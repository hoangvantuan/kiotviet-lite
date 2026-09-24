import { useQuery } from '@tanstack/react-query'

import type { ResolvedPriceItem, ResolvePricesInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

export interface PosPriceList {
  id: string
  name: string
}

export function resolvePricesApi(input: ResolvePricesInput) {
  return apiClient.post<{ data: ResolvedPriceItem[] }>('/api/v1/pos/resolve-prices', input)
}

export function listPosPriceListsApi() {
  return apiClient.get<{ data: PosPriceList[] }>('/api/v1/pos/price-lists')
}

export function usePosPriceLists() {
  return useQuery({
    queryKey: ['pos', 'price-lists'],
    queryFn: async () => {
      const res = await listPosPriceListsApi()
      return res.data
    },
    staleTime: 60_000,
  })
}
