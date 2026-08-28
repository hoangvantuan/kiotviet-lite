import { apiClient } from '@/lib/api-client'

interface OrderListItem {
  id: string
  orderNumber: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  createdByName: string | null
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  paidAmount: number
  debtAmount: number
  status: string
  debtLimitExceeded?: boolean
  note: string | null
  createdAt: string
}

interface OrderDetailResponse {
  id: string
  orderNumber: string
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  customerGroupName: string | null
  customerCurrentDebt?: number | null
  oldDebt?: number | null
  createdByName: string | null
  subtotal: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  change: number
  paidAmount: number
  debtAmount: number
  note: string | null
  status: string
  debtLimitExceeded?: boolean
  createdAt: string
  updatedAt: string
  items: OrderDetailItem[]
}

interface OrderDetailItem {
  id: string
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  quantity: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  lineTotal: number
  originalPrice: number | null
  priceOverride: boolean
  sku?: string | null
  costPrice?: number | null
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

interface Envelope<T> {
  data: T
}

export interface ListOrdersQuery {
  page?: number
  pageSize?: number
  search?: string
  fromDate?: string
  toDate?: string
  status?: string
  customerId?: string
  paymentMethod?: string
  paymentStatus?: string
}

function buildQuery(q: ListOrdersQuery): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  if (q.status) params.set('status', q.status)
  if (q.customerId) params.set('customerId', q.customerId)
  if (q.paymentMethod) params.set('paymentMethod', q.paymentMethod)
  if (q.paymentStatus) params.set('paymentStatus', q.paymentStatus)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listOrdersApi(query: ListOrdersQuery) {
  return apiClient.get<ListEnvelope<OrderListItem[]>>(`/api/v1/orders${buildQuery(query)}`)
}

export function getOrderApi(id: string) {
  return apiClient.get<Envelope<OrderDetailResponse>>(`/api/v1/orders/${id}`)
}

// --- Returns API ---

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

export interface CreateOrderReturnInput {
  items: Array<{ orderItemId: string; quantity: number; reason: string }>
  note?: string | null
}

export interface OrderReturnDetail extends OrderReturnListItem {
  orderId: string
  note: string | null
  createdBy: string
}

export function getReturnableItemsApi(orderId: string) {
  return apiClient.get<Envelope<ReturnableItem[]>>(`/api/v1/orders/${orderId}/returnable-items`)
}

export function getOrderReturnsApi(orderId: string) {
  return apiClient.get<Envelope<OrderReturnListItem[]>>(`/api/v1/orders/${orderId}/returns`)
}

export function createReturnApi(orderId: string, input: CreateOrderReturnInput) {
  return apiClient.post<Envelope<OrderReturnDetail>>(`/api/v1/orders/${orderId}/returns`, input)
}

export type { OrderDetailItem, OrderDetailResponse, OrderListItem }
