import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type {
  ProductHistoryQuery,
  ProductPurchaseHistoryItem,
  ProductStockCheckHistoryItem,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ProductHistoryQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.variantId) params.set('variantId', q.variantId)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function useProductPurchaseHistoryQuery(
  productId: string | undefined,
  query: Partial<ProductHistoryQuery>,
) {
  return useQuery({
    queryKey: ['product-history', 'purchase', productId, query],
    queryFn: () =>
      apiClient.get<ListEnvelope<ProductPurchaseHistoryItem[]>>(
        `/api/v1/products/${productId}/purchase-history${buildQuery(query)}`,
      ),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  })
}

export function useProductStockCheckHistoryQuery(
  productId: string | undefined,
  query: Partial<ProductHistoryQuery>,
) {
  return useQuery({
    queryKey: ['product-history', 'stock-check', productId, query],
    queryFn: () =>
      apiClient.get<ListEnvelope<ProductStockCheckHistoryItem[]>>(
        `/api/v1/products/${productId}/stock-check-history${buildQuery(query)}`,
      ),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  })
}
