import type { ResolvedPriceItem, ResolvePricesInput } from '../schema/pricing-resolve.js'
import type { PosProductItem, PosUnitConversion, PosVariantItem } from '../types/pos.js'
import { resolveEffectiveDebtLimit } from '../utils/debt-limit.js'
import {
  type CategoryDiscountRule,
  isEffectiveOn,
  type PriceSources,
  rankCategoryDiscounts,
  resolvePriceFromSources,
  selectVariantScoped,
  storeIsoDate,
} from '../utils/price-resolution.js'
import { addQty, parseQuantity } from '../utils/quantity.js'
import { normalizeSearchText, searchLikePattern } from '../utils/search-text.js'
import type { OfflineSqlExecutor } from './catalog-store.js'

const num = (value: unknown): number => Number(value)
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

// ---------------------------------------------------------------------------
// Tìm hàng (OFF-09): cùng điều kiện với searchProductsForPos của máy chủ
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string
  name: string
  sku: string
  barcode: string | null
  unit: string
  selling_price: unknown
  cost_price: unknown
  image_url: string | null
  track_inventory: boolean
  /** numeric: PGlite trả chuỗi */
  current_stock: unknown
  allow_decimal_quantity: boolean
  has_variants: boolean
  category_id: string | null
}

interface VariantRow {
  id: string
  product_id: string
  sku: string
  barcode: string | null
  attribute1_name: string
  attribute1_value: string
  attribute2_name: string | null
  attribute2_value: string | null
  selling_price: unknown
  cost_price: unknown
  stock_quantity: unknown
  status: string
}

const PRODUCT_COLUMNS = `p.id, p.name, p.sku, p.barcode, p.unit, p.selling_price, p.cost_price,
  p.image_url, p.track_inventory, p.current_stock, p.allow_decimal_quantity, p.has_variants, p.category_id`

function mapVariant(v: VariantRow, includeCost: boolean): PosVariantItem {
  const attributes: Record<string, string> = {}
  if (v.attribute1_name) attributes[v.attribute1_name] = v.attribute1_value
  if (v.attribute2_name && v.attribute2_value) attributes[v.attribute2_name] = v.attribute2_value
  return {
    id: v.id,
    name: [v.attribute1_value, v.attribute2_value].filter(Boolean).join(' - '),
    sku: v.sku,
    barcode: v.barcode,
    price: num(v.selling_price),
    ...(includeCost ? { costPrice: numOrNull(v.cost_price) } : {}),
    stockQuantity: parseQuantity(v.stock_quantity),
    attributes,
  }
}

async function hydrateProducts(
  db: OfflineSqlExecutor,
  storeId: string,
  rows: ProductRow[],
  includeCost: boolean,
): Promise<PosProductItem[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const variantRows = (
    await db.query<VariantRow>(
      `SELECT * FROM catalog_variants WHERE store_id = $1 AND product_id = ANY($2::uuid[])
       ORDER BY created_at, id`,
      [storeId, ids],
    )
  ).rows
  const variants = new Map<string, PosVariantItem[]>()
  const variantStock = new Map<string, number>()
  for (const v of variantRows) {
    // Tồn kho hàng có biến thể cộng mọi biến thể chưa xóa, kể cả ngừng bán (như máy chủ)
    variantStock.set(
      v.product_id,
      addQty(variantStock.get(v.product_id) ?? 0, parseQuantity(v.stock_quantity)),
    )
    if (v.status !== 'active') continue
    const list = variants.get(v.product_id) ?? []
    list.push(mapVariant(v, includeCost))
    variants.set(v.product_id, list)
  }

  const ucRows = (
    await db.query<{
      id: string
      product_id: string
      unit: string
      conversion_factor: number
      selling_price: unknown
      allow_decimal_quantity: boolean
    }>(
      `SELECT id, product_id, unit, conversion_factor, selling_price, allow_decimal_quantity
       FROM catalog_unit_conversions
       WHERE store_id = $1 AND product_id = ANY($2::uuid[]) ORDER BY sort_order, created_at, id`,
      [storeId, ids],
    )
  ).rows
  const units = new Map<string, PosUnitConversion[]>()
  for (const uc of ucRows) {
    const price = numOrNull(uc.selling_price)
    const list = units.get(uc.product_id) ?? []
    list.push({
      id: uc.id,
      unit: uc.unit,
      conversionFactor: uc.conversion_factor,
      sellingPrice: price !== null && price > 0 ? price : null,
      allowDecimalQuantity: uc.allow_decimal_quantity,
    })
    units.set(uc.product_id, list)
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    unit: row.unit,
    basePrice: num(row.selling_price),
    ...(includeCost ? { costPrice: numOrNull(row.cost_price) } : {}),
    imageUrl: row.image_url,
    trackInventory: row.track_inventory,
    stockQuantity: row.has_variants
      ? (variantStock.get(row.id) ?? 0)
      : parseQuantity(row.current_stock),
    allowDecimalQuantity: row.allow_decimal_quantity,
    hasVariants: row.has_variants,
    categoryId: row.category_id,
    variants: variants.get(row.id) ?? [],
    unitConversions: units.get(row.id) ?? [],
  }))
}

/**
 * Tìm hàng trên bản sao cục bộ: tên hoặc mã không dấu, mã vạch đúng, mã hoặc mã vạch biến thể.
 * Kết quả cùng dạng với GET /pos/products/search, kèm biến thể và đơn vị quy đổi.
 */
export async function searchCatalogProducts(
  db: OfflineSqlExecutor,
  {
    storeId,
    search,
    categoryId,
    includeCost,
    limit = 500,
  }: {
    storeId: string
    search?: string
    categoryId?: string
    includeCost: boolean
    limit?: number
  },
): Promise<PosProductItem[]> {
  const params: unknown[] = [storeId]
  const conds = [`p.store_id = $1`, `p.status = 'active'`]
  const term = search?.trim() ?? ''
  if (term) {
    params.push(searchLikePattern(term), term)
    conds.push(`(p.search_text LIKE $${params.length - 1} OR p.barcode = $${params.length})`)
  }
  if (categoryId) {
    params.push(categoryId)
    conds.push(`p.category_id = $${params.length}`)
  }
  params.push(limit)
  const base = (
    await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM catalog_products p WHERE ${conds.join(' AND ')}
       ORDER BY p.name LIMIT $${params.length}`,
      params,
    )
  ).rows

  let rows = base
  if (term) {
    const lowerLike = `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const extra = (
      await db.query<ProductRow>(
        `SELECT DISTINCT ON (p.id) ${PRODUCT_COLUMNS} FROM catalog_products p
         JOIN catalog_variants v ON v.store_id = p.store_id AND v.product_id = p.id
         WHERE p.store_id = $1 AND p.status = 'active'
           AND (lower(v.sku) LIKE $2 OR v.barcode = $3) AND NOT (p.id = ANY($4::uuid[]))
         ORDER BY p.id`,
        [storeId, lowerLike, term, base.map((r) => r.id)],
      )
    ).rows
    rows = [...base, ...extra]
  }
  return hydrateProducts(db, storeId, rows, includeCost)
}

/** Máy quét: khớp đúng mã vạch hoặc mã hàng (không phân biệt hoa thường), như đường Enter online */
export async function findCatalogProductByCode(
  db: OfflineSqlExecutor,
  { storeId, code, includeCost }: { storeId: string; code: string; includeCost: boolean },
): Promise<PosProductItem[]> {
  const term = code.trim()
  if (!term) return []
  const rows = (
    await db.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM catalog_products p
       WHERE p.store_id = $1 AND p.status = 'active' AND (p.barcode = $2 OR lower(p.sku) = lower($2)
         OR EXISTS (SELECT 1 FROM catalog_variants v WHERE v.store_id = p.store_id
           AND v.product_id = p.id AND v.status = 'active'
           AND (v.barcode = $2 OR lower(v.sku) = lower($2))))
       ORDER BY p.name LIMIT 20`,
      [storeId, term],
    )
  ).rows
  return hydrateProducts(db, storeId, rows, includeCost)
}

// ---------------------------------------------------------------------------
// Khách hàng và công nợ (OFF-09, OFF-15)
// ---------------------------------------------------------------------------

export interface CatalogCustomer {
  id: string
  name: string
  code: string
  phone: string | null
  groupId: string | null
  groupName: string | null
  currentDebt: number
}

/** Tìm khách theo tên, mã, số điện thoại, không dấu */
export async function searchCatalogCustomers(
  db: OfflineSqlExecutor,
  { storeId, search, limit = 10 }: { storeId: string; search: string; limit?: number },
): Promise<CatalogCustomer[]> {
  const term = normalizeSearchText(search.trim())
  const { rows } = await db.query<{
    id: string
    name: string
    code: string
    phone: string | null
    group_id: string | null
    group_name: string | null
    current_debt: unknown
  }>(
    `SELECT c.id, c.name, c.code, c.phone, c.group_id, g.name AS group_name, c.current_debt
     FROM catalog_customers c
     LEFT JOIN catalog_customer_groups g ON g.store_id = c.store_id AND g.id = c.group_id
     WHERE c.store_id = $1 AND ($2 = '' OR c.search_text LIKE $3)
     ORDER BY c.name LIMIT $4`,
    [storeId, term, searchLikePattern(search), limit],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    phone: r.phone,
    groupId: r.group_id,
    groupName: r.group_name,
    currentDebt: num(r.current_debt),
  }))
}

export interface CatalogCustomerDebt {
  customerId: string
  customerName: string
  groupId: string | null
  groupName: string | null
  currentDebt: number
  customerDebtLimit: number | null
  groupDebtLimit: number | null
  debtUnlimited: boolean
  effectiveDebtLimit: number | null
}

/** Nợ và hạn mức của khách theo lần đồng bộ gần nhất, cùng dạng GET /pos/customer-debt/:id */
export async function getCatalogCustomerDebt(
  db: OfflineSqlExecutor,
  { storeId, customerId }: { storeId: string; customerId: string },
): Promise<CatalogCustomerDebt | null> {
  const { rows } = await db.query<{
    id: string
    name: string
    group_id: string | null
    group_name: string | null
    group_debt_limit: unknown
    debt_limit: unknown
    debt_unlimited: boolean
    current_debt: unknown
  }>(
    `SELECT c.id, c.name, c.group_id, g.name AS group_name, g.debt_limit AS group_debt_limit,
       c.debt_limit, c.debt_unlimited, c.current_debt
     FROM catalog_customers c
     LEFT JOIN catalog_customer_groups g ON g.store_id = c.store_id AND g.id = c.group_id
     WHERE c.store_id = $1 AND c.id = $2`,
    [storeId, customerId],
  )
  const row = rows[0]
  if (!row) return null
  const customerDebtLimit = numOrNull(row.debt_limit)
  const groupDebtLimit = numOrNull(row.group_debt_limit)
  return {
    customerId: row.id,
    customerName: row.name,
    groupId: row.group_id,
    groupName: row.group_name,
    currentDebt: num(row.current_debt),
    customerDebtLimit,
    groupDebtLimit,
    debtUnlimited: row.debt_unlimited,
    effectiveDebtLimit: resolveEffectiveDebtLimit({
      debtUnlimited: row.debt_unlimited,
      customerDebtLimit,
      groupDebtLimit,
    }),
  }
}

// ---------------------------------------------------------------------------
// Tính giá ngoại tuyến (OFF-09): đọc nguồn từ PGlite, ghép bằng resolvePriceFromSources
// ---------------------------------------------------------------------------

export class OfflinePriceListError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfflinePriceListError'
  }
}

async function first<T>(db: OfflineSqlExecutor, sql: string, params: unknown[]): Promise<T | null> {
  return (await db.query<T>(sql, params)).rows[0] ?? null
}

/**
 * Cùng đầu vào, cùng quy tắc với POST /pos/resolve-prices, trên dữ liệu đã đồng bộ. Bảng giá thu
 * ngân chọn không dùng được thì ném OfflinePriceListError với đúng thông điệp của máy chủ.
 */
export async function resolvePricesOffline(
  db: OfflineSqlExecutor,
  {
    storeId,
    input,
    today = storeIsoDate(),
  }: { storeId: string; input: ResolvePricesInput; today?: string },
): Promise<ResolvedPriceItem[]> {
  const customerId = input.customerId ?? null
  const priceListId = input.priceListId ?? null

  let manualList: { id: string; name: string } | null = null
  if (priceListId) {
    const pl = await first<{
      id: string
      name: string
      is_active: boolean
      effective_from: string | null
      effective_to: string | null
    }>(db, 'SELECT * FROM catalog_price_lists WHERE store_id = $1 AND id = $2', [
      storeId,
      priceListId,
    ])
    if (!pl) throw new OfflinePriceListError('Bảng giá không tồn tại hoặc không thuộc cửa hàng')
    if (!pl.is_active) throw new OfflinePriceListError('Bảng giá đang ngừng hoạt động')
    if (pl.effective_from && today < pl.effective_from) {
      throw new OfflinePriceListError('Bảng giá chưa đến ngày hiệu lực')
    }
    if (pl.effective_to && today > pl.effective_to) {
      throw new OfflinePriceListError('Bảng giá đã hết hiệu lực')
    }
    manualList = { id: pl.id, name: pl.name }
  }

  // Dữ liệu theo khách dùng chung cho mọi dòng
  let customerGroupId: string | null = null
  let groupList: { id: string; name: string } | null = null
  if (customerId) {
    const customer = await first<{ group_id: string | null }>(
      db,
      'SELECT group_id FROM catalog_customers WHERE store_id = $1 AND id = $2',
      [storeId, customerId],
    )
    customerGroupId = customer?.group_id ?? null
    if (customerGroupId) {
      const list = await first<{
        id: string
        name: string
        is_active: boolean
        effective_from: string | null
        effective_to: string | null
      }>(
        db,
        `SELECT pl.id, pl.name, pl.is_active, pl.effective_from, pl.effective_to
         FROM catalog_customer_groups g
         JOIN catalog_price_lists pl ON pl.store_id = g.store_id AND pl.id = g.default_price_list_id
         WHERE g.store_id = $1 AND g.id = $2`,
        [storeId, customerGroupId],
      )
      if (
        list &&
        isEffectiveOn(
          {
            isActive: list.is_active,
            effectiveFrom: list.effective_from,
            effectiveTo: list.effective_to,
          },
          today,
        )
      ) {
        groupList = { id: list.id, name: list.name }
      }
    }
  }

  // POS-08: dòng theo sản phẩm (variant_id null) cộng dòng riêng của biến thể đang bán, rồi chọn
  // bằng cùng quy tắc với máy chủ (selectVariantScoped)
  const scoped = async <T extends { variant_id: string | null }>(
    sql: string,
    params: unknown[],
    variantId: string | null,
  ): Promise<T[]> => {
    const rows = (
      await db.query<T>(`${sql} AND (variant_id IS NULL OR variant_id = $${params.length + 1})`, [
        ...params,
        variantId,
      ])
    ).rows
    return selectVariantScoped(
      rows.map((r) => ({ ...r, variantId: r.variant_id })),
      variantId,
    )
  }

  const listPrice = async (listId: string, productId: string, variantId: string | null) => {
    const [row] = await scoped<{ price: unknown; variant_id: string | null }>(
      `SELECT price, variant_id FROM catalog_price_list_items
       WHERE store_id = $1 AND price_list_id = $2 AND product_id = $3`,
      [storeId, listId, productId],
      variantId,
    )
    return row ? num(row.price) : null
  }

  const results: ResolvedPriceItem[] = []
  for (const item of input.items) {
    const product = await first<{ selling_price: unknown; category_id: string | null }>(
      db,
      'SELECT selling_price, category_id FROM catalog_products WHERE store_id = $1 AND id = $2',
      [storeId, item.productId],
    )
    const sources: PriceSources = {
      product: product ? { sellingPrice: num(product.selling_price) } : null,
      variantSellingPrice: null,
      unitConversion: null,
      manualPriceList: null,
      customer: null,
      volumeTiers: [],
      quantity: item.quantity,
    }

    if (product) {
      // Biến thể không còn trong bản sao thì bán theo sản phẩm, như máy chủ
      let variantId: string | null = null
      if (item.variantId) {
        const v = await first<{ id: string; selling_price: unknown }>(
          db,
          `SELECT id, selling_price FROM catalog_variants WHERE store_id = $1 AND id = $2 AND product_id = $3`,
          [storeId, item.variantId, item.productId],
        )
        sources.variantSellingPrice = v?.selling_price ? num(v.selling_price) : null
        variantId = v?.id ?? null
      }
      if (item.unitConversionId) {
        const uc = await first<{ conversion_factor: number; selling_price: unknown }>(
          db,
          `SELECT conversion_factor, selling_price FROM catalog_unit_conversions
           WHERE store_id = $1 AND id = $2 AND product_id = $3`,
          [storeId, item.unitConversionId, item.productId],
        )
        if (uc) {
          const sp = numOrNull(uc.selling_price)
          sources.unitConversion = {
            conversionFactor: num(uc.conversion_factor),
            sellingPrice: sp !== null && sp > 0 ? sp : null,
          }
        }
      }

      const tiers = (
        await scoped<{ min_qty: unknown; price: unknown; variant_id: string | null }>(
          'SELECT min_qty, price, variant_id FROM catalog_volume_prices WHERE store_id = $1 AND product_id = $2',
          [storeId, item.productId],
          variantId,
        )
      ).map((r) => ({ minQty: parseQuantity(r.min_qty), price: num(r.price) }))
      sources.volumeTiers = tiers

      if (manualList) {
        const price = await listPrice(manualList.id, item.productId, variantId)
        sources.manualPriceList = {
          item: price !== null ? { price, priceListName: manualList.name } : null,
        }
      }

      if (customerId) {
        const [cp] = await scoped<{ price: unknown; variant_id: string | null }>(
          `SELECT price, variant_id FROM catalog_customer_prices
           WHERE store_id = $1 AND customer_id = $2 AND product_id = $3`,
          [storeId, customerId, item.productId],
          variantId,
        )
        const rules = product.category_id
          ? (
              await db.query<{
                id: string
                category_id: string
                customer_id: string | null
                customer_group_id: string | null
                discount_type: 'percent' | 'amount'
                discount_value: unknown
                min_qty: number
                effective_from: string | null
                effective_to: string | null
                is_active: boolean
              }>(
                'SELECT * FROM catalog_category_discounts WHERE store_id = $1 AND category_id = $2',
                [storeId, product.category_id],
              )
            ).rows.map(
              (r): CategoryDiscountRule => ({
                id: r.id,
                categoryId: r.category_id,
                customerId: r.customer_id,
                customerGroupId: r.customer_group_id,
                discountType: r.discount_type,
                discountValue: num(r.discount_value),
                minQty: r.min_qty,
                effectiveFrom: r.effective_from,
                effectiveTo: r.effective_to,
                isActive: r.is_active,
              }),
            )
          : []
        const ranked = rankCategoryDiscounts(rules, {
          categoryId: product.category_id,
          customerId,
          customerGroupId,
          today,
        })
        const groupPrice = groupList
          ? await listPrice(groupList.id, item.productId, variantId)
          : null
        sources.customer = {
          customerPrice: cp ? num(cp.price) : null,
          categoryDiscounts: ranked,
          groupPriceList:
            groupPrice !== null && groupList
              ? { price: groupPrice, priceListName: groupList.name }
              : null,
        }
      }
    }

    const resolved = resolvePriceFromSources(sources)
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
