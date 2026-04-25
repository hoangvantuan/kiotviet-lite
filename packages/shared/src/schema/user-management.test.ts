import { describe, expect, it } from 'vitest'

import { createUserSchema, updateUserSchema, verifyPinSchema } from './user-management.js'

describe('createUserSchema', () => {
  const valid = {
    name: 'Nguyễn Văn B',
    phone: '0901234567',
    role: 'staff' as const,
    pin: '123456',
  }

  it('chấp nhận input hợp lệ', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true)
  })

  it('chấp nhận tất cả 3 role: owner/manager/staff', () => {
    expect(createUserSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(true)
    expect(createUserSchema.safeParse({ ...valid, role: 'manager' }).success).toBe(true)
    expect(createUserSchema.safeParse({ ...valid, role: 'staff' }).success).toBe(true)
  })

  it('từ chối tên quá ngắn (<2 ký tự)', () => {
    const r = createUserSchema.safeParse({ ...valid, name: 'A' })
    expect(r.success).toBe(false)
  })

  it('từ chối tên quá dài (>100 ký tự)', () => {
    const r = createUserSchema.safeParse({ ...valid, name: 'A'.repeat(101) })
    expect(r.success).toBe(false)
  })

  it('từ chối phone sai format VN', () => {
    expect(createUserSchema.safeParse({ ...valid, phone: '123' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, phone: '0201234567' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, phone: '+84901234567' }).success).toBe(false)
  })

  it('từ chối PIN không đủ 6 chữ số', () => {
    expect(createUserSchema.safeParse({ ...valid, pin: '12345' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, pin: '1234567' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, pin: 'abcdef' }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, pin: '12345a' }).success).toBe(false)
  })

  it('từ chối role không nằm trong enum', () => {
    const r = createUserSchema.safeParse({ ...valid, role: 'admin' as never })
    expect(r.success).toBe(false)
  })

  it('từ chối thiếu field bắt buộc', () => {
    expect(
      createUserSchema.safeParse({ phone: '0901234567', role: 'staff', pin: '123456' }).success,
    ).toBe(false)
    expect(createUserSchema.safeParse({ name: 'A B', role: 'staff', pin: '123456' }).success).toBe(
      false,
    )
    expect(
      createUserSchema.safeParse({ name: 'A B', phone: '0901234567', pin: '123456' }).success,
    ).toBe(false)
    expect(
      createUserSchema.safeParse({ name: 'A B', phone: '0901234567', role: 'staff' }).success,
    ).toBe(false)
  })
})

describe('updateUserSchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(updateUserSchema.safeParse({ name: 'Tên mới' }).success).toBe(true)
  })

  it('chấp nhận chỉ role', () => {
    expect(updateUserSchema.safeParse({ role: 'manager' }).success).toBe(true)
  })

  it('chấp nhận chỉ isActive', () => {
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true)
  })

  it('chấp nhận chỉ pin (reset PIN)', () => {
    expect(updateUserSchema.safeParse({ pin: '654321' }).success).toBe(true)
  })

  it('chấp nhận nhiều field cùng lúc', () => {
    expect(updateUserSchema.safeParse({ name: 'X Y', role: 'staff', isActive: true }).success).toBe(
      true,
    )
  })

  it('từ chối object rỗng (cần ít nhất 1 field)', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false)
  })

  it('từ chối tên quá ngắn khi có truyền', () => {
    expect(updateUserSchema.safeParse({ name: 'A' }).success).toBe(false)
  })

  it('từ chối PIN sai format khi có truyền', () => {
    expect(updateUserSchema.safeParse({ pin: '12345' }).success).toBe(false)
    expect(updateUserSchema.safeParse({ pin: 'abcdef' }).success).toBe(false)
  })

  it('từ chối role không hợp lệ', () => {
    expect(updateUserSchema.safeParse({ role: 'superuser' }).success).toBe(false)
  })
})

describe('verifyPinSchema', () => {
  it('chấp nhận PIN 6 chữ số', () => {
    expect(verifyPinSchema.safeParse({ pin: '123456' }).success).toBe(true)
    expect(verifyPinSchema.safeParse({ pin: '000000' }).success).toBe(true)
  })

  it('từ chối PIN sai độ dài', () => {
    expect(verifyPinSchema.safeParse({ pin: '12345' }).success).toBe(false)
    expect(verifyPinSchema.safeParse({ pin: '1234567' }).success).toBe(false)
    expect(verifyPinSchema.safeParse({ pin: '' }).success).toBe(false)
  })

  it('từ chối PIN chứa ký tự không phải chữ số', () => {
    expect(verifyPinSchema.safeParse({ pin: 'abcdef' }).success).toBe(false)
    expect(verifyPinSchema.safeParse({ pin: '12345a' }).success).toBe(false)
    expect(verifyPinSchema.safeParse({ pin: '12-456' }).success).toBe(false)
  })

  it('từ chối thiếu field pin', () => {
    expect(verifyPinSchema.safeParse({}).success).toBe(false)
  })
})
