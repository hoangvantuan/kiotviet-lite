import { z } from 'zod'

import { paginationSchema } from './pagination.js'
import { priceSchema } from './price-list-management.js'

export const customerPriceNoteSchema = z
  .string()
  .trim()
  .max(255, 'Ghi chú tối đa 255 ký tự')
  .nullable()
  .optional()

export const createCustomerPriceSchema = z
  .object({
    customerId: z.string().uuid('Khách hàng không hợp lệ'),
    productId: z.string().uuid('Sản phẩm không hợp lệ'),
    // POS-08: null hoặc bỏ trống là giá riêng cho mọi biến thể của sản phẩm
    variantId: z.string().uuid('Biến thể không hợp lệ').nullable().optional(),
    price: priceSchema,
    note: customerPriceNoteSchema,
  })
  .strict()

export const updateCustomerPriceSchema = z
  .object({
    price: priceSchema.optional(),
    note: customerPriceNoteSchema,
  })
  .strict()
  .refine((data) => data.price !== undefined || data.note !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  })

export const listCustomerPricesQuerySchema = paginationSchema.extend({
  customerId: z.string().uuid('Khách hàng không hợp lệ').optional(),
  productId: z.string().uuid('Sản phẩm không hợp lệ').optional(),
  search: z.string().trim().optional(),
})

export const customerPriceListItemSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
  variantId: z.string().uuid().nullable(),
  variantName: z.string().nullable(),
  /** Giá bán, giá vốn của biến thể nếu dòng gắn biến thể, ngược lại của sản phẩm */
  productSellingPrice: z.number(),
  productCostPrice: z.number().nullable(),
  price: z.number(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type CreateCustomerPriceInput = z.infer<typeof createCustomerPriceSchema>
export type UpdateCustomerPriceInput = z.infer<typeof updateCustomerPriceSchema>
export type ListCustomerPricesQuery = z.infer<typeof listCustomerPricesQuerySchema>
export type CustomerPriceListItem = z.infer<typeof customerPriceListItemSchema>
