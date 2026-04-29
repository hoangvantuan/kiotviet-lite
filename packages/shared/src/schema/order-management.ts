import { z } from 'zod'

export const orderDiscountTypeSchema = z.enum(['percent', 'amount'])

export const orderPaymentMethodSchema = z.enum(['cash', 'transfer', 'qr', 'combined'])

export const orderPaymentStatusSchema = z.enum(['paid', 'partial', 'unpaid'])

export const orderStatusSchema = z.enum(['completed', 'cancelled'])

export const createOrderItemSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  variantId: z.string().uuid('Biến thể không hợp lệ').nullable().default(null),
  productName: z
    .string()
    .trim()
    .min(1, 'Tên sản phẩm bắt buộc')
    .max(255, 'Tên sản phẩm tối đa 255 ký tự'),
  variantName: z.string().trim().max(255, 'Tên biến thể tối đa 255 ký tự').nullable().default(null),
  unit: z.string().trim().max(50, 'Đơn vị tối đa 50 ký tự').nullable().default(null),
  unitPrice: z.number().int('Đơn giá phải là số nguyên').min(0, 'Đơn giá ≥ 0'),
  quantity: z
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng ≥ 1')
    .max(1_000_000, 'Số lượng vượt giới hạn'),
  discountType: orderDiscountTypeSchema.nullable().default(null),
  discountValue: z
    .number()
    .int('Giá trị chiết khấu phải là số nguyên')
    .min(0, 'Giá trị chiết khấu ≥ 0')
    .default(0),
  discountAmount: z
    .number()
    .int('Số tiền chiết khấu phải là số nguyên')
    .min(0, 'Số tiền chiết khấu ≥ 0')
    .default(0),
  lineTotal: z.number().int('Thành tiền phải là số nguyên').min(0, 'Thành tiền ≥ 0'),
  note: z.string().trim().max(500, 'Ghi chú dòng tối đa 500 ký tự').nullable().default(null),
})

export const createOrderSchema = z.object({
  customerId: z.string().uuid('Khách hàng không hợp lệ').nullable().default(null),
  subtotal: z.number().int('Tổng tiền hàng phải là số nguyên').min(0, 'Tổng tiền hàng ≥ 0'),
  discountType: orderDiscountTypeSchema.nullable().default(null),
  discountValue: z
    .number()
    .int('Giá trị chiết khấu đơn phải là số nguyên')
    .min(0, 'Giá trị chiết khấu đơn ≥ 0')
    .default(0),
  discountAmount: z
    .number()
    .int('Số tiền chiết khấu đơn phải là số nguyên')
    .min(0, 'Số tiền chiết khấu đơn ≥ 0')
    .default(0),
  total: z.number().int('Tổng thanh toán phải là số nguyên').min(0, 'Tổng thanh toán ≥ 0'),
  paymentMethod: orderPaymentMethodSchema,
  note: z.string().trim().max(1000, 'Ghi chú đơn tối đa 1000 ký tự').nullable().default(null),
  items: z
    .array(createOrderItemSchema)
    .min(1, 'Đơn hàng phải có ít nhất 1 sản phẩm')
    .max(200, 'Tối đa 200 dòng sản phẩm trong một đơn'),
})

export type OrderDiscountType = z.infer<typeof orderDiscountTypeSchema>
export type OrderPaymentMethod = z.infer<typeof orderPaymentMethodSchema>
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>
