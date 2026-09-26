import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import {
  customerGroups,
  customerPrices,
  customers,
  priceListItems,
  priceLists,
  type PriceSources,
  products,
  productUnitConversions,
  type ResolvedPrice,
  type ResolvedPriceItem,
  resolvePriceFromSources,
  type ResolvePricesInput,
  selectVariantScoped,
  volumePrices,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toIsoDate } from '../lib/date.js'
import { ApiError } from '../lib/errors.js'
import { listCategoryDiscountCandidates } from './category-discounts.service.js'

interface ResolveContext {
  db: Db
  storeId: string
  customerId: string | null
  priceListId?: string | null
  productId: string
  variantId?: string | null
  unitConversionId?: string | null
  quantity: number
  context?: {
    customerGroupId?: string | null
    orderDate?: Date
  }
}

async function findUnitConversion(
  db: Db,
  storeId: string,
  productId: string,
  unitConversionId: string,
): Promise<{ conversionFactor: number; sellingPrice: number | null } | null> {
  const rows = await db
    .select({
      conversionFactor: productUnitConversions.conversionFactor,
      sellingPrice: productUnitConversions.sellingPrice,
    })
    .from(productUnitConversions)
    .where(
      and(
        eq(productUnitConversions.id, unitConversionId),
        eq(productUnitConversions.productId, productId),
        eq(productUnitConversions.storeId, storeId),
      ),
    )
    .limit(1)
  if (!rows[0]) return null
  const sp =
    rows[0].sellingPrice != null && Number(rows[0].sellingPrice) > 0
      ? Number(rows[0].sellingPrice)
      : null
  return {
    conversionFactor: Number(rows[0].conversionFactor),
    sellingPrice: sp,
  }
}

/** Dòng theo sản phẩm (variant_id null) cộng dòng riêng của biến thể đang bán, nếu có (POS-08) */
function variantScope(column: AnyPgColumn, variantId: string | null): SQL {
  return variantId ? or(isNull(column), eq(column, variantId))! : isNull(column)
}

async function findCustomerPrice(
  db: Db,
  storeId: string,
  customerId: string,
  productId: string,
  variantId: string | null,
): Promise<number | null> {
  const rows = await db
    .select({ price: customerPrices.price, variantId: customerPrices.variantId })
    .from(customerPrices)
    .where(
      and(
        eq(customerPrices.storeId, storeId),
        eq(customerPrices.customerId, customerId),
        eq(customerPrices.productId, productId),
        variantScope(customerPrices.variantId, variantId),
      ),
    )
  const row = selectVariantScoped(rows, variantId)[0]
  return row ? Number(row.price) : null
}

/** Mọi bậc giá theo số lượng của dòng (chọn theo biến thể); ngưỡng lọc ở `resolvePriceFromSources` */
async function findVolumeTiers(
  db: Db,
  storeId: string,
  productId: string,
  variantId: string | null,
): Promise<Array<{ price: number; minQty: number }>> {
  const rows = await db
    .select({
      price: volumePrices.price,
      minQty: volumePrices.minQty,
      variantId: volumePrices.variantId,
    })
    .from(volumePrices)
    .where(
      and(
        eq(volumePrices.storeId, storeId),
        eq(volumePrices.productId, productId),
        variantScope(volumePrices.variantId, variantId),
      ),
    )
  return selectVariantScoped(rows, variantId).map((r) => ({
    minQty: r.minQty,
    price: Number(r.price),
  }))
}

async function findPriceListPrice(
  db: Db,
  storeId: string,
  customerId: string,
  productId: string,
  variantId: string | null,
  today: Date,
): Promise<{ price: number; priceListName: string } | null> {
  const todayStr = toIsoDate(today)

  const rows = await db
    .select({
      price: priceListItems.price,
      variantId: priceListItems.variantId,
      priceListName: priceLists.name,
    })
    .from(customers)
    .innerJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .innerJoin(priceLists, eq(customerGroups.defaultPriceListId, priceLists.id))
    .innerJoin(
      priceListItems,
      and(
        eq(priceListItems.priceListId, priceLists.id),
        eq(priceListItems.productId, productId),
        variantScope(priceListItems.variantId, variantId),
      ),
    )
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId),
        eq(priceLists.storeId, storeId),
        isNull(customers.deletedAt),
        isNull(customerGroups.deletedAt),
        isNull(priceLists.deletedAt),
        eq(priceLists.isActive, true),
        sql`(${priceLists.effectiveFrom} IS NULL OR ${priceLists.effectiveFrom} <= ${todayStr})`,
        sql`(${priceLists.effectiveTo} IS NULL OR ${priceLists.effectiveTo} >= ${todayStr})`,
      ),
    )

  const row = selectVariantScoped(rows, variantId)[0]
  return row ? { price: Number(row.price), priceListName: row.priceListName } : null
}

async function findManualPriceListItem(
  db: Db,
  storeId: string,
  priceListId: string,
  productId: string,
  variantId: string | null,
  today: Date = new Date(),
): Promise<{ price: number; priceListName: string } | null> {
  const todayStr = toIsoDate(today)
  const rows = await db
    .select({
      price: priceListItems.price,
      variantId: priceListItems.variantId,
      priceListName: priceLists.name,
    })
    .from(priceLists)
    .innerJoin(
      priceListItems,
      and(
        eq(priceListItems.priceListId, priceLists.id),
        eq(priceListItems.productId, productId),
        variantScope(priceListItems.variantId, variantId),
      ),
    )
    .where(
      and(
        eq(priceLists.id, priceListId),
        eq(priceLists.storeId, storeId),
        isNull(priceLists.deletedAt),
        eq(priceLists.isActive, true),
        sql`(${priceLists.effectiveFrom} IS NULL OR ${priceLists.effectiveFrom} <= ${todayStr})`,
        sql`(${priceLists.effectiveTo} IS NULL OR ${priceLists.effectiveTo} >= ${todayStr})`,
      ),
    )

  const row = selectVariantScoped(rows, variantId)[0]
  return row ? { price: Number(row.price), priceListName: row.priceListName } : null
}

async function getProduct(db: Db, storeId: string, productId: string) {
  const row = await db.query.products.findFirst({
    where: and(
      eq(products.id, productId),
      eq(products.storeId, storeId),
      isNull(products.deletedAt),
    ),
    columns: { id: true, sellingPrice: true, categoryId: true, name: true },
  })
  return row ?? null
}

async function getCustomerGroupId(
  db: Db,
  storeId: string,
  customerId: string,
): Promise<string | null> {
  const row = await db
    .select({ groupId: customers.groupId })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1)
  return row[0]?.groupId ?? null
}

/**
 * Đọc dữ liệu nguồn từ Postgres rồi ghép giá bằng quy tắc dùng chung `resolvePriceFromSources`
 * (máy bán hàng ngoại tuyến dùng đúng hàm này trên dữ liệu PGlite, OFF-09).
 */
export async function resolveProductPrice(ctx: ResolveContext): Promise<ResolvedPrice> {
  const { db, storeId, customerId, priceListId, productId, variantId, unitConversionId, quantity } =
    ctx

  const product = await getProduct(db, storeId, productId)
  if (!product) return resolvePriceFromSources(EMPTY_SOURCES)

  let variantSellingPrice: number | null = null
  // Biến thể không còn (đã xóa, khác sản phẩm) thì coi như bán theo sản phẩm: không lấy dòng giá
  // riêng của nó
  let liveVariantId: string | null = null
  if (variantId) {
    const variantResult = await db.query.productVariants.findFirst({
      where: (vt, { eq, and, isNull }) =>
        and(
          eq(vt.id, variantId),
          eq(vt.productId, productId),
          eq(vt.storeId, storeId),
          isNull(vt.deletedAt),
        ),
      columns: { id: true, sellingPrice: true },
    })
    variantSellingPrice = variantResult?.sellingPrice ? Number(variantResult.sellingPrice) : null
    liveVariantId = variantResult?.id ?? null
  }

  const unitConversion = unitConversionId
    ? await findUnitConversion(db, storeId, productId, unitConversionId)
    : null

  const sources: PriceSources = {
    quantity,
    product: { sellingPrice: Number(product.sellingPrice) },
    variantSellingPrice,
    unitConversion,
    manualPriceList: null,
    customer: null,
    volumeTiers: await findVolumeTiers(db, storeId, productId, liveVariantId),
  }

  const today = ctx.context?.orderDate ?? new Date()
  if (priceListId) {
    sources.manualPriceList = {
      item: await findManualPriceListItem(
        db,
        storeId,
        priceListId,
        productId,
        liveVariantId,
        today,
      ),
    }
  }

  if (customerId) {
    const customerGroupId = await getCustomerGroupId(db, storeId, customerId)
    const { candidates } = await listCategoryDiscountCandidates({
      db,
      storeId,
      productId,
      customerId,
      customerGroupId,
      date: today,
    })
    sources.customer = {
      customerPrice: await findCustomerPrice(db, storeId, customerId, productId, liveVariantId),
      categoryDiscounts: candidates,
      groupPriceList: await findPriceListPrice(
        db,
        storeId,
        customerId,
        productId,
        liveVariantId,
        today,
      ),
    }
  }

  return resolvePriceFromSources(sources)
}

const EMPTY_SOURCES: PriceSources = {
  product: null,
  variantSellingPrice: null,
  unitConversion: null,
  manualPriceList: null,
  customer: null,
  volumeTiers: [],
  quantity: 0,
}

export async function resolvePrices({
  db,
  storeId,
  input,
}: {
  db: Db
  storeId: string
  input: ResolvePricesInput
}): Promise<ResolvedPriceItem[]> {
  const customerId = input.customerId ?? null
  const priceListId = input.priceListId ?? null

  if (priceListId) {
    const [pl] = await db
      .select({
        id: priceLists.id,
        name: priceLists.name,
        isActive: priceLists.isActive,
        effectiveFrom: priceLists.effectiveFrom,
        effectiveTo: priceLists.effectiveTo,
        deletedAt: priceLists.deletedAt,
      })
      .from(priceLists)
      .where(and(eq(priceLists.id, priceListId), eq(priceLists.storeId, storeId)))
      .limit(1)

    if (!pl || pl.deletedAt !== null) {
      throw new ApiError('VALIDATION_ERROR', 'Bảng giá không tồn tại hoặc không thuộc cửa hàng')
    }
    if (!pl.isActive) {
      throw new ApiError('VALIDATION_ERROR', 'Bảng giá đang ngừng hoạt động')
    }
    const today = toIsoDate(new Date())
    if (pl.effectiveFrom && today < pl.effectiveFrom) {
      throw new ApiError('VALIDATION_ERROR', 'Bảng giá chưa đến ngày hiệu lực')
    }
    if (pl.effectiveTo && today > pl.effectiveTo) {
      throw new ApiError('VALIDATION_ERROR', 'Bảng giá đã hết hiệu lực')
    }
  }

  const results: ResolvedPriceItem[] = []
  for (const item of input.items) {
    const resolved = await resolveProductPrice({
      db,
      storeId,
      customerId,
      priceListId,
      productId: item.productId,
      variantId: item.variantId ?? null,
      unitConversionId: item.unitConversionId ?? null,
      quantity: item.quantity,
    })
    results.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      unitConversionId: item.unitConversionId ?? null,
      price: resolved.price,
      source: resolved.source,
      sourceDetail: resolved.sourceDetail,
      isFallback: resolved.isFallback,
      breakdown: resolved.breakdown,
    })
  }
  return results
}
