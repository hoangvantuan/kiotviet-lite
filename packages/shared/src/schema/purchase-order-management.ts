import { z } from 'zod'

import { moneyMethodSchema } from './cash-management.js'
import { documentStatusSchema } from './document-cancel.js'
import { dateFilterSchema, paginationSchema } from './pagination.js'
import { purchaseReturnSchema } from './purchase-return-management.js'
import { positiveQuantitySchema } from './quantity-input.js'

export const discountTypeSchema = z.enum(['amount', 'percent'])
export const paymentStatusSchema = z.enum(['unpaid', 'partial', 'paid'])

export const purchaseOrderItemInputSchema = z.object({
  productId: z.string().uuid('Sản phẩm không hợp lệ'),
  variantId: z.string().uuid('Biến thể không hợp lệ').nullable().optional(),
  // Nhập theo đơn vị quy đổi (ví dụ thùng): quantity và unitPrice tính theo đơn vị đó,
  // máy chủ quy ra đơn vị tính cho tồn kho và giá vốn
  unitConversionId: z.string().uuid('Đơn vị quy đổi không hợp lệ').nullable().optional(),
  quantity: positiveQuantitySchema(),
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

export const listPurchaseOrdersQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  supplierId: z.string().uuid().optional(),
  paymentStatus: paymentStatusSchema.optional(),
  status: documentStatusSchema.optional(),
  fromDate: dateFilterSchema.optional(),
  toDate: dateFilterSchema.optional(),
})

export const purchaseOrderItemDetailSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productNameSnapshot: z.string(),
  productSkuSnapshot: z.string(),
  variantLabelSnapshot: z.string().nullable(),
  unitConversionId: z.string().uuid().nullable(),
  // null = đơn vị tính của sản phẩm
  unitName: z.string().nullable(),
  conversionFactor: z.number().int(),
  // Số lượng quy ra đơn vị tính (quantity × conversionFactor)
  baseQuantity: z.number(),
  quantity: z.number(),
  unitPrice: z.number(),
  discountAmount: z.number(),
  discountType: discountTypeSchema,
  discountValue: z.number(),
  lineTotal: z.number(),
  // Phần chiết khấu phiếu phân bổ cho dòng; null với phiếu lập trước quy tắc phân bổ
  orderDiscountAllocated: z.number().nullable(),
  // Giá nhập thực trên một đơn vị tính (sau chiết khấu dòng và chiết khấu phiếu)
  unitCost: z.number().nullable(),
  costAfter: z.number().nullable(),
  stockAfter: z.number().nullable(),
  // KHO-11: lũy kế đã trả NCC, theo đơn vị ghi trên chứng từ
  returnedQuantity: z.number(),
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
  // Đã trả ròng cho phiếu: trả lúc nhập + phiếu chi gắn phiếu (còn hiệu lực) - NCC hoàn khi trả hàng
  paidAmount: z.number(),
  // Lũy kế giá trị hàng đã trả NCC (KHO-11)
  returnedAmount: z.number(),
  paymentStatus: paymentStatusSchema,
  status: documentStatusSchema,
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
  // Trả lúc nhập, tách khỏi phiếu chi gắn sau (TIEN-104)
  initialPaidAmount: z.number(),
  linkedPaymentAmount: z.number(),
  returnRefundAmount: z.number(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledByName: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelDebtReduction: z.number(),
  cancelSupplierRefund: z.number(),
  /** BC-06: kênh NCC hoàn phần đã trả khi hủy phiếu; null khi không có tiền hoàn */
  cancelRefundMethod: moneyMethodSchema.nullable(),
  returns: z.array(purchaseReturnSchema),
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
