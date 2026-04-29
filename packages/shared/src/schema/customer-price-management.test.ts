import { describe, expect, it } from 'vitest'

import {
  createCustomerPriceSchema,
  listCustomerPricesQuerySchema,
  updateCustomerPriceSchema,
} from './customer-price-management.js'

const VALID_UUID = '00000000-0000-7000-8000-000000000001'
const ANOTHER_UUID = '00000000-0000-7000-8000-000000000002'

describe('createCustomerPriceSchema', () => {
  it('chấp nhận body hợp lệ', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 45000,
      note: 'Khách VIP',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận price = 0', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 0,
    })
    expect(r.success).toBe(true)
  })

  it('reject customerId không phải uuid', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: 'not-uuid',
      productId: ANOTHER_UUID,
      price: 1000,
    })
    expect(r.success).toBe(false)
  })

  it('reject productId không phải uuid', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: 'not-uuid',
      price: 1000,
    })
    expect(r.success).toBe(false)
  })

  it('reject price âm', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: -1,
    })
    expect(r.success).toBe(false)
  })

  it('reject price decimal', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 100.5,
    })
    expect(r.success).toBe(false)
  })

  it('reject note > 255 ký tự', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 1000,
      note: 'a'.repeat(256),
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận note = null', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 1000,
      note: null,
    })
    expect(r.success).toBe(true)
  })

  it('strict: reject key lạ', () => {
    const r = createCustomerPriceSchema.safeParse({
      customerId: VALID_UUID,
      productId: ANOTHER_UUID,
      price: 1000,
      storeId: VALID_UUID,
    })
    expect(r.success).toBe(false)
  })
})

describe('updateCustomerPriceSchema', () => {
  it('reject empty object', () => {
    const r = updateCustomerPriceSchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('chấp nhận chỉ price', () => {
    const r = updateCustomerPriceSchema.safeParse({ price: 50000 })
    expect(r.success).toBe(true)
  })

  it('chấp nhận chỉ note', () => {
    const r = updateCustomerPriceSchema.safeParse({ note: 'Cập nhật' })
    expect(r.success).toBe(true)
  })

  it('strict: reject customerId', () => {
    const r = updateCustomerPriceSchema.safeParse({
      price: 1000,
      customerId: VALID_UUID,
    })
    expect(r.success).toBe(false)
  })

  it('strict: reject productId', () => {
    const r = updateCustomerPriceSchema.safeParse({
      price: 1000,
      productId: VALID_UUID,
    })
    expect(r.success).toBe(false)
  })
})

describe('listCustomerPricesQuerySchema', () => {
  it('default page=1, pageSize=20', () => {
    const r = listCustomerPricesQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('coerce string sang number', () => {
    const r = listCustomerPricesQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('reject pageSize > 100', () => {
    const r = listCustomerPricesQuerySchema.safeParse({ pageSize: 200 })
    expect(r.success).toBe(false)
  })

  it('chấp nhận customerId optional uuid', () => {
    const r = listCustomerPricesQuerySchema.safeParse({ customerId: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it('reject customerId không phải uuid', () => {
    const r = listCustomerPricesQuerySchema.safeParse({ customerId: 'invalid' })
    expect(r.success).toBe(false)
  })
})
