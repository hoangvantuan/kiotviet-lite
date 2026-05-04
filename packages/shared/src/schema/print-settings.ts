import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { z } from 'zod'

import { stores } from './stores.js'

export const printSettings = pgTable(
  'print_settings',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    logoUrl: text(),
    slogan: varchar({ length: 100 }),
    defaultPaperSize: varchar({ length: 8 }).notNull().default('58mm'),
    showOldDebt: boolean().notNull().default(false),
    showNewDebt: boolean().notNull().default(true),
    showCostPrice: boolean().notNull().default(false),
    showDiscount: boolean().notNull().default(true),
    showNotes: boolean().notNull().default(true),
    showCustomerName: boolean().notNull().default(true),
    showCustomerPhone: boolean().notNull().default(true),
    showSku: boolean().notNull().default(false),
    footerText: varchar({ length: 200 }).notNull().default('Cảm ơn quý khách!'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('uniq_print_settings_store').on(table.storeId)],
)

export const printSettingsRelations = relations(printSettings, ({ one }) => ({
  store: one(stores, { fields: [printSettings.storeId], references: [stores.id] }),
}))

const LOGO_DATA_URL_REGEX = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/

export const paperSizeSchema = z.enum(['58mm', '80mm', 'a4', 'a5'])

export const printSettingsResponseSchema = z.object({
  id: z.string().uuid().nullable(),
  storeId: z.string().uuid(),
  logoUrl: z.string().nullable(),
  slogan: z.string().nullable(),
  defaultPaperSize: paperSizeSchema,
  showOldDebt: z.boolean(),
  showNewDebt: z.boolean(),
  showCostPrice: z.boolean(),
  showDiscount: z.boolean(),
  showNotes: z.boolean(),
  showCustomerName: z.boolean(),
  showCustomerPhone: z.boolean(),
  showSku: z.boolean(),
  footerText: z.string(),
})

export const updatePrintSettingsSchema = z.object({
  logoUrl: z
    .string()
    .max(2_800_000, 'Logo vượt quá 2MB')
    .regex(LOGO_DATA_URL_REGEX, 'Logo phải là PNG hoặc JPEG (data URL)')
    .nullable()
    .optional(),
  slogan: z.string().trim().max(100, 'Slogan tối đa 100 ký tự').nullable().optional(),
  defaultPaperSize: paperSizeSchema.optional(),
  showOldDebt: z.boolean().optional(),
  showNewDebt: z.boolean().optional(),
  showCostPrice: z.boolean().optional(),
  showDiscount: z.boolean().optional(),
  showNotes: z.boolean().optional(),
  showCustomerName: z.boolean().optional(),
  showCustomerPhone: z.boolean().optional(),
  showSku: z.boolean().optional(),
  footerText: z.string().trim().max(200, 'Chú thích cuối tối đa 200 ký tự').optional(),
})

export type PrintSettingsResponse = z.infer<typeof printSettingsResponseSchema>
export type UpdatePrintSettingsInput = z.infer<typeof updatePrintSettingsSchema>
