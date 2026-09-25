// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient, ApiClientError } from '@/lib/api-client'
import { resetIdempotencyKeysForTest } from '@/lib/idempotency'
import { useAuthStore } from '@/stores/use-auth-store'

import { useDocumentMutation, useGuardedOpenChange } from './use-document-mutation'

interface Payload {
  amount: number
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function sentKeys(fetchMock: ReturnType<typeof vi.fn>): Array<string | null> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/api/v1/things'))
    .map(([, init]) => (init as RequestInit & { headers: Headers }).headers.get('Idempotency-Key'))
}

const created = () =>
  new Response(JSON.stringify({ data: { id: crypto.randomUUID() } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const { result } = renderHook(
    () =>
      useDocumentMutation<{ data: { id: string } }, Payload>({
        intent: 'test.create',
        mutationFn: (payload: Payload, idempotencyKey) =>
          apiClient.post<{ data: { id: string } }>('/api/v1/things', payload, { idempotencyKey }),
      }),
    { wrapper: wrapper(client) },
  )
  return { client, result }
}

async function attempt(
  result: ReturnType<typeof setup>['result'],
  payload: Payload,
): Promise<unknown> {
  let outcome: unknown
  await act(async () => {
    try {
      outcome = await result.current.mutateAsync(payload)
    } catch (error) {
      outcome = error
    }
  })
  return outcome
}

beforeEach(() => {
  sessionStorage.clear()
  resetIdempotencyKeysForTest()
  useAuthStore.setState({
    accessToken: 'test-token',
    user: { id: 'u1', storeId: 's1' } as never,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('R4: vòng đời Idempotency-Key của một ý định lưu', () => {
  it('mất phản hồi rồi bấm lưu lại: cùng khóa, báo "chưa rõ đã lưu"', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    const first = await attempt(result, { amount: 100 })
    expect(first).toBeInstanceOf(ApiClientError)
    expect((first as ApiClientError).code).toBe('NETWORK_ERROR')
    expect((first as ApiClientError).message).toContain('Chưa rõ đã lưu hay chưa')
    expect((first as ApiClientError).message).toContain('không tạo bản trùng')

    await attempt(result, { amount: 100 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k1).toMatch(/^[0-9a-f-]{36}$/)
    expect(k2).toBe(k1)
  })

  it('sửa nội dung thì sinh khóa mới', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    await attempt(result, { amount: 100 })
    await attempt(result, { amount: 150 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k2).not.toBe(k1)
  })

  it('lưu thành công thì bỏ khóa: chứng từ kế tiếp cùng nội dung là chứng từ mới', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(created()).mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    await attempt(result, { amount: 100 })
    await attempt(result, { amount: 100 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k2).not.toBe(k1)
  })

  it('khóa còn sau khi tải lại trang (sessionStorage) và sau khi đóng rồi mở lại form', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)

    const firstForm = setup()
    await attempt(firstForm.result, { amount: 100 })
    // Tải lại trang: bộ nhớ mất, sessionStorage còn
    resetIdempotencyKeysForTest()
    const secondForm = setup()
    await attempt(secondForm.result, { amount: 100 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k2).toBe(k1)
  })

  it('sessionStorage chỉ giữ khóa và giá trị băm, không giữ nội dung (PIN, số tiền)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')))
    const { result } = setup()

    await attempt(result, { amount: 987_654_321 })

    const stored = sessionStorage.getItem('kiotviet-idempotency-keys') ?? ''
    expect(stored).toContain('test.create')
    expect(stored).not.toContain('987654321')
  })

  it('khóa tách theo người dùng: đổi tài khoản không dùng lại khóa cũ', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    await attempt(result, { amount: 100 })
    useAuthStore.setState({ user: { id: 'u2', storeId: 's1' } as never })
    await attempt(result, { amount: 100 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k2).not.toBe(k1)
  })

  it('máy chủ báo khóa đã dùng cho nội dung khác thì lần sau sinh khóa mới', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'BUSINESS_RULE_VIOLATION',
              message: 'Idempotency-Key đã dùng cho một yêu cầu khác',
              details: { reason: 'idempotency_key_reused' },
            },
          }),
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(created())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    await attempt(result, { amount: 100 })
    await attempt(result, { amount: 100 })

    const [k1, k2] = sentKeys(fetchMock)
    expect(k2).not.toBe(k1)
  })

  it('mutation không tạm dừng khi trình duyệt báo mất mạng (networkMode always)', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()

    const outcome = await attempt(result, { amount: 100 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(outcome).toBeInstanceOf(ApiClientError)
    expect(result.current.isPaused).toBe(false)
  })
})

describe('R4: không cho đóng hộp thoại khi đang lưu', () => {
  it('đang lưu thì bỏ qua yêu cầu đóng; lưu xong thì đóng được và dọn mutation tạm dừng', async () => {
    let resolveFetch: (res: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => (resolveFetch = resolve))),
    )
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const onOpenChange = vi.fn()
    const { result } = renderHook(
      () => {
        const mutation = useDocumentMutation<unknown, Payload>({
          intent: 'test.dialog',
          mutationFn: (payload: Payload, idempotencyKey) =>
            apiClient.post('/api/v1/things', payload, { idempotencyKey }),
        })
        return { mutation, close: useGuardedOpenChange(onOpenChange, mutation) }
      },
      { wrapper: wrapper(client) },
    )

    act(() => result.current.mutation.mutate({ amount: 1 }))
    await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
    act(() => result.current.close(false))
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => resolveFetch(created()))
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
    act(() => result.current.close(false))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
