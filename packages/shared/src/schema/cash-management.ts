import { z } from 'zod'

import { orderPaymentMethodSchema } from './order-management.js'
import { paginationSchema } from './pagination.js'

/**
 * TIEN-05, TIEN-02: phương thức của một dòng tiền thực nhận hay thực chi (phiếu thu, tiền hoàn
 * của phiếu trả, phiếu chi). Là tập con của phương thức thanh toán đơn: "Kết hợp" và "Ghi nợ"
 * chỉ có nghĩa ở đơn hàng, còn một khoản tiền đi qua đúng một kênh.
 */
export const moneyMethodSchema = orderPaymentMethodSchema.extract(['cash', 'transfer', 'qr'])

export type MoneyMethod = z.infer<typeof moneyMethodSchema>

/** Trường phương thức bắt buộc của form ghi, kèm thông báo tiếng Việt khi thiếu hay sai giá trị. */
export function moneyMethodInput(message: string) {
  return moneyMethodSchema.extract(moneyMethodSchema.options, { errorMap: () => ({ message }) })
}

export const MONEY_METHODS: readonly MoneyMethod[] = moneyMethodSchema.options

export const MONEY_METHOD_LABELS: Record<MoneyMethod, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  qr: 'QR',
}

/** Nhãn của chứng từ cũ lập trước khi có trường phương thức (cột NULL). */
export const UNKNOWN_MONEY_METHOD_LABEL = 'Chưa rõ (chứng từ cũ)'

export function moneyMethodLabel(method: MoneyMethod | null): string {
  return method ? MONEY_METHOD_LABELS[method] : UNKNOWN_MONEY_METHOD_LABEL
}

/** Kênh được chọn khi hoàn tiền (TIEN-02): không có QR. */
export const REFUND_METHODS = ['cash', 'transfer'] as const satisfies readonly MoneyMethod[]
export const refundMethodSchema = z.enum(REFUND_METHODS, {
  errorMap: () => ({ message: 'Phương thức hoàn tiền không hợp lệ' }),
})
export type RefundMethod = z.infer<typeof refundMethodSchema>

/**
 * TIEN-02: phương thức hoàn tiền mặc định theo cách khách đã trả đơn gốc. Đơn kết hợp, đơn ghi nợ
 * có trả trước hoàn theo kênh chiếm phần lớn số tiền đã trả (bằng nhau thì tiền mặt); không trả gì
 * thì hoàn tiền mặt. QR là cách nhận tiền, không dùng để hoàn: đơn QR hoàn chuyển khoản.
 * Dùng chung cho hộp trả hàng (chọn sẵn) và máy chủ (khi máy khách không gửi).
 */
export function defaultRefundMethod(order: {
  paymentMethod: string
  cashAmount: number | null
  transferAmount: number | null
}): RefundMethod {
  switch (order.paymentMethod) {
    case 'transfer':
    case 'qr':
      return 'transfer'
    case 'combined':
    case 'debt':
      return (order.transferAmount ?? 0) > (order.cashAmount ?? 0) ? 'transfer' : 'cash'
    default:
      return 'cash'
  }
}

/** Số tiền theo từng kênh hoàn tiền (QR tính vào chuyển khoản) */
export type RefundChannelAmounts = Record<RefundMethod, number>

/** Kênh hoàn tiền tương ứng một kênh thu: QR hoàn qua chuyển khoản */
export function refundChannelOf(method: MoneyMethod): RefundMethod {
  return method === 'cash' ? 'cash' : 'transfer'
}

/**
 * TIEN-111: số khách đã trả cho đơn lúc bán theo từng kênh, cùng cách tính dòng tiền
 * (apps/api/src/lib/cash-flow.ts): đơn tiền mặt, chuyển khoản, QR là cả tổng đơn; đơn kết hợp lấy
 * tiền mặt trừ tiền thối; đơn ghi nợ lấy phần trả ngay.
 */
export function orderPaidByChannel(order: {
  paymentMethod: string
  total: number
  cashAmount: number | null
  transferAmount: number | null
  change: number
}): RefundChannelAmounts {
  switch (order.paymentMethod) {
    case 'cash':
      return { cash: order.total, transfer: 0 }
    case 'transfer':
    case 'qr':
      return { cash: 0, transfer: order.total }
    case 'combined':
      return {
        cash: Math.max(0, (order.cashAmount ?? 0) - order.change),
        transfer: order.transferAmount ?? 0,
      }
    case 'debt':
      return { cash: order.cashAmount ?? 0, transfer: order.transferAmount ?? 0 }
    default:
      return { cash: 0, transfer: 0 }
  }
}

/**
 * TIEN-111: số còn hoàn được qua từng kênh mà không vượt quyền: khách đã trả qua kênh đó (lúc bán
 * cộng phiếu thu nợ của đơn) trừ phần các phiếu trả trước đã hoàn qua kênh đó.
 */
export function refundableByChannel(
  paid: RefundChannelAmounts,
  refunded: RefundChannelAmounts,
): RefundChannelAmounts {
  return {
    cash: Math.max(0, paid.cash - refunded.cash),
    transfer: Math.max(0, paid.transfer - refunded.transfer),
  }
}

/**
 * TIEN-111: hoàn qua một kênh nhiều hơn số còn hoàn được qua kênh đó là vượt quyền (ví dụ đơn
 * 10.000 tiền mặt cộng 990.000 chuyển khoản mà chi 1.000.000 tiền mặt từ két). Người không có
 * `orders.returnOverride` cần người duyệt nhập PIN (R1). Máy chủ và hộp trả hàng dùng chung hàm này.
 */
export function refundExceedsChannel(
  refundable: RefundChannelAmounts,
  method: MoneyMethod | null,
  amount: number,
): boolean {
  if (method === null || amount <= 0) return false
  return amount > refundable[refundChannelOf(method)]
}

// ---------------------------------------------------------------------------
// Ca bán hàng (POS-06)
// ---------------------------------------------------------------------------

const cashAmountSchema = (label: string) =>
  z
    .number({
      required_error: `Vui lòng nhập ${label}`,
      invalid_type_error: `Vui lòng nhập ${label}`,
    })
    .int('Số tiền phải là số nguyên')
    .min(0, 'Số tiền không được âm')
    .max(99_999_999_999, 'Số tiền vượt giới hạn')

/**
 * Ca nhận chứng từ có dòng tiền (phiếu thu, phiếu chi, phiếu trả) khi người lập không trực quầy,
 * ví dụ quản lý hoàn tiền thay thu ngân. Bỏ trống thì máy chủ tự chọn (resolveDocumentShift).
 */
export const documentShiftIdSchema = z
  .string()
  .uuid('Ca bán hàng không hợp lệ')
  .nullable()
  .optional()

/** Một ca đang mở, trả kèm lỗi `shift_choice_required` để người lập chọn ca. */
export interface OpenShiftChoice {
  id: string
  userId: string
  userName: string | null
  openedAt: string
}

export const openShiftSchema = z
  .object({
    openingCash: cashAmountSchema('tiền quỹ đầu ca'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
  })
  .strict()

export const closeShiftSchema = z
  .object({
    countedCash: cashAmountSchema('tiền mặt đếm được'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional(),
  })
  .strict()

export const shiftStatusSchema = z.enum(['open', 'closed'])

/**
 * Số liệu tiền mặt của một ca. `expectedCash = openingCash + cashSales + cashReceipts
 * - cashRefunds - cashSupplierPayments`. Tiền bán tiền mặt là tiền mặt giữ lại sau khi trả tiền
 * thừa; phần ghi nợ và tiền chuyển khoản không vào ngăn kéo.
 */
export const shiftSummarySchema = z.object({
  openingCash: z.number().int(),
  cashSales: z.number().int(),
  cashReceipts: z.number().int(),
  /** Tiền mặt trả khách: phiếu trả và hủy đơn chi trong ca */
  cashRefunds: z.number().int(),
  cashSupplierPayments: z.number().int(),
  /** Tiền mặt NCC hoàn trong ca; bản chụp đóng ca cũ không có trường này */
  cashSupplierRefunds: z.number().int().default(0),
  expectedCash: z.number().int(),
  transferIn: z.number().int(),
  qrIn: z.number().int(),
  transferOut: z.number().int(),
  debtSales: z.number().int(),
  orderCount: z.number().int(),
  receiptCount: z.number().int(),
  returnCount: z.number().int(),
  supplierPaymentCount: z.number().int(),
})

export const shiftSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  status: shiftStatusSchema,
  openingCash: z.number().int(),
  openNote: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedByName: z.string().nullable(),
  expectedCash: z.number().int().nullable(),
  countedCash: z.number().int().nullable(),
  difference: z.number().int().nullable(),
  closeNote: z.string().nullable(),
})

export const shiftDetailSchema = shiftSchema.extend({
  /** Số tính lại từ chứng từ hiện gắn với ca */
  summary: shiftSummarySchema,
  /** Số đã chụp lúc đóng ca; khác `summary` nghĩa là có chứng từ gắn vào ca sau khi đóng */
  closeSummary: shiftSummarySchema.nullable(),
})

export const currentShiftResponseSchema = z.object({
  shiftsEnabled: z.boolean(),
  shift: shiftDetailSchema.nullable(),
})

export const listShiftsQuerySchema = paginationSchema.extend({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày: YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày: YYYY-MM-DD')
    .optional(),
  userId: z.string().uuid().optional(),
  status: shiftStatusSchema.optional(),
})

export type OpenShiftInput = z.infer<typeof openShiftSchema>
export type CloseShiftInput = z.infer<typeof closeShiftSchema>
export type ShiftStatus = z.infer<typeof shiftStatusSchema>
export type ShiftSummary = z.infer<typeof shiftSummarySchema>
export type Shift = z.infer<typeof shiftSchema>
export type ShiftDetail = z.infer<typeof shiftDetailSchema>
export type CurrentShiftResponse = z.infer<typeof currentShiftResponseSchema>
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>

// ---------------------------------------------------------------------------
// Báo cáo dòng tiền theo phương thức (BC-06)
// ---------------------------------------------------------------------------

export const cashFlowReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày: YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày: YYYY-MM-DD'),
})

export const cashFlowMethodRowSchema = z.object({
  /** null: phiếu thu, phiếu trả lập trước khi có trường phương thức */
  method: moneyMethodSchema.nullable(),
  /** Tiền thực nhận trên đơn (tiền mặt đã trừ tiền thừa trả khách) */
  salesIn: z.number().int(),
  /** Tiền thu nợ qua phiếu thu */
  receiptsIn: z.number().int(),
  /** Tiền nhà cung cấp hoàn: phiếu trả hàng nhập (ngày lập), phiếu nhập bị hủy (ngày hủy) */
  supplierRefundsIn: z.number().int(),
  /**
   * Tiền trả lại khách: phần hoàn của phiếu trả (không gồm phần cấn nợ, phần hoàn vào tiền trả
   * trước) và khoản trả lại khi hủy đơn (ngày hủy)
   */
  refundsOut: z.number().int(),
  /** Tiền trả nhà cung cấp qua phiếu chi */
  supplierPaymentsOut: z.number().int(),
  net: z.number().int(),
})

export const cashFlowReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.object({
    orderCount: z.number().int(),
    /** Doanh thu gộp: tổng đơn giá × số lượng, trước mọi chiết khấu */
    gross: z.number().int(),
    lineDiscount: z.number().int(),
    orderDiscount: z.number().int(),
    returnCount: z.number().int(),
    /** Giá trị hàng trả lại (giá trị ròng lúc bán, ADR-0010) của phiếu trả lập trong kỳ */
    returns: z.number().int(),
    /** Doanh thu thuần = gộp - chiết khấu - trả hàng */
    net: z.number().int(),
  }),
  methods: z.array(cashFlowMethodRowSchema),
  debt: z.object({
    /** Phần ghi nợ của đơn trong kỳ: chưa phải tiền thu */
    debtSales: z.number().int(),
    /** Trả hàng cấn vào nợ còn lại của đơn */
    returnDebtReduction: z.number().int(),
    /** Trả hàng hoàn vào tiền trả trước (ADR-0011) */
    returnPrepaymentRefund: z.number().int(),
  }),
  cash: z.object({
    cashIn: z.number().int(),
    cashOut: z.number().int(),
    /** Tiền mặt ngăn kéo tăng thêm trong kỳ, cộng với tiền đầu ngày ra số phải có */
    netCash: z.number().int(),
    /**
     * Tiền đầu ngày gợi ý: quỹ đầu ca của ca mở sớm nhất trong kỳ (0 nếu không dùng ca). Không
     * cộng quỹ đầu ca các ca sau: ca nối tiếp nhận lại chính tiền trong ngăn kéo của ca trước.
     */
    openingCash: z.number().int(),
    /** Tổng chênh lệch (thực đếm - phải có) của các ca đã đóng, mở trong kỳ */
    shiftDifference: z.number().int(),
    closedShiftCount: z.number().int(),
    /** Ca mở trong kỳ còn chưa đóng: chưa có chênh lệch */
    openShiftCount: z.number().int(),
  }),
  /** Ca mở trong kỳ, xếp theo giờ mở. Ca vắt qua 0h thuộc ngày mở ca */
  shifts: z.array(shiftSchema),
  /** Chứng từ tiền mặt không gắn ca trong kỳ, cần đối soát tay khi cửa hàng dùng ca */
  unassigned: z.object({
    orderCount: z.number().int(),
    cashIn: z.number().int(),
    cashOut: z.number().int(),
  }),
})

export type CashFlowReportQuery = z.infer<typeof cashFlowReportQuerySchema>
export type CashFlowMethodRow = z.infer<typeof cashFlowMethodRowSchema>
export type CashFlowReport = z.infer<typeof cashFlowReportSchema>
