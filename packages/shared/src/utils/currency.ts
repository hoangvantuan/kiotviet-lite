/**
 * Tiện ích định dạng và xử lý tiền tệ Việt Nam (VND) dùng chung.
 */

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

/**
 * Định dạng số tiền VND theo chuẩn Việt Nam (phân cách hàng nghìn bằng dấu chấm).
 * Trả về chuỗi rỗng nếu giá trị là null, undefined hoặc NaN.
 *
 * Ví dụ:
 * - formatVnd(1000000) -> '1.000.000'
 * - formatVnd(0) -> '0'
 * - formatVnd(null) -> ''
 */
export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return VND_FORMATTER.format(value)
}

/**
 * Định dạng số tiền VND kèm hậu tố đơn vị tiền tệ (mặc định 'đ').
 *
 * Ví dụ:
 * - formatVndWithSuffix(1000000) -> '1.000.000 đ'
 * - formatVndWithSuffix(1000000, 'đ') -> '1.000.000đ'
 * - formatVndWithSuffix(null) -> ''
 */
export function formatVndWithSuffix(
  value: number | null | undefined,
  suffix: string = ' đ',
): string {
  const formatted = formatVnd(value)
  if (!formatted) return ''
  return `${formatted}${suffix}`
}

/**
 * Định dạng số tiền VND luôn kèm hậu tố 'đ', nếu null/undefined/0 thì trả về '0đ'.
 * Thích hợp cho hiển thị báo cáo, thông báo lỗi công nợ trong API.
 */
export function formatCurrencyVnd(value: number | null | undefined): string {
  const formatted = formatVnd(value ?? 0)
  return `${formatted || '0'}đ`
}

/**
 * Phân tích chuỗi nhập tiền thành số nguyên VND không âm.
 * Trả về null nếu không hợp lệ hoặc âm.
 */
export function parseVnd(input: string): number | null {
  const cleaned = input.replace(/[^\d-]/g, '')
  if (cleaned.length === 0) return null
  const n = Number(cleaned)
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) return null
  return n
}
