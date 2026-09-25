import { escapeCsvField, slugify as sharedSlugify } from '@kiotviet-lite/shared'

// Mã hóa ô dùng chung với API (BC-12): giữ số 0 đầu SĐT, chặn chèn công thức
export { escapeCsvField }

export function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines: string[] = []
  lines.push(headers.map(escapeCsvField).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  return lines.join('\r\n')
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
