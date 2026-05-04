import { eq } from 'drizzle-orm'

import {
  printSettings,
  type PrintSettingsResponse,
  type UpdatePrintSettingsInput,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const LOGO_DATA_URL_PREFIX_REGEX = /^data:image\/(png|jpeg);base64,/

const DEFAULTS: Omit<PrintSettingsResponse, 'id' | 'storeId'> = {
  logoUrl: null,
  slogan: null,
  defaultPaperSize: '58mm',
  showOldDebt: false,
  showNewDebt: true,
  showCostPrice: false,
  showDiscount: true,
  showNotes: true,
  showCustomerName: true,
  showCustomerPhone: true,
  showSku: false,
  footerText: 'Cảm ơn quý khách!',
}

function toResponse(
  row: typeof printSettings.$inferSelect,
): PrintSettingsResponse {
  return {
    id: row.id,
    storeId: row.storeId,
    logoUrl: row.logoUrl,
    slogan: row.slogan,
    defaultPaperSize: row.defaultPaperSize as PrintSettingsResponse['defaultPaperSize'],
    showOldDebt: row.showOldDebt,
    showNewDebt: row.showNewDebt,
    showCostPrice: row.showCostPrice,
    showDiscount: row.showDiscount,
    showNotes: row.showNotes,
    showCustomerName: row.showCustomerName,
    showCustomerPhone: row.showCustomerPhone,
    showSku: row.showSku,
    footerText: row.footerText,
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

export async function getPrintSettings(
  db: Db,
  storeId: string,
): Promise<PrintSettingsResponse> {
  const row = await db.query.printSettings.findFirst({
    where: eq(printSettings.storeId, storeId),
  })
  if (!row) {
    return { id: null, storeId, ...DEFAULTS }
  }
  return toResponse(row)
}

export interface UpsertPrintSettingsDeps {
  db: Db
  actor: { userId: string; storeId: string }
  input: UpdatePrintSettingsInput
  meta?: RequestMeta
}

export async function upsertPrintSettings({
  db,
  actor,
  input,
  meta,
}: UpsertPrintSettingsDeps): Promise<PrintSettingsResponse> {
  if (input.logoUrl !== undefined && input.logoUrl !== null) {
    validateLogoSize(input.logoUrl)
  }

  const before = await getPrintSettings(db, actor.storeId)

  const defined = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  )

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(printSettings)
      .values({
        storeId: actor.storeId,
        ...defined,
      })
      .onConflictDoUpdate({
        target: printSettings.storeId,
        set: {
          ...defined,
          updatedAt: new Date(),
        },
      })
      .returning()

    if (!row) {
      throw new ApiError('INTERNAL_ERROR', 'Không lưu được cài đặt mẫu in')
    }

    const after = toResponse(row)

    const beforeForDiff = {
      ...before,
      logoUrl: before.logoUrl ? '<base64>' : null,
    }
    const afterForDiff = {
      ...after,
      logoUrl: after.logoUrl ? '<base64>' : null,
    }
    const fieldDiff = diffObjects(beforeForDiff, afterForDiff)

    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        action: 'print_settings.updated',
        targetType: 'print_settings',
        targetId: row.id,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return after
  })
}
