export interface CsvFieldOptions {
  /**
   * Bọc chuỗi toàn chữ số có số 0 đầu thành ="0911..." để Excel giữ số 0 (mặc định bật).
   * Tắt cho tệp dành cho máy đọc (script, công cụ nhập liệu), nơi tiền tố = làm sai giá trị.
   */
  excelLeadingZero?: boolean
}

/** Chuỗi số thập phân thuần, ví dụ "-12.50": là số, không phải công thức */
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/

/**
 * Mã hóa một ô CSV, dùng chung cho mọi tệp CSV xuất ra (API và web, BC-12).
 *
 * - Số giữ nguyên là số (kể cả số âm) để Excel cộng được. Chuỗi số thập phân như "-12.50"
 *   (số đã làm tròn bằng toFixed) cũng giữ nguyên.
 * - Chuỗi toàn chữ số có số 0 đầu (SĐT, mã) ghi dạng ="0911000003" để Excel không đổi thành số
 *   911000003, trừ khi tắt `excelLeadingZero`.
 * - Chuỗi bắt đầu bằng = + - @ tab hoặc CR được thêm tiền tố ' để Excel không chạy như công thức
 *   (CSV injection), ví dụ tên khách "=HYPERLINK(...)". Luôn bật, kể cả tệp cho máy đọc.
 * - Ô có dấu phẩy, ngoặc kép hoặc xuống dòng được bọc ngoặc kép theo RFC 4180.
 */
export function escapeCsvField(value: unknown, options: CsvFieldOptions = {}): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  const { excelLeadingZero = true } = options
  let s = String(value)
  if (/^0\d+$/.test(s)) {
    if (excelLeadingZero) s = `="${s}"`
  } else if (!NUMERIC_STRING.test(s) && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Một dòng CSV từ danh sách ô. */
export function toCsvLine(cells: readonly unknown[], options?: CsvFieldOptions): string {
  return cells.map((cell) => escapeCsvField(cell, options)).join(',')
}
