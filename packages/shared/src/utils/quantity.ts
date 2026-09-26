/**
 * Số lượng và tồn kho thập phân (ADR-0015).
 *
 * Số lượng trong mã là `number` luôn là bội của 0,001 (cột `numeric(14,3)`). Mọi phép cộng trừ
 * nhân đi qua các hàm ở đây, tính trên số nguyên nghìn đơn vị, để không lệch kiểu `0.1 + 0.2`.
 * Tiền nhân số lượng tính bằng BigInt và chỉ làm tròn một lần ở cuối.
 */

/** Số chữ số lẻ tối đa của số lượng */
export const QUANTITY_SCALE = 3
const MILLI = 1000
const MILLI_BIG = 1000n

/** Làm tròn về bội của 0,001 (bỏ sai số dấu phẩy động của phép tính trước đó). */
export function roundQty(value: number): number {
  const m = Math.round(value * MILLI)
  // Tránh -0
  return m === 0 ? 0 : m / MILLI
}

/** Số lượng tính bằng nghìn đơn vị (số nguyên). */
export function toMilli(value: number): number {
  return Math.round(value * MILLI)
}

export function fromMilli(milli: number): number {
  return milli === 0 ? 0 : milli / MILLI
}

/**
 * Đọc số lượng từ DB hoặc từ đầu vào không định kiểu. Driver Postgres và PGlite trả numeric là
 * chuỗi ("1.255"); dữ liệu cũ hay số JSON là number. Đây là chỗ chuẩn hóa duy nhất.
 */
export function parseQuantity(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return roundQty(n)
}

/** Như parseQuantity nhưng giữ null (cột cho phép NULL như stock_after). */
export function parseQuantityOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return parseQuantity(value)
}

/** Chuỗi ghi xuống cột numeric(14,3). */
export function quantityToDb(value: number): string {
  return roundQty(value).toFixed(QUANTITY_SCALE)
}

export function addQty(...values: number[]): number {
  let m = 0
  for (const v of values) m += toMilli(v)
  return fromMilli(m)
}

export function subQty(a: number, b: number): number {
  return fromMilli(toMilli(a) - toMilli(b))
}

export function sumQty(values: Iterable<number>): number {
  let m = 0
  for (const v of values) m += toMilli(v)
  return fromMilli(m)
}

/** Nhân số lượng với hệ số quy đổi (số nguyên) ra số lượng đơn vị gốc. */
export function mulQty(qty: number, factor: number): number {
  return fromMilli(toMilli(qty) * factor)
}

export function negQty(qty: number): number {
  return fromMilli(-toMilli(qty))
}

/** Có đúng tối đa 3 chữ số lẻ không (không tính sai số dấu phẩy động của số nhập vào). */
export function hasValidQuantityScale(value: number): boolean {
  if (!Number.isFinite(value)) return false
  return Math.abs(value * MILLI - Math.round(value * MILLI)) < 1e-6
}

export function isWholeQuantity(value: number): boolean {
  return toMilli(value) % MILLI === 0
}

/**
 * Quy tắc cờ bán số lẻ (ADR-0015 mục 2), dùng chung máy chủ và POS: số lượng theo đơn vị đã chọn
 * theo cờ của đơn vị đó (đơn vị gốc theo cờ sản phẩm), và số quy ra đơn vị gốc phải nguyên khi sản
 * phẩm không bật cờ. Không kiểm dấu và giới hạn trên.
 */
export function isQuantityAllowed(args: {
  quantity: number
  productAllowsDecimal: boolean
  unitConversion?: { conversionFactor: number; allowDecimalQuantity?: boolean } | null
}): boolean {
  const { quantity, productAllowsDecimal, unitConversion } = args
  if (!hasValidQuantityScale(quantity)) return false
  const unitAllowsDecimal = unitConversion
    ? (unitConversion.allowDecimalQuantity ?? false)
    : productAllowsDecimal
  if (!unitAllowsDecimal && !isWholeQuantity(quantity)) return false
  const baseQuantity = unitConversion ? mulQty(quantity, unitConversion.conversionFactor) : quantity
  return productAllowsDecimal || isWholeQuantity(baseQuantity)
}

/**
 * Chia làm tròn nửa lên (nửa xa số 0) hai số nguyên BigInt. Kết quả là đồng.
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) throw new Error('Chia cho 0')
  let num = numerator
  let den = denominator
  if (den < 0n) {
    num = -num
    den = -den
  }
  const negative = num < 0n
  const abs = negative ? -num : num
  const q = (abs * 2n + den) / (den * 2n)
  return Number(negative ? -q : q)
}

/**
 * Tiền của một lượng hàng: round_half_up(đơn giá × số lượng) về đồng. Quy tắc làm tròn tiền dòng
 * duy nhất của hệ thống, dùng chung máy chủ, POS và PGlite (ADR-0015 mục 4).
 */
export function lineAmount(unitPrice: number, quantity: number): number {
  return divRoundHalfUp(BigInt(Math.round(unitPrice)) * BigInt(toMilli(quantity)), MILLI_BIG)
}

/**
 * round_half_up(tiền × a / b) với a, b là số lượng: phân bổ tiền theo tỷ lệ số lượng (tiền hoàn
 * của phần trả, giá trị của phần rút khỏi lô). b phải khác 0.
 */
export function amountByQtyRatio(amount: number, part: number, whole: number): number {
  return divRoundHalfUp(BigInt(Math.round(amount)) * BigInt(toMilli(part)), BigInt(toMilli(whole)))
}

/** round_half_up(tiền / số lượng): đơn giá một đơn vị từ tổng tiền. */
export function unitAmountOf(total: number, quantity: number): number {
  return divRoundHalfUp(BigInt(Math.round(total)) * MILLI_BIG, BigInt(toMilli(quantity)))
}

/**
 * Giá vốn bình quân gia quyền: round_half_up((tồn trước × giá trước + giá trị thêm) / tồn sau).
 * `addedValue` âm khi rút lô. Gọi khi tồn sau dương.
 */
export function weightedAverageCost(args: {
  stockBefore: number
  costBefore: number
  addedValue: number
  stockAfter: number
}): number {
  const numerator =
    BigInt(toMilli(args.stockBefore)) * BigInt(Math.round(args.costBefore)) +
    BigInt(Math.round(args.addedValue)) * MILLI_BIG
  return divRoundHalfUp(numerator, BigInt(toMilli(args.stockAfter)))
}

/** Giá trị (đồng, chưa làm tròn, tính bằng nghìn đồng) của tồn × giá: dùng khi cần so sánh. */
export function stockValueMilli(stock: number, cost: number): bigint {
  return BigInt(toMilli(stock)) * BigInt(Math.round(cost))
}

const QUANTITY_FORMATTER = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: QUANTITY_SCALE,
})

/**
 * Hiển thị số lượng: tối đa 3 chữ số lẻ, bỏ số 0 thừa, dấu phẩy thập phân kiểu Việt Nam.
 * formatQuantity(1.5) -> '1,5'; formatQuantity(1.255) -> '1,255'; formatQuantity(1200) -> '1.200'
 */
export function formatQuantity(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = parseQuantity(value)
  return QUANTITY_FORMATTER.format(n)
}

/**
 * Phân tích chuỗi người dùng gõ vào ô số lượng. Dấu phẩy hoặc dấu chấm đều là dấu thập phân (bàn
 * phím số gõ ra dấu chấm); không nhận dấu phân cách hàng nghìn. Trả null nếu không hợp lệ, quá 3
 * chữ số lẻ, hoặc có phần lẻ khi `allowDecimal` là false.
 */
export function parseQuantityInput(
  input: string,
  options: { allowDecimal?: boolean; allowNegative?: boolean } = {},
): number | null {
  const s = input.trim().replace(/\s+/g, '')
  if (s === '') return null
  const pattern = options.allowNegative ? /^-?\d*([.,]\d*)?$/ : /^\d*([.,]\d*)?$/
  if (!pattern.test(s)) return null
  const normalized = s.replace(',', '.')
  if (normalized === '.' || normalized === '-' || normalized === '-.') return null
  const [, frac = ''] = normalized.split('.')
  if (frac.length > QUANTITY_SCALE) return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  if (!options.allowDecimal && !Number.isInteger(n)) return null
  return roundQty(n)
}

/**
 * Chuỗi hiển thị trong ô nhập (không phân cách hàng nghìn, dấu phẩy thập phân).
 */
export function quantityToInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const n = roundQty(value)
  return String(n).replace('.', ',')
}
