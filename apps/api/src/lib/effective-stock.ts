import { and, eq, gt, isNull, type SQL, sql } from 'drizzle-orm'

import { parseQuantity, products, productVariants } from '@kiotviet-lite/shared'

/**
 * Tồn hiệu lực của một sản phẩm (BC-11): có biến thể thì cộng tồn các biến thể còn hoạt động,
 * không thì lấy tồn của sản phẩm. Báo cáo tồn, cảnh báo trên tổng quan và chuông thông báo
 * dùng chung một định nghĩa này, để không còn cảnh "đủ tồn kho" cạnh chuông "sắp hết hàng".
 */
export function effectiveStockSql(): SQL<number> {
  // ADR-0015: tồn thập phân numeric(14,3), không ép ::int (làm tròn mất phần lẻ)
  return sql<number>`(CASE WHEN ${products.hasVariants} THEN COALESCE((
    SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants}
    WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL
  ), 0) ELSE ${products.currentStock} END)::numeric(14, 3)`.mapWith(parseQuantity)
}

/**
 * Giá trị tồn của một sản phẩm (BC-11), mỗi dòng làm tròn round(tồn × giá vốn) về đồng (ADR-0015). Sản phẩm có biến thể cộng tồn × giá vốn từng biến thể còn
 * hoạt động, biến thể chưa có giá vốn riêng lấy giá vốn cha (ADR-0007, như `getEffectiveCostPrice`).
 * Không dùng tồn cha × giá vốn cha: giá vốn cha chỉ là số tóm tắt, không tính lại khi bán, trả, kiểm kê.
 */
export function effectiveStockValueSql(): SQL<number> {
  return sql<number>`(CASE WHEN ${products.hasVariants} THEN (
    SELECT coalesce(sum(round(${productVariants.stockQuantity} * coalesce(${productVariants.costPrice}, ${products.costPrice}, 0))), 0)
    FROM ${productVariants}
    WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL
  ) ELSE round(${products.currentStock} * coalesce(${products.costPrice}, 0)) END)::bigint`
}

/**
 * Điều kiện "sắp hết hàng" duy nhất (BC-11): sản phẩm còn hoạt động, có theo dõi tồn, đặt tồn tối
 * thiểu, tồn hiệu lực không vượt tồn tối thiểu. Chuông thông báo, cảnh báo trên tổng quan và báo
 * cáo đặt hàng lại cùng dùng điều kiện này nên luôn ra cùng một danh sách.
 */
export function lowStockConditionSql(): SQL {
  return and(
    isNull(products.deletedAt),
    eq(products.trackInventory, true),
    gt(products.minStock, 0),
    sql`${effectiveStockSql()} <= ${products.minStock}`,
  )!
}
