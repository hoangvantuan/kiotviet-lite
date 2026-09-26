import { customType } from 'drizzle-orm/pg-core'

import { parseQuantity, quantityToDb } from '../utils/quantity.js'

/**
 * Cột số lượng và tồn kho `numeric(14,3)` (ADR-0015). Driver trả numeric là chuỗi; chuẩn hóa về
 * `number` bội của 0,001 tại đây, không rải `Number()` ở từng dịch vụ.
 */
export const quantity = customType<{ data: number; driverData: string | number }>({
  dataType() {
    return 'numeric(14, 3)'
  },
  fromDriver(value) {
    return parseQuantity(value)
  },
  toDriver(value) {
    return quantityToDb(value)
  },
})
