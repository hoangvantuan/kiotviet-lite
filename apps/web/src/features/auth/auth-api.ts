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

export async function refreshApi(): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const API_BASE_URL =
      (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: { accessToken: string; expiresIn: number } }
    return json.data
  } catch {
    return null
  }
}
