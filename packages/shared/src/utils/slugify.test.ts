import { describe, expect, it } from 'vitest'

import { slugify, slugifyForSku } from './slugify.js'

describe('slugify', () => {
  it('chuyển đổi tiếng Việt có dấu sang slug không dấu', () => {
    expect(slugify('Bảng giá VIP')).toBe('bang-gia-vip')
    expect(slugify('Cà phê đen')).toBe('ca-phe-den')
    expect(slugify('Đỏ')).toBe('do')
    expect(slugify('Áo sơ mi nam — size XL')).toBe('ao-so-mi-nam-size-xl')
  })

  it('xử lý ký tự đặc biệt và dấu gạch nối liên tiếp', () => {
    expect(slugify('Bảng giá VIP - Đại lý!')).toBe('bang-gia-vip-dai-ly')
    expect(slugify('hello---world')).toBe('hello-world')
    expect(slugify('---hello---')).toBe('hello')
  })

  it('hỗ trợ giới hạn độ dài maxLength', () => {
    const long = 'Tên bảng giá siêu dài dành cho khách hàng thân thiết năm 2026'
    const result = slugify(long, { maxLength: 30 })
    expect(result.length).toBeLessThanOrEqual(30)
    expect(result.endsWith('-')).toBe(false)
  })

  it('xử lý chuỗi rỗng hoặc chỉ ký tự đặc biệt', () => {
    expect(slugify('')).toBe('')
    expect(slugify('!!!')).toBe('')
  })

  it('slugifyForSku hoạt động tương thích hoàn toàn', () => {
    expect(slugifyForSku('Size  M_Plus')).toBe('size-m-plus')
  })
})
