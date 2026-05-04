import { describe, expect, it } from 'vitest'

import {
  createDebtAdjustmentSchema,
  listDebtAdjustmentsQuerySchema,
} from './debt-adjustment-management.js'

const VALID_UUID = '01928a8e-1234-7c01-9999-aaaaaaaaaaaa'

describe('createDebtAdjustmentSchema', () => {
  it('chấp nhận input đầy đủ hợp lệ', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 300000,
      reason: 'Xoá nợ xấu, KH đã thanh toán bên ngoài',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận newAmount = 0 (xoá toàn bộ nợ)', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 0,
      reason: 'Xoá nợ hoàn toàn',
    })
    expect(r.success).toBe(true)
  })

  it('từ chối customerId không phải uuid', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: 'not-a-uuid',
      newAmount: 100000,
      reason: 'Lý do test',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('Vui lòng chọn khách hàng'))).toBe(
        true,
      )
    }
  })

  it('từ chối newAmount < 0', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: -1000,
      reason: 'Lý do test',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('không được âm'))).toBe(true)
    }
  })

  it('từ chối newAmount không phải integer', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100.5,
      reason: 'Lý do test',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('số nguyên'))).toBe(true)
    }
  })

  it('từ chối newAmount vượt max', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100_000_000_000_000,
      reason: 'Lý do test',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('vượt giới hạn'))).toBe(true)
    }
  })

  it('từ chối reason trống', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100000,
      reason: '',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message.includes('Vui lòng nhập lý do điều chỉnh')),
      ).toBe(true)
    }
  })

  it('từ chối reason chỉ có khoảng trắng (sau trim)', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100000,
      reason: '   ',
    })
    expect(r.success).toBe(false)
  })

  it('từ chối reason > 500 ký tự', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100000,
      reason: 'a'.repeat(501),
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('tối đa 500'))).toBe(true)
    }
  })

  it('strict() từ chối field lạ', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100000,
      reason: 'Lý do test',
      extraField: 'should fail',
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận reason tiếng Việt có dấu', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      customerId: VALID_UUID,
      newAmount: 100000,
      reason: 'Xoá nợ xấu, khách hàng đã thanh toán bên ngoài hệ thống',
    })
    expect(r.success).toBe(true)
  })
})

describe('listDebtAdjustmentsQuerySchema', () => {
  it('default page=1, pageSize=20 khi có customerId', () => {
    const r = listDebtAdjustmentsQuerySchema.safeParse({ customerId: VALID_UUID })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('từ chối thiếu customerId', () => {
    const r = listDebtAdjustmentsQuerySchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('từ chối customerId không phải uuid', () => {
    const r = listDebtAdjustmentsQuerySchema.safeParse({ customerId: 'not-uuid' })
    expect(r.success).toBe(false)
  })

  it('coerce page/pageSize string sang số', () => {
    const r = listDebtAdjustmentsQuerySchema.safeParse({
      customerId: VALID_UUID,
      page: '3',
      pageSize: '50',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('từ chối pageSize > 100', () => {
    const r = listDebtAdjustmentsQuerySchema.safeParse({
      customerId: VALID_UUID,
      pageSize: '200',
    })
    expect(r.success).toBe(false)
  })
})
