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

export const PGLITE_SCHEMA_VERSION = 1
