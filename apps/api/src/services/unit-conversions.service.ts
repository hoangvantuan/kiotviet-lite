import { and, asc, eq, sql } from 'drizzle-orm'

import {
  products,
  productUnitConversions,
  type UnitConversionInput,
  type UnitConversionItem,
  type UnitConversionUpdate,
  type UserRole,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface UnitConversionsActor {
  userId: string
  storeId: string
  role: UserRole
}

interface UnitConversionRow {
  id: string
  storeId: string
  productId: string
  unit: string
  conversionFactor: number
  sellingPrice: number
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export function toUnitConversionItem(row: UnitConversionRow): UnitConversionItem {
  return {
    id: row.id,
    productId: row.productId,
    unit: row.unit,
    conversionFactor: row.conversionFactor,
    sellingPrice: Number(row.sellingPrice),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
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
  const u = unwrapDriverError(err)
  if (u && typeof u === 'object' && 'code' in u) {
    const code = (u as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

function getPgConstraint(err: unknown): string | undefined {
  const u = unwrapDriverError(err)
  if (u && typeof u === 'object' && 'constraint_name' in u) {
    const v = (u as { constraint_name: unknown }).constraint_name
    if (typeof v === 'string') return v
  }
  if (u && typeof u === 'object' && 'constraint' in u) {
    const v = (u as { constraint: unknown }).constraint
    if (typeof v === 'string') return v
  }
  return undefined
}

function isUnitDuplicateViolation(err: unknown): boolean {
  if (getPgErrorCode(err) !== '23505') return false
  return getPgConstraint(err) === 'uniq_unit_conversions_product_unit'
}

async function ensureProductInStore({
  db,
  storeId,
  productId,
}: {
  db: Db
  storeId: string
  productId: string
}): Promise<{ id: string; unit: string; storeId: string }> {
  const target = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!target || target.storeId !== storeId || target.deletedAt !== null) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy sản phẩm')
  }
  return { id: target.id, unit: target.unit, storeId: target.storeId }
}

async function loadConversionRow({
  db,
  productId,
  conversionId,
}: {
  db: Db
  productId: string
  conversionId: string
}): Promise<UnitConversionRow | null> {
  const rows = await db
    .select()
    .from(productUnitConversions)
    .where(
      and(
        eq(productUnitConversions.id, conversionId),
        eq(productUnitConversions.productId, productId),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export interface ListUnitConversionsDeps {
  db: Db
  storeId: string
  productId: string
}

export async function listUnitConversions({
  db,
  storeId,
  productId,
}: ListUnitConversionsDeps): Promise<UnitConversionItem[]> {
  await ensureProductInStore({ db, storeId, productId })
  const rows = await db
    .select()
    .from(productUnitConversions)
    .where(eq(productUnitConversions.productId, productId))
    .orderBy(asc(productUnitConversions.sortOrder), asc(productUnitConversions.createdAt))
  return rows.map((r) => toUnitConversionItem(r))
}

async function countConversions({ db, productId }: { db: Db; productId: string }): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productUnitConversions)
    .where(eq(productUnitConversions.productId, productId))
  return rows[0]?.count ?? 0
}

function validateUnitVsParent(unit: string, parentUnit: string): void {
  if (unit.trim().toLowerCase() === parentUnit.trim().toLowerCase()) {
    throw new ApiError('VALIDATION_ERROR', 'Đơn vị quy đổi phải khác đơn vị tính của sản phẩm', {
      field: 'unit',
    })
  }
}

export interface CreateUnitConversionDeps {
  db: Db
  actor: UnitConversionsActor
  productId: string
  input: UnitConversionInput
  meta?: RequestMeta
  // Optional: skip count check (used when caller already validated max-3 in a batch)
  skipCountCheck?: boolean
}

export async function createUnitConversion({
  db,
  actor,
  productId,
  input,
  meta,
  skipCountCheck = false,
}: CreateUnitConversionDeps): Promise<UnitConversionItem> {
  const product = await ensureProductInStore({ db, storeId: actor.storeId, productId })
  validateUnitVsParent(input.unit, product.unit)

  if (!skipCountCheck) {
    const count = await countConversions({ db, productId })
    if (count >= 3) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Tối đa 3 đơn vị quy đổi/sản phẩm')
    }
  }

  let inserted: UnitConversionRow
  try {
    const [row] = await db
      .insert(productUnitConversions)
      .values({
        storeId: actor.storeId,
        productId,
        unit: input.unit.trim(),
        conversionFactor: input.conversionFactor,
        sellingPrice: input.sellingPrice,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()
    if (!row) throw new ApiError('INTERNAL_ERROR', 'Không tạo được đơn vị quy đổi')
    inserted = row
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (isUnitDuplicateViolation(err)) {
      throw new ApiError('CONFLICT', 'Đơn vị quy đổi đã tồn tại', { field: 'unit' })
    }
    throw err
  }

  await logAction({
    db,
    storeId: actor.storeId,
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'product.unit_conversion_created',
    targetType: 'product_unit_conversion',
    targetId: inserted.id,
    changes: {
      productId,
      unit: inserted.unit,
      conversionFactor: inserted.conversionFactor,
      sellingPrice: Number(inserted.sellingPrice),
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  })

  return toUnitConversionItem(inserted)
}

export interface UpdateUnitConversionDeps {
  db: Db
  actor: UnitConversionsActor
  productId: string
  conversionId: string
  input: UnitConversionUpdate
  meta?: RequestMeta
}

export async function updateUnitConversion({
  db,
  actor,
  productId,
  conversionId,
  input,
  meta,
}: UpdateUnitConversionDeps): Promise<UnitConversionItem> {
  const product = await ensureProductInStore({ db, storeId: actor.storeId, productId })
  const existing = await loadConversionRow({ db, productId, conversionId })
  if (!existing || existing.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn vị quy đổi')
  }

  const updates: Partial<typeof productUnitConversions.$inferInsert> = {}

  if (input.unit !== undefined) {
    const newUnit = input.unit.trim()
    if (newUnit !== existing.unit) {
      validateUnitVsParent(newUnit, product.unit)
      updates.unit = newUnit
    }
  }
  if (
    input.conversionFactor !== undefined &&
    input.conversionFactor !== existing.conversionFactor
  ) {
    updates.conversionFactor = input.conversionFactor
  }
  if (input.sellingPrice !== undefined && input.sellingPrice !== Number(existing.sellingPrice)) {
    updates.sellingPrice = input.sellingPrice
  }
  if (input.sortOrder !== undefined && input.sortOrder !== existing.sortOrder) {
    updates.sortOrder = input.sortOrder
  }

  if (Object.keys(updates).length === 0) {
    return toUnitConversionItem(existing)
  }

  let updated: UnitConversionRow
  try {
    const [row] = await db
      .update(productUnitConversions)
      .set(updates)
      .where(eq(productUnitConversions.id, conversionId))
      .returning()
    if (!row) throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được đơn vị quy đổi')
    updated = row
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (isUnitDuplicateViolation(err)) {
      throw new ApiError('CONFLICT', 'Đơn vị quy đổi đã tồn tại', { field: 'unit' })
    }
    throw err
  }

  const before = {
    unit: existing.unit,
    conversionFactor: existing.conversionFactor,
    sellingPrice: Number(existing.sellingPrice),
    sortOrder: existing.sortOrder,
  }
  const after = {
    unit: updated.unit,
    conversionFactor: updated.conversionFactor,
    sellingPrice: Number(updated.sellingPrice),
    sortOrder: updated.sortOrder,
  }
  const changes = diffObjects(before as Record<string, unknown>, after as Record<string, unknown>)

  if (Object.keys(changes).length > 0) {
    await logAction({
      db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'product.unit_conversion_updated',
      targetType: 'product_unit_conversion',
      targetId: updated.id,
      changes,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })
  }

  return toUnitConversionItem(updated)
}

export interface DeleteUnitConversionDeps {
  db: Db
  actor: UnitConversionsActor
  productId: string
  conversionId: string
  meta?: RequestMeta
}

export async function deleteUnitConversion({
  db,
  actor,
  productId,
  conversionId,
  meta,
}: DeleteUnitConversionDeps): Promise<void> {
  await ensureProductInStore({ db, storeId: actor.storeId, productId })
  const existing = await loadConversionRow({ db, productId, conversionId })
  if (!existing || existing.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn vị quy đổi')
  }

  await db.delete(productUnitConversions).where(eq(productUnitConversions.id, conversionId))

  await logAction({
    db,
    storeId: actor.storeId,
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'product.unit_conversion_deleted',
    targetType: 'product_unit_conversion',
    targetId: conversionId,
    changes: {
      productId,
      unit: existing.unit,
      conversionFactor: existing.conversionFactor,
      sellingPrice: Number(existing.sellingPrice),
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  })
}
