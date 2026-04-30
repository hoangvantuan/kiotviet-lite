import { z } from 'zod'

export const orderDiscountTypeSchema = z.enum(['percent', 'amount'])

export const orderPaymentMethodSchema = z.enum(['cash', 'transfer', 'qr', 'combined'])

export const orderPaymentStatusSchema = z.enum(['paid', 'partial', 'unpaid'])

export const orderStatusSchema = z.enum(['completed', 'cancelled'])

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

export type OrderDiscountType = z.infer<typeof orderDiscountTypeSchema>
export type OrderPaymentMethod = z.infer<typeof orderPaymentMethodSchema>
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>
export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>
