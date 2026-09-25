import { describe, expect, it } from 'vitest'

import { DEFAULT_DEV_ORIGINS, parseAllowedOrigins } from './allowed-origins.js'

describe('BM-104: đọc ALLOWED_ORIGINS', () => {
  it('bỏ phần tử rỗng và khoảng trắng (dấu phẩy thừa không thành origin "")', () => {
    expect(parseAllowedOrigins(' https://a.vn, ,https://b.vn,', 'production').origins).toEqual([
      'https://a.vn',
      'https://b.vn',
    ])
  })

  it('không đặt biến thì dùng origin dev, production có cảnh báo', () => {
    const dev = parseAllowedOrigins(undefined, 'development')
    expect(dev.origins).toEqual([...DEFAULT_DEV_ORIGINS])
    expect(dev.warning).toBeUndefined()

    for (const raw of [undefined, '', ' , ']) {
      const prod = parseAllowedOrigins(raw, 'production')
      expect(prod.origins).toEqual([...DEFAULT_DEV_ORIGINS])
      expect(prod.warning).toContain('ALLOWED_ORIGINS')
    }
  })

  it('production chỉ khai báo localhost cũng bị cảnh báo', () => {
    expect(parseAllowedOrigins('http://localhost:5173', 'production').warning).toContain(
      'localhost',
    )
    expect(parseAllowedOrigins('https://shop.vn', 'production').warning).toBeUndefined()
  })
})
