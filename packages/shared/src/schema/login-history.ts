import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'
import { users } from './users.js'

export const loginHistory = pgTable(
  'login_history',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    ip: varchar({ length: 45 }),
    userAgent: text(),
    loginAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_login_history_user_id_login_at').on(table.userId, table.loginAt)],
)
