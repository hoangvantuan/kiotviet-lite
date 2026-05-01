import { describe, expect, it } from 'vitest'

import { createOrderSchema } from './order-management.js'

const VALID_UUID_A = '01919c3e-1234-7000-9000-000000000001'
const VALID_UUID_B = '01919c3e-1234-7000-9000-000000000002'

const baseItem = {
  productId: VALID_UUID_A,
  variantId: null,
  productName: 'Sản phẩm A',
  variantName: null,
  unit: null,
  unitPrice: 100_000,
  quantity: 1,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  lineTotal: 100_000,
  note: null,
  unitConversionId: null,
  originalPrice: null,
  priceOverride: false,
  priceOverrideReason: null,
  priceOverridePinUsed: false,
}

const baseOrder = {
  customerId: VALID_UUID_B,
  subtotal: 100_000,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  total: 100_000,
  paymentMethod: 'debt' as const,
  paymentStatus: 'unpaid' as const,
  note: null,
  items: [baseItem],
}

describe('createOrderSchema - debt logic', () => {
  it('valid: ghi nợ toàn bộ (debtAmount === total)', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100_000,
      paymentStatus: 'unpaid',
    })
    expect(r.success).toBe(true)
  })

  it('valid: ghi nợ một phần (debtAmount < total, paymentStatus partial)', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 60_000,
      cashAmount: 40_000,
      paymentStatus: 'partial',
    })
    expect(r.success).toBe(true)
  })

  it('valid: không ghi nợ (debtAmount = 0, không cần customerId)', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      customerId: null,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      cashAmount: 100_000,
      debtAmount: 0,
    })
    expect(r.success).toBe(true)
  })

  it('valid: debtLimitOverridden default false', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100_000,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.debtLimitOverridden).toBe(false)
    }
  })

  it('valid: debtLimitOverridden = true với PIN', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100_000,
      debtLimitOverridden: true,
      debtLimitOverridePin: '111111',
    })
    expect(r.success).toBe(true)
  })

  it('reject: debtLimitOverridden = true thiếu PIN', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100_000,
      debtLimitOverridden: true,
    })
    expect(r.success).toBe(false)
  })

  it('reject: debtAmount > 0 nhưng customerId null', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      customerId: null,
      debtAmount: 100_000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('customerId'))).toBe(true)
    }
  })

  it('reject: debtAmount > total', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 150_000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('debtAmount'))).toBe(true)
    }
  })

  it('reject: debtAmount âm', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: -1000,
    })
    expect(r.success).toBe(false)
  })

  it('reject: debtAmount không phải số nguyên', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100.5,
    })
    expect(r.success).toBe(false)
  })

  it('reject: debtAmount === total nhưng paymentStatus = paid', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 100_000,
      paymentStatus: 'paid',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('paymentStatus'))).toBe(true)
    }
  })

  it('reject: debtAmount < total nhưng paymentStatus = unpaid', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      debtAmount: 50_000,
      cashAmount: 50_000,
      paymentStatus: 'unpaid',
    })
    expect(r.success).toBe(false)
  })

  it('valid: paymentMethod = debt được chấp nhận', () => {
    const r = createOrderSchema.safeParse({
      ...baseOrder,
      paymentMethod: 'debt',
      debtAmount: 100_000,
      paymentStatus: 'unpaid',
    })
    expect(r.success).toBe(true)
  })
})
