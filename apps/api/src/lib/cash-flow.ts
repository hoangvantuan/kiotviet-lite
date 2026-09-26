/**
 * Nguồn chân lý duy nhất cho "tiền thực nhận, thực chi" theo phương thức (POS-06, BC-06).
 *
 * Tiền thu là tiền thực nhận trên đơn và phiếu thu, KHÔNG phải `debts.paid` (bẫy TIEN-01: `paid`
 * là số khoản nợ đã được tất toán, không nói tiền vào quỹ lúc nào, qua kênh nào). Đóng ca và báo
 * cáo dòng tiền đều đọc các biểu thức dưới đây để hai con số luôn khớp nhau.
 *
 * Tách tiền của một đơn theo cách trả (derivePayment trong order-policy.ts):
 * - `cash`: khách đưa tiền mặt, thối lại tiền thừa, ngăn kéo giữ đúng `total`.
 * - `transfer`, `qr`: toàn bộ `total` đi qua tài khoản ngân hàng.
 * - `combined`: tiền mặt và chuyển khoản; tiền thừa thối bằng tiền mặt nên tiền mặt giữ lại là
 *   `cash_amount - change` (có thể âm khi khách chuyển dư rồi nhận lại tiền mặt).
 * - `debt`: phần trả ngay là `cash_amount` (và `transfer_amount` nếu có), phần còn lại ghi nợ.
 */
import { type SQL, sql } from 'drizzle-orm'

import { type MoneyMethod, moneyMethodSchema, orders } from '@kiotviet-lite/shared'

import { activeReceiptFilter, activeSupplierPaymentFilter } from './document-status.js'

/** Chứng từ lập trước TIEN-05, TIEN-02 có phương thức NULL: giữ là "chưa rõ", không đoán tiền mặt. */
export function toMoneyMethod(value: string | null): MoneyMethod | null {
  const parsed = moneyMethodSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Tiền mặt ngăn kéo giữ lại từ một đơn. */
export function orderCashInExpr(): SQL<number> {
  return sql<number>`(CASE ${orders.paymentMethod}
    WHEN 'cash' THEN ${orders.total}
    WHEN 'combined' THEN coalesce(${orders.cashAmount}, 0) - ${orders.change}
    WHEN 'debt' THEN coalesce(${orders.cashAmount}, 0)
    ELSE 0 END)`
}

/** Tiền chuyển khoản (không gồm QR) nhận từ một đơn. */
export function orderTransferInExpr(): SQL<number> {
  return sql<number>`(CASE ${orders.paymentMethod}
    WHEN 'transfer' THEN ${orders.total}
    WHEN 'combined' THEN coalesce(${orders.transferAmount}, 0)
    WHEN 'debt' THEN coalesce(${orders.transferAmount}, 0)
    ELSE 0 END)`
}

/** Tiền nhận qua mã QR của một đơn. */
export function orderQrInExpr(): SQL<number> {
  return sql<number>`(CASE ${orders.paymentMethod} WHEN 'qr' THEN ${orders.total} ELSE 0 END)`
}

/** Phần ghi nợ của một đơn: chưa phải tiền thu. */
export function orderDebtExpr(): SQL<number> {
  return sql<number>`(CASE ${orders.paymentMethod}
    WHEN 'debt' THEN ${orders.total} - coalesce(${orders.cashAmount}, 0) - coalesce(${orders.transferAmount}, 0)
    ELSE 0 END)`
}

// ---------------------------------------------------------------------------
// Chứng từ được tính vào dòng tiền. Điều kiện trạng thái hủy của từng loại chứng từ nằm TẠI ĐÂY,
// không rải ở từng truy vấn báo cáo, đóng ca.
// ---------------------------------------------------------------------------

/**
 * Tiền bán của đơn luôn thuộc ngày bán, ca bán, kể cả khi đơn bị hủy sau đó: không rút ngược số của
 * ngày cũ hay ca đã đóng (BC-06). Khoản trả lại khi hủy là tiền ra riêng, ghi theo ngày hủy
 * (`cancelled_at`), kênh `cancel_refund_method`, ca `cancel_shift_id`. Trả về `undefined` để
 * `and(...)` bỏ qua. Phần doanh thu (không phải tiền) vẫn loại đơn hủy qua `revenueStatusFilter`.
 */
export function cashFlowOrderFilter(): SQL | undefined {
  return undefined
}

/** Tiền trả lại khách khi hủy đơn, lọc theo phương thức hoàn đã ghi trên đơn. */
export function orderCancelRefundExpr(method: MoneyMethod): SQL<number> {
  return sql<number>`(CASE WHEN ${orders.status} = 'cancelled' AND ${orders.cancelRefundMethod} = ${method}
    THEN ${orders.cancelRefundAmount} ELSE 0 END)`
}

/** Phiếu thu đã hủy không tính (TIEN-107). */
export function cashFlowReceiptFilter(): SQL {
  return activeReceiptFilter()
}

/** Phiếu trả hàng chưa có luồng hủy nên luôn được tính. */
export function cashFlowReturnFilter(): SQL | undefined {
  return undefined
}

/** Phiếu chi NCC đã hủy không tính (TIEN-107). */
export function cashFlowSupplierPaymentFilter(): SQL {
  return activeSupplierPaymentFilter()
}
