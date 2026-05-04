import type { PrintSettingsResponse, UpdatePrintSettingsInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export function getPrintSettingsApi() {
  return apiClient.get<ApiEnvelope<PrintSettingsResponse>>('/api/v1/print-settings')
}

export function updatePrintSettingsApi(input: UpdatePrintSettingsInput) {
  return apiClient.put<ApiEnvelope<PrintSettingsResponse>>('/api/v1/print-settings', input)
}
