import { describe, expect, it } from 'vitest'

import { escapeCsvField, toCsvLine } from './csv.js'

describe('escapeCsvField (BC-12)', () => {
  it('giữ số 0 đầu của SĐT khi mở bằng Excel', () => {
    expect(escapeCsvField('0911000003')).toBe('"=""0911000003"""')
  })

  it('chặn chèn công thức ở ô bắt đầu bằng = + - @ tab CR', () => {
    expect(escapeCsvField("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0")
    expect(escapeCsvField('+1+1')).toBe("'+1+1")
    expect(escapeCsvField('-2+3')).toBe("'-2+3")
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvField('\tx')).toBe("'\tx")
    expect(escapeCsvField('\rx')).toBe('"\'\rx"')
    expect(escapeCsvField('=HYPERLINK("http://x","a")')).toBe('"\'=HYPERLINK(""http://x"",""a"")"')
  })

  it('số giữ nguyên là số, kể cả số âm', () => {
    expect(escapeCsvField(270000)).toBe('270000')
    expect(escapeCsvField(-5000)).toBe('-5000')
    expect(escapeCsvField(0)).toBe('0')
  })

  it('bọc ngoặc kép ô có dấu phẩy, ngoặc kép, xuống dòng', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('l1\nl2')).toBe('"l1\nl2"')
  })

  it('null, undefined thành ô trống; chuỗi thường giữ nguyên', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
    expect(escapeCsvField('Nguyễn Văn A')).toBe('Nguyễn Văn A')
    expect(escapeCsvField('0')).toBe('0')
    expect(escapeCsvField('2026-09-25')).toBe('2026-09-25')
  })

  it('chuỗi số thập phân (toFixed) giữ là số, không thêm dấu nháy', () => {
    expect(escapeCsvField('-12.50')).toBe('-12.50')
    expect(escapeCsvField('12.50')).toBe('12.50')
    expect(escapeCsvField('-3')).toBe('-3')
    expect(escapeCsvField('-1.5+1')).toBe("'-1.5+1")
  })

  it('excelLeadingZero = false: tệp cho máy đọc ghi nguyên số 0 đầu, vẫn chặn công thức', () => {
    expect(escapeCsvField('007', { excelLeadingZero: false })).toBe('007')
    expect(escapeCsvField('=x', { excelLeadingZero: false })).toBe("'=x")
    expect(toCsvLine(['0901', '-2.00'], { excelLeadingZero: false })).toBe('0901,-2.00')
  })

  it('toCsvLine nối các ô đã mã hóa', () => {
    expect(toCsvLine(['=x', '0901', 12])).toBe('\'=x,"=""0901""",12')
  })
})
