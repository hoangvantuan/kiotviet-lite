import { z } from 'zod'

export const syncInitialQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})
export type SyncInitialQuery = z.infer<typeof syncInitialQuerySchema>

export const syncIncrementalQuerySchema = z.object({
  since: z.string().datetime(),
})
export type SyncIncrementalQuery = z.infer<typeof syncIncrementalQuerySchema>

export const schemaVersionResponseSchema = z.object({
  version: z.number().int(),
})
export type SchemaVersionResponse = z.infer<typeof schemaVersionResponseSchema>

export const PGLITE_SCHEMA_VERSION = 2

// Story 9-2: Sync push schemas

export const syncPushOrderItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().default(null),
  productName: z.string().trim().min(1).max(255),
  variantName: z.string().trim().max(255).nullable().default(null),
  unit: z.string().trim().max(50).nullable().default(null),
  unitPrice: z.number().int().min(0),
  quantity: z.number().int().min(1).max(1_000_000),
  discountType: z.enum(['percent', 'amount']).nullable().default(null),
  discountValue: z.number().int().min(0).default(0),
  discountAmount: z.number().int().min(0).default(0),
  lineTotal: z.number().int().min(0),
  note: z.string().trim().max(500).nullable().default(null),
  unitConversionId: z.string().uuid().nullable().default(null),
  originalPrice: z.number().int().min(0).nullable().default(null),
  priceOverride: z.boolean().default(false),
  priceOverrideReason: z.string().trim().max(255).nullable().default(null),
  priceOverridePinUsed: z.boolean().default(false),
})

export const syncPushOrderSchema = z.object({
  clientId: z.string().uuid(),
  createdAt: z.string().datetime(),
  orderData: z.object({
    customerId: z.string().uuid().nullable().default(null),
    subtotal: z.number().int().min(0),
    discountType: z.enum(['percent', 'amount']).nullable().default(null),
    discountValue: z.number().int().min(0).default(0),
    discountAmount: z.number().int().min(0).default(0),
    total: z.number().int().min(0),
    paymentMethod: z.enum(['cash', 'transfer', 'qr', 'combined', 'debt']),
    paymentStatus: z.enum(['paid', 'partial', 'unpaid']).default('paid'),
    cashAmount: z.number().int().min(0).optional(),
    transferAmount: z.number().int().min(0).optional(),
    debtAmount: z.number().int().min(0).optional(),
    note: z.string().trim().max(1000).nullable().default(null),
    items: z.array(syncPushOrderItemSchema).min(1).max(200),
  }),
})
export type SyncPushOrder = z.infer<typeof syncPushOrderSchema>

export const syncPushRequestSchema = z.object({
  orders: z.array(syncPushOrderSchema).min(1).max(100),
})
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>

export const syncPushResultSchema = z.object({
  clientId: z.string().uuid(),
  serverId: z.string().uuid().optional(),
  status: z.enum(['synced', 'error', 'duplicate']),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
})
export type SyncPushResult = z.infer<typeof syncPushResultSchema>
