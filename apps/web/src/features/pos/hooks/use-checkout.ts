import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { CreateOrderInput, DebtInfo, PriceSource } from '@kiotviet-lite/shared'

import { useDocumentMutation } from '@/hooks/use-document-mutation'
import { apiClient } from '@/lib/api-client'
import { saveOfflineOrder } from '@/lib/offline-orders'
import { getPGliteRaw, initializeOfflineDB } from '@/lib/pglite'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import type { OrderDetail, StockInfo } from '../types'

interface CheckoutPayload {
  customerId?: string | null
  priceListId?: string | null
  priceListName?: string | null
  subtotal: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus?: string
  cashAmount?: number
  transferAmount?: number
  debtAmount?: number
  debtLimitOverridden?: boolean
  debtLimitOverridePin?: string
  debtLimitApproverId?: string
  priceOverridePin?: string
  priceApproverId?: string
  note?: string | null
  items: {
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
    note: string | null
    unitConversionId: string | null
    originalPrice?: number | null
    priceOverride?: boolean
    priceOverrideReason?: string | null
    priceOverridePinUsed?: boolean
    priceSource?: PriceSource | null
    priceSourceDetail?: string | null
  }[]
}

export interface CheckoutVariables {
  /** Tab giỏ hàng đang thanh toán: mỗi tab là một ý định bán, giữ khóa riêng */
  tab: number
  order: CheckoutPayload
}

interface CheckoutResponse {
  data: OrderDetail
}

interface StockInfoResponse {
  data: StockInfo
}

interface CustomerDebtResponse {
  data: DebtInfo
}

export function useCheckoutMutation() {
  const qc = useQueryClient()
  return useDocumentMutation({
    intent: 'pos.order',
    instance: ({ tab }: CheckoutVariables) => String(tab),
    // R4 (OFF-07): khóa của lần bán cũng là clientId của đơn, dùng chung cho request trực tuyến
    // và hàng chờ ngoại tuyến. Mất phản hồi rồi lưu lại (trực tuyến hay ngoại tuyến) vẫn ra một đơn.
    mutationFn: async ({ order }: CheckoutVariables, clientId) => {
      const payload = { ...order, clientId }
      const isOffline =
        useOfflineStore.getState().status === 'offline' ||
        (typeof navigator !== 'undefined' && !navigator.onLine)

      if (isOffline) {
        await initializeOfflineDB()
        const pglite = getPGliteRaw()

        const storeId = useAuthStore.getState().user?.storeId
        if (!storeId) throw new Error('Chưa đăng nhập')

        await saveOfflineOrder(pglite, storeId, payload as CreateOrderInput, clientId)
        toast.success('Đơn hàng đã lưu (ngoại tuyến, chờ đồng bộ)')

        const debtAmount = payload.debtAmount ?? 0
        let change = 0
        if (payload.paymentMethod === 'cash' && payload.cashAmount != null) {
          change = Math.max(0, payload.cashAmount - payload.total)
        } else if (payload.paymentMethod === 'combined') {
          const cashPart = payload.cashAmount ?? 0
          const transferPart = payload.transferAmount ?? 0
          change = Math.max(0, cashPart + transferPart - payload.total)
        } else if (payload.paymentMethod === 'debt' && payload.cashAmount != null) {
          change = Math.max(0, payload.cashAmount - (payload.total - debtAmount))
        }

        const offlineOrder: OrderDetail = {
          id: clientId,
          orderNumber: `OFFLINE-${clientId.slice(0, 8).toUpperCase()}`,
          customerId: payload.customerId ?? null,
          priceListId: payload.priceListId ?? null,
          priceListName: payload.priceListName ?? null,
          subtotal: payload.subtotal,
          discountAmount: payload.discountAmount,
          total: payload.total,
          paymentMethod: payload.paymentMethod,
          paymentStatus:
            payload.paymentStatus ??
            (debtAmount > 0 ? (debtAmount === payload.total ? 'unpaid' : 'partial') : 'paid'),
          cashAmount: payload.cashAmount ?? null,
          transferAmount: payload.transferAmount ?? null,
          debtAmount,
          change,
          note: payload.note ?? null,
          status: 'completed',
          items: payload.items.map((item, idx) => ({
            id: `offline-item-${idx}`,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            unit: item.unit,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            discountType: item.discountType,
            discountValue: item.discountValue,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
            originalPrice: item.originalPrice ?? null,
            priceOverride: item.priceOverride ?? false,
            sku: null,
            costPrice: null,
            priceSource: item.priceSource ?? 'retail_price',
            priceSourceDetail: item.priceSourceDetail ?? null,
          })),
          createdAt: new Date().toISOString(),
          oldDebt: null,
          customerCurrentDebt: null,
        }

        return { data: offlineOrder }
      }

      return apiClient.post<CheckoutResponse>('/api/v1/pos/orders', payload, {
        idempotencyKey: clientId,
      })
    },
    onSuccess: (_data, { order: variables }) => {
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['low-stock-list'] })
      if (variables.customerId) {
        qc.invalidateQueries({ queryKey: ['customer-debt', variables.customerId] })
      }
    },
  })
}

// Story 5.1: customer debt info query
export function useCustomerDebtQuery(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-debt', customerId],
    queryFn: () => apiClient.get<CustomerDebtResponse>(`/api/v1/pos/customer-debt/${customerId}`),
    enabled: customerId !== null,
    staleTime: 0,
    select: (res) => res.data,
  })
}

export function useStockInfoQuery(productId: string | null) {
  return useQuery({
    queryKey: ['stock-info', productId],
    queryFn: () => apiClient.get<StockInfoResponse>(`/api/v1/pos/stock/${productId}`),
    enabled: productId !== null,
    staleTime: 0, // Always fresh
    select: (res) => res.data,
  })
}
