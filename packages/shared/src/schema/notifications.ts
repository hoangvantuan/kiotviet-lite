import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { z } from 'zod'

import { stores } from './stores.js'

export const notificationTransportEnum = pgEnum('notification_transport', [
  'console',
  'file',
  'webhook',
  'telegram',
])

export const notificationSeverityEnum = pgEnum('notification_severity', [
  'info',
  'warn',
  'error',
  'critical',
])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'sent',
  'throttled',
  'dead',
])

export const notificationTypeValues = [
  'auth.login.suspicious',
  'auth.pin.locked',
  'order.high_value',
  'stock.negative',
  'sync.failed_repeatedly',
  'audit.price_override',
  'system.error.unhandled',
] as const

export const notificationTypeEnum = pgEnum('notification_type', [...notificationTypeValues])

// --- Drizzle Tables ---

export const notificationChannels = pgTable('notification_channels', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  storeId: uuid()
    .notNull()
    .references(() => stores.id, { onDelete: 'restrict' }),
  transport: notificationTransportEnum().notNull(),
  name: varchar({ length: 100 }).notNull(),
  configEncrypted: text(),
  enabled: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const notificationRules = pgTable('notification_rules', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  storeId: uuid()
    .notNull()
    .references(() => stores.id, { onDelete: 'restrict' }),
  eventType: notificationTypeEnum().notNull(),
  minSeverity: notificationSeverityEnum().notNull().default('info'),
  channelId: uuid()
    .notNull()
    .references(() => notificationChannels.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(true),
  throttleSeconds: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    eventId: uuid().notNull(),
    channelId: uuid()
      .notNull()
      .references(() => notificationChannels.id, { onDelete: 'cascade' }),
    storeId: uuid().notNull(),
    eventType: notificationTypeEnum().notNull(),
    status: deliveryStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    retriable: boolean(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_deliveries_throttle').on(
      table.storeId,
      table.eventType,
      table.channelId,
      table.createdAt,
    ),
  ],
)

// --- Zod Schemas ---

export const notificationSeverityValues = ['info', 'warn', 'error', 'critical'] as const

export const notificationEventSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  type: z.enum(notificationTypeValues),
  severity: z.enum(notificationSeverityValues),
  title: z.string().max(200),
  body: z.string().max(2000),
  context: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
})

export type NotificationEvent = z.infer<typeof notificationEventSchema>
export type NotificationType = (typeof notificationTypeValues)[number]
export type NotificationSeverity = (typeof notificationSeverityValues)[number]
