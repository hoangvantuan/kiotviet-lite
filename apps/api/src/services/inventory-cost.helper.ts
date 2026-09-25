import { and, eq, isNull, sql } from 'drizzle-orm'

import { products, productVariants } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { loadProductForUpdate, loadVariantForUpdate } from './products-lock.helper.js'

/**
 * Chia `total` thành các phần nguyên theo tỷ lệ `weights`, tổng các phần luôn đúng bằng `total`.
 * Dùng phương pháp phần dư lớn nhất: mỗi phần lấy phần nguyên, số đồng còn thiếu cộng lần lượt
 * cho các phần có phần lẻ lớn nhất (hòa thì dòng đứng trước được trước). Nhờ vậy không phần nào
 * vượt quá ceil(tỷ lệ chính xác), nên chiết khấu phân bổ không bao giờ lớn hơn thành tiền dòng.
 * Tính bằng BigInt để tích weight × total không tràn số nguyên an toàn của JS.
 */
export function allocateProportionally(weights: readonly number[], total: number): number[] {
  const result = weights.map(() => 0)
  if (total <= 0 || weights.length === 0) return result
  const sum = weights.reduce((acc, w) => acc + Math.max(0, w), 0)
  if (sum <= 0) return result

  const bigTotal = BigInt(total)
  const bigSum = BigInt(sum)
  const remainders: Array<{ index: number; remainder: bigint }> = []
  let allocated = 0n
  weights.forEach((w, index) => {
    const numerator = BigInt(Math.max(0, w)) * bigTotal
    const share = numerator / bigSum
    result[index] = Number(share)
    allocated += share
    remainders.push({ index, remainder: numerator % bigSum })
  })

  let left = Number(bigTotal - allocated)
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  for (const r of remainders) {
    if (left <= 0) break
    if (r.remainder === 0n) continue
    result[r.index]! += 1
    left--
  }
  return result
}

/**
 * Giá vốn bình quân gia quyền sau một lần nhập.
 * `totalCost` là tiền hàng thực trả của cả lô (đã trừ chiết khấu dòng và phần chiết khấu phiếu
 * phân bổ), không phải đơn giá niêm yết. Chỉ làm tròn một lần ở kết quả, không làm tròn đơn giá lô.
 * Tồn trước ≤ 0 hoặc chưa có giá vốn thì giá vốn mới là giá nhập thực của lô.
 */
export function computeWac(args: {
  costBefore: number | null
  stockBefore: number
  quantity: number
  totalCost: number
}): number {
  const { costBefore, stockBefore, quantity, totalCost } = args
  if (costBefore === null || stockBefore <= 0) {
    return Math.round(totalCost / quantity)
  }
  const newStock = stockBefore + quantity
  return Math.round((stockBefore * costBefore + totalCost) / newStock)
}

/**
 * Giá vốn dùng cho MỘT đơn vị tính của sản phẩm hoặc biến thể.
 * Sản phẩm có biến thể: giá vốn của biến thể; biến thể chưa có giá vốn thì lấy giá vốn sản phẩm cha.
 * Sản phẩm không biến thể: `products.cost_price`. Trả null khi chưa từng có giá vốn.
 * Quy tắc chuẩn cho giá vốn một đơn vị bán (ADR-0007 mục 5). Hiện trạng: đơn bán tự chụp cùng quy
 * tắc trong `orders.service`, báo cáo tồn kho áp quy tắc này bằng SQL; `profit-report.service` và
 * `pricing-report.service` còn đọc giá vốn cha hiện tại, sẽ chuyển sang giá vốn chụp trên dòng đơn.
 */
export async function getEffectiveCostPrice({
  db,
  storeId,
  productId,
  variantId,
}: {
  db: Db
  storeId: string
  productId: string
  variantId: string | null
}): Promise<number | null> {
  if (variantId) {
    const rows = await db
      .select({ variantCost: productVariants.costPrice, productCost: products.costPrice })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId),
          eq(products.storeId, storeId),
        ),
      )
      .limit(1)
    const row = rows[0]
    if (!row) throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể')
    const cost = row.variantCost ?? row.productCost
    return cost === null ? null : Number(cost)
  }
  const rows = await db
    .select({ cost: products.costPrice })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  return row.cost === null ? null : Number(row.cost)
}

/**
 * Tính tồn và giá vốn tóm tắt của sản phẩm cha từ các biến thể còn hoạt động, không ghi gì.
 * - Tồn cha = tổng tồn biến thể (giống luồng bán, trả, kiểm kê).
 * - Giá vốn cha = bình quân giá vốn các biến thể theo tồn dương; biến thể chưa có giá vốn bị bỏ qua.
 *   Không có biến thể nào tồn dương thì giữ `fallbackCost`.
 */
export async function computeParentFromVariants({
  db,
  productId,
  fallbackCost,
}: {
  db: Db
  productId: string
  fallbackCost: number | null
}): Promise<{ currentStock: number; costPrice: number | null }> {
  const rows = await db
    .select({
      totalStock: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)::int`,
      costedQty: sql<string>`COALESCE(SUM(GREATEST(${productVariants.stockQuantity}, 0)) FILTER (WHERE ${productVariants.costPrice} IS NOT NULL), 0)`,
      costedValue: sql<string>`COALESCE(SUM(GREATEST(${productVariants.stockQuantity}, 0)::numeric * ${productVariants.costPrice}) FILTER (WHERE ${productVariants.costPrice} IS NOT NULL), 0)`,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
  const row = rows[0]
  const currentStock = Number(row?.totalStock ?? 0)
  const costedQty = Number(row?.costedQty ?? 0)
  const costedValue = Number(row?.costedValue ?? 0)
  const costPrice = costedQty > 0 ? Math.round(costedValue / costedQty) : fallbackCost
  return { currentStock, costPrice }
}

/**
 * Đồng bộ tồn kho và giá vốn tóm tắt của sản phẩm cha từ các biến thể (xem
 * `computeParentFromVariants`). Dùng ở nghiệp vụ đổi giá vốn biến thể (nhập hàng) và script tính lại.
 * Giá vốn cha chỉ là số tóm tắt cấp sản phẩm cho màn hình; giá vốn thật để bán là giá vốn
 * biến thể (xem `getEffectiveCostPrice`), giá trị tồn trong báo cáo cộng theo biến thể.
 */
export async function syncParentFromVariants({
  tx,
  productId,
  fallbackCost,
}: {
  tx: Db
  productId: string
  fallbackCost: number | null
}): Promise<{ currentStock: number; costPrice: number | null }> {
  const { currentStock, costPrice } = await computeParentFromVariants({
    db: tx,
    productId,
    fallbackCost,
  })
  await tx.update(products).set({ currentStock, costPrice }).where(eq(products.id, productId))
  return { currentStock, costPrice }
}

export interface ReceiveStockResult {
  /** Giá vốn trước và sau của đúng cấp nhận hàng (biến thể nếu có, không thì sản phẩm). */
  costBefore: number | null
  costAfter: number
  /** Tồn trước và sau của đúng cấp nhận hàng. */
  stockBefore: number
  stockAfter: number
  /** Giá nhập thực trên một đơn vị tính, làm tròn đồng, để ghi sổ giao dịch kho. */
  unitCost: number
  /** Tồn cấp sản phẩm sau khi nhận (bằng tổng biến thể khi có biến thể). */
  productStockAfter: number
}

/**
 * Nhận hàng vào kho (nhập hàng) cho một dòng: cập nhật tồn và giá vốn bình quân trong transaction.
 * - `quantity` tính theo đơn vị tính (đã quy đổi nếu nhập theo đơn vị quy đổi).
 * - `totalCost` là tiền hàng thực trả của dòng sau mọi chiết khấu.
 * Sản phẩm có biến thể: giá vốn bình quân tính riêng cho biến thể trên tồn của biến thể,
 * rồi đồng bộ tồn và giá vốn tóm tắt của sản phẩm cha ngay trong cùng transaction.
 * Người gọi tự ghi sổ giao dịch kho và chứng từ.
 */
export async function receiveStock({
  tx,
  storeId,
  productId,
  variantId,
  quantity,
  totalCost,
}: {
  tx: Db
  storeId: string
  productId: string
  variantId: string | null
  quantity: number
  totalCost: number
}): Promise<ReceiveStockResult> {
  if (quantity <= 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Số lượng nhập phải > 0')
  }
  if (totalCost < 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Tiền hàng nhập không được âm')
  }
  const product = await loadProductForUpdate({ tx, storeId, productId })
  if (product.hasVariants && !variantId) {
    throw new ApiError('VALIDATION_ERROR', 'Sản phẩm có biến thể, vui lòng chọn biến thể nhập')
  }
  if (!product.hasVariants && variantId) {
    throw new ApiError('VALIDATION_ERROR', 'Sản phẩm không có biến thể')
  }
  const unitCost = Math.round(totalCost / quantity)
  const productCost = product.costPrice === null ? null : Number(product.costPrice)

  if (product.hasVariants && variantId) {
    const variant = await loadVariantForUpdate({ tx, productId, variantId })
    // Biến thể chưa từng có giá vốn riêng thì kế thừa giá vốn cha làm giá vốn trước
    const costBefore = variant.costPrice === null ? productCost : Number(variant.costPrice)
    const stockBefore = variant.stockQuantity
    const costAfter = computeWac({ costBefore, stockBefore, quantity, totalCost })
    const stockAfter = stockBefore + quantity
    await tx
      .update(productVariants)
      .set({ stockQuantity: stockAfter, costPrice: costAfter })
      .where(eq(productVariants.id, variantId))
    const parent = await syncParentFromVariants({ tx, productId, fallbackCost: costAfter })
    return {
      costBefore,
      costAfter,
      stockBefore,
      stockAfter,
      unitCost,
      productStockAfter: parent.currentStock,
    }
  }

  const stockBefore = product.currentStock
  const costAfter = computeWac({ costBefore: productCost, stockBefore, quantity, totalCost })
  const stockAfter = stockBefore + quantity
  await tx
    .update(products)
    .set({ currentStock: stockAfter, costPrice: costAfter })
    .where(eq(products.id, productId))
  return {
    costBefore: productCost,
    costAfter,
    stockBefore,
    stockAfter,
    unitCost,
    productStockAfter: stockAfter,
  }
}
