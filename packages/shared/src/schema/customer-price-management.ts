import { z } from 'zod'

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

export const listCustomerPricesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.string().uuid('Khách hàng không hợp lệ').optional(),
  productId: z.string().uuid('Sản phẩm không hợp lệ').optional(),
  search: z.string().trim().optional(),
})

export const customerPriceListItemSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string(),
  productId: z.string().uuid(),
  productName: z.string(),
  productSku: z.string(),
  productImageUrl: z.string().nullable(),
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
