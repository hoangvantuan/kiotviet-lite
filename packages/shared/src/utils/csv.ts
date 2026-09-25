/**
 * Mã hóa một ô CSV, dùng chung cho mọi tệp CSV xuất ra (API và web, BC-12).
 *
 * - Số giữ nguyên là số (kể cả số âm) để Excel cộng được.
 * - Chuỗi toàn chữ số có số 0 đầu (SĐT, mã) ghi dạng ="0911000003" để Excel không đổi thành số
 *   911000003.
 * - Chuỗi bắt đầu bằng = + - @ tab hoặc CR được thêm tiền tố ' để Excel không chạy như công thức
 *   (CSV injection), ví dụ tên khách "=HYPERLINK(...)".
 * - Ô có dấu phẩy, ngoặc kép hoặc xuống dòng được bọc ngoặc kép theo RFC 4180.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  let s = String(value)
  if (/^0\d+$/.test(s)) {
    s = `="${s}"`
  } else if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Một dòng CSV từ danh sách ô. */
export function toCsvLine(cells: readonly unknown[]): string {
  return cells.map(escapeCsvField).join(',')
}
