import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import {
  auditLogs,
  inventoryTransactions,
  products,
  purchaseOrderItems,
  purchaseOrders,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { logAction } from './audit.service.js'
import { allocateProportionally, syncParentFromVariants } from './inventory-cost.helper.js'

/**
 * Tính lại giá vốn đã bị thổi bởi lỗi KHO-04 (quyết định 7 của đợt sửa go-live).
 *
 * Trước khi sửa, mỗi dòng phiếu nhập có chiết khấu (chiết khấu dòng hoặc phần chiết khấu phiếu)
 * làm giá trị tồn cao hơn đúng số tiền chiết khấu D của dòng đó. Giá vốn bình quân sau lần nhập
 * vì thế cao hơn δ = D / tồn sau. Bán, trả, kiểm kê không đổi giá vốn, nên δ trên một đơn vị giữ
 * nguyên; mỗi lần nhập sau đó pha loãng δ theo tỷ lệ tồn trước / tồn sau; tồn trước ≤ 0 thì giá
 * vốn đặt lại theo lô mới nên δ chỉ còn phần của lô đó. Script đi lại sổ giao dịch kho theo thứ tự
 * thời gian để ra δ hiện tại, giá vốn đúng = giá vốn hiện tại - δ.
 *
 * Giới hạn: chỉ tự sửa sản phẩm không biến thể và khi giá vốn hiện tại vẫn bằng giá vốn sau lần
 * nhập cuối (không ai sửa tay sau đó). Sản phẩm có biến thể thì trước đây giá vốn biến thể không
 * được cập nhật khi nhập, sổ không đủ để tái lập, nên chỉ liệt kê để xem tay và đồng bộ lại tồn,
 * giá vốn tóm tắt của sản phẩm cha theo định nghĩa mới.
 */

export type RecalcStatus = 'fixable' | 'manual_review' | 'variant_parent'

export interface RecalcRow {
  storeId: string
  productId: string
  sku: string
  name: string
  status: RecalcStatus
  reason: string | null
  currentStock: number
  currentCost: number | null
  correctedCost: number | null
  /** Giá vốn hiện tại - giá vốn đúng, trên một đơn vị tính */
  diffPerUnit: number | null
  /** Giá trị tồn đang bị thổi = chênh lệch × tồn hiện tại */
  inflatedValue: number | null
  /** Tổng chiết khấu đã bị bỏ khỏi giá vốn qua các phiếu cũ */
  discountMissed: number
  affectedPurchaseOrders: string[]
  applied: boolean
}

export interface RecalcResult {
  apply: boolean
  rows: RecalcRow[]
}

interface OldLine {
  purchaseOrderId: string
  code: string
  productId: string
  variantId: string | null
  /** Số tiền chiết khấu bị bỏ khỏi giá vốn: chiết khấu dòng + phần chiết khấu phiếu phân bổ */
  missed: number
}

/**
 * Các dòng phiếu nhập lập theo quy tắc cũ (unit_cost null) cần xem lại: dòng có chiết khấu bị bỏ
 * khỏi giá vốn, và mọi dòng nhập biến thể (giá vốn cha bị trộn, giá vốn biến thể đứng yên).
 */
async function loadOldPurchaseLines(db: Db, storeId: string | undefined): Promise<OldLine[]> {
  const conditions = [isNull(purchaseOrderItems.unitCost)]
  if (storeId) conditions.push(eq(purchaseOrders.storeId, storeId))
  const items = await db
    .select({
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      code: purchaseOrders.code,
      discountTotal: purchaseOrders.discountTotal,
      productId: purchaseOrderItems.productId,
      variantId: purchaseOrderItems.variantId,
      discountAmount: purchaseOrderItems.discountAmount,
      lineTotal: purchaseOrderItems.lineTotal,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
    .where(and(...conditions))
    .orderBy(
      asc(purchaseOrderItems.purchaseOrderId),
      asc(purchaseOrderItems.createdAt),
      asc(purchaseOrderItems.id),
    )

  const byPo = new Map<string, typeof items>()
  for (const it of items) {
    const list = byPo.get(it.purchaseOrderId) ?? []
    list.push(it)
    byPo.set(it.purchaseOrderId, list)
  }

  const result: OldLine[] = []
  for (const lines of byPo.values()) {
    // Chia lại chiết khấu phiếu theo đúng quy tắc mới để biết phần đã bị bỏ khỏi giá vốn
    const allocations = allocateProportionally(
      lines.map((l) => Number(l.lineTotal)),
      Number(lines[0]!.discountTotal),
    )
    lines.forEach((l, i) => {
      const missed = Number(l.discountAmount) + (allocations[i] ?? 0)
      if (missed <= 0 && l.variantId === null) return
      result.push({
        purchaseOrderId: l.purchaseOrderId,
        code: l.code,
        productId: l.productId,
        variantId: l.variantId,
        missed,
      })
    })
  }
  return result
}

/**
 * Đi lại sổ nhập của một sản phẩm không biến thể, trả δ (giá vốn bị thổi trên một đơn vị) hiện tại
 * và giá vốn sau lần nhập cuối để đối chiếu.
 */
async function replayInflation(
  db: Db,
  productId: string,
  missedByCode: Map<string, number>,
): Promise<{ delta: number; lastCostAfter: number | null; broken: string | null }> {
  const ledger = await db
    .select({
      quantity: inventoryTransactions.quantity,
      stockAfter: inventoryTransactions.stockAfter,
      costAfter: inventoryTransactions.costAfter,
      note: inventoryTransactions.note,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, productId),
        isNull(inventoryTransactions.variantId),
        eq(inventoryTransactions.type, 'purchase'),
      ),
    )
    .orderBy(asc(inventoryTransactions.createdAt), asc(inventoryTransactions.id))

  // Lần tính lại đã áp dụng trước đó: giá vốn đã đúng tại thời điểm đó, δ về 0 (chạy lại an toàn)
  const recalcs = await db
    .select({ changes: auditLogs.changes, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.action, 'inventory.cost_recalculated'), eq(auditLogs.targetId, productId)),
    )
    .orderBy(asc(auditLogs.createdAt))

  type Event =
    | { kind: 'purchase'; at: Date; row: (typeof ledger)[number] }
    | { kind: 'recalc'; at: Date; costAfter: number | null }
  const events: Event[] = [
    ...ledger.map((row): Event => ({ kind: 'purchase', at: row.createdAt, row })),
    ...recalcs.map(
      (r): Event => ({
        kind: 'recalc',
        at: r.createdAt,
        costAfter: (r.changes as { costAfter?: number | null } | null)?.costAfter ?? null,
      }),
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())

  let delta = 0
  let lastCostAfter: number | null = null
  for (const ev of events) {
    if (ev.kind === 'recalc') {
      delta = 0
      lastCostAfter = ev.costAfter
      continue
    }
    const row = ev.row
    if (row.stockAfter === null) {
      return { delta, lastCostAfter, broken: 'Sổ nhập thiếu tồn sau nhập, không tính lại được' }
    }
    const qty = row.quantity
    const stockAfter = row.stockAfter
    const stockBefore = stockAfter - qty
    const missed = row.note ? (missedByCode.get(row.note) ?? 0) : 0
    delta = stockBefore <= 0 ? missed / qty : (delta * stockBefore + missed) / stockAfter
    lastCostAfter = row.costAfter === null ? null : Number(row.costAfter)
  }
  return { delta, lastCostAfter, broken: null }
}

async function findStoreOwner(db: Db, storeId: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.storeId, storeId), eq(users.role, 'owner')))
    .orderBy(asc(users.createdAt))
    .limit(1)
  return rows[0]?.id ?? null
}

export async function recalcInflatedPurchaseCosts({
  db,
  storeId,
  apply = false,
}: {
  db: Db
  storeId?: string
  apply?: boolean
}): Promise<RecalcResult> {
  const oldLines = await loadOldPurchaseLines(db, storeId)
  if (oldLines.length === 0) return { apply, rows: [] }

  const productIds = [...new Set(oldLines.map((l) => l.productId))]
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.sku))

  const rows: RecalcRow[] = []
  for (const p of productRows) {
    const lines = oldLines.filter((l) => l.productId === p.id)
    const discountMissed = lines.reduce((s, l) => s + l.missed, 0)
    const codes = [...new Set(lines.map((l) => l.code))]
    const currentCost = p.costPrice === null ? null : Number(p.costPrice)
    const base = {
      storeId: p.storeId,
      productId: p.id,
      sku: p.sku,
      name: p.name,
      currentStock: p.currentStock,
      currentCost,
      discountMissed,
      affectedPurchaseOrders: codes,
      applied: false,
    }

    if (p.hasVariants) {
      rows.push({
        ...base,
        status: 'variant_parent',
        reason:
          'Có biến thể: giá vốn biến thể trước đây không cập nhật khi nhập, cần kiểm tay từng biến thể; áp dụng chỉ đồng bộ tồn và giá vốn cha theo biến thể',
        correctedCost: null,
        diffPerUnit: null,
        inflatedValue: null,
      })
      continue
    }

    const missedByCode = new Map<string, number>()
    for (const l of lines) missedByCode.set(l.code, (missedByCode.get(l.code) ?? 0) + l.missed)
    const { delta, lastCostAfter, broken } = await replayInflation(db, p.id, missedByCode)

    let reason: string | null = broken
    if (!reason && currentCost === null) reason = 'Sản phẩm chưa có giá vốn'
    if (!reason && lastCostAfter !== currentCost) {
      reason = 'Giá vốn đã đổi ngoài phiếu nhập sau lần nhập cuối (sửa tay), cần xem tay'
    }
    const correctedCost = currentCost === null ? null : Math.round(currentCost - delta)
    const diffPerUnit =
      correctedCost === null || currentCost === null ? null : currentCost - correctedCost
    // Không còn chênh lệch (ví dụ đã tính lại ở lần chạy trước) thì không báo
    if (!reason && diffPerUnit === 0) continue
    rows.push({
      ...base,
      status: reason ? 'manual_review' : 'fixable',
      reason,
      correctedCost,
      diffPerUnit,
      inflatedValue: Math.round(delta * Math.max(0, p.currentStock)),
    })
  }

  if (apply) {
    for (const row of rows) {
      if (row.status === 'manual_review') continue
      const actorId = await findStoreOwner(db, row.storeId)
      if (!actorId) continue
      row.applied = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db
        const [locked] = await tx
          .select()
          .from(products)
          .where(eq(products.id, row.productId))
          .for('update')
          .limit(1)
        const lockedCost = locked?.costPrice === null ? null : Number(locked?.costPrice)
        // Giá vốn đã đổi từ lúc tính (có phiếu nhập mới chen vào) thì bỏ qua, chạy lại script
        if (!locked || lockedCost !== row.currentCost || locked.currentStock !== row.currentStock) {
          return false
        }
        let costAfter: number | null
        let stockAfter = locked.currentStock
        if (row.status === 'variant_parent') {
          const synced = await syncParentFromVariants({
            tx: txDb,
            productId: row.productId,
            fallbackCost: lockedCost,
          })
          costAfter = synced.costPrice
          stockAfter = synced.currentStock
          if (costAfter === lockedCost && stockAfter === locked.currentStock) return false
        } else {
          costAfter = row.correctedCost
          await tx
            .update(products)
            .set({ costPrice: costAfter })
            .where(eq(products.id, row.productId))
        }
        await logAction({
          db: txDb,
          storeId: row.storeId,
          actorId,
          actorRole: 'owner',
          action: 'inventory.cost_recalculated',
          targetType: 'product',
          targetId: row.productId,
          changes: {
            reason: 'KHO-04: chiết khấu phiếu nhập cũ chưa trừ vào giá vốn',
            costBefore: lockedCost,
            costAfter,
            stockBefore: locked.currentStock,
            stockAfter,
            discountMissed: row.discountMissed,
            purchaseOrders: row.affectedPurchaseOrders,
          },
        })
        return true
      })
    }
  }

  return { apply, rows }
}
