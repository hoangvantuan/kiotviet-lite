import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { parseQuantity, products, productVariants } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

/**
 * Khóa trước mọi sản phẩm của chứng từ theo id tăng dần (thứ tự khóa chung, xem
 * customer-debt-ledger.service.ts). Nhờ đó hai chứng từ có cùng các sản phẩm nhưng khác thứ tự
 * dòng không khóa chéo nhau; các lần `loadProductForUpdate` sau đó chỉ đọc lại dòng đã khóa.
 */
export async function lockProductsInIdOrder({
  tx,
  storeId,
  productIds,
}: {
  tx: Db
  storeId: string
  productIds: string[]
}) {
  const ids = [...new Set(productIds)].sort()
  if (ids.length === 0) return
  await tx
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.storeId, storeId)))
    .orderBy(asc(products.id))
    .for('update')
}

export async function loadProductForUpdate({
  tx,
  storeId,
  productId,
}: {
  tx: Db
  storeId: string
  productId: string
}) {
  const rows = await tx
    .select()
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    )
    .for('update')
    .limit(1)
  const target = rows[0]
  if (!target) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  return target
}

export async function loadVariantForUpdate({
  tx,
  productId,
  variantId,
}: {
  tx: Db
  productId: string
  variantId: string
}) {
  const rows = await tx
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
        isNull(productVariants.deletedAt),
      ),
    )
    .for('update')
    .limit(1)
  const v = rows[0]
  if (!v) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy biến thể')
  }
  return v
}

export async function aggregateVariantStock({
  tx,
  productId,
}: {
  tx: Db
  productId: string
}): Promise<number> {
  const rows = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)`.mapWith(parseQuantity),
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
  return rows[0]?.total ?? 0
}
