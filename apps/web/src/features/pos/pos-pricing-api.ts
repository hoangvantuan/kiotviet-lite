import { useQuery } from '@tanstack/react-query'

import type { ResolvedPriceItem, ResolvePricesInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'
import {
  isBrowserOffline,
  isUnreachableError,
  resolvePricesFromCatalog,
} from '@/lib/offline-catalog'

export interface PosPriceList {
  id: string
  name: string
}

/**
 * OFF-09: giá theo quy tắc hiện hành. Không tới được máy chủ thì tính trên bản sao danh mục bằng
 * cùng hàm tính giá của máy chủ (resolvePriceFromSources), nên giá ngoại tuyến bằng giá trực tuyến
 * với cùng dữ liệu.
 */
export async function resolvePricesApi(
  input: ResolvePricesInput,
): Promise<{ data: ResolvedPriceItem[] }> {
  const offline = async () => ({ data: await resolvePricesFromCatalog(input) })
  if (isBrowserOffline()) return offline()
  try {
    return await apiClient.post<{ data: ResolvedPriceItem[] }>('/api/v1/pos/resolve-prices', input)
  } catch (error) {
    if (isUnreachableError(error)) return offline()
    throw error
  }
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
