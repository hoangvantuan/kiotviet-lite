import { pgTable, text, timestamp,uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const stores = pgTable('stores', {
  id: uuid().primaryKey().$defaultFn(() => uuidv7()),
  name: varchar({ length: 100 }).notNull(),
  address: text(),
  phone: varchar({ length: 20 }),
  logoUrl: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})
