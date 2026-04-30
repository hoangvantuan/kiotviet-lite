import { describe, expect, it } from 'vitest'

import {
  createSupplierPaymentSchema,
  listSupplierPaymentsQuerySchema,
} from './supplier-payment-management.js'

const VALID_UUID = '01928a8e-1234-7c01-9999-aaaaaaaaaaaa'

describe('createSupplierPaymentSchema', () => {
  it('chấp nhận input đầy đủ', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 500000,
      note: 'Chi trả nợ tháng 4',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận note null', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100000,
      note: null,
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận khi không truyền note', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100000,
    })
    expect(r.success).toBe(true)
  })

  it('từ chối supplierId không phải uuid', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: 'not-a-uuid',
      amount: 100000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối amount = 0', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 0,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain('lớn hơn 0')
    }
  })

  it('từ chối amount âm', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: -1000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối amount không phải integer', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100.5,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối amount vượt giới hạn', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100_000_000_000_000,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối note > 500 ký tự', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100000,
      note: 'a'.repeat(501),
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận note đúng 500 ký tự', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100000,
      note: 'a'.repeat(500),
    })
    expect(r.success).toBe(true)
  })

  it('strict() loại bỏ field lạ', () => {
    const r = createSupplierPaymentSchema.safeParse({
      supplierId: VALID_UUID,
      amount: 100000,
      extraField: 'should fail',
    })
    expect(r.success).toBe(false)
  })

  it('từ chối thiếu supplierId', () => {
    const r = createSupplierPaymentSchema.safeParse({ amount: 100000 })
    expect(r.success).toBe(false)
  })

  it('từ chối thiếu amount', () => {
    const r = createSupplierPaymentSchema.safeParse({ supplierId: VALID_UUID })
    expect(r.success).toBe(false)
  })
})

describe('listSupplierPaymentsQuerySchema', () => {
  it('default page=1, pageSize=20', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('coerce page/pageSize string sang số', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('từ chối pageSize > 100', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({ pageSize: '200' })
    expect(r.success).toBe(false)
  })

  it('từ chối supplierId không phải uuid', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({ supplierId: 'not-uuid' })
    expect(r.success).toBe(false)
  })

  it('chấp nhận supplierId hợp lệ', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({ supplierId: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it('từ chối fromDate > toDate', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({
      fromDate: '2026-04-30T00:00:00.000Z',
      toDate: '2026-04-01T00:00:00.000Z',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain('Ngày kết thúc phải sau ngày bắt đầu')
    }
  })

  it('chấp nhận fromDate <= toDate', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({
      fromDate: '2026-04-01T00:00:00.000Z',
      toDate: '2026-04-30T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận chỉ fromDate', () => {
    const r = listSupplierPaymentsQuerySchema.safeParse({
      fromDate: '2026-04-01T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})
