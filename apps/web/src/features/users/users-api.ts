import type {
  CreateUserInput,
  UpdateUserInput,
  UserListItem,
  VerifyPinInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export function listUsersApi() {
  return apiClient.get<ApiEnvelope<UserListItem[]>>('/api/v1/users')
}

export function createUserApi(input: CreateUserInput) {
  return apiClient.post<ApiEnvelope<UserListItem>>('/api/v1/users', input)
}

export function updateUserApi(id: string, input: UpdateUserInput) {
  return apiClient.patch<ApiEnvelope<UserListItem>>(`/api/v1/users/${id}`, input)
}

export function lockUserApi(id: string) {
  return apiClient.post<ApiEnvelope<UserListItem>>(`/api/v1/users/${id}/lock`)
}

export function unlockUserApi(id: string) {
  return apiClient.post<ApiEnvelope<UserListItem>>(`/api/v1/users/${id}/unlock`)
}

export function verifyPinApi(input: VerifyPinInput) {
  return apiClient.post<ApiEnvelope<{ ok: true }>>('/api/v1/users/verify-pin', input)
}
