import { and, eq, isNull, sql } from 'drizzle-orm'

import { products, productVariants } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

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
    .where(eq(products.id, productId))
    .for('update')
    .limit(1)
  const target = rows[0]
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
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
    .where(eq(productVariants.id, variantId))
    .for('update')
    .limit(1)
  const v = rows[0]
  if (!v || v.productId !== productId || v.deletedAt !== null) {
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
      total: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)::int`,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)))
  return Number(rows[0]?.total ?? 0)
}
