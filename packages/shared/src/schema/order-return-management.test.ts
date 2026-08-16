import { describe, expect, it } from 'vitest'

import { createOrderReturnSchema } from './order-return-management.js'

const OII_A = '123e4567-e89b-12d3-a456-426614174000'
const OII_B = '223e4567-e89b-12d3-a456-426614174000'

describe('createOrderReturnSchema - CRIT C3 chống trùng orderItemId', () => {
  it('chấp nhận các dòng có orderItemId khác nhau', () => {
    const r = createOrderReturnSchema.safeParse({
      items: [
        { orderItemId: OII_A, quantity: 1, reason: 'defective' },
        { orderItemId: OII_B, quantity: 2, reason: 'other' },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('từ chối trùng orderItemId trong cùng phiếu (chống hoàn tiền gấp N lần)', () => {
    const r = createOrderReturnSchema.safeParse({
      items: [
        { orderItemId: OII_A, quantity: 5, reason: 'defective' },
        { orderItemId: OII_A, quantity: 5, reason: 'defective' },
      ],
    })
    expect(r.success).toBe(false)
  })
})
