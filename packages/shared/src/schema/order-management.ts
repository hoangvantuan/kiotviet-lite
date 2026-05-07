import { z } from 'zod'

export const orderDiscountTypeSchema = z.enum(['percent', 'amount'])

export const orderPaymentMethodSchema = z.enum(['cash', 'transfer', 'qr', 'combined', 'debt'])

export const orderPaymentStatusSchema = z.enum(['paid', 'partial', 'unpaid'])

export const orderStatusSchema = z.enum(['completed', 'cancelled', 'partial_return', 'full_return'])

export const createOrderItemSchema = z
  .object({
    productId: z.string().uuid('Sản phẩm không hợp lệ'),
    variantId: z.string().uuid('Biến thể không hợp lệ').nullable().default(null),
    productName: z
      .string()
      .trim()
      .min(1, 'Tên sản phẩm bắt buộc')
      .max(255, 'Tên sản phẩm tối đa 255 ký tự'),
    variantName: z
      .string()
      .trim()
      .max(255, 'Tên biến thể tối đa 255 ký tự')
      .nullable()
      .default(null),
    unit: z.string().trim().max(50, 'Đơn vị tối đa 50 ký tự').nullable().default(null),
    unitPrice: z.number().int('Đơn giá phải là số nguyên').min(0, 'Đơn giá >= 0'),
    quantity: z
      .number()
      .int('Số lượng phải là số nguyên')
      .min(1, 'Số lượng >= 1')
      .max(1_000_000, 'Số lượng vượt giới hạn'),
    discountType: orderDiscountTypeSchema.nullable().default(null),
    discountValue: z
      .number()
      .int('Giá trị chiết khấu phải là số nguyên')
      .min(0, 'Giá trị chiết khấu >= 0')
      .default(0),
    discountAmount: z
      .number()
      .int('Số tiền chiết khấu phải là số nguyên')
      .min(0, 'Số tiền chiết khấu >= 0')
      .default(0),
    lineTotal: z.number().int('Thành tiền phải là số nguyên').min(0, 'Thành tiền >= 0'),
    note: z.string().trim().max(500, 'Ghi chú dòng tối đa 500 ký tự').nullable().default(null),
    unitConversionId: z.string().uuid().nullable().default(null),
    originalPrice: z
      .number()
      .int('Giá gốc phải là số nguyên')
      .min(0, 'Giá gốc >= 0')
      .nullable()
      .default(null),
    priceOverride: z.boolean().default(false),
    priceOverrideReason: z
      .string()
      .trim()
      .max(255, 'Lý do sửa giá tối đa 255 ký tự')
      .nullable()
      .default(null),
    priceOverridePinUsed: z.boolean().default(false),
  })
  .refine((item) => item.lineTotal === item.unitPrice * item.quantity - item.discountAmount, {
    message: 'lineTotal không khớp với unitPrice * quantity - discountAmount',
  })
  .refine((item) => !item.priceOverride || item.originalPrice !== null, {
    message: 'priceOverride yêu cầu originalPrice',
  })

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid('Khách hàng không hợp lệ').nullable().default(null),
    subtotal: z.number().int('Tổng tiền hàng phải là số nguyên').min(0, 'Tổng tiền hàng >= 0'),
    discountType: orderDiscountTypeSchema.nullable().default(null),
    discountValue: z
      .number()
      .int('Giá trị chiết khấu đơn phải là số nguyên')
      .min(0, 'Giá trị chiết khấu đơn >= 0')
      .default(0),
    discountAmount: z
      .number()
      .int('Số tiền chiết khấu đơn phải là số nguyên')
      .min(0, 'Số tiền chiết khấu đơn >= 0')
      .default(0),
    total: z.number().int('Tổng thanh toán phải là số nguyên').min(0, 'Tổng thanh toán >= 0'),
    paymentMethod: orderPaymentMethodSchema,
    paymentStatus: orderPaymentStatusSchema.default('paid'),
    cashAmount: z.number().int().min(0).optional(),
    transferAmount: z.number().int().min(0).optional(),
    debtAmount: z
      .number()
      .int('Số tiền ghi nợ phải là số nguyên')
      .min(0, 'Số tiền ghi nợ phải >= 0')
      .optional(),
    debtLimitOverridden: z.boolean().default(false),
    debtLimitOverridePin: z.string().trim().min(1).max(32).optional(),
    note: z.string().trim().max(1000, 'Ghi chú đơn tối đa 1000 ký tự').nullable().default(null),
    items: z
      .array(createOrderItemSchema)
      .min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm')
      .max(200, 'Tối đa 200 dòng sản phẩm trong một đơn'),
  })
  .refine((order) => order.total === order.subtotal - order.discountAmount, {
    message: 'total không khớp với subtotal - discountAmount',
  })
  .refine(
    (order) => {
      if (order.paymentMethod === 'cash') {
        return order.cashAmount != null && order.cashAmount >= order.total
      }
      return true
    },
    { message: 'Tiền mặt phải >= tổng thanh toán khi thanh toán bằng tiền mặt' },
  )
  .refine(
    (order) => {
      if (order.paymentMethod === 'combined') {
        const cash = order.cashAmount ?? 0
        const transfer = order.transferAmount ?? 0
        return cash + transfer >= order.total
      }
      return true
    },
    { message: 'Tổng tiền mặt + chuyển khoản phải >= tổng thanh toán khi thanh toán kết hợp' },
  )
  .refine(
    (order) => {
      // debtAmount > 0 yêu cầu phải có customerId
      if (order.debtAmount && order.debtAmount > 0) {
        return order.customerId !== null && order.customerId !== undefined
      }
      return true
    },
    {
      message: 'Phải chọn khách hàng khi ghi nợ',
      path: ['customerId'],
    },
  )
  .refine(
    (order) => {
      // debtAmount không được vượt total
      if (order.debtAmount && order.debtAmount > 0) {
        return order.debtAmount <= order.total
      }
      return true
    },
    {
      message: 'Số tiền ghi nợ không được vượt tổng thanh toán',
      path: ['debtAmount'],
    },
  )
  .refine(
    (order) => {
      // Nếu có debt: paymentStatus phải khớp
      if (order.debtAmount && order.debtAmount > 0) {
        if (order.debtAmount === order.total) return order.paymentStatus === 'unpaid'
        return order.paymentStatus === 'partial'
      }
      return true
    },
    {
      message: 'paymentStatus không khớp với số tiền ghi nợ',
      path: ['paymentStatus'],
    },
  )
  .refine(
    (order) => {
      // CRIT-2: paymentMethod='debt' yêu cầu debtAmount > 0
      if (order.paymentMethod === 'debt') {
        return order.debtAmount != null && order.debtAmount > 0
      }
      return true
    },
    {
      message: 'Phương thức ghi nợ yêu cầu số tiền ghi nợ lớn hơn 0',
      path: ['debtAmount'],
    },
  )
  .refine(
    (order) => {
      // CRIT-1: paymentMethod='debt' yêu cầu cashAmount + debtAmount >= total
      if (order.paymentMethod === 'debt') {
        const cash = order.cashAmount ?? 0
        const debt = order.debtAmount ?? 0
        return cash + debt >= order.total
      }
      return true
    },
    {
      message: 'Tổng tiền mặt và ghi nợ phải bằng tổng đơn hàng',
      path: ['debtAmount'],
    },
  )
  .refine(
    (order) => {
      // SF-1: debtLimitOverridden=true yêu cầu phải có PIN
      if (order.debtLimitOverridden === true) {
        return (
          typeof order.debtLimitOverridePin === 'string' && order.debtLimitOverridePin.length > 0
        )
      }
      return true
    },
    {
      message: 'Vượt hạn mức công nợ yêu cầu mã PIN',
      path: ['debtLimitOverridePin'],
    },
  )

export type OrderDiscountType = z.infer<typeof orderDiscountTypeSchema>
export type OrderPaymentMethod = z.infer<typeof orderPaymentMethodSchema>
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>

// --- Story 7-1: List & Detail ---

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD')
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD')
    .optional(),
  status: z.enum(['completed', 'cancelled', 'partial_return', 'full_return']).optional(),
  customerId: z.string().uuid().optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'qr', 'combined', 'debt']).optional(),
  paymentStatus: z.enum(['paid', 'partial', 'unpaid']).optional(),
})

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>
