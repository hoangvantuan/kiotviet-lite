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

/**
 * TIEN-02: phương thức hoàn tiền mặc định theo cách khách đã trả đơn gốc. Đơn kết hợp có phần
 * tiền mặt thì hoàn tiền mặt; đơn ghi nợ chỉ thu tiền mặt tại quầy nên phần dư cũng hoàn tiền mặt.
 * Dùng chung cho hộp trả hàng (chọn sẵn) và máy chủ (khi máy khách không gửi).
 */
export function defaultRefundMethod(order: {
  paymentMethod: string
  cashAmount: number | null
}): MoneyMethod {
  switch (order.paymentMethod) {
    case 'transfer':
      return 'transfer'
    case 'qr':
      return 'qr'
    case 'combined':
      return (order.cashAmount ?? 0) > 0 ? 'cash' : 'transfer'
    default:
      return 'cash'
  }
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
  cashRefunds: z.number().int(),
  cashSupplierPayments: z.number().int(),
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
  /** Tiền hoàn cho khách qua phiếu trả (không gồm phần cấn nợ, phần hoàn vào tiền trả trước) */
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
    /** Tổng tiền quỹ đầu ca của các ca mở trong kỳ (0 nếu không dùng ca) */
    openingCash: z.number().int(),
  }),
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
