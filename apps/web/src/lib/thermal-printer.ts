import { PAYMENT_METHOD_LABELS } from './constants'
import { formatVnd } from './currency'

/**
 * ESC/POS command constants for thermal printers.
 */
const ESC = 0x1b
const GS = 0x1d

const CMD = {
  INIT: [ESC, 0x40],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  CENTER: [ESC, 0x61, 0x01],
  LEFT: [ESC, 0x61, 0x00],
  RIGHT: [ESC, 0x61, 0x02],
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  DOUBLE_WIDTH_HEIGHT: [ESC, 0x21, 0x30],
  NORMAL: [ESC, 0x21, 0x00],
  /**
   * Set UTF-8 codepage (ESC t 0xFF).
   * WARNING: Nhiều máy in nhiệt tại VN (đặc biệt đời cũ) không hỗ trợ UTF-8.
   * Dấu tiếng Việt có thể hiển thị sai. Story 7.4 sẽ thêm option cho user
   * chọn encoding mode (utf8 / ascii-safe).
   */
  UTF8_MODE: [ESC, 0x74, 0xff],
  /** ESC d n: Feed n lines (dùng trước cut để đảm bảo nội dung không bị cắt) */
  FEED_LINES: [ESC, 0x64, 0x03],
  CUT: [GS, 0x56, 0x00],
  PARTIAL_CUT: [GS, 0x56, 0x01],
} as const

export type PaperWidth = '58mm' | '80mm'

const CHARS_PER_LINE: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 48,
}

const DOTS_WIDTH: Record<PaperWidth, number> = {
  '58mm': 384,
  '80mm': 576,
}

// ---- Public types ----

export interface ThermalStoreInfo {
  name?: string | null
  address?: string | null
  phone?: string | null
  slogan?: string | null
}

export interface ThermalOrderItem {
  productName: string
  variantName?: string | null
  unit?: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  sku?: string | null
  costPrice?: number | null
}

export interface ThermalOrder {
  orderNumber: string
  createdAt: string
  customerName?: string | null
  customerPhone?: string | null
  items: ThermalOrderItem[]
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  cashAmount?: number | null
  transferAmount?: number | null
  paidAmount: number
  change: number
  debtAmount: number
  oldDebt?: number | null
  customerCurrentDebt?: number | null
  note?: string | null
}

export interface PrintOptions {
  paperWidth: PaperWidth
  isReprint?: boolean
  showCustomerName?: boolean
  showCustomerPhone?: boolean
  showDiscount?: boolean
  showSku?: boolean
  showOldDebt?: boolean
  showNewDebt?: boolean
  showCostPrice?: boolean
  showNotes?: boolean
  footerText?: string | null
}

// ---- Buffer builder ----

class BufferBuilder {
  private parts: number[][] = []

  push(...bytes: number[]): this {
    this.parts.push(bytes)
    return this
  }

  pushBytes(arr: number[]): this {
    this.parts.push(arr)
    return this
  }

  pushText(text: string): this {
    this.parts.push(Array.from(new TextEncoder().encode(text)))
    return this
  }

  pushLine(text: string): this {
    this.pushText(text + '\n')
    return this
  }

  toUint8Array(): Uint8Array {
    const total = this.parts.reduce((sum, p) => sum + p.length, 0)
    const result = new Uint8Array(total)
    let offset = 0
    for (const part of this.parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }
}

// ---- Helper functions ----

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return text + ' '.repeat(width - text.length)
}

function twoColumns(left: string, right: string, totalWidth: number): string {
  const rightLen = right.length
  const leftMax = totalWidth - rightLen - 1
  const leftTrimmed = left.length > leftMax ? left.slice(0, leftMax) : left
  return padRight(leftTrimmed, totalWidth - rightLen) + right
}

function separatorLine(width: number, char = '-'): string {
  return char.repeat(width)
}

function formatDateTimeForReceipt(iso: string): string {
  try {
    const d = new Date(iso)
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

// ---- Main builder ----

/**
 * Build ESC/POS binary buffer for a thermal receipt.
 */
export function buildOrderReceipt(
  order: ThermalOrder,
  store: ThermalStoreInfo,
  options: PrintOptions,
): Uint8Array {
  const buf = new BufferBuilder()
  const w = CHARS_PER_LINE[options.paperWidth]

  // 1. Initialize printer
  buf.pushBytes([...CMD.INIT])

  // Set UTF-8 mode
  buf.pushBytes([...CMD.UTF8_MODE])

  // 2. Store name (bold, center, double height)
  buf.pushBytes([...CMD.CENTER])
  if (store.name) {
    buf.pushBytes([...CMD.BOLD_ON, ...CMD.DOUBLE_HEIGHT])
    buf.pushLine(store.name)
    buf.pushBytes([...CMD.NORMAL, ...CMD.BOLD_OFF])
  }

  // 3. Slogan (center, normal)
  if (store.slogan) {
    buf.pushLine(store.slogan)
  }

  // Address + phone
  if (store.address) {
    buf.pushLine(store.address)
  }
  if (store.phone) {
    buf.pushLine(`SĐT: ${store.phone}`)
  }

  // Reprint marker
  if (options.isReprint) {
    buf.pushBytes([...CMD.BOLD_ON])
    buf.pushLine('*** BẢN IN LẠI ***')
    buf.pushBytes([...CMD.BOLD_OFF])
  }

  buf.pushBytes([...CMD.LEFT])

  // 4. Separator
  buf.pushLine(separatorLine(w))

  // 5. Order info
  buf.pushLine(twoColumns(`HĐ: ${order.orderNumber}`, formatDateTimeForReceipt(order.createdAt), w))

  // Customer info
  if ((options.showCustomerName ?? true) && order.customerName) {
    buf.pushLine(`KH: ${order.customerName}`)
  }
  if ((options.showCustomerPhone ?? true) && order.customerPhone) {
    buf.pushLine(`SĐT: ${order.customerPhone}`)
  }

  // 6. Separator
  buf.pushLine(separatorLine(w))

  // 7. Items
  if (options.paperWidth === '58mm') {
    buildItems58mm(buf, order.items, w, options.showSku ?? false)
  } else {
    buildItems80mm(buf, order.items, w, options.showDiscount ?? true, options.showSku ?? false)
  }

  // 8. Separator
  buf.pushLine(separatorLine(w))

  // 9. Totals
  buf.pushLine(twoColumns('Tạm tính:', formatVnd(order.subtotal), w))

  if ((options.showDiscount ?? true) && order.discountAmount > 0) {
    buf.pushLine(twoColumns('Chiết khấu:', `-${formatVnd(order.discountAmount)}`, w))
  }

  buf.pushBytes([...CMD.BOLD_ON])
  buf.pushLine(twoColumns('TỔNG:', formatVnd(order.total), w))
  buf.pushBytes([...CMD.BOLD_OFF])

  // Payment method
  const methodLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod
  buf.pushLine(twoColumns('Thanh toán:', methodLabel, w))

  if (order.cashAmount != null && order.cashAmount > 0) {
    buf.pushLine(twoColumns('Tiền mặt:', formatVnd(order.cashAmount), w))
  }
  if (order.transferAmount != null && order.transferAmount > 0) {
    buf.pushLine(twoColumns('Chuyển khoản:', formatVnd(order.transferAmount), w))
  }

  // Change
  if (order.change > 0) {
    buf.pushLine(twoColumns('Tiền thừa:', formatVnd(order.change), w))
  }

  // Debt
  if (options.showOldDebt && order.oldDebt != null && order.oldDebt > 0) {
    buf.pushLine(twoColumns('Nợ cũ:', formatVnd(order.oldDebt), w))
  }
  if ((options.showNewDebt ?? true) && order.debtAmount > 0) {
    buf.pushLine(twoColumns('Còn nợ:', formatVnd(order.debtAmount), w))
  }

  // Cost price
  if (options.showCostPrice) {
    const totalCost = order.items.reduce(
      (sum, it) => sum + (it.costPrice != null ? it.costPrice * it.quantity : 0),
      0,
    )
    if (totalCost > 0) {
      buf.pushLine(twoColumns('Giá vốn:', formatVnd(totalCost), w))
    }
  }

  // Separator
  buf.pushLine(separatorLine(w))

  // Notes
  if ((options.showNotes ?? true) && order.note) {
    buf.pushBytes([...CMD.CENTER])
    buf.pushLine(`Ghi chú: ${order.note}`)
    buf.pushBytes([...CMD.LEFT])
    buf.pushLine(separatorLine(w))
  }

  // Footer
  buf.pushBytes([...CMD.CENTER])
  const footer = options.footerText ?? 'Cảm ơn quý khách!'
  buf.pushLine(footer)
  buf.pushBytes([...CMD.LEFT])

  // Feed 3 lines (ESC d 3) rồi cut
  buf.pushBytes([...CMD.FEED_LINES])
  buf.pushBytes([...CMD.CUT])

  return buf.toUint8Array()
}

// ---- Item formatters ----

function buildItems58mm(
  buf: BufferBuilder,
  items: ThermalOrderItem[],
  w: number,
  showSku: boolean,
): void {
  for (const item of items) {
    let name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName
    if (showSku && item.sku) {
      name = `[${item.sku}] ${name}`
    }
    // Line 1: product name (truncate if needed)
    buf.pushLine(name.length > w ? name.slice(0, w) : name)
    // Line 2: qty x price = total
    const detail = `${item.quantity} x ${formatVnd(item.unitPrice)}`
    const total = formatVnd(item.lineTotal)
    buf.pushLine(twoColumns(` ${detail}`, total, w))
  }
}

function buildItems80mm(
  buf: BufferBuilder,
  items: ThermalOrderItem[],
  w: number,
  showDiscount: boolean,
  showSku: boolean,
): void {
  for (const item of items) {
    let name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName
    if (showSku && item.sku) {
      name = `[${item.sku}] ${name}`
    }

    if (showDiscount && item.discountAmount > 0) {
      // Name might be long, put on its own line if needed
      buf.pushLine(name.length > w ? name.slice(0, w) : name)
      const detail = ` ${item.quantity} x ${formatVnd(item.unitPrice)} CK -${formatVnd(item.discountAmount)}`
      const total = formatVnd(item.lineTotal)
      buf.pushLine(twoColumns(detail, total, w))
    } else {
      // Try to fit in one line: name + qty x price = total
      const qtyPrice = `${item.quantity}x${formatVnd(item.unitPrice)}`
      const total = formatVnd(item.lineTotal)
      const rightPart = `${qtyPrice} ${total}`
      if (name.length + rightPart.length + 1 <= w) {
        buf.pushLine(twoColumns(name, rightPart, w))
      } else {
        buf.pushLine(name.length > w ? name.slice(0, w) : name)
        buf.pushLine(twoColumns(` ${qtyPrice}`, total, w))
      }
    }
  }
}

// ---- Raster image builder ----

/**
 * Convert image blob to ESC/POS raster image command (GS v 0).
 * Uses Canvas API to resize and convert to monochrome bitmap.
 */
export async function buildRasterImage(
  imageBlob: Blob,
  paperWidth: PaperWidth,
): Promise<Uint8Array> {
  const targetWidth = DOTS_WIDTH[paperWidth]

  const bitmap = await createImageBitmap(imageBlob)
  const aspectRatio = bitmap.height / bitmap.width
  const scaledWidth = Math.min(bitmap.width, targetWidth)
  const scaledHeight = Math.round(scaledWidth * aspectRatio)

  // Ensure height is multiple of 8 for raster format
  const height = Math.ceil(scaledHeight / 8) * 8
  const width = scaledWidth

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, scaledHeight)

  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data

  // Convert to monochrome: 1 bit per pixel, MSB first
  const bytesPerLine = Math.ceil(width / 8)
  const rasterData: number[] = []

  for (let y = 0; y < height; y++) {
    for (let byteIdx = 0; byteIdx < bytesPerLine; byteIdx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIdx * 8 + bit
        if (x < width) {
          const offset = (y * width + x) * 4
          const r = pixels[offset] ?? 255
          const g = pixels[offset + 1] ?? 255
          const b = pixels[offset + 2] ?? 255
          // Simple threshold: dark pixels become black (bit = 1)
          const grayscale = 0.299 * r + 0.587 * g + 0.114 * b
          if (grayscale < 128) {
            byte |= 1 << (7 - bit)
          }
        }
      }
      rasterData.push(byte)
    }
  }

  // GS v 0 command: GS v 0 m xL xH yL yH [data]
  // m = 0 (normal density)
  const xL = bytesPerLine & 0xff
  const xH = (bytesPerLine >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff

  const header = [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]
  const result = new Uint8Array(header.length + rasterData.length)
  result.set(header)
  result.set(rasterData, header.length)

  return result
}

export { CHARS_PER_LINE, DOTS_WIDTH }
