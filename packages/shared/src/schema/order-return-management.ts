import { z } from 'zod'

export const orderReturnReasonSchema = z.enum([
  'defective',
  'wrong_product',
  'customer_changed_mind',
  'other',
])

export const RETURN_REASON_LABELS: Record<string, string> = {
  defective: 'Lỗi sản phẩm',
  wrong_product: 'Sai sản phẩm',
  customer_changed_mind: 'Khách đổi ý',
  other: 'Khác',
}

export const createOrderReturnItemSchema = z.object({
  orderItemId: z.string().uuid('Order item không hợp lệ'),
  quantity: z
    .number()
    .int('Số lượng trả phải là số nguyên')
    .min(1, 'Số lượng trả phải >= 1')
    .max(1_000_000, 'Số lượng trả vượt giới hạn'),
  reason: orderReturnReasonSchema,
})

export const createOrderReturnSchema = z
  .object({
    items: z.array(createOrderReturnItemSchema).min(1, 'Phải có ít nhất 1 sản phẩm trả'),
    note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự').nullable().default(null),
  })
  // CRIT C3: chặn trùng orderItemId trong cùng phiếu. Nếu cho trùng, mỗi dòng đều
  // thấy "remaining" từ snapshot ban đầu → trả vượt số đã mua, hoàn tiền gấp N lần.
  .refine(
    (input) => {
      const ids = input.items.map((it) => it.orderItemId)
      return new Set(ids).size === ids.length
    },
    {
      message: 'Mỗi dòng hàng chỉ được trả một lần trong cùng phiếu',
      path: ['items'],
    },
  )

export type OrderReturnReason = z.infer<typeof orderReturnReasonSchema>
export type CreateOrderReturnItemInput = z.infer<typeof createOrderReturnItemSchema>
export type CreateOrderReturnInput = z.infer<typeof createOrderReturnSchema>

export interface ReturnableItem {
  orderItemId: string
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  purchasedQuantity: number
  returnedQuantity: number
  remainingQuantity: number
}

export interface OrderReturnItemDetail {
  id: string
  orderItemId: string
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  reason: string
}

export interface OrderReturnDetail {
  id: string
  returnNumber: string
  orderId: string
  totalAmount: number
  refundAmount: number
  debtReductionAmount: number
  note: string | null
  createdBy: string
  createdByName: string | null
  createdAt: string
  items: OrderReturnItemDetail[]
}

export interface OrderReturnListItem {
  id: string
  returnNumber: string
  totalAmount: number
  refundAmount: number
  debtReductionAmount: number
  createdByName: string | null
  createdAt: string
  items: OrderReturnItemDetail[]
}
