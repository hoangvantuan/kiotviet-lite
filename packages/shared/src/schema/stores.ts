import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const stores = pgTable('stores', {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: varchar({ length: 100 }).notNull(),
  address: text(),
  phone: varchar({ length: 20 }),
  logoUrl: text(),
  debtWarningPercent: integer().notNull().default(80),
  debtOverdueDays: varchar({ length: 50 }).notNull().default('30,60,90'),
  customerCodeCounter: integer().notNull().default(0),
  supplierCodeCounter: integer().notNull().default(0),
  negativeStockAlertsEnabled: boolean().notNull().default(true),
  // POS-13: cho bán vượt tồn kho (tồn kho âm). Mặc định bật như hành vi trước đây; tắt thì quầy và máy
  // chủ cùng chặn dòng bán vượt tồn
  allowNegativeStock: boolean().notNull().default(true),
  // POS-06: dùng ca bán hàng. Mặc định tắt để không chặn bán ngày đầu; bật thì phải mở ca mới bán
  shiftsEnabled: boolean().notNull().default(false),
  // POS-07: tài khoản nhận chuyển khoản để sinh mã VietQR tại quầy
  bankBin: varchar({ length: 6 }),
  bankAccountNumber: varchar({ length: 19 }),
  bankAccountName: varchar({ length: 50 }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
