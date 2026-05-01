import { describe, expect, it } from 'vitest'

import { buildCsv, escapeCsvField, slugify } from './csv'

describe('escapeCsvField', () => {
  it('null/undefined → empty string', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('chuỗi không có ký tự đặc biệt → giữ nguyên', () => {
    expect(escapeCsvField('hello')).toBe('hello')
    expect(escapeCsvField(123)).toBe('123')
  })

  it('chuỗi chứa dấu phẩy → wrap quote', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })

  it('chuỗi chứa dấu nháy kép → escape "" và wrap', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('chuỗi chứa newline → wrap quote', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"')
  })
})

describe('buildCsv', () => {
  it('2 row 3 col tạo CSV CRLF đúng', () => {
    const csv = buildCsv(
      ['a', 'b', 'c'],
      [
        [1, 2, 3],
        ['x', 'y', 'z'],
      ],
    )
    expect(csv).toBe('a,b,c\r\n1,2,3\r\nx,y,z')
  })

  it('null cell trở thành empty', () => {
    const csv = buildCsv(['a', 'b'], [[1, null]])
    expect(csv).toBe('a,b\r\n1,')
  })

  it('escape dấu phẩy trong cell', () => {
    const csv = buildCsv(['a'], [['hello, world']])
    expect(csv).toBe('a\r\n"hello, world"')
  })
})

describe('slugify', () => {
  it('Bỏ dấu tiếng Việt + lowercase + dash', () => {
    expect(slugify('Bảng giá VIP')).toBe('bang-gia-vip')
  })

  it('Tên dài bị truncate 30 ký tự', () => {
    const long = 'a'.repeat(50)
    expect(slugify(long).length).toBeLessThanOrEqual(30)
  })

  it('Dấu đặc biệt chuyển thành dash', () => {
    expect(slugify('Bảng giá VIP - Đại lý!')).toMatch(/^bang-gia-vip-dai-ly/)
  })

  it('Trailing dash bị strip', () => {
    expect(slugify('hello---')).toBe('hello')
    expect(slugify('---hello')).toBe('hello')
  })

  it('Tên rỗng', () => {
    expect(slugify('')).toBe('')
  })
})
