import { useAuthStore } from '@/stores/use-auth-store'

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeRequestId(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null
}

type DiagnosticKind =
  | 'render_error'
  | 'offline_sync_error'
  | 'incremental_sync_error'
  | 'request_network_error'
  | 'response_parse_error'

interface BrowserDiagnostic {
  kind: DiagnosticKind
  requestId?: string
  clientId?: string
  status?: number
  code?: string
}

const DIAGNOSTIC_KEY = 'kiotviet-browser-diagnostics'
const MAX_DIAGNOSTICS = 50
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
let queuedDiagnostics: BrowserDiagnostic[] | null = null
let flushPromise: Promise<void> | null = null

function cleanDiagnostic(value: unknown): BrowserDiagnostic | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (
    item.kind !== 'render_error' &&
    item.kind !== 'offline_sync_error' &&
    item.kind !== 'incremental_sync_error' &&
    item.kind !== 'request_network_error' &&
    item.kind !== 'response_parse_error'
  ) {
    return null
  }
  return {
    kind: item.kind,
    ...(typeof item.requestId === 'string' && safeRequestId(item.requestId)
      ? { requestId: item.requestId }
      : {}),
    ...(typeof item.clientId === 'string' && safeRequestId(item.clientId)
      ? { clientId: item.clientId }
      : {}),
    ...(typeof item.status === 'number' &&
    Number.isInteger(item.status) &&
    item.status >= 100 &&
    item.status <= 599
      ? { status: item.status }
      : {}),
    ...(typeof item.code === 'string' && CODE_PATTERN.test(item.code) ? { code: item.code } : {}),
  }
}

function pendingDiagnostics(): BrowserDiagnostic[] {
  if (queuedDiagnostics) return queuedDiagnostics
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) ?? '[]')
    queuedDiagnostics = Array.isArray(saved)
      ? saved.slice(-MAX_DIAGNOSTICS).flatMap((item: unknown) => {
          const clean = cleanDiagnostic(item)
          return clean ? [clean] : []
        })
      : []
  } catch {
    queuedDiagnostics = []
  }
  return queuedDiagnostics
}

function persistDiagnostics(): void {
  try {
    localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(pendingDiagnostics()))
  } catch {
    // Best effort while storage is unavailable; keep this session's bounded queue.
  }
}

function flushBrowserDiagnostics(): void {
  if (flushPromise || (typeof navigator !== 'undefined' && !navigator.onLine)) return
  const token = useAuthStore.getState().accessToken
  if (!token || pendingDiagnostics().length === 0) return

  flushPromise = (async () => {
    while (pendingDiagnostics().length > 0 && navigator.onLine) {
      if (useAuthStore.getState().accessToken !== token) break
      const item = pendingDiagnostics()[0]!
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/client-diagnostics`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Request-Id': crypto.randomUUID(),
          },
          body: JSON.stringify(item),
        })
        // 400 means the server will never accept this item; drop it so it cannot block the queue.
        if (!response.ok && response.status !== 400) break
        const index = pendingDiagnostics().indexOf(item)
        if (index !== -1) pendingDiagnostics().splice(index, 1)
        persistDiagnostics()
      } catch {
        // Deferred until connectivity or an authenticated API request succeeds.
        break
      }
    }
  })().finally(() => {
    flushPromise = null
  })
}

export function queueBrowserDiagnostic(diagnostic: BrowserDiagnostic): void {
  const clean = cleanDiagnostic(diagnostic)
  if (!clean) return
  const queue = pendingDiagnostics()
  queue.push(clean)
  if (queue.length > MAX_DIAGNOSTICS) queue.splice(0, queue.length - MAX_DIAGNOSTICS)
  persistDiagnostics()
  flushBrowserDiagnostics()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushBrowserDiagnostics)
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly requestId: string | null

  constructor(status: number, body: ApiErrorBody, requestId?: string | null) {
    const id = safeRequestId(requestId ?? null)
    super(id ? `${body.message} (Mã yêu cầu: ${id})` : body.message)
    this.status = status
    this.code = body.code
    this.details = body.details
    this.requestId = id
  }
}

/** Safe browser diagnostics; HTTP failures are already logged on the API. */
export function reportBrowserFailure(
  event: 'incremental_sync' | 'auto_sync' | 'manual_sync' | 'order_sync',
  error: unknown,
  clientId?: string,
): string {
  const apiError = error instanceof ApiClientError ? error : null
  const requestId = apiError?.requestId ?? crypto.randomUUID()
  const status = apiError?.status ?? 0
  const code = apiError && CODE_PATTERN.test(apiError.code) ? apiError.code : 'CLIENT_ERROR'
  console.warn('Browser diagnostic', {
    event,
    ...(clientId && UUID_PATTERN.test(clientId) ? { clientId } : {}),
    status,
    code,
    requestId,
  })
  if (!apiError || (apiError.status === 0 && apiError.code !== 'NETWORK_ERROR')) {
    queueBrowserDiagnostic({
      kind: event === 'incremental_sync' ? 'incremental_sync_error' : 'offline_sync_error',
      requestId,
      ...(clientId && UUID_PATTERN.test(clientId) ? { clientId } : {}),
      code,
    })
  }
  return requestId
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
  skipRefresh?: boolean
  /** R4: gửi kèm header Idempotency-Key, gửi lại cùng khóa không tạo chứng từ thứ hai */
  idempotencyKey?: string
  /** R4: chỉ chỗ kiểm tra khi không rõ máy chủ đã lưu chưa, ví dụ "Xem danh sách phiếu thu" */
  unknownOutcomeHint?: string
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
// 502, 504: nginx mất kết nối hoặc hết giờ chờ API; 524: Cloudflare hết giờ chờ nginx
const GATEWAY_STATUSES = new Set([502, 504, 524])

/**
 * R4 (UX-03): request ghi đã gửi đi nhưng không nhận được phản hồi thì máy chủ có thể đã lưu.
 * Không báo "không kết nối được" như thể chưa có gì xảy ra, mà nói rõ là chưa biết kết quả.
 */
function unknownOutcomeMessage({ idempotencyKey, unknownOutcomeHint }: RequestOptions): string {
  const base = 'Chưa rõ đã lưu hay chưa vì mất kết nối tới máy chủ.'
  if (idempotencyKey) {
    return `${base} Giữ nguyên nội dung và bấm lưu lại: nếu lần trước đã lưu, hệ thống trả lại đúng chứng từ đó, không tạo bản trùng.`
  }
  return `${base} ${unknownOutcomeHint ?? 'Vui lòng kiểm tra lại danh sách trước khi thao tác lại.'}`
}

function isUnsafeRequest(options: RequestOptions): boolean {
  return !SAFE_METHODS.has((options.method ?? 'GET').toUpperCase())
}

/** Cổng trung gian hết thời gian chờ hay mất kết nối tới API: request ghi có thể đã chạy xong. */
function gatewayUnknownOutcome(
  res: Response,
  options: RequestOptions,
  requestId?: string,
): ApiClientError | null {
  if (!isUnsafeRequest(options) || !GATEWAY_STATUSES.has(res.status)) return null
  return new ApiClientError(
    res.status,
    {
      code: 'NETWORK_ERROR',
      message: unknownOutcomeMessage(options),
      details: { outcomeUnknown: true },
    },
    requestId,
  )
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const requestId = crypto.randomUUID()
        let res: Response
        try {
          res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Request-Id': requestId },
          })
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            queueBrowserDiagnostic({
              kind: 'request_network_error',
              requestId,
              code: 'NETWORK_ERROR',
            })
          }
          throw error
        }
        if (!res.ok) {
          useAuthStore.getState().clearAuth()
          window.location.href = '/login'
          return false
        }
        const json = (await res.json()) as { data: { accessToken: string; expiresIn: number } }
        useAuthStore.getState().setAccessToken(json.data.accessToken)
        flushBrowserDiagnostics()
        return true
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    auth = true,
    skipRefresh = false,
    headers,
    idempotencyKey,
    unknownOutcomeHint,
    ...rest
  } = options
  const requestId = crypto.randomUUID()
  const finalHeaders = new Headers(headers)
  finalHeaders.set('X-Request-Id', requestId)
  if (idempotencyKey) finalHeaders.set('Idempotency-Key', idempotencyKey)
  if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (auth) {
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      finalHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    queueBrowserDiagnostic({ kind: 'request_network_error', requestId, code: 'NETWORK_ERROR' })
    throw new ApiClientError(
      0,
      isUnsafeRequest(options)
        ? {
            code: 'NETWORK_ERROR',
            message: unknownOutcomeMessage({ idempotencyKey, unknownOutcomeHint }),
            details: { outcomeUnknown: true },
          }
        : { code: 'NETWORK_ERROR', message: 'Không thể kết nối đến máy chủ' },
      requestId,
    )
  }
  const receivedRequestId = safeRequestId(res.headers.get('X-Request-Id')) ?? requestId

  if (res.status === 401 && auth && !skipRefresh) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefresh: true })
    }
  }

  if (res.status === 204) {
    flushBrowserDiagnostics()
    return undefined as T
  }

  let text: string
  try {
    text = await res.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    queueBrowserDiagnostic({
      kind: 'request_network_error',
      requestId: receivedRequestId,
      status: res.status,
      code: 'NETWORK_ERROR',
    })
    throw new ApiClientError(
      res.status,
      isUnsafeRequest(options) && res.ok
        ? {
            code: 'NETWORK_ERROR',
            message: unknownOutcomeMessage(options),
            details: { outcomeUnknown: true },
          }
        : { code: 'NETWORK_ERROR', message: 'Không thể đọc phản hồi từ máy chủ' },
      receivedRequestId,
    )
  }
  let json: unknown = null
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      const unknown = gatewayUnknownOutcome(res, options, receivedRequestId)
      if (unknown) throw unknown
      if (res.ok) {
        queueBrowserDiagnostic({
          kind: 'response_parse_error',
          requestId: receivedRequestId,
          status: res.status,
          code: 'INVALID_RESPONSE',
        })
      }
      throw new ApiClientError(
        res.status,
        { code: 'INTERNAL_ERROR', message: 'Server trả response không hợp lệ' },
        receivedRequestId,
      )
    }
  }

  if (!res.ok) {
    if (!(json as { error?: ApiErrorBody } | null)?.error) {
      const unknown = gatewayUnknownOutcome(res, options, receivedRequestId)
      if (unknown) throw unknown
    }
    const errBody = (json as { error?: ApiErrorBody } | null)?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi không xác định',
    }
    throw new ApiClientError(res.status, errBody, receivedRequestId)
  }

  flushBrowserDiagnostics()
  return json as T
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
