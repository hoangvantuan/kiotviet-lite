import { describe, expect, it } from 'vitest'

import { loginSchema, phoneSchema, registerSchema } from './auth.js'

describe('phoneSchema', () => {
  it('chấp nhận số VN bắt đầu 03/05/07/08/09', () => {
    expect(phoneSchema.safeParse('0901234567').success).toBe(true)
    expect(phoneSchema.safeParse('0312345678').success).toBe(true)
    expect(phoneSchema.safeParse('0581234567').success).toBe(true)
    expect(phoneSchema.safeParse('0701234567').success).toBe(true)
  })

  it('từ chối format +84/84 (chỉ chấp nhận 0xxxxxxxxx)', () => {
    expect(phoneSchema.safeParse('+84901234567').success).toBe(false)
    expect(phoneSchema.safeParse('84901234567').success).toBe(false)
  })

  it('từ chối số sai định dạng', () => {
    expect(phoneSchema.safeParse('123').success).toBe(false)
    expect(phoneSchema.safeParse('0201234567').success).toBe(false)
    expect(phoneSchema.safeParse('abcdefghij').success).toBe(false)
  })
})

describe('registerSchema', () => {
  const valid = {
    storeName: 'Cửa hàng A',
    ownerName: 'Nguyễn Văn A',
    phone: '0901234567',
    password: 'matkhau123',
  }

  it('chấp nhận input hợp lệ', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it('từ chối tên cửa hàng quá ngắn', () => {
    const r = registerSchema.safeParse({ ...valid, storeName: 'A' })
    expect(r.success).toBe(false)
  })

  it('từ chối mật khẩu < 8 ký tự', () => {
    const r = registerSchema.safeParse({ ...valid, password: '1234567' })
    expect(r.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('chấp nhận phone hợp lệ + password bất kỳ', () => {
    const r = loginSchema.safeParse({ phone: '0901234567', password: 'x' })
    expect(r.success).toBe(true)
  })

  it('từ chối phone sai', () => {
    const r = loginSchema.safeParse({ phone: 'abc', password: 'x' })
    expect(r.success).toBe(false)
  })
})
