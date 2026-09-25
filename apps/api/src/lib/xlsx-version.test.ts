import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

// BM-102/BM-05: xlsx trên npm dừng ở 0.18.5 (CVE-2023-30533 prototype pollution,
// CVE-2024-22363 ReDoS). Bản vá chỉ phát hành qua cdn.sheetjs.com; chặn việc ai đó
// vô tình kéo lại bản npm cũ khi cập nhật phụ thuộc.
describe('SheetJS dùng bản đã vá', () => {
  it('phiên bản >= 0.20.2', () => {
    const [major, minor, patch] = XLSX.version.split('.').map(Number) as [number, number, number]
    expect(major * 1_000_000 + minor * 1_000 + patch).toBeGreaterThanOrEqual(20_002)
  })

  it('đọc tệp chứa khóa __proto__ không làm bẩn Object.prototype', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['__proto__', 'constructor'],
        ['polluted', 'x'],
      ]),
      'Dữ liệu',
    )
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const read = XLSX.read(new Uint8Array(bytes), { type: 'array' })
    XLSX.utils.sheet_to_json(read.Sheets['Dữ liệu']!)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
