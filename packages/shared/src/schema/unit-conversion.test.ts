import { describe, expect, it } from 'vitest'

import {
  recordManualAdjustInputSchema,
  recordPurchaseInputSchema,
} from './inventory-transaction-management.js'
import { unitConversionInputSchema, unitConversionUpdateSchema } from './unit-conversions.js'

describe('unitConversionInputSchema', () => {
  it('chấp nhận input hợp lệ', () => {
    const r = unitConversionInputSchema.safeParse({
      unit: 'Thùng',
      conversionFactor: 24,
      sellingPrice: 240000,
    })
    expect(r.success).toBe(true)
  })

  it('từ chối unit rỗng', () => {
    const r = unitConversionInputSchema.safeParse({
      unit: '',
      conversionFactor: 24,
      sellingPrice: 240000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối conversionFactor = 1', () => {
    const r = unitConversionInputSchema.safeParse({
      unit: 'Thùng',
      conversionFactor: 1,
      sellingPrice: 240000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối conversionFactor > 100_000', () => {
    const r = unitConversionInputSchema.safeParse({
      unit: 'Thùng',
      conversionFactor: 100_001,
      sellingPrice: 240000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối sellingPrice âm', () => {
    const r = unitConversionInputSchema.safeParse({
      unit: 'Thùng',
      conversionFactor: 24,
      sellingPrice: -1,
    })
    expect(r.success).toBe(false)
  })
})

describe('unitConversionUpdateSchema', () => {
  it('chấp nhận update partial', () => {
    const r = unitConversionUpdateSchema.safeParse({ sellingPrice: 100 })
    expect(r.success).toBe(true)
  })

  it('từ chối update rỗng', () => {
    const r = unitConversionUpdateSchema.safeParse({})
    expect(r.success).toBe(false)
  })
})

describe('recordPurchaseInputSchema', () => {
  it('từ chối quantity = 0', () => {
    const r = recordPurchaseInputSchema.safeParse({
      quantity: 0,
      unitCost: 10000,
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận input hợp lệ', () => {
    const r = recordPurchaseInputSchema.safeParse({
      quantity: 10,
      unitCost: 10000,
    })
    expect(r.success).toBe(true)
  })
})

describe('recordManualAdjustInputSchema', () => {
  it('từ chối delta = 0', () => {
    const r = recordManualAdjustInputSchema.safeParse({
      delta: 0,
      reason: 'Kiểm kê',
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận delta âm + reason', () => {
    const r = recordManualAdjustInputSchema.safeParse({
      delta: -5,
      reason: 'Hỏng hàng',
    })
    expect(r.success).toBe(true)
  })

  it('từ chối reason rỗng', () => {
    const r = recordManualAdjustInputSchema.safeParse({
      delta: 5,
      reason: '',
    })
    expect(r.success).toBe(false)
  })
})
