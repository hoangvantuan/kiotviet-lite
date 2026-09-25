import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/use-auth-store'

import { ApiClientError, apiFetch } from './api-client'

const SERVER_ID = 'c85c283b-6907-4195-a75b-f7d2a54c35f9'

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token' })
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
