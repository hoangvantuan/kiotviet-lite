import type { StoreSettings, UpdateStoreInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export function getStoreApi() {
  return apiClient.get<ApiEnvelope<StoreSettings>>('/api/v1/store')
}

export function updateStoreApi(input: UpdateStoreInput) {
  return apiClient.patch<ApiEnvelope<StoreSettings>>('/api/v1/store', input)
}
