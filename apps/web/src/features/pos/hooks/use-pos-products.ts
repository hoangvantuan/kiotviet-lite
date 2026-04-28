import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'

import type { PosProductItem } from '../types'

interface PosProductsResponse {
  data: PosProductItem[]
}

export function usePosProducts(categoryId?: string) {
  return useQuery({
    queryKey: ['pos-products', categoryId ?? 'all'],
    queryFn: () =>
      apiClient.get<PosProductsResponse>(
        `/api/v1/pos/products/search${categoryId ? '?categoryId=' + encodeURIComponent(categoryId) : ''}`,
      ),
    staleTime: 30_000,
    select: (res) => res.data,
  })
}

export function usePosSearch(query: string) {
  return useQuery({
    queryKey: ['pos-search', query],
    queryFn: () =>
      apiClient.get<PosProductsResponse>(
        `/api/v1/pos/products/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.trim().length >= 1,
    staleTime: 10_000,
    select: (res) => res.data,
  })
}
