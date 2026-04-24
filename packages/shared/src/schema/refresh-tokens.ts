import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { users } from './users.js'

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid().primaryKey().$defaultFn(() => uuidv7()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
  replacedByTokenHash: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_refresh_tokens_user_id').on(table.userId),
  index('idx_refresh_tokens_token_hash').on(table.tokenHash),
])
