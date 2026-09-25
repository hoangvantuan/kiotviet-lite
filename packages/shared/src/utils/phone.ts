/**
 * Định dạng số điện thoại Việt Nam để hiển thị (UX-26), dùng chung cho khách hàng và nhà cung cấp.
 * Chỉ nhóm số khi toàn bộ chuỗi (sau khi bỏ khoảng trắng, dấu chấm, gạch nối) là số hợp lệ;
 * chuỗi khác trả nguyên văn (đã trim) để không làm sai dữ liệu người dùng nhập.
 *
 * Ví dụ:
 * - formatPhone('0901234567') -> '0901 234 567' (di động 10 số)
 * - formatPhone('02839401401') -> '028 3940 1401' (cố định 11 số)
 * - formatPhone('+84901234567') -> '+84 901 234 567'
 * - formatPhone('0901 234 567') -> '0901 234 567'
 * - formatPhone(null) -> ''
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const raw = phone.trim()
  const digits = raw.replace(/[\s.-]/g, '')

  const national = /^0(\d{9,10})$/.exec(digits)
  if (national) return groupNational(digits)

  const intl = /^\+84(\d{9,10})$/.exec(digits)
  if (intl) return `+84 ${groupNational(`0${intl[1]}`).slice(1)}`

  return raw
}

function groupNational(digits: string): string {
  // 10 số (di động): 4-3-3; 11 số (cố định, mã vùng 3 số): 3-4-4
  if (digits.length === 10) return digits.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3')
  return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3')
}
