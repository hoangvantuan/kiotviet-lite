import { z } from 'zod'

import { userRoleSchema } from './auth.js'

export const auditActionSchema = z.enum([
  'user.created',
  'user.updated',
  'user.locked',
  'user.unlocked',
  'user.pin_reset',
  'store.updated',
  'auth.pin_failed',
  'auth.pin_locked',
  'category.created',
  'category.updated',
  'category.deleted',
  'category.reordered',
  'product.created',
  'product.updated',
  'product.deleted',
  'product.restored',
  'product.stock_initialized',
  'product.variant_created',
  'product.variant_updated',
  'product.variant_deleted',
  'product.variants_enabled',
  'product.variants_disabled',
  'product.unit_conversion_created',
  'product.unit_conversion_updated',
  'product.unit_conversion_deleted',
  'inventory.purchase_recorded',
  'inventory.manual_adjusted',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.restored',
  'customer_group.created',
  'customer_group.updated',
  'customer_group.deleted',
])

export const auditLogItemSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid(),
  actorName: z.string(),
  actorRole: userRoleSchema,
  action: auditActionSchema,
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  changes: z.unknown().nullable(),
  createdAt: z.string(),
})

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  actorIds: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  actions: z
    .union([auditActionSchema, z.array(auditActionSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export type AuditAction = z.infer<typeof auditActionSchema>
export type AuditLogItem = z.infer<typeof auditLogItemSchema>
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>
