/**
 * POS-07: sinh chuỗi VietQR (chuẩn EMVCo MPM của NAPAS) ngay trên máy, không gọi dịch vụ ngoài
 * nên chạy được khi mất mạng. Ứng dụng ngân hàng của khách quét mã sẽ điền sẵn tài khoản nhận,
 * số tiền và nội dung chuyển khoản.
 *
 * Cấu trúc (mỗi trường là ID 2 chữ số + độ dài 2 chữ số + giá trị):
 *   00 "01"                 phiên bản
 *   01 "12" | "11"          mã động (có số tiền, dùng một lần) | mã tĩnh
 *   38                      thông tin tài khoản NAPAS
 *     00 "A000000727"       định danh NAPAS
 *     01                    00 BIN ngân hàng, 01 số tài khoản
 *     02 "QRIBFTTA"         chuyển nhanh tới tài khoản
 *   53 "704"                VND
 *   54                      số tiền (không bắt buộc)
 *   58 "VN"
 *   62 08                   nội dung chuyển khoản (không bắt buộc)
 *   63 CRC16-CCITT-FALSE    tính trên toàn chuỗi, gồm cả "6304"
 */

const NAPAS_GUID = 'A000000727'
const SERVICE_TO_ACCOUNT = 'QRIBFTTA'

/** Nội dung chuyển khoản tối đa 25 ký tự: một số ngân hàng cắt hoặc từ chối nội dung dài hơn. */
export const VIETQR_NOTE_MAX_LENGTH = 25

export interface VietQrInput {
  bankBin: string
  accountNumber: string
  /** Số tiền VND nguyên dương; bỏ trống thì khách tự nhập (mã tĩnh) */
  amount?: number | null
  /** Nội dung chuyển khoản, đã hoặc chưa chuẩn hóa */
  note?: string | null
}

export interface BankConfig {
  bankBin: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
}

function field(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường VietQR ${id} dài quá 99 ký tự`)
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC16-CCITT-FALSE (đa thức 0x1021, giá trị đầu 0xFFFF), 4 ký tự hex in hoa. */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff
  const bytes = new TextEncoder().encode(input)
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Nội dung chuyển khoản an toàn cho mọi ngân hàng: bỏ dấu tiếng Việt, chỉ giữ chữ, số và khoảng
 * trắng, viết hoa, tối đa 25 ký tự.
 */
export function normalizeTransferNote(note: string): string {
  return note
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, VIETQR_NOTE_MAX_LENGTH)
    .trim()
}

export function buildVietQrPayload({ bankBin, accountNumber, amount, note }: VietQrInput): string {
  if (!/^\d{6}$/.test(bankBin)) throw new Error('Mã ngân hàng (BIN) phải gồm 6 chữ số')
  if (!/^\d{6,19}$/.test(accountNumber)) throw new Error('Số tài khoản không hợp lệ')
  const hasAmount = amount !== undefined && amount !== null
  if (hasAmount && (!Number.isInteger(amount) || amount <= 0)) {
    throw new Error('Số tiền phải là số nguyên dương')
  }

  const beneficiary = field('00', bankBin) + field('01', accountNumber)
  const merchantAccount =
    field('00', NAPAS_GUID) + field('01', beneficiary) + field('02', SERVICE_TO_ACCOUNT)
  const cleanNote = note ? normalizeTransferNote(note) : ''

  const body =
    field('00', '01') +
    field('01', hasAmount ? '12' : '11') +
    field('38', merchantAccount) +
    field('53', '704') +
    (hasAmount ? field('54', String(amount)) : '') +
    field('58', 'VN') +
    (cleanNote ? field('62', field('08', cleanNote)) : '')

  const withCrcHeader = `${body}6304`
  return withCrcHeader + crc16Ccitt(withCrcHeader)
}

/** Cửa hàng đã khai báo đủ tài khoản nhận tiền để sinh mã QR chưa. */
export function isBankConfigured(
  config: Partial<BankConfig> | null | undefined,
): config is BankConfig & { bankBin: string; bankAccountNumber: string } {
  return Boolean(
    config?.bankBin &&
    /^\d{6}$/.test(config.bankBin) &&
    config.bankAccountNumber &&
    /^\d{6,19}$/.test(config.bankAccountNumber),
  )
}

/**
 * Nội dung chuyển khoản cho đơn POS: mã tạm lấy từ khóa chống trùng của đơn (cũng là `clientId`
 * của đơn ngoại tuyến), nên đối chiếu được sao kê với đơn khi chưa có mã HD từ máy chủ.
 */
export function posTransferNote(idempotencyKey: string): string {
  const shortCode = idempotencyKey
    .replace(/[^0-9a-f]/gi, '')
    .slice(0, 8)
    .toUpperCase()
  return normalizeTransferNote(`TT ${shortCode}`)
}
