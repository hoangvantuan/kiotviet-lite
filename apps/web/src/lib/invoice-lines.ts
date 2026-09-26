import { formatQuantity } from '@kiotviet-lite/shared'
/**
 * Nội dung dùng chung cho mọi bản in hóa đơn (A4, A5, nhiệt qua trình duyệt, ESC/POS).
 * Mỗi mẫu chỉ lo bố cục; nhãn và cách tính nằm ở đây để các khổ in không lệch nhau.
 */

export interface InvoiceDebtSource {
  /** Công nợ của khách ngay trước đơn, chụp lúc bán. NULL với đơn cũ không suy ra được */
  oldDebt?: number | null
  /** Nợ phát sinh của đơn (khi in theo số liệu lúc bán là debtAmountAtSale) */
  debtAmount: number
}

export interface InvoiceDebtOptions {
  showOldDebt?: boolean
  showNewDebt?: boolean
}

export interface InvoiceDebtLine {
  key: 'before' | 'order' | 'after'
  label: string
  value: number
  emphasis?: boolean
}

export const INVOICE_DEBT_LABELS = {
  before: 'Công nợ trước đơn',
  order: 'Nợ của đơn này',
  after: 'Tổng công nợ sau đơn',
} as const

/**
 * UX-09: ba dòng công nợ rõ nghĩa. Cài đặt showOldDebt bật dòng trước đơn, showNewDebt bật dòng
 * tổng sau đơn; "Nợ của đơn này" in khi đơn có ghi nợ và ít nhất một tùy chọn nợ đang bật.
 * Tổng sau đơn chỉ in khi biết công nợ trước đơn, không đoán từ công nợ hiện tại.
 */
export function invoiceDebtLines(
  order: InvoiceDebtSource,
  { showOldDebt = false, showNewDebt = true }: InvoiceDebtOptions = {},
): InvoiceDebtLine[] {
  const lines: InvoiceDebtLine[] = []
  const before = order.oldDebt
  if (showOldDebt && before != null && before > 0) {
    lines.push({ key: 'before', label: INVOICE_DEBT_LABELS.before, value: before })
  }
  if ((showOldDebt || showNewDebt) && order.debtAmount > 0) {
    lines.push({ key: 'order', label: INVOICE_DEBT_LABELS.order, value: order.debtAmount })
  }
  if (showNewDebt && before != null && before + order.debtAmount > 0) {
    lines.push({
      key: 'after',
      label: INVOICE_DEBT_LABELS.after,
      value: before + order.debtAmount,
      emphasis: true,
    })
  }
  return lines
}

export interface InvoiceItemNameSource {
  productName: string
  variantName?: string | null
  sku?: string | null
}

export function invoiceItemName(item: InvoiceItemNameSource, showSku: boolean): string {
  const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName
  return showSku && item.sku ? `[${item.sku}] ${name}` : name
}

/** BC-09: số lượng kèm đơn vị tính, ví dụ "2 thùng", "1,255 kg" (ADR-0015) */
export function formatQuantityWithUnit(quantity: number, unit?: string | null): string {
  const u = unit?.trim()
  const q = formatQuantity(quantity)
  return u ? `${q} ${u}` : q
}

/**
 * Ngắt dòng theo từ cho giấy in nhiệt, thay vì cắt cụt tên hàng.
 * Từ dài hơn một dòng thì cắt cứng theo độ rộng.
 */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > width) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
    if (!rest) continue
    if (!current) current = rest
    else if (current.length + 1 + rest.length <= width) current += ` ${rest}`
    else {
      lines.push(current)
      current = rest
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}
