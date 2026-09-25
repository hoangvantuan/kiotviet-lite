import type {
  CreateNotificationChannelInput,
  NotificationChannelItem,
  NotificationChannelTestResult,
  UpdateNotificationChannelInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

const BASE = '/api/v1/notifications/channels'

export function listNotificationChannelsApi() {
  return apiClient.get<ApiEnvelope<NotificationChannelItem[]>>(BASE)
}

export function createNotificationChannelApi(input: CreateNotificationChannelInput) {
  return apiClient.post<ApiEnvelope<NotificationChannelItem>>(BASE, input)
}

export function updateNotificationChannelApi(id: string, input: UpdateNotificationChannelInput) {
  return apiClient.patch<ApiEnvelope<NotificationChannelItem>>(`${BASE}/${id}`, input)
}

export function deleteNotificationChannelApi(id: string) {
  return apiClient.delete<void>(`${BASE}/${id}`)
}

export function testNotificationChannelApi(id: string) {
  return apiClient.post<ApiEnvelope<NotificationChannelTestResult>>(`${BASE}/${id}/test`)
}
