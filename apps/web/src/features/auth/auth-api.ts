import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@kiotviet-lite/shared'

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
  return apiClient.get<ApiEnvelope<AuthUser>>('/api/v1/me')
}

export async function refreshApi(): Promise<{ accessToken: string; expiresIn: number } | { error: string } | null> {
  try {
    const response = await apiClient.post<ApiEnvelope<{ accessToken: string; expiresIn: number }>>(
      '/api/v1/auth/refresh',
      undefined,
      { auth: false, skipRefresh: true },
    )
    return response.data
  } catch (err: any) {
    if (err.message === 'Không thể kết nối đến máy chủ') {
      return { error: 'network' }
    }
    return null
  }
}
