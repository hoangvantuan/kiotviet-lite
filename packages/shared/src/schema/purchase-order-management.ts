import { z } from 'zod'

export const discountTypeSchema = z.enum(['amount', 'percent'])
export const paymentStatusSchema = z.enum(['unpaid', 'partial', 'paid'])

export const purchaseOrderItemInputSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  variantId: z.string().uuid('Biến thể không hợp lệ').nullable().optional(),
  quantity: z
    .number()
    .int('Số lượng phải là số nguyên')
    .min(1, 'Số lượng phải ≥ 1')
    .max(1_000_000, 'Số lượng vượt giới hạn'),
  unitPrice: z.number().int('Đơn giá nhập phải là số nguyên').min(0, 'Đơn giá nhập ≥ 0'),
  discountType: discountTypeSchema.default('amount'),
  discountValue: z
    .number()
    .int('Giá trị chiết khấu phải là số nguyên')
    .min(0, 'Giá trị chiết khấu ≥ 0')
    .default(0),
})

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' }),
  purchaseDate: z.string().datetime().optional(),
  items: z
    .array(purchaseOrderItemInputSchema)
    .min(1, 'Phiếu nhập phải có ít nhất 1 sản phẩm')
    .max(200, 'Tối đa 200 dòng sản phẩm trong một phiếu'),
  discountTotalType: discountTypeSchema.default('amount'),
  discountTotalValue: z
    .number()
    .int('Giá trị chiết khấu tổng phải là số nguyên')
    .min(0, 'Giá trị chiết khấu tổng ≥ 0')
    .default(0),
  paidAmount: z
    .number()
    .int('Số tiền đã trả phải là số nguyên')
    .min(0, 'Số tiền đã trả ≥ 0')
    .default(0),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
})

export const listPurchaseOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  supplierId: z.string().uuid().optional(),
  paymentStatus: paymentStatusSchema.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
})

export const purchaseOrderItemDetailSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productNameSnapshot: z.string(),
  productSkuSnapshot: z.string(),
  variantLabelSnapshot: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountAmount: z.number(),
  discountType: discountTypeSchema,
  discountValue: z.number(),
  lineTotal: z.number(),
  costAfter: z.number().nullable(),
  stockAfter: z.number().nullable(),
})

export const purchaseOrderListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  itemCount: z.number().int(),
  subtotal: z.number(),
  discountTotal: z.number(),
  totalAmount: z.number(),
  paidAmount: z.number(),
  paymentStatus: paymentStatusSchema,
  purchaseDate: z.string(),
  createdAt: z.string(),
})

export const purchaseOrderDetailSchema = purchaseOrderListItemSchema.extend({
  storeId: z.string().uuid(),
  discountTotalType: discountTypeSchema,
  discountTotalValue: z.number(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable(),
  supplier: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string().nullable(),
  }),
  items: z.array(purchaseOrderItemDetailSchema),
  updatedAt: z.string(),
})

export type DiscountType = z.infer<typeof discountTypeSchema>
export type PaymentStatus = z.infer<typeof paymentStatusSchema>
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>
export type PurchaseOrderItemDetail = z.infer<typeof purchaseOrderItemDetailSchema>
export type PurchaseOrderListItem = z.infer<typeof purchaseOrderListItemSchema>
export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>
