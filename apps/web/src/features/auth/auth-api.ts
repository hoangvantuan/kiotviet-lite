import type { AuthResponse, LoginInput, RegisterInput } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export function registerApi(input: RegisterInput) {
  return apiClient.post<ApiEnvelope<AuthResponse>>('/api/v1/auth/register', input, { auth: false })
}

export function loginApi(input: LoginInput) {
  return apiClient.post<ApiEnvelope<AuthResponse>>('/api/v1/auth/login', input, { auth: false })
}

export function logoutApi() {
  return apiClient.post<void>('/api/v1/auth/logout', undefined, { auth: false })
}

export function meApi() {
  return apiClient.get<ApiEnvelope<{ userId: string; storeId: string; role: string }>>('/api/v1/me')
}
