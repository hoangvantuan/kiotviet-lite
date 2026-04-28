import { describe, expect, it } from 'vitest'

import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierNameSchema,
  supplierPhoneSchema,
  updateSupplierSchema,
} from './supplier-management.js'

describe('supplierNameSchema', () => {
  it('chấp nhận tên thường', () => {
    expect(supplierNameSchema.safeParse('Công ty ABC').success).toBe(true)
  })

  it('chấp nhận tên có ký tự đặc biệt cho phép', () => {
    expect(supplierNameSchema.safeParse('TNHH A&B (Việt Nam) - 2026').success).toBe(true)
  })

  it('từ chối tên rỗng', () => {
    expect(supplierNameSchema.safeParse('   ').success).toBe(false)
  })

  it('từ chối tên quá 100 ký tự', () => {
    expect(supplierNameSchema.safeParse('a'.repeat(101)).success).toBe(false)
  })

  it('từ chối ký tự không hợp lệ', () => {
    expect(supplierNameSchema.safeParse('<script>x</script>').success).toBe(false)
  })
})

describe('supplierPhoneSchema', () => {
  it('chấp nhận số VN 0901234567', () => {
    expect(supplierPhoneSchema.safeParse('0901234567').success).toBe(true)
  })

  it('chấp nhận số quốc tế +84901234567', () => {
    expect(supplierPhoneSchema.safeParse('+84901234567').success).toBe(true)
  })

  it('từ chối quá ngắn (<8 ký tự)', () => {
    expect(supplierPhoneSchema.safeParse('1234567').success).toBe(false)
  })

  it('từ chối quá dài (>15 ký tự)', () => {
    expect(supplierPhoneSchema.safeParse('1234567890123456').success).toBe(false)
  })

  it('từ chối có chữ', () => {
    expect(supplierPhoneSchema.safeParse('abc12345').success).toBe(false)
  })
})

describe('createSupplierSchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(createSupplierSchema.safeParse({ name: 'Công ty ABC' }).success).toBe(true)
  })

  it('chấp nhận đầy đủ field', () => {
    const r = createSupplierSchema.safeParse({
      name: 'Công ty ABC',
      phone: '0901234567',
      email: 'contact@abc.com',
      address: '12 Nguyễn Huệ, Q1, TP.HCM',
      taxId: '0312345678',
      notes: 'Đối tác chính',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận phone null', () => {
    expect(createSupplierSchema.safeParse({ name: 'X', phone: null }).success).toBe(true)
  })

  it('từ chối email không hợp lệ', () => {
    expect(createSupplierSchema.safeParse({ name: 'X', email: 'abc' }).success).toBe(false)
  })

  it('chấp nhận email valid', () => {
    expect(createSupplierSchema.safeParse({ name: 'X', email: 'a@b.com' }).success).toBe(true)
  })

  it('từ chối taxId chứa ký tự đặc biệt không phải dash', () => {
    expect(createSupplierSchema.safeParse({ name: 'X', taxId: '03/12345' }).success).toBe(false)
  })

  it('từ chối thiếu name', () => {
    expect(createSupplierSchema.safeParse({}).success).toBe(false)
  })
})

describe('updateSupplierSchema', () => {
  it('từ chối object rỗng', () => {
    expect(updateSupplierSchema.safeParse({}).success).toBe(false)
  })

  it('chấp nhận chỉ phone', () => {
    expect(updateSupplierSchema.safeParse({ phone: '0901234567' }).success).toBe(true)
  })

  it('chấp nhận chỉ name', () => {
    expect(updateSupplierSchema.safeParse({ name: 'Mới' }).success).toBe(true)
  })
})

describe('listSuppliersQuerySchema', () => {
  it('default page=1, pageSize=20, hasDebt=all', () => {
    const r = listSuppliersQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
      expect(r.data.hasDebt).toBe('all')
    }
  })

  it('coerce page string sang số', () => {
    const r = listSuppliersQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('hasDebt enum', () => {
    expect(listSuppliersQuerySchema.safeParse({ hasDebt: 'yes' }).success).toBe(true)
    expect(listSuppliersQuerySchema.safeParse({ hasDebt: 'invalid' }).success).toBe(false)
  })

  it('từ chối pageSize quá 100', () => {
    expect(listSuppliersQuerySchema.safeParse({ pageSize: '200' }).success).toBe(false)
  })
})
