import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DebtInfo } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

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
    mutationFn: (payload: CheckoutPayload) =>
      apiClient.post<CheckoutResponse>('/api/v1/pos/orders', payload),
    onSuccess: (_data, variables) => {
      // Invalidate POS products to update stock badges / "Het hang" status
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      // Invalidate low-stock count to update bell badge
      qc.invalidateQueries({ queryKey: ['low-stock-count'] })
      qc.invalidateQueries({ queryKey: ['low-stock-list'] })
      // Story 5.1: invalidate debt info nếu có customer
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
