import { MutationObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logoutMutationOptions } from '@/features/auth/use-logout'
import { useAuthStore } from '@/stores/use-auth-store'

import { queryClient } from './query-client'

vi.mock('@/features/auth/auth-api', () => ({
  logoutApi: vi.fn(),
  isNetworkError: () => false,
}))

const { logoutApi } = await import('@/features/auth/auth-api')

const OWNER = {
  id: '11111111-1111-4111-8111-111111111111',
  storeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Chủ cửa hàng A',
  phone: null,
  role: 'owner' as const,
}

/**
 * C-01: sau khi chủ cửa hàng A đăng xuất, người đăng nhập kế tiếp trên cùng máy không được
 * thấy lại báo cáo hay dữ liệu của A, dù từ React Query trong bộ nhớ hay từ api-cache mà
 * service worker cũ để lại.
 */
describe('đăng xuất dọn dữ liệu phiên (C-01)', () => {
  const cacheDelete = vi.fn(async () => true)

  beforeEach(() => {
    vi.stubGlobal('caches', { delete: cacheDelete })
    cacheDelete.mockClear()
    useAuthStore.getState().setAuth({ user: OWNER, accessToken: 'token-a' })
    queryClient.setQueryData(['reports', 'revenue'], { total: 15_000_000 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    queryClient.clear()
  })

  async function logout() {
    const observer = new MutationObserver(queryClient, logoutMutationOptions)
    return observer.mutate()
  }

  it('xóa api-cache, xóa query client và xóa phiên đăng nhập', async () => {
    vi.mocked(logoutApi).mockResolvedValueOnce(undefined)
    await logout()

    expect(cacheDelete).toHaveBeenCalledWith('api-cache')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(queryClient.getQueryData(['reports', 'revenue'])).toBeUndefined()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('vẫn dọn sạch khi gọi API đăng xuất thất bại (mất mạng)', async () => {
    vi.mocked(logoutApi).mockRejectedValueOnce(new Error('NETWORK_ERROR'))
    await expect(logout()).rejects.toThrow('NETWORK_ERROR')

    expect(cacheDelete).toHaveBeenCalledWith('api-cache')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('không lỗi khi trình duyệt không có CacheStorage (HTTP không an toàn)', async () => {
    vi.stubGlobal('caches', undefined)
    vi.mocked(logoutApi).mockResolvedValueOnce(undefined)
    await logout()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})
