import { type SQL, sql } from 'drizzle-orm'

import { products, productVariants } from '@kiotviet-lite/shared'

/**
 * Tồn hiệu lực của một sản phẩm (BC-11): có biến thể thì cộng tồn các biến thể còn hoạt động,
 * không thì lấy tồn của sản phẩm. Báo cáo tồn, cảnh báo trên tổng quan và chuông thông báo
 * dùng chung một định nghĩa này, để không còn cảnh "đủ tồn kho" cạnh chuông "sắp hết hàng".
 */
export function effectiveStockSql(): SQL<number> {
  return sql<number>`(CASE WHEN ${products.hasVariants} THEN COALESCE((
    SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants}
    WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL
  ), 0) ELSE ${products.currentStock} END)::int`
}

/**
 * Giá trị tồn của một sản phẩm (BC-11). Sản phẩm có biến thể cộng tồn × giá vốn từng biến thể còn
 * hoạt động, biến thể chưa có giá vốn riêng lấy giá vốn cha (ADR-0007, như `getEffectiveCostPrice`).
 * Không dùng tồn cha × giá vốn cha: giá vốn cha chỉ là số tóm tắt, không tính lại khi bán, trả, kiểm kê.
 */
export function effectiveStockValueSql(): SQL<number> {
  return sql<number>`(CASE WHEN ${products.hasVariants} THEN (
    SELECT coalesce(sum(${productVariants.stockQuantity}::bigint * coalesce(${productVariants.costPrice}, ${products.costPrice}, 0)), 0)
    FROM ${productVariants}
    WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.deletedAt} IS NULL
  ) ELSE ${products.currentStock}::bigint * coalesce(${products.costPrice}, 0) END)`
}
