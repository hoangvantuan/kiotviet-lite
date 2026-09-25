import {
  type CsvFieldOptions,
  escapeCsvField,
  slugify as sharedSlugify,
  toCsvLine,
} from '@kiotviet-lite/shared'

// Mã hóa ô dùng chung với API (BC-12): giữ số 0 đầu SĐT, chặn chèn công thức
export { escapeCsvField }

/**
 * `options.excelLeadingZero = false` cho tệp dành cho máy đọc (ví dụ CSV so sánh bảng giá):
 * mã "007" ghi nguyên, không bọc ="007".
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | null)[][],
  options?: CsvFieldOptions,
): string {
  return [headers, ...rows].map((row) => toCsvLine(row, options)).join('\r\n')
}

export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob(['\ufeff' + csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slugify(input: string): string {
  return sharedSlugify(input, { maxLength: 30 })
}
