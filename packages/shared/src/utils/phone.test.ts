import { describe, expect, it } from 'vitest'

import { formatPhone } from './phone.js'

describe('formatPhone', () => {
  it('di động 10 số nhóm 4-3-3', () => {
    expect(formatPhone('0901234567')).toBe('0901 234 567')
  })

  it('cố định 11 số nhóm 3-4-4', () => {
    expect(formatPhone('02839401401')).toBe('028 3940 1401')
  })

  it('+84 giữ đầu số quốc tế', () => {
    expect(formatPhone('+84901234567')).toBe('+84 901 234 567')
    expect(formatPhone('+842839401401')).toBe('+84 28 3940 1401')
  })

  it('số đã có khoảng trắng, dấu chấm hoặc gạch nối được chuẩn hóa', () => {
    expect(formatPhone('0901 234 567')).toBe('0901 234 567')
    expect(formatPhone('090.123.4567')).toBe('0901 234 567')
    expect(formatPhone(' 028-3940-1401 ')).toBe('028 3940 1401')
  })

  it('null, undefined, rỗng trả chuỗi rỗng', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
    expect(formatPhone('')).toBe('')
  })

  it('chuỗi không phải số điện thoại hợp lệ trả nguyên văn', () => {
    expect(formatPhone('12345')).toBe('12345')
    expect(formatPhone('090123456789')).toBe('090123456789')
    expect(formatPhone('0901234567 ext 2')).toBe('0901234567 ext 2')
  })
})
