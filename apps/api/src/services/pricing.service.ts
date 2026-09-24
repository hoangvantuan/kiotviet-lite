import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  customerGroups,
  customerPrices,
  customers,
  priceListItems,
  priceLists,
  type PriceSource,
  products,
  productUnitConversions,
  type ResolvedPriceItem,
  type ResolvePricesInput,
  type TierBreakdown,
  volumePrices,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { toIsoDate } from '../lib/date.js'
import { ApiError } from '../lib/errors.js'
import { findApplicableCategoryDiscount } from './category-discounts.service.js'

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

interface ResolvedPrice {
  price: number
  source: PriceSource
  sourceDetail: string | null
  isFallback?: boolean
  breakdown: TierBreakdown[]
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

async function findCustomerPrice(
  db: Db,
  storeId: string,
  customerId: string,
  productId: string,
): Promise<number | null> {
  const rows = await db
    .select({ price: customerPrices.price })
    .from(customerPrices)
    .where(
      and(
        eq(customerPrices.storeId, storeId),
        eq(customerPrices.customerId, customerId),
        eq(customerPrices.productId, productId),
      ),
    )
    .limit(1)
  if (!rows[0]) return null
  return Number(rows[0].price)
}

async function findVolumePrice(
  db: Db,
  storeId: string,
  productId: string,
  quantity: number,
): Promise<{ price: number; minQty: number } | null> {
  const rows = await db
    .select({ price: volumePrices.price, minQty: volumePrices.minQty })
    .from(volumePrices)
    .where(
      and(
        eq(volumePrices.storeId, storeId),
        eq(volumePrices.productId, productId),
        sql`${volumePrices.minQty} <= ${quantity}`,
      ),
    )
    .orderBy(desc(volumePrices.minQty))
    .limit(1)
  if (!rows[0]) return null
  return { price: Number(rows[0].price), minQty: rows[0].minQty }
}

async function findPriceListPrice(
  db: Db,
  storeId: string,
  customerId: string,
  productId: string,
): Promise<{ price: number; priceListName: string } | null> {
  const todayStr = toIsoDate(new Date())

  const rows = await db
    .select({
      price: priceListItems.price,
      priceListName: priceLists.name,
    })
    .from(customers)
    .innerJoin(customerGroups, eq(customers.groupId, customerGroups.id))
    .innerJoin(priceLists, eq(customerGroups.defaultPriceListId, priceLists.id))
    .innerJoin(
      priceListItems,
      and(eq(priceListItems.priceListId, priceLists.id), eq(priceListItems.productId, productId)),
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
    .limit(1)

  if (!rows[0]) return null
  return { price: Number(rows[0].price), priceListName: rows[0].priceListName }
}

async function findManualPriceListItem(
  db: Db,
  storeId: string,
  priceListId: string,
  productId: string,
  today: Date = new Date(),
): Promise<{ price: number; priceListName: string } | null> {
  const todayStr = toIsoDate(today)
  const rows = await db
    .select({
      price: priceListItems.price,
      priceListName: priceLists.name,
    })
    .from(priceLists)
    .innerJoin(
      priceListItems,
      and(eq(priceListItems.priceListId, priceLists.id), eq(priceListItems.productId, productId)),
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
    .limit(1)

  if (!rows[0]) return null
  return { price: Number(rows[0].price), priceListName: rows[0].priceListName }
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

export async function resolveProductPrice(ctx: ResolveContext): Promise<ResolvedPrice> {
  const { db, storeId, customerId, priceListId, productId, variantId, unitConversionId, quantity } =
    ctx

  const product = await getProduct(db, storeId, productId)
  if (!product) {
    return {
      price: 0,
      source: 'retail_price',
      sourceDetail: null,
      isFallback: false,
      breakdown: [],
    }
  }

  let rawRetailPrice = Number(product.sellingPrice)
  if (variantId) {
    const variantResult = await db.query.productVariants.findFirst({
      where: (vt, { eq, and, isNull }) =>
        and(
          eq(vt.id, variantId),
          eq(vt.productId, productId),
          eq(vt.storeId, storeId),
          isNull(vt.deletedAt),
        ),
      columns: { sellingPrice: true },
    })
    const variantSellingPrice = variantResult?.sellingPrice
      ? Number(variantResult.sellingPrice)
      : null
    if (variantSellingPrice !== null && variantSellingPrice > 0) {
      rawRetailPrice = variantSellingPrice
    }
  }

  let unitConv: { conversionFactor: number; sellingPrice: number | null } | null = null
  if (unitConversionId) {
    unitConv = await findUnitConversion(db, storeId, productId, unitConversionId)
  }

  const conversionFactor = unitConv?.conversionFactor ?? 1
  const retailPrice = unitConv?.sellingPrice ?? Math.round(rawRetailPrice * conversionFactor)

  const breakdown: TierBreakdown[] = []
  let winner: { price: number; source: PriceSource; sourceDetail: string | null } | null = null
  let isFallback = false

  if (priceListId) {
    const today = ctx.context?.orderDate ?? new Date()
    const manualItem = await findManualPriceListItem(db, storeId, priceListId, productId, today)
    if (manualItem) {
      // Ensure selected manual list price wins unitConversion.sellingPrice (scale by factor)
      const manualPrice = Math.round(manualItem.price * conversionFactor)
      winner = {
        price: manualPrice,
        source: 'price_list',
        sourceDetail: manualItem.priceListName,
      }
      breakdown.push({
        tier: 1,
        name: `Bảng giá (${manualItem.priceListName})`,
        price: manualPrice,
        matched: true,
        reason: `Bảng giá: ${manualItem.priceListName}`,
      })
    } else {
      isFallback = true
      breakdown.push({
        tier: 1,
        name: 'Bảng giá thủ công',
        price: null,
        matched: false,
        reason: 'Không có trong bảng giá đã chọn (dùng giá dự phòng)',
      })
    }
  }

  if (customerId) {
    const rawCp = await findCustomerPrice(db, storeId, customerId, productId)
    const cp =
      rawCp !== null ? (unitConv?.sellingPrice ?? Math.round(rawCp * conversionFactor)) : null
    const t1Hit = !winner && cp !== null && cp >= 0
    breakdown.push({
      tier: 1,
      name: 'Giá riêng KH',
      price: cp,
      matched: t1Hit,
      reason: cp !== null ? `Giá riêng: ${cp.toLocaleString('vi-VN')}đ` : 'Không có giá riêng',
    })
    if (t1Hit) {
      winner = {
        price: cp!,
        source: 'customer_price',
        sourceDetail: isFallback ? 'Giá dự phòng: Giá riêng cho KH' : 'Giá riêng cho KH',
      }
    }

    const customerGroupId = await getCustomerGroupId(db, storeId, customerId)
    const catDiscount = await findApplicableCategoryDiscount({
      db,
      storeId,
      productId,
      customerId,
      customerGroupId,
      quantity,
      basePrice: retailPrice,
    })
    const catDetail = catDiscount
      ? catDiscount.discountType === 'percent'
        ? `Giảm ${catDiscount.discountValue}%`
        : `Giảm ${catDiscount.discountValue.toLocaleString('vi-VN')}đ`
      : null
    const t2Hit = !winner && catDiscount !== null && catDiscount.finalPrice >= 0
    breakdown.push({
      tier: 2,
      name: 'CK danh mục',
      price: catDiscount?.finalPrice ?? null,
      matched: t2Hit,
      reason: catDetail ?? 'Không có CK danh mục',
    })
    if (t2Hit) {
      winner = {
        price: catDiscount!.finalPrice,
        source: 'category_discount',
        sourceDetail: isFallback ? `Giá dự phòng: ${catDetail}` : catDetail,
      }
    }
  } else {
    breakdown.push({
      tier: 1,
      name: 'Giá riêng KH',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
    breakdown.push({
      tier: 2,
      name: 'CK danh mục',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
  }

  breakdown.push({
    tier: 3,
    name: 'Giá chỉnh tay',
    price: null,
    matched: false,
    reason: 'Client state',
  })

  const rawVp = await findVolumePrice(db, storeId, productId, quantity)
  const vpPrice =
    rawVp !== null ? (unitConv?.sellingPrice ?? Math.round(rawVp.price * conversionFactor)) : null
  const t4Hit = !winner && vpPrice !== null && vpPrice >= 0
  breakdown.push({
    tier: 4,
    name: 'Giá theo SL',
    price: vpPrice,
    matched: t4Hit,
    reason:
      rawVp !== null
        ? `SL >= ${rawVp.minQty}: ${vpPrice?.toLocaleString('vi-VN')}đ`
        : 'Không có giá SL phù hợp',
  })
  if (t4Hit) {
    winner = {
      price: vpPrice!,
      source: 'volume_price',
      sourceDetail: isFallback ? `Giá dự phòng: SL >= ${rawVp!.minQty}` : `SL >= ${rawVp!.minQty}`,
    }
  }

  if (customerId) {
    const rawPlp = await findPriceListPrice(db, storeId, customerId, productId)
    const plpPrice =
      rawPlp !== null
        ? (unitConv?.sellingPrice ?? Math.round(rawPlp.price * conversionFactor))
        : null
    const t5Hit = !winner && plpPrice !== null && plpPrice >= 0
    breakdown.push({
      tier: 5,
      name: 'Bảng giá nhóm KH',
      price: plpPrice,
      matched: t5Hit,
      reason: rawPlp ? `Bảng giá: ${rawPlp.priceListName}` : 'Không có bảng giá nhóm',
    })
    if (t5Hit) {
      winner = {
        price: plpPrice!,
        source: 'price_list',
        sourceDetail: isFallback ? `Giá dự phòng: ${rawPlp!.priceListName}` : rawPlp!.priceListName,
      }
    }
  } else {
    breakdown.push({
      tier: 5,
      name: 'Bảng giá nhóm KH',
      price: null,
      matched: false,
      reason: 'Khách lẻ',
    })
  }

  const t6Hit = !winner
  breakdown.push({
    tier: 6,
    name: 'Giá bán lẻ',
    price: retailPrice,
    matched: t6Hit,
    reason: `Giá lẻ: ${retailPrice.toLocaleString('vi-VN')}đ`,
  })

  if (winner) {
    return { ...winner, isFallback, breakdown }
  }
  return {
    price: retailPrice,
    source: 'retail_price',
    sourceDetail: isFallback ? 'Giá dự phòng: Giá bán lẻ' : null,
    isFallback,
    breakdown,
  }
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
