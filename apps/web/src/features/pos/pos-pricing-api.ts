import type { ResolvedPriceItem, ResolvePricesInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

export function resolvePricesApi(input: ResolvePricesInput) {
  return apiClient.post<{ data: ResolvedPriceItem[] }>('/api/v1/pos/resolve-prices', input)
}
