import { useAuthStore } from '@/stores/use-auth-store'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.details = body.details
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
  skipRefresh?: boolean
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) {
          useAuthStore.getState().clearAuth()
          return false
        }
        const json = (await res.json()) as { data: { accessToken: string; expiresIn: number } }
        useAuthStore.getState().setAccessToken(json.data.accessToken)
        return true
      } catch {
        useAuthStore.getState().clearAuth()
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, skipRefresh = false, headers, ...rest } = options
  const finalHeaders = new Headers(headers)
  if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (auth) {
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      finalHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && auth && !skipRefresh) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefresh: true })
    }
  }

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const json: unknown = text.length > 0 ? JSON.parse(text) : null

  if (!res.ok) {
    const errBody = (json as { error?: ApiErrorBody } | null)?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi không xác định',
    }
    throw new ApiClientError(res.status, errBody)
  }

  return json as T
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
