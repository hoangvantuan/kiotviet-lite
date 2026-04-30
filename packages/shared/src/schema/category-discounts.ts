import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

import { categories } from './categories.js'
import { customerGroups } from './customer-groups.js'
import { customers } from './customers.js'
import { stores } from './stores.js'

export const categoryDiscounts = pgTable(
  'category_discounts',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    customerId: uuid().references(() => customers.id, { onDelete: 'cascade' }),
    customerGroupId: uuid().references(() => customerGroups.id, { onDelete: 'cascade' }),
    discountType: varchar({ length: 16 }).notNull(),
    discountValue: bigint({ mode: 'number' }).notNull(),
    minQty: integer().notNull().default(1),
    effectiveFrom: date({ mode: 'string' }),
    effectiveTo: date({ mode: 'string' }),
    isActive: boolean().notNull().default(true),
    note: varchar({ length: 255 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_category_discounts_store_category').on(
      table.storeId,
      table.categoryId,
      table.isActive,
    ),
    index('idx_category_discounts_store_customer')
      .on(table.storeId, table.customerId)
      .where(sql`${table.customerId} IS NOT NULL`),
    index('idx_category_discounts_store_group')
      .on(table.storeId, table.customerGroupId)
      .where(sql`${table.customerGroupId} IS NOT NULL`),
    index('idx_category_discounts_effective_window').on(
      table.storeId,
      table.isActive,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check(
      'check_category_discount_target',
      sql`(${table.customerId} IS NOT NULL)::int + (${table.customerGroupId} IS NOT NULL)::int = 1`,
    ),
    check(
      'check_category_discount_type_value',
      sql`(${table.discountType} = 'percent' AND ${table.discountValue} <= 100) OR ${table.discountType} = 'amount'`,
    ),
    check('check_category_discount_min_qty_positive', sql`${table.minQty} >= 1`),
    check(
      'check_category_discount_dates_valid',
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveFrom} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
)
