import { eq } from 'drizzle-orm'

import { stores, type StoreSettings, type UpdateStoreInput } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOGO_DATA_URL_PREFIX_REGEX = /^data:image\/(png|jpeg);base64,/

function toStoreSettings(row: typeof stores.$inferSelect): StoreSettings {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    logoUrl: row.logoUrl,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function validateLogoSize(dataUrl: string): void {
  const match = LOGO_DATA_URL_PREFIX_REGEX.exec(dataUrl)
  if (!match) {
    throw new ApiError('VALIDATION_ERROR', 'Logo phải là PNG hoặc JPEG (data URL)', {
      field: 'logoUrl',
    })
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const sizeBytes = Math.floor((base64.length * 3) / 4) - padding
  if (sizeBytes > MAX_LOGO_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Logo vượt quá 2MB', { field: 'logoUrl' })
  }
}

export interface GetStoreDeps {
  db: Db
  storeId: string
}

export async function getStore({ db, storeId }: GetStoreDeps): Promise<StoreSettings> {
  const row = await db.query.stores.findFirst({ where: eq(stores.id, storeId) })
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy cửa hàng')
  }
  return toStoreSettings(row)
}

export interface UpdateStoreDeps {
  db: Db
  actor: { userId: string; storeId: string }
  input: UpdateStoreInput
  meta?: RequestMeta
}

export async function updateStore({
  db,
  actor,
  input,
  meta,
}: UpdateStoreDeps): Promise<StoreSettings> {
  const before = await db.query.stores.findFirst({ where: eq(stores.id, actor.storeId) })
  if (!before) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy cửa hàng')
  }

  if (input.logoUrl !== undefined && input.logoUrl !== null) {
    validateLogoSize(input.logoUrl)
  }

  const updates: Partial<typeof stores.$inferInsert> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.address !== undefined) updates.address = input.address
  if (input.phone !== undefined) updates.phone = input.phone
  if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(stores)
      .set(updates)
      .where(eq(stores.id, actor.storeId))
      .returning()

    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được cửa hàng')
    }

    const beforeFields = {
      name: before.name,
      address: before.address,
      phone: before.phone,
      logoUrl: before.logoUrl ? '<base64>' : null,
    }
    const afterFields = {
      name: updated.name,
      address: updated.address,
      phone: updated.phone,
      logoUrl: updated.logoUrl ? '<base64>' : null,
    }
    const fieldDiff = diffObjects(beforeFields, afterFields)

    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        action: 'store.updated',
        targetType: 'store',
        targetId: actor.storeId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return toStoreSettings(updated)
  })
}
