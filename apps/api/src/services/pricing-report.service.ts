import { subDays } from 'date-fns'
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'

import {
  orderItems,
  orders,
  type PriceComparisonResponse,
  type PriceHistoryResponse,
  priceListItems,
  priceLists,
  type PriceOverridesResponse,
  products,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

function parseDateRange(from?: string, to?: string) {
  const now = new Date()
  return {
    start: from ? new Date(from + 'T00:00:00Z') : subDays(now, 30),
    end: to ? new Date(to + 'T23:59:59.999Z') : now,
  }
}

export async function getPriceOverrides(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
): Promise<PriceOverridesResponse> {
  const { start, end } = parseDateRange(from, to)

  const result = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderDate: orders.createdAt,
      productName: orderItems.productName,
      originalPrice: orderItems.originalPrice,
      overridePrice: orderItems.unitPrice,
      userName: users.name,
      reason: orderItems.priceOverrideReason,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orderItems.priceOverride, true),
        gte(orders.createdAt, start),
        lte(orders.createdAt, end),
      ),
    )
    .orderBy(sql`${orders.createdAt} DESC`)

  const rows = result.map((r) => ({
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    orderDate: r.orderDate.toISOString(),
    productName: r.productName,
    originalPrice: Number(r.originalPrice ?? 0),
    overridePrice: Number(r.overridePrice),
    difference: Number(r.overridePrice) - Number(r.originalPrice ?? 0),
    userName: r.userName,
    reason: r.reason,
  }))

  return { rows }
}

export async function getPriceComparison(
  db: Db,
  storeId: string,
): Promise<PriceComparisonResponse> {
  const activePriceLists = await db
    .select({ id: priceLists.id, name: priceLists.name })
    .from(priceLists)
    .where(
      and(
        eq(priceLists.storeId, storeId),
        eq(priceLists.isActive, true),
        isNull(priceLists.deletedAt),
      ),
    )
    .orderBy(priceLists.name)

  if (activePriceLists.length === 0) {
    return { priceLists: [], rows: [] }
  }

  const priceListIds = activePriceLists.map((pl) => pl.id)
  const priceListNames = activePriceLists.map((pl) => pl.name)

  const allItems = await db
    .select({
      productId: priceListItems.productId,
      priceListId: priceListItems.priceListId,
      price: priceListItems.price,
    })
    .from(priceListItems)
    .where(
      sql`${priceListItems.priceListId} IN (${sql.join(
        priceListIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )

  const priceMap = new Map<string, Map<string, number>>()
  for (const item of allItems) {
    if (!priceMap.has(item.productId)) {
      priceMap.set(item.productId, new Map())
    }
    priceMap.get(item.productId)!.set(item.priceListId, Number(item.price))
  }

  const productIds = [...priceMap.keys()]
  if (productIds.length === 0) {
    return { priceLists: priceListNames, rows: [] }
  }

  const productList = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        isNull(products.deletedAt),
        sql`${products.id} IN (${sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(products.name)

  const rows = productList.map((p) => {
    const productPrices = priceMap.get(p.id)
    const costPrice = Number(p.costPrice ?? 0)
    const prices = priceListIds.map((plId) => productPrices?.get(plId) ?? null)
    const margins = prices.map((price) => {
      if (price === null || price === 0) return null
      return Math.round(((price - costPrice) / price) * 1000) / 10
    })

    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      costPrice,
      prices,
      margins,
    }
  })

  return { priceLists: priceListNames, rows }
}

export async function getPriceHistory(
  db: Db,
  storeId: string,
  from: string | undefined,
  to: string | undefined,
  productId: string | undefined,
): Promise<PriceHistoryResponse> {
  const { start, end } = parseDateRange(from, to)

  const conditions = [
    eq(purchaseOrders.storeId, storeId),
    gte(purchaseOrders.purchaseDate, start),
    lte(purchaseOrders.purchaseDate, end),
  ]

  if (productId) {
    conditions.push(eq(purchaseOrderItems.productId, productId))
  }

  const result = await db
    .select({
      productId: purchaseOrderItems.productId,
      productName: purchaseOrderItems.productNameSnapshot,
      purchaseDate: purchaseOrders.purchaseDate,
      supplierName: suppliers.name,
      unitPrice: purchaseOrderItems.unitPrice,
      costAfter: purchaseOrderItems.costAfter,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(sql`${purchaseOrders.purchaseDate} DESC`)

  const rows = result.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    purchaseDate: r.purchaseDate.toISOString().slice(0, 10),
    supplierName: r.supplierName,
    unitPrice: Number(r.unitPrice),
    costAfter: r.costAfter !== null ? Number(r.costAfter) : null,
  }))

  return { rows }
}
