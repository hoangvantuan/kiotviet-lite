import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { CreateOrderInput, DebtInfo } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'
import { saveOfflineOrder } from '@/lib/offline-orders'
import { getPGliteClient } from '@/lib/pglite'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import type { OrderDetail, StockInfo } from '../types'

interface CheckoutPayload {
  customerId?: string | null
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
  }[]
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

  return useMutation({
    mutationFn: async (payload: CheckoutPayload) => {
      const isOffline = useOfflineStore.getState().status === 'offline' || !navigator.onLine

      if (isOffline) {
        const pglite = getPGliteClient()
        if (!pglite) throw new Error('PGlite chưa khởi tạo')

        const storeId = useAuthStore.getState().user?.storeId
        if (!storeId) throw new Error('Chưa đăng nhập')

        const clientId = await saveOfflineOrder(pglite, storeId, payload as CreateOrderInput)
        toast.success('Đơn hàng đã lưu (chờ đồng bộ)')
        return { data: { id: clientId, offline: true } } as unknown as CheckoutResponse
      }

      return apiClient.post<CheckoutResponse>('/api/v1/pos/orders', payload)
    },
    onSuccess: (_data, variables) => {
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
