import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { stores } from './stores.js'

export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    name: varchar({ length: 100 }).notNull(),
    description: varchar({ length: 255 }),
    method: varchar({ length: 16 }).notNull(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    basePriceListId: uuid().references((): any => priceLists.id, { onDelete: 'restrict' }),
    formulaType: varchar({ length: 16 }),
    formulaValue: bigint({ mode: 'number' }),
    roundingRule: varchar({ length: 24 }).notNull().default('none'),
    effectiveFrom: date({ mode: 'string' }),
    effectiveTo: date({ mode: 'string' }),
    isActive: boolean().notNull().default(true),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_price_lists_store_name_alive')
      .on(table.storeId, sql`LOWER(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_price_lists_store_created').on(table.storeId, table.createdAt),
    index('idx_price_lists_store_method_active').on(table.storeId, table.method, table.isActive),
    check(
      'check_formula_required',
      sql`(method = 'direct' AND base_price_list_id IS NULL AND formula_type IS NULL AND formula_value IS NULL) OR (method = 'formula' AND base_price_list_id IS NOT NULL AND formula_type IS NOT NULL AND formula_value IS NOT NULL)`,
    ),
    check(
      'check_effective_range',
      sql`effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from`,
    ),
  ],
)
