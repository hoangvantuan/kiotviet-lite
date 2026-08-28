/**
 * Tiện ích định dạng ngày giờ chuẩn Việt Nam dùng chung cho toàn bộ giao diện Web.
 */

/**
 * Định dạng ngày theo chuẩn DD/MM/YYYY.
 * Hỗ trợ cả chuỗi YYYY-MM-DD và chuỗi ISO timestamp.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const clean = iso.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-')
    if (y && m && d) return `${d}/${m}/${y}`
  }
  try {
    const d = new Date(clean)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Định dạng ngày giờ theo chuẩn DD/MM/YYYY HH:mm hoặc HH:mm DD/MM/YYYY theo locale vi-VN.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Tương thích với định dạng ngày giờ in hoá đơn nhiệt.
 */
export const formatDateTimeForReceipt = formatDateTime
