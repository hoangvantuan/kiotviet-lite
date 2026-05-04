import { z } from 'zod'

export const orderDiscountTypeSchema = z.enum(['percent', 'amount'])

export const orderPaymentMethodSchema = z.enum(['cash', 'transfer', 'qr', 'combined', 'debt'])

export const orderPaymentStatusSchema = z.enum(['paid', 'partial', 'unpaid'])

export const orderStatusSchema = z.enum(['completed', 'cancelled', 'partial_return', 'full_return'])

export const createOrderItemSchema = z
  .object({
    productId: z.string().uuid('San pham khong hop le'),
    variantId: z.string().uuid('Bien the khong hop le').nullable().default(null),
    productName: z
      .string()
      .trim()
      .min(1, 'Ten san pham bat buoc')
      .max(255, 'Ten san pham toi da 255 ky tu'),
    variantName: z
      .string()
      .trim()
      .max(255, 'Ten bien the toi da 255 ky tu')
      .nullable()
      .default(null),
    unit: z.string().trim().max(50, 'Don vi toi da 50 ky tu').nullable().default(null),
    unitPrice: z.number().int('Don gia phai la so nguyen').min(0, 'Don gia >= 0'),
    quantity: z
      .number()
      .int('So luong phai la so nguyen')
      .min(1, 'So luong >= 1')
      .max(1_000_000, 'So luong vuot gioi han'),
    discountType: orderDiscountTypeSchema.nullable().default(null),
    discountValue: z
      .number()
      .int('Gia tri chiet khau phai la so nguyen')
      .min(0, 'Gia tri chiet khau >= 0')
      .default(0),
    discountAmount: z
      .number()
      .int('So tien chiet khau phai la so nguyen')
      .min(0, 'So tien chiet khau >= 0')
      .default(0),
    lineTotal: z.number().int('Thanh tien phai la so nguyen').min(0, 'Thanh tien >= 0'),
    note: z.string().trim().max(500, 'Ghi chu dong toi da 500 ky tu').nullable().default(null),
    unitConversionId: z.string().uuid().nullable().default(null),
    originalPrice: z
      .number()
      .int('Gia goc phai la so nguyen')
      .min(0, 'Gia goc >= 0')
      .nullable()
      .default(null),
    priceOverride: z.boolean().default(false),
    priceOverrideReason: z
      .string()
      .trim()
      .max(255, 'Ly do sua gia toi da 255 ky tu')
      .nullable()
      .default(null),
    priceOverridePinUsed: z.boolean().default(false),
  })
  .refine((item) => item.lineTotal === item.unitPrice * item.quantity - item.discountAmount, {
    message: 'lineTotal khong khop voi unitPrice * quantity - discountAmount',
  })
  .refine((item) => !item.priceOverride || item.originalPrice !== null, {
    message: 'priceOverride yeu cau originalPrice',
  })

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid('Khach hang khong hop le').nullable().default(null),
    subtotal: z.number().int('Tong tien hang phai la so nguyen').min(0, 'Tong tien hang >= 0'),
    discountType: orderDiscountTypeSchema.nullable().default(null),
    discountValue: z
      .number()
      .int('Gia tri chiet khau don phai la so nguyen')
      .min(0, 'Gia tri chiet khau don >= 0')
      .default(0),
    discountAmount: z
      .number()
      .int('So tien chiet khau don phai la so nguyen')
      .min(0, 'So tien chiet khau don >= 0')
      .default(0),
    total: z.number().int('Tong thanh toan phai la so nguyen').min(0, 'Tong thanh toan >= 0'),
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
    note: z.string().trim().max(1000, 'Ghi chu don toi da 1000 ky tu').nullable().default(null),
    items: z
      .array(createOrderItemSchema)
      .min(1, 'Don hang phai co it nhat 1 san pham')
      .max(200, 'Toi da 200 dong san pham trong mot don'),
  })
  .refine((order) => order.total === order.subtotal - order.discountAmount, {
    message: 'total khong khop voi subtotal - discountAmount',
  })
  .refine(
    (order) => {
      if (order.paymentMethod === 'cash') {
        return order.cashAmount != null && order.cashAmount >= order.total
      }
      return true
    },
    { message: 'Tien mat phai >= tong thanh toan khi thanh toan bang tien mat' },
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
    { message: 'Tong tien mat + chuyen khoan phai >= tong thanh toan khi thanh toan ket hop' },
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
