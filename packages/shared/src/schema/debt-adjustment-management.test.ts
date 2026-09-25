import { describe, expect, it } from 'vitest'

import {
  applyDebtAdjustment,
  createDebtAdjustmentSchema,
  listDebtAdjustmentsQuerySchema,
} from './debt-adjustment-management.js'

const VALID_UUID = '01928a8e-1234-7c01-9999-aaaaaaaaaaaa'

const base = {
  customerId: VALID_UUID,
  direction: 'decrease' as const,
  amount: 100_000,
  expectedCurrentDebt: 300_000,
  reason: 'Chiết khấu cuối kỳ',
}

function messages(input: unknown): string[] {
  const r = createDebtAdjustmentSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('createDebtAdjustmentSchema (TIEN-102, TIEN-110)', () => {
  it('chấp nhận tăng và giảm nợ hợp lệ', () => {
    expect(createDebtAdjustmentSchema.safeParse(base).success).toBe(true)
    expect(
      createDebtAdjustmentSchema.safeParse({ ...base, direction: 'increase', amount: 5_000_000 })
        .success,
    ).toBe(true)
  })

  it('cho giảm đúng bằng số nợ hiện tại (xoá hết nợ phải nhập đủ số)', () => {
    expect(createDebtAdjustmentSchema.safeParse({ ...base, amount: 300_000 }).success).toBe(true)
  })

  it('từ chối giảm vượt số nợ hiện tại', () => {
    expect(messages({ ...base, amount: 300_001 })).toContain(
      'Số tiền giảm không được lớn hơn số nợ hiện tại',
    )
  })

  it('từ chối số tiền 0, âm, lẻ hoặc vượt giới hạn', () => {
    expect(messages({ ...base, amount: 0 })).toContain('Số tiền điều chỉnh phải lớn hơn 0')
    expect(messages({ ...base, amount: -1000 })).toContain('Số tiền điều chỉnh phải lớn hơn 0')
    expect(messages({ ...base, amount: 100.5 })).toContain('Số tiền phải là số nguyên')
    expect(messages({ ...base, direction: 'increase', amount: 100_000_000_000_000 })).toContain(
      'Số tiền vượt giới hạn',
    )
  })

  it('bắt buộc chọn chiều điều chỉnh', () => {
    const rest = { ...base, direction: undefined }
    expect(messages(rest)).toContain('Vui lòng chọn tăng nợ hoặc giảm nợ')
    expect(messages({ ...base, direction: 'set' })).toContain('Vui lòng chọn tăng nợ hoặc giảm nợ')
  })

  it('bắt buộc gửi số nợ đang thấy', () => {
    const rest = { ...base, expectedCurrentDebt: undefined }
    expect(messages(rest)).toContain('Thiếu số nợ hiện tại, vui lòng tải lại')
  })

  it('từ chối hợp đồng cũ gửi số nợ mới tuyệt đối', () => {
    expect(
      createDebtAdjustmentSchema.safeParse({
        customerId: VALID_UUID,
        newAmount: 0,
        reason: 'Xoá nợ',
      }).success,
    ).toBe(false)
  })

  it('từ chối customerId không phải uuid', () => {
    expect(messages({ ...base, customerId: 'not-a-uuid' })).toContain('Vui lòng chọn khách hàng')
  })

  it('bắt buộc lý do, trim khoảng trắng, tối đa 500 ký tự', () => {
    expect(messages({ ...base, reason: '' })).toContain('Vui lòng nhập lý do điều chỉnh')
    expect(messages({ ...base, reason: '   ' })).toContain('Vui lòng nhập lý do điều chỉnh')
    expect(messages({ ...base, reason: 'a'.repeat(501) })).toContain('Lý do tối đa 500 ký tự')
  })

  it('strict() từ chối field lạ', () => {
    expect(createDebtAdjustmentSchema.safeParse({ ...base, extraField: 'x' }).success).toBe(false)
  })

  it('chấp nhận reason tiếng Việt có dấu', () => {
    const r = createDebtAdjustmentSchema.safeParse({
      ...base,
      reason: 'Xoá nợ xấu, khách hàng đã thanh toán bên ngoài hệ thống',
    })
    expect(r.success).toBe(true)
  })
})

describe('applyDebtAdjustment', () => {
  it('tính số nợ sau theo chiều điều chỉnh', () => {
    expect(applyDebtAdjustment(300_000, 'increase', 50_000)).toBe(350_000)
    expect(applyDebtAdjustment(300_000, 'decrease', 300_000)).toBe(0)
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
