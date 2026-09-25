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
 * Khoảng trắng không ngắt dòng (U+00A0) giữa số và 'đ' để ký hiệu tiền không rớt xuống dòng riêng.
 */
export const VND_DISPLAY_SUFFIX = '\xA0đ'

/**
 * Định dạng số tiền VND để HIỂN THỊ trên giao diện, kèm hậu tố đơn vị (mặc định NBSP + 'đ').
 * Đây là định dạng tiền duy nhất của giao diện web (UX-13). API không dùng hàm này.
 *
 * Ví dụ:
 * - formatVndWithSuffix(1000000) -> '1.000.000\u00A0đ'
 * - formatVndWithSuffix(1000000, 'đ') -> '1.000.000đ'
 * - formatVndWithSuffix(null) -> ''
 */
export function formatVndWithSuffix(
  value: number | null | undefined,
  suffix: string = VND_DISPLAY_SUFFIX,
): string {
  const formatted = formatVnd(value)
  if (!formatted) return ''
  return `${formatted}${suffix}`
}

/**
 * Định dạng số tiền VND luôn kèm hậu tố 'đ', nếu null/undefined/0 thì trả về '0đ'.
 * Dùng cho thông báo lỗi và nội dung lưu DB của API; giữ nguyên định dạng này
 * vì dữ liệu cũ và client đang dựa vào nó. Giao diện web dùng formatVndWithSuffix.
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
