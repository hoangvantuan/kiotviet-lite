import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'
import { users } from './users.js'

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorRole: varchar({ length: 32 }),
    action: varchar({ length: 64 }).notNull(),
    targetType: varchar({ length: 32 }),
    targetId: uuid(),
    changes: jsonb(),
    ipAddress: varchar({ length: 45 }),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_logs_store_id_created_at').on(table.storeId, table.createdAt.desc()),
    index('idx_audit_logs_actor_id_created_at').on(table.actorId, table.createdAt.desc()),
  ],
)
