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

import { createOrderItemSchema, createOrderSchema } from './order-management.js'

// Story 9-2: Sync push schemas
export const syncPushOrderItemSchema = createOrderItemSchema
export const syncPushOrderDataSchema = createOrderSchema

export const syncPushOrderSchema = z.object({
  clientId: z.string().uuid(),
  createdAt: z.string().datetime(),
  orderData: syncPushOrderDataSchema,
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
