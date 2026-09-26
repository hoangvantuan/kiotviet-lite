import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/use-auth-store'

import {
  ApiClientError,
  apiFetch,
  clearBrowserDiagnostics,
  LONG_REQUEST_TIMEOUT_MS,
  queueBrowserDiagnostic,
  REFRESH_UNAVAILABLE_MESSAGE,
  REQUEST_TIMEOUT_MS,
} from './api-client'

const SERVER_ID = 'c85c283b-6907-4195-a75b-f7d2a54c35f9'
const STORE_A = '0199aa00-0000-7000-8000-00000000000a'
const STORE_B = '0199aa00-0000-7000-8000-00000000000b'

function signIn(storeId: string, accessToken = 'test-token') {
  useAuthStore.setState({
    accessToken,
    user: { id: crypto.randomUUID(), storeId, name: 'Thu ngân', phone: null, role: 'staff' },
  })
}

beforeEach(() => {
  clearBrowserDiagnostics()
  signIn(STORE_A)
  vi.stubGlobal('navigator', { onLine: true })
})

describe('apiFetch request correlation', () => {
  it('uses a safe response ID on a non-JSON error without reporting an HTTP failure twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>unavailable</html>', {
        status: 503,
        headers: { 'X-Request-Id': SERVER_ID },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/v1/products')).rejects.toMatchObject({
      status: 503,
      code: 'INTERNAL_ERROR',
      requestId: SERVER_ID,
    })
    expect((fetchMock.mock.calls[0]![1].headers as Headers).get('X-Request-Id')).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the sent ID if a response exposes an unsafe value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Conflict' } }), {
        status: 409,
        headers: { 'X-Request-Id': 'private-customer-info' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    let error: unknown
    try {
      await apiFetch('/api/v1/products')
    } catch (caught) {
      error = caught
    }
    const sentId = (fetchMock.mock.calls[0]![1].headers as Headers).get('X-Request-Id')
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).requestId).toBe(sentId)
    expect((error as ApiClientError).message).toContain(`Mã yêu cầu: ${sentId}`)
    expect((error as ApiClientError).message).not.toContain('private-customer-info')
  })

  it('reports an invalid successful response without storing its body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('private customer payload', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/v1/products')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const diagnostic = fetchMock.mock.calls[1]![1].body as string
    expect(JSON.parse(diagnostic)).toMatchObject({
      kind: 'response_parse_error',
      status: 200,
      code: 'INVALID_RESPONSE',
    })
    expect(diagnostic).not.toContain('private customer payload')
  })

  it('defers a safe network diagnostic offline and sends it after a successful API call', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('sensitive network detail'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    let error: unknown
    try {
      await apiFetch('/api/v1/sync/push', { method: 'POST', body: { secret: 'not logged' } })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('NETWORK_ERROR')
    expect((error as ApiClientError).requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.stubGlobal('navigator', { onLine: true })
    expect(await apiFetch('/api/v1/products')).toEqual({ data: true })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[2]![0]).toMatch(/\/api\/v1\/client-diagnostics$/)
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body as string)).toEqual({
      kind: 'request_network_error',
      requestId: (error as ApiClientError).requestId,
      code: 'NETWORK_ERROR',
    })
  })
})

describe('R4 UX-03: request ghi mất phản hồi báo "chưa rõ đã lưu hay chưa"', () => {
  it('POST có Idempotency-Key bị mất kết nối: nói rõ lưu lại an toàn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await apiFetch('/api/v1/receipts', {
      method: 'POST',
      body: {},
      idempotencyKey: '5b3c1e7a-0b7e-4d5e-9d61-3c1f0d7c2a11',
    }).catch((e: unknown) => e)

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', details: { outcomeUnknown: true } })
    expect((error as ApiClientError).message).toContain('Chưa rõ đã lưu hay chưa')
    expect((error as ApiClientError).message).toContain('không tạo bản trùng')
  })

  it('POST không có khóa: chỉ chỗ kiểm tra trước khi thao tác lại', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await apiFetch('/api/v1/customers', {
      method: 'POST',
      body: {},
      unknownOutcomeHint: 'Xem lại danh sách khách hàng.',
    }).catch((e: unknown) => e)

    expect((error as ApiClientError).message).toContain('Chưa rõ đã lưu hay chưa')
    expect((error as ApiClientError).message).toContain('Xem lại danh sách khách hàng.')
  })

  it('nginx trả 504 cho POST: cũng là chưa rõ kết quả', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>504 Gateway Time-out</html>', { status: 504 })),
    )

    const error = await apiFetch('/api/v1/pos/orders', {
      method: 'POST',
      body: {},
      idempotencyKey: '5b3c1e7a-0b7e-4d5e-9d61-3c1f0d7c2a11',
    }).catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 504, details: { outcomeUnknown: true } })
  })

  it('GET mất kết nối giữ thông báo cũ, không gửi Idempotency-Key', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiFetch('/api/v1/products').catch((e: unknown) => e)

    expect((error as ApiClientError).message).toContain('Không thể kết nối đến máy chủ')
    expect((fetchMock.mock.calls[0]![1].headers as Headers).get('Idempotency-Key')).toBeNull()
  })
})

describe('apiFetch 401 do PIN sai (POS-10)', () => {
  it('không làm mới phiên và không gửi lại request, một lần nhập sai chỉ tính một lần', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Mã PIN không đúng',
            details: { remaining: 4, reason: 'pin_invalid' },
          },
        }),
        { status: 401 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch('/api/v1/users/verify-pin', { method: 'POST', body: { pin: '000000' } }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 do token hết hạn vẫn làm mới phiên rồi gửi lại', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Token đã hết hạn',
              details: { reason: 'expired' },
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { accessToken: 'new-token', user: null } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/v1/products').catch(() => undefined)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/refresh')
  })
})

describe('OFF-03: làm mới phiên không tới được máy chủ', () => {
  const expired = () =>
    new Response(
      JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập đã hết hạn' },
      }),
      { status: 401 },
    )

  it('mất mạng lúc làm mới: báo mất kết nối, không báo phiên hết hạn, giữ phiên', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(expired())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiFetch('/api/v1/sync/push', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
    expect((error as ApiClientError).message).toContain(REFRESH_UNAVAILABLE_MESSAGE)
    expect((error as ApiClientError).message).not.toContain('hết hạn')
    expect(useAuthStore.getState().accessToken).toBe('test-token')
  })

  it('máy chủ lỗi 502 lúc làm mới: cũng là lỗi tạm thời', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/v1/products')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})

describe('OFF-22: chẩn đoán trình duyệt gắn với cửa hàng', () => {
  it('chẩn đoán ghi khi cửa hàng A đăng nhập không được gửi bằng token của cửa hàng B', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    queueBrowserDiagnostic({ kind: 'offline_sync_error', requestId: SERVER_ID, code: 'X' })

    signIn(STORE_B, 'token-b')
    vi.stubGlobal('navigator', { onLine: true })
    await apiFetch('/api/v1/products')

    await new Promise((r) => setTimeout(r, 10))
    const diagnosticCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/v1/client-diagnostics'),
    )
    expect(diagnosticCalls).toHaveLength(0)
  })

  it('cùng cửa hàng thì gửi, và không gửi storeId lên máy chủ', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    queueBrowserDiagnostic({ kind: 'offline_sync_error', requestId: SERVER_ID, code: 'X' })

    vi.stubGlobal('navigator', { onLine: true })
    await apiFetch('/api/v1/products')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body as string)
    expect(body).toEqual({ kind: 'offline_sync_error', requestId: SERVER_ID, code: 'X' })
  })

  it('đăng xuất xóa hàng chẩn đoán chưa gửi', () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    })
    vi.stubGlobal('navigator', { onLine: false })
    queueBrowserDiagnostic({ kind: 'offline_sync_error', requestId: SERVER_ID, code: 'X' })
    expect(stored.get('kiotviet-browser-diagnostics')).toContain(SERVER_ID)

    clearBrowserDiagnostics()
    expect(stored.has('kiotviet-browser-diagnostics')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('OFF-06: có Wi-Fi nhưng không tới được máy chủ, request phải hết giờ', () => {
  /** fetch treo tới khi bị hủy, như kết nối không có phản hồi */
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        }),
    )
  }

  it('POST tạo đơn hết giờ: NETWORK_ERROR, chưa rõ kết quả, có cờ timeout', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', hangingFetch())
      const pending = apiFetch('/api/v1/pos/orders', {
        method: 'POST',
        body: {},
        idempotencyKey: '5b3c1e7a-0b7e-4d5e-9d61-3c1f0d7c2a11',
      }).catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      const error = await pending
      expect(error).toBeInstanceOf(ApiClientError)
      expect(error).toMatchObject({
        status: 0,
        code: 'NETWORK_ERROR',
        details: { outcomeUnknown: true, timeout: true },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('GET hết giờ theo timeoutMs riêng: NETWORK_ERROR, không phải lỗi hủy', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', hangingFetch())
      const pending = apiFetch('/api/v1/pos/products/search?q=a', { timeoutMs: 3_000 }).catch(
        (e: unknown) => e,
      )
      await vi.advanceTimersByTimeAsync(3_000)
      const error = await pending
      expect(error).toMatchObject({ code: 'NETWORK_ERROR', details: { timeout: true } })
      expect((error as ApiClientError).message).toContain('Máy chủ không phản hồi')
    } finally {
      vi.useRealTimers()
    }
  })

  it('request nặng (nhập bảng giá, đẩy hàng chờ) chờ lâu hơn mặc định mà không bị coi là mất mạng', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              setTimeout(
                () => resolve(new Response(JSON.stringify({ data: 1 }), { status: 200 })),
                REQUEST_TIMEOUT_MS + 10_000,
              )
            }),
        ),
      )
      const pending = apiFetch('/api/v1/sync/push', {
        method: 'POST',
        body: {},
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      })
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10_000)
      await expect(pending).resolves.toEqual({ data: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('nơi gọi tự hủy thì vẫn là lỗi hủy như cũ, không bị đổi thành mất mạng', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()
    const pending = apiFetch('/api/v1/products', { signal: controller.signal }).catch(
      (e: unknown) => e,
    )
    controller.abort(new DOMException('hủy', 'AbortError'))
    const error = await pending
    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe('AbortError')
  })
})
