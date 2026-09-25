import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'
import { users } from './users.js'

export const BULK_IMPORT_TYPES = ['product', 'customer', 'supplier'] as const
export type BulkImportType = (typeof BULK_IMPORT_TYPES)[number]
export const BULK_IMPORT_MODES = ['create-only', 'upsert'] as const
export type BulkImportMode = (typeof BULK_IMPORT_MODES)[number]
export const BULK_IMPORT_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const
export type BulkImportStatus = (typeof BULK_IMPORT_STATUSES)[number]

export const bulkImportJobs = pgTable(
  'bulk_import_jobs',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: varchar({ length: 16 }).$type<BulkImportType>().notNull(),
    mode: varchar({ length: 16 }).$type<BulkImportMode>().notNull(),
    status: varchar({ length: 16 }).$type<BulkImportStatus>().notNull().default('queued'),
    originalFilename: varchar({ length: 255 }).notNull(),
    confirmedDigest: varchar({ length: 64 }).notNull(),
    approveNewNames: boolean().notNull().default(false),
    // Owner approved the preview's automatic conversions (rounding, default unit, dropped values).
    approveConversions: boolean().notNull().default(false),
    fileSizeBytes: integer().notNull(),
    totalRows: integer().notNull(),
    processedRows: integer().notNull().default(0),
    succeededRows: integer().notNull().default(0),
    failedRows: integer().notNull().default(0),
    errorMessage: varchar({ length: 2000 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('uniq_bulk_import_jobs_active_store_type')
      .on(table.storeId, table.type)
      .where(sql`${table.status} IN ('queued', 'running')`),
    index('idx_bulk_import_jobs_store_created').on(table.storeId, table.createdAt.desc()),
    index('idx_bulk_import_jobs_expires').on(table.expiresAt),
    check('chk_bulk_import_jobs_type', sql`${table.type} IN ('product', 'customer', 'supplier')`),
    check('chk_bulk_import_jobs_mode', sql`${table.mode} IN ('create-only', 'upsert')`),
    check('chk_bulk_import_jobs_digest', sql`${table.confirmedDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      'chk_bulk_import_jobs_status',
      sql`${table.status} IN ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      'chk_bulk_import_jobs_counts',
      sql`${table.fileSizeBytes} > 0 AND ${table.totalRows} BETWEEN 0 AND 100000 AND ${table.processedRows} >= 0 AND ${table.succeededRows} >= 0 AND ${table.failedRows} >= 0 AND ${table.succeededRows} + ${table.failedRows} <= ${table.processedRows} AND ${table.processedRows} <= ${table.totalRows}`,
    ),
  ],
)

export type BulkImportJob = typeof bulkImportJobs.$inferSelect
