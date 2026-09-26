import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'

import {
  auditLogs,
  inventoryTransactions,
  products,
  purchaseOrderItems,
  purchaseOrders,
  subQty,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { logAction } from './audit.service.js'
import {
  allocateProportionally,
  computeParentFromVariants,
  syncParentFromVariants,
} from './inventory-cost.helper.js'

/**
 * Tính lại giá vốn đã bị thổi bởi lỗi KHO-04 (quyết định 7 của đợt sửa go-live).
 *
 * Trước khi sửa, mỗi dòng phiếu nhập có chiết khấu (chiết khấu dòng hoặc phần chiết khấu phiếu)
 * làm giá trị tồn cao hơn đúng số tiền chiết khấu D của dòng đó. Mã cũ tính giá vốn sau nhập bằng
 * đơn giá niêm yết: tồn trước ≤ 0 hoặc chưa có giá vốn thì đặt lại theo đơn giá lô, không thì bình
 * quân gia quyền. Giá vốn vì thế cao hơn δ = D / số lượng (đặt lại) hoặc δ = D / tồn sau (bình quân).
 * Bán, trả, kiểm kê không đổi giá vốn, nên δ trên một đơn vị giữ nguyên; mỗi lần nhập bình quân sau
 * đó pha loãng δ theo tỷ lệ tồn trước / tồn sau, lần nhập đặt lại thì δ chỉ còn phần của lô đó.
 * Script đi lại sổ giao dịch kho theo thứ tự thời gian, mỗi giao dịch nhập ghép với đúng một dòng
 * phiếu (cùng mã phiếu, cùng thứ tự ghi), ra δ hiện tại, giá vốn đúng = giá vốn hiện tại - δ.
 *
 * Giới hạn: chỉ tự sửa sản phẩm không biến thể và khi giá vốn hiện tại vẫn bằng giá vốn sau lần
 * nhập cuối (không ai sửa tay sau đó). Sản phẩm có biến thể thì trước đây giá vốn biến thể không
 * được cập nhật khi nhập, sổ không đủ để tái lập, nên chỉ liệt kê để xem tay; đồng bộ tồn, giá vốn
 * tóm tắt của cha theo biến thể chỉ khi gọi rõ `applyVariantParent`, vì giá vốn biến thể cũ nhập tay
 * có thể sai và ghi đè cha bằng số đó có thể tệ hơn.
 * Script không sửa giá vốn đã chụp trên dòng đơn bán cũ (`order_items`).
 */

/** Tác nhân ghi trong audit khi script áp dụng (tài khoản chủ cửa hàng chỉ để thỏa khóa ngoại) */
export const RECALC_SCRIPT_ACTOR = 'script cost:recalc'

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
  applyVariantParent: boolean
  rows: RecalcRow[]
}

interface OldLine {
  purchaseOrderId: string
  code: string
  productId: string
  variantId: string | null
  /** Số tiền chiết khấu bị bỏ khỏi giá vốn: chiết khấu dòng + phần chiết khấu phiếu phân bổ */
  missed: number
  createdAt: Date
}

/**
 * Mọi dòng phiếu nhập lập theo quy tắc cũ (unit_cost null), theo thứ tự ghi trong từng phiếu.
 * Giữ cả dòng không bị bỏ chiết khấu để ghép đúng từng giao dịch sổ kho với dòng phiếu của nó.
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
      createdAt: purchaseOrderItems.createdAt,
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
      result.push({
        purchaseOrderId: l.purchaseOrderId,
        code: l.code,
        productId: l.productId,
        variantId: l.variantId,
        missed: Number(l.discountAmount) + (allocations[i] ?? 0),
        createdAt: l.createdAt,
      })
    })
  }
  return result
}

/** Dòng phiếu cần xem lại: có chiết khấu bị bỏ khỏi giá vốn, hoặc nhập biến thể theo quy tắc cũ */
function isAffected(line: OldLine): boolean {
  return line.missed > 0 || line.variantId !== null
}

/**
 * Đi lại sổ nhập của một sản phẩm không biến thể, trả δ (giá vốn bị thổi trên một đơn vị) hiện tại
 * và giá vốn sau lần nhập cuối để đối chiếu.
 * `missedByPo`: theo id phiếu nhập, số chiết khấu bị bỏ của từng dòng phiếu cũ của sản phẩm, đúng
 * thứ tự ghi. Mã cũ ghi một giao dịch sổ cho mỗi dòng phiếu, cùng thứ tự, và giao dịch trỏ về phiếu
 * qua reference_id (POS-18), nên giao dịch thứ k của một phiếu ghép với dòng thứ k (một phiếu có thể
 * có hai dòng cùng sản phẩm). Nhập tay không có reference_id, không ghép dòng phiếu nào.
 */
async function replayInflation(
  db: Db,
  productId: string,
  missedByPo: Map<string, number[]>,
): Promise<{ delta: number; lastCostAfter: number | null; broken: string | null }> {
  const ledger = await db
    .select({
      quantity: inventoryTransactions.quantity,
      unitCost: inventoryTransactions.unitCost,
      stockAfter: inventoryTransactions.stockAfter,
      costAfter: inventoryTransactions.costAfter,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
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

  // KHO-11: hủy phiếu nhập, trả hàng nhập rút lại lô theo giá nhập thực (ADR-0012), δ không còn
  // đi theo công thức pha loãng ở dưới, nên sản phẩm có các giao dịch này phải xem tay
  const [removal] = await db
    .select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.productId, productId),
        inArray(inventoryTransactions.type, ['purchase_cancel', 'purchase_return']),
      ),
    )
    .limit(1)
  if (removal) {
    return {
      delta: 0,
      lastCostAfter: null,
      broken: 'Có hủy phiếu nhập hoặc trả hàng nhập, không tính lại tự động được, cần xem tay',
    }
  }

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

  const pending = new Map([...missedByPo].map(([poId, list]) => [poId, [...list]]))
  let delta = 0
  let lastCostAfter: number | null = null
  // Giá vốn trước mỗi lần nhập theo sổ; undefined là chưa biết (trước lần nhập đầu tiên trong sổ)
  let costBefore: number | null | undefined = undefined
  for (const ev of events) {
    if (ev.kind === 'recalc') {
      delta = 0
      lastCostAfter = ev.costAfter
      costBefore = ev.costAfter
      continue
    }
    const row = ev.row
    if (row.stockAfter === null) {
      return { delta, lastCostAfter, broken: 'Sổ nhập thiếu tồn sau nhập, không tính lại được' }
    }
    const qty = row.quantity
    const stockAfter = row.stockAfter
    const stockBefore = subQty(stockAfter, qty)
    const missed =
      (row.referenceType === 'purchase_order' && row.referenceId
        ? pending.get(row.referenceId)?.shift()
        : undefined) ?? 0
    const costAfter = row.costAfter === null ? null : Number(row.costAfter)
    // Lần nhập đầu tiên trong sổ không biết giá vốn trước: mã cũ đặt lại theo đơn giá lô khi chưa có
    // giá vốn, nên giá vốn sau đúng bằng đơn giá ghi sổ là dấu hiệu đặt lại. (Giá vốn trước tình cờ
    // bằng đúng đơn giá thì không phân biệt được; khi đó coi là đặt lại.)
    const wasReset =
      stockBefore <= 0 ||
      costBefore === null ||
      (costBefore === undefined && costAfter !== null && costAfter === Number(row.unitCost))
    delta = wasReset ? missed / qty : (delta * stockBefore + missed) / stockAfter
    lastCostAfter = costAfter
    costBefore = costAfter
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
  applyVariantParent = false,
}: {
  db: Db
  storeId?: string
  /** Ghi giá vốn đã tính lại cho các dòng "Sửa được" */
  apply?: boolean
  /** Ghi đồng bộ tồn, giá vốn tóm tắt của sản phẩm cha có biến thể theo giá vốn biến thể hiện tại */
  applyVariantParent?: boolean
}): Promise<RecalcResult> {
  const allOldLines = await loadOldPurchaseLines(db, storeId)
  const affectedLines = allOldLines.filter(isAffected)
  if (affectedLines.length === 0) return { apply, applyVariantParent, rows: [] }

  const productIds = [...new Set(affectedLines.map((l) => l.productId))]
  const productRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.sku))

  const rows: RecalcRow[] = []
  for (const p of productRows) {
    const lines = affectedLines.filter((l) => l.productId === p.id)
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
      const preview = await computeParentFromVariants({
        db,
        productId: p.id,
        fallbackCost: currentCost,
      })
      const inSync = preview.costPrice === currentCost && preview.currentStock === p.currentStock
      // Bớt nhiễu: đã đồng bộ bằng script sau dòng phiếu cũ cuối, hoặc cha đã khớp biến thể mà không
      // có chiết khấu nào bị bỏ, thì script không còn gì để báo thêm
      const lastLineAt = Math.max(...lines.map((l) => l.createdAt.getTime()))
      const [acknowledged] = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'inventory.cost_recalculated'),
            eq(auditLogs.targetId, p.id),
            gt(auditLogs.createdAt, new Date(lastLineAt)),
          ),
        )
        .limit(1)
      if (acknowledged || (inSync && discountMissed === 0)) continue
      rows.push({
        ...base,
        status: 'variant_parent',
        reason:
          'Có biến thể: giá vốn biến thể trước đây không cập nhật khi nhập, cần kiểm tay từng biến thể. "Giá vốn đúng" là giá vốn cha nếu đồng bộ theo giá vốn biến thể hiện tại, chỉ ghi khi có --apply-variant-parent',
        correctedCost: preview.costPrice,
        diffPerUnit:
          preview.costPrice === null || currentCost === null
            ? null
            : currentCost - preview.costPrice,
        inflatedValue: null,
      })
      continue
    }

    const missedByPo = new Map<string, number[]>()
    for (const l of allOldLines) {
      if (l.productId !== p.id || l.variantId !== null) continue
      const list = missedByPo.get(l.purchaseOrderId) ?? []
      list.push(l.missed)
      missedByPo.set(l.purchaseOrderId, list)
    }
    const { delta, lastCostAfter, broken } = await replayInflation(db, p.id, missedByPo)

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

  const toWrite = rows.filter(
    (r) =>
      (apply && r.status === 'fixable') || (applyVariantParent && r.status === 'variant_parent'),
  )
  // Audit bắt buộc có tài khoản thật: thiếu chủ cửa hàng thì dừng trước khi ghi bất cứ gì
  const actorByStore = new Map<string, string>()
  for (const sid of new Set(toWrite.map((r) => r.storeId))) {
    const actorId = await findStoreOwner(db, sid)
    if (!actorId) {
      throw new Error(
        `Cửa hàng ${sid} không có chủ cửa hàng để ghi audit, không áp dụng gì. Gán lại vai trò chủ cửa hàng rồi chạy lại.`,
      )
    }
    actorByStore.set(sid, actorId)
  }

  for (const row of toWrite) {
    const actorId = actorByStore.get(row.storeId)!
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
          reason:
            row.status === 'variant_parent'
              ? 'KHO-04/KHO-05: đồng bộ tồn và giá vốn cha theo biến thể'
              : 'KHO-04: chiết khấu phiếu nhập cũ chưa trừ vào giá vốn',
          performedBy: RECALC_SCRIPT_ACTOR,
          costBefore: lockedCost,
          costAfter,
          stockBefore: locked.currentStock,
          stockAfter,
          discountMissed: row.discountMissed,
          purchaseOrders: row.affectedPurchaseOrders,
        },
        userAgent: RECALC_SCRIPT_ACTOR,
      })
      return true
    })
  }

  return { apply, applyVariantParent, rows }
}
