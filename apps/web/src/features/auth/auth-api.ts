import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@kiotviet-lite/shared'

import { apiClient, ApiClientError } from '@/lib/api-client'

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

export type RefreshResult =
  | { status: 'ok'; accessToken: string; expiresIn: number }
  | { status: 'unauthenticated' }
  // Không kết nối được máy chủ: khác với "chưa đăng nhập", màn đăng nhập phải báo (UX-15)
  | { status: 'network_error' }

export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'NETWORK_ERROR'
}

export async function refreshApi(): Promise<RefreshResult> {
  try {
    const response = await apiClient.post<ApiEnvelope<{ accessToken: string; expiresIn: number }>>(
      '/api/v1/auth/refresh',
      undefined,
      { auth: false, skipRefresh: true },
    )
    return { status: 'ok', ...response.data }
  } catch (err) {
    // Chỉ 401, 403 mới là "chưa đăng nhập". Máy chủ lỗi 5xx hay cổng trung gian hết giờ là không
    // gọi được máy chủ: không được coi như đã đăng xuất (OFF-03)
    if (isNetworkError(err)) return { status: 'network_error' }
    if (err instanceof ApiClientError && err.status >= 500) return { status: 'network_error' }
    return { status: 'unauthenticated' }
  }
}
