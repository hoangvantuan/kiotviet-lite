import { describe, expect, it } from 'vitest'

import {
  createCustomerGroupSchema,
  createCustomerSchema,
  listCustomersQuerySchema,
  quickCreateCustomerSchema,
  updateCustomerGroupSchema,
  updateCustomerSchema,
} from './customer-management.js'

const validUuid = '0190d000-0000-7000-8000-000000000001'
const validUuid2 = '0190d000-0000-7000-8000-000000000002'

describe('createCustomerGroupSchema', () => {
  it('chấp nhận tên hợp lệ, không debt_limit', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP' }).success).toBe(true)
  })

  it('chấp nhận tên + debtLimit', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP', debtLimit: 5_000_000 }).success).toBe(
      true,
    )
  })

  it('chấp nhận debtLimit null', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP', debtLimit: null }).success).toBe(true)
  })

  it('chấp nhận description', () => {
    const r = createCustomerGroupSchema.safeParse({ name: 'VIP', description: 'Khách VIP' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.description).toBe('Khách VIP')
  })

  it('chấp nhận description null', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP', description: null }).success).toBe(
      true,
    )
  })

  it('từ chối description quá 255 ký tự', () => {
    expect(
      createCustomerGroupSchema.safeParse({ name: 'VIP', description: 'a'.repeat(256) }).success,
    ).toBe(false)
  })

  it('từ chối tên rỗng', () => {
    expect(createCustomerGroupSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('từ chối tên quá 100 ký tự', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('từ chối debtLimit âm', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP', debtLimit: -1 }).success).toBe(false)
  })

  it('từ chối debtLimit không phải số nguyên', () => {
    expect(createCustomerGroupSchema.safeParse({ name: 'VIP', debtLimit: 1.5 }).success).toBe(false)
  })

  it('từ chối tên có ký tự không hợp lệ', () => {
    expect(createCustomerGroupSchema.safeParse({ name: '<script>x</script>' }).success).toBe(false)
  })
})

describe('updateCustomerGroupSchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(updateCustomerGroupSchema.safeParse({ name: 'Mới' }).success).toBe(true)
  })

  it('chấp nhận chỉ debtLimit', () => {
    expect(updateCustomerGroupSchema.safeParse({ debtLimit: 1_000_000 }).success).toBe(true)
  })

  it('chấp nhận chỉ description', () => {
    expect(updateCustomerGroupSchema.safeParse({ description: 'Mô tả mới' }).success).toBe(true)
  })

  it('từ chối object rỗng', () => {
    expect(updateCustomerGroupSchema.safeParse({}).success).toBe(false)
  })
})

describe('createCustomerSchema', () => {
  it('chấp nhận name + phone (tối thiểu)', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'Nguyễn Văn A', phone: '0901234567' }).success,
    ).toBe(true)
  })

  it('chấp nhận đủ field', () => {
    const r = createCustomerSchema.safeParse({
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'a@example.com',
      address: 'Số 1 Nguyễn Trãi',
      taxId: '0123456789',
      notes: 'KH thân thiết',
      debtLimit: 5_000_000,
      groupId: validUuid,
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận phone quốc tế có dấu +', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '+84901234567' }).success).toBe(true)
  })

  it('chấp nhận phone 8 ký tự (tối thiểu)', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '12345678' }).success).toBe(true)
  })

  it('chấp nhận phone 15 ký tự (tối đa)', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '123456789012345' }).success).toBe(
      true,
    )
  })

  it('từ chối phone có chữ cái', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '090abc1234' }).success).toBe(false)
  })

  it('từ chối phone quá ngắn (< 8)', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '1234567' }).success).toBe(false)
  })

  it('từ chối phone quá dài (> 15)', () => {
    expect(createCustomerSchema.safeParse({ name: 'A', phone: '1234567890123456' }).success).toBe(
      false,
    )
  })

  it('từ chối name quá 100 ký tự', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'a'.repeat(101), phone: '0901234567' }).success,
    ).toBe(false)
  })

  it('từ chối email sai định dạng', () => {
    expect(
      createCustomerSchema.safeParse({
        name: 'A',
        phone: '0901234567',
        email: 'not-email',
      }).success,
    ).toBe(false)
  })

  it('chấp nhận email null', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', email: null }).success,
    ).toBe(true)
  })

  it('chấp nhận taxId chữ + số + gạch ngang', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', taxId: 'ABC-123' }).success,
    ).toBe(true)
  })

  it('chấp nhận taxId 10 chữ số', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', taxId: '0123456789' })
        .success,
    ).toBe(true)
  })

  it('từ chối taxId quá 32 ký tự', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', taxId: 'A'.repeat(33) })
        .success,
    ).toBe(false)
  })

  it('từ chối taxId có ký tự đặc biệt', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', taxId: 'AB@#' }).success,
    ).toBe(false)
  })

  it('từ chối groupId không phải uuid', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', groupId: 'invalid' })
        .success,
    ).toBe(false)
  })

  it('chấp nhận groupId null', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', groupId: null }).success,
    ).toBe(true)
  })

  it('từ chối debtLimit âm', () => {
    expect(
      createCustomerSchema.safeParse({ name: 'A', phone: '0901234567', debtLimit: -100 }).success,
    ).toBe(false)
  })

  it('trim whitespace ở name', () => {
    const r = createCustomerSchema.safeParse({ name: '  Nguyễn Văn A  ', phone: '0901234567' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Nguyễn Văn A')
    }
  })
})

describe('updateCustomerSchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(updateCustomerSchema.safeParse({ name: 'Tên mới' }).success).toBe(true)
  })

  it('chấp nhận chỉ groupId (đổi nhóm)', () => {
    expect(updateCustomerSchema.safeParse({ groupId: validUuid2 }).success).toBe(true)
  })

  it('chấp nhận groupId null (rời nhóm)', () => {
    expect(updateCustomerSchema.safeParse({ groupId: null }).success).toBe(true)
  })

  it('từ chối object rỗng', () => {
    expect(updateCustomerSchema.safeParse({}).success).toBe(false)
  })
})

describe('quickCreateCustomerSchema', () => {
  it('chấp nhận name + phone', () => {
    expect(quickCreateCustomerSchema.safeParse({ name: 'A', phone: '0901234567' }).success).toBe(
      true,
    )
  })

  it('từ chối thiếu phone', () => {
    expect(quickCreateCustomerSchema.safeParse({ name: 'A' }).success).toBe(false)
  })

  it('từ chối thiếu name', () => {
    expect(quickCreateCustomerSchema.safeParse({ phone: '0901234567' }).success).toBe(false)
  })

  it('từ chối phone có chữ cái', () => {
    expect(quickCreateCustomerSchema.safeParse({ name: 'A', phone: 'abc12345' }).success).toBe(
      false,
    )
  })
})

describe('listCustomersQuerySchema', () => {
  it('mặc định page=1, pageSize=20, hasDebt=all', () => {
    const r = listCustomersQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
      expect(r.data.hasDebt).toBe('all')
    }
  })

  it('coerce page và pageSize từ string', () => {
    const r = listCustomersQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('chấp nhận groupId là uuid', () => {
    expect(listCustomersQuerySchema.safeParse({ groupId: validUuid }).success).toBe(true)
  })

  it('chấp nhận groupId là "none"', () => {
    expect(listCustomersQuerySchema.safeParse({ groupId: 'none' }).success).toBe(true)
  })

  it('từ chối pageSize quá lớn', () => {
    expect(listCustomersQuerySchema.safeParse({ pageSize: 200 }).success).toBe(false)
  })

  it('chấp nhận hasDebt = yes', () => {
    const r = listCustomersQuerySchema.safeParse({ hasDebt: 'yes' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.hasDebt).toBe('yes')
  })

  it('chấp nhận hasDebt = no', () => {
    const r = listCustomersQuerySchema.safeParse({ hasDebt: 'no' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.hasDebt).toBe('no')
  })

  it('từ chối hasDebt giá trị không hợp lệ', () => {
    expect(listCustomersQuerySchema.safeParse({ hasDebt: 'invalid' }).success).toBe(false)
  })
})
