import { describe, expect, it } from 'vitest'

import { createReceiptSchema, listReceiptsQuerySchema } from './receipt-management.js'

const VALID_UUID_1 = '01928a8e-1234-7c01-9999-aaaaaaaaaaaa'
const VALID_UUID_2 = '01928a8e-1234-7c01-9999-bbbbbbbbbbbb'
const VALID_UUID_3 = '01928a8e-1234-7c01-9999-cccccccccccc'

describe('createReceiptSchema', () => {
  it('chấp nhận input đầy đủ FIFO mode', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 250000,
      note: 'Thu tiền nợ tháng 4',
      allocationMode: 'fifo',
      allocations: [
        { debtId: VALID_UUID_2, amount: 100000 },
        { debtId: VALID_UUID_3, amount: 150000 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận input đầy đủ Manual mode', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'manual',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(true)
  })

  it('từ chối customerId không phải uuid', () => {
    const r = createReceiptSchema.safeParse({
      customerId: 'not-a-uuid',
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối amount = 0', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 0,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 0 }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('lớn hơn 0'))).toBe(true)
    }
  })

  it('từ chối amount âm', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: -1000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: -1000 }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối amount không phải integer', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100.5,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100.5 }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối note > 500 ký tự', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      note: 'a'.repeat(501),
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối allocations rỗng', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối allocations có debtId trùng', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'manual',
      allocations: [
        { debtId: VALID_UUID_2, amount: 50000 },
        { debtId: VALID_UUID_2, amount: 50000 },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('trùng'))).toBe(true)
    }
  })

  it('từ chối SUM(allocations) !== amount', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 200000,
      allocationMode: 'fifo',
      allocations: [
        { debtId: VALID_UUID_2, amount: 100000 },
        { debtId: VALID_UUID_3, amount: 50000 },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('Tổng phân bổ'))).toBe(true)
    }
  })

  it('từ chối allocation.amount < 1', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 0 }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối allocationMode invalid', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'random',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(false)
  })

  it('strict() loại bỏ field lạ', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
      extraField: 'should fail',
    })
    expect(r.success).toBe(false)
  })

  it('strict() loại field lạ trong allocation', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000, extra: 'x' }],
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận note null', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      note: null,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận khi không truyền note', () => {
    const r = createReceiptSchema.safeParse({
      customerId: VALID_UUID_1,
      amount: 100000,
      allocationMode: 'fifo',
      allocations: [{ debtId: VALID_UUID_2, amount: 100000 }],
    })
    expect(r.success).toBe(true)
  })
})

describe('listReceiptsQuerySchema', () => {
  it('default page=1, pageSize=20', () => {
    const r = listReceiptsQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('coerce page/pageSize string sang số', () => {
    const r = listReceiptsQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('từ chối pageSize > 100', () => {
    const r = listReceiptsQuerySchema.safeParse({ pageSize: '200' })
    expect(r.success).toBe(false)
  })

  it('từ chối customerId không phải uuid', () => {
    const r = listReceiptsQuerySchema.safeParse({ customerId: 'not-uuid' })
    expect(r.success).toBe(false)
  })

  it('từ chối fromDate > toDate', () => {
    const r = listReceiptsQuerySchema.safeParse({
      fromDate: '2026-04-30T00:00:00.000Z',
      toDate: '2026-04-01T00:00:00.000Z',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain('Ngày kết thúc phải sau ngày bắt đầu')
    }
  })

  it('chấp nhận fromDate <= toDate', () => {
    const r = listReceiptsQuerySchema.safeParse({
      fromDate: '2026-04-01T00:00:00.000Z',
      toDate: '2026-04-30T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})
