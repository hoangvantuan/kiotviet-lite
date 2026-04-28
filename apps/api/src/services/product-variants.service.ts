import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { inventoryTransactions, productVariants, type VariantItem } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

const SKU_REGEX = /^[A-Za-z0-9_\-./]+$/

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface VariantRow {
  id: string
  storeId: string
  productId: string
  sku: string
  barcode: string | null
  attribute1Name: string
  attribute1Value: string
  attribute2Name: string | null
  attribute2Value: string | null
  sellingPrice: number
  costPrice: number | null
  stockQuantity: number
  status: string
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export function toVariantItem(row: VariantRow, hasTransactions = false): VariantItem {
  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    barcode: row.barcode,
    attribute1Name: row.attribute1Name,
    attribute1Value: row.attribute1Value,
    attribute2Name: row.attribute2Name,
    attribute2Value: row.attribute2Value,
    sellingPrice: Number(row.sellingPrice),
    costPrice: row.costPrice === null ? null : Number(row.costPrice),
    stockQuantity: row.stockQuantity,
    status: (row.status as 'active' | 'inactive') ?? 'active',
    hasTransactions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function findVariantsWithTransactions({
  db,
  variantIds,
}: {
  db: Db
  variantIds: string[]
}): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set()
  const rows = await db
    .selectDistinct({ variantId: inventoryTransactions.variantId })
    .from(inventoryTransactions)
    .where(
      and(
        inArray(inventoryTransactions.variantId, variantIds),
        ne(inventoryTransactions.type, 'initial_stock'),
      ),
    )
  return new Set(rows.map((r) => r.variantId).filter((v): v is string => v !== null))
}

interface BuildVariantSkuArgs {
  parentSku: string
  value1: string
  value2: string | null
  index: number
}

export function buildVariantSkuCandidate({
  parentSku,
  value1,
  value2,
  index,
}: BuildVariantSkuArgs): string {
  const parts = [slugify(value1)]
  if (value2 !== null && value2 !== undefined) parts.push(slugify(value2))
  const filtered = parts.filter((p) => p.length > 0)
  if (filtered.length === 0) {
    return `${parentSku}-V${index + 1}`
  }
  const candidate = `${parentSku}-${filtered.join('-')}`
  if (!SKU_REGEX.test(candidate)) {
    return `${parentSku}-V${index + 1}`
  }
  return candidate
}

interface GenerateUniqueVariantSkuArgs {
  db: Db
  storeId: string
  parentSku: string
  value1: string
  value2: string | null
  index: number
  reserved: Set<string>
}

export async function generateUniqueVariantSku({
  db,
  storeId,
  parentSku,
  value1,
  value2,
  index,
  reserved,
}: GenerateUniqueVariantSkuArgs): Promise<string> {
  const base = buildVariantSkuCandidate({ parentSku, value1, value2, index })
  const candidates = [base]
  for (let i = 2; i <= 6; i++) candidates.push(`${base}-${i}`)

  for (const cand of candidates) {
    const lower = cand.toLowerCase()
    if (reserved.has(lower)) continue
    const taken = await isVariantSkuTaken({ db, storeId, sku: cand })
    if (!taken) {
      reserved.add(lower)
      return cand
    }
  }
  throw new ApiError('INTERNAL_ERROR', 'Không tạo được SKU biến thể duy nhất, vui lòng nhập tay')
}

export async function isVariantSkuTaken({
  db,
  storeId,
  sku,
  excludeId,
}: {
  db: Db
  storeId: string
  sku: string
  excludeId?: string
}): Promise<boolean> {
  const conds = [
    eq(productVariants.storeId, storeId),
    isNull(productVariants.deletedAt),
    sql`LOWER(${productVariants.sku}) = LOWER(${sku})`,
  ]
  if (excludeId) conds.push(ne(productVariants.id, excludeId))
  const rows = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(...conds))
    .limit(1)
  return rows.length > 0
}

export async function isVariantBarcodeTaken({
  db,
  storeId,
  barcode,
  excludeId,
}: {
  db: Db
  storeId: string
  barcode: string
  excludeId?: string
}): Promise<boolean> {
  const conds = [
    eq(productVariants.storeId, storeId),
    isNull(productVariants.deletedAt),
    eq(productVariants.barcode, barcode),
  ]
  if (excludeId) conds.push(ne(productVariants.id, excludeId))
  const rows = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(...conds))
    .limit(1)
  return rows.length > 0
}

export async function findTakenVariantSkus({
  db,
  storeId,
  skus,
  excludeIds,
}: {
  db: Db
  storeId: string
  skus: string[]
  excludeIds: string[]
}): Promise<Set<string>> {
  if (skus.length === 0) return new Set()
  const lowered = skus.map((s) => s.toLowerCase())
  const conds = [
    eq(productVariants.storeId, storeId),
    isNull(productVariants.deletedAt),
    sql`LOWER(${productVariants.sku}) IN (${sql.join(
      lowered.map((s) => sql`${s}`),
      sql`, `,
    )})`,
  ]
  if (excludeIds.length > 0) {
    conds.push(
      sql`${productVariants.id} NOT IN (${sql.join(
        excludeIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
  }
  const rows = await db
    .select({ sku: productVariants.sku })
    .from(productVariants)
    .where(and(...conds))
  return new Set(rows.map((r) => r.sku.toLowerCase()))
}

export async function findTakenVariantBarcodes({
  db,
  storeId,
  barcodes,
  excludeIds,
}: {
  db: Db
  storeId: string
  barcodes: string[]
  excludeIds: string[]
}): Promise<Set<string>> {
  if (barcodes.length === 0) return new Set()
  const conds = [
    eq(productVariants.storeId, storeId),
    isNull(productVariants.deletedAt),
    inArray(productVariants.barcode, barcodes),
  ]
  if (excludeIds.length > 0) {
    conds.push(
      sql`${productVariants.id} NOT IN (${sql.join(
        excludeIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
  }
  const rows = await db
    .select({ barcode: productVariants.barcode })
    .from(productVariants)
    .where(and(...conds))
  return new Set(rows.map((r) => r.barcode).filter((b): b is string => b !== null))
}

export async function hasVariantTransactions({
  db,
  variantId,
}: {
  db: Db
  variantId: string
}): Promise<boolean> {
  const rows = await db
    .select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.variantId, variantId),
        ne(inventoryTransactions.type, 'initial_stock'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

interface UniqueVariantViolation {
  field: 'sku' | 'barcode' | 'attrs'
}

function unwrapDriverError(err: unknown): unknown {
  let current: unknown = err
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break
    if ('code' in current || 'constraint_name' in current || 'constraint' in current) return current
    if ('cause' in current) {
      current = (current as { cause: unknown }).cause
      continue
    }
    break
  }
  return current
}

function getPgErrorCode(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object' && 'code' in unwrapped) {
    const code = (unwrapped as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

function getPgConstraint(err: unknown): string | undefined {
  const unwrapped = unwrapDriverError(err)
  if (unwrapped && typeof unwrapped === 'object' && 'constraint_name' in unwrapped) {
    const name = (unwrapped as { constraint_name: unknown }).constraint_name
    if (typeof name === 'string') return name
  }
  if (unwrapped && typeof unwrapped === 'object' && 'constraint' in unwrapped) {
    const name = (unwrapped as { constraint: unknown }).constraint
    if (typeof name === 'string') return name
  }
  return undefined
}

export function classifyVariantViolation(err: unknown): UniqueVariantViolation | null {
  if (getPgErrorCode(err) !== '23505') return null
  const constraint = getPgConstraint(err)
  if (constraint === 'uniq_variants_store_sku_alive') return { field: 'sku' }
  if (constraint === 'uniq_variants_store_barcode_alive') return { field: 'barcode' }
  if (constraint === 'uniq_variants_product_attrs_alive') return { field: 'attrs' }
  return null
}
