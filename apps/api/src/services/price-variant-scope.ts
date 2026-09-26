import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { productVariants } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

// POS-08: phần dùng chung của các màn quản lý giá gắn theo biến thể (bảng giá, giá riêng khách,
// giá theo số lượng). Dòng có variant_id null là giá cho mọi biến thể của sản phẩm.

/** Tên biến thể "Giá trị 1 - Giá trị 2" như màn sản phẩm; null khi dòng gắn theo sản phẩm */
export const variantNameSql = sql<string | null>`CASE WHEN ${productVariants.id} IS NULL THEN NULL
  ELSE ${productVariants.attribute1Value} || COALESCE(' - ' || ${productVariants.attribute2Value}, '') END`

/** Giá bán, giá vốn hiệu lực của dòng: của biến thể nếu dòng gắn biến thể (ADR-0007) */
export const effectiveSellingPriceSql = (productSellingPrice: AnyPgColumn) =>
  sql<number>`CASE WHEN ${productVariants.sellingPrice} > 0 THEN ${productVariants.sellingPrice}
    ELSE ${productSellingPrice} END`
export const effectiveCostPriceSql = (productCostPrice: AnyPgColumn) =>
  sql<number | null>`COALESCE(${productVariants.costPrice}, ${productCostPrice})`

/** Bỏ dòng giá gắn biến thể đã xóa (join trái bảng biến thể theo variant_id) */
export function aliveVariantCondition(variantColumn: AnyPgColumn): SQL {
  return or(isNull(variantColumn), isNull(productVariants.deletedAt))!
}

/** Biến thể phải thuộc đúng sản phẩm, đúng cửa hàng và chưa bị xóa */
export async function ensureVariantOfProduct({
  db,
  storeId,
  productId,
  variantId,
}: {
  db: Db
  storeId: string
  productId: string
  variantId: string | null | undefined
}): Promise<void> {
  if (!variantId) return
  const [row] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
        eq(productVariants.storeId, storeId),
        isNull(productVariants.deletedAt),
      ),
    )
    .limit(1)
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể của sản phẩm này', {
      field: 'variantId',
    })
  }
}
