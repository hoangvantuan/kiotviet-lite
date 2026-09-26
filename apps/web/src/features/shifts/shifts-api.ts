import type {
  CloseShiftInput,
  CurrentShiftResponse,
  OpenShiftInput,
  ShiftDetail,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

export function getCurrentShiftApi() {
  return apiClient.get<Envelope<CurrentShiftResponse>>('/api/v1/shifts/current')
}

export function getShiftApi(id: string) {
  return apiClient.get<Envelope<ShiftDetail>>(`/api/v1/shifts/${id}`)
}

export function openShiftApi(input: OpenShiftInput, idempotencyKey?: string) {
  return apiClient.post<Envelope<ShiftDetail>>('/api/v1/shifts/open', input, { idempotencyKey })
}

export function closeShiftApi(id: string, input: CloseShiftInput, idempotencyKey?: string) {
  return apiClient.post<Envelope<ShiftDetail>>(`/api/v1/shifts/${id}/close`, input, {
    idempotencyKey,
  })
}
