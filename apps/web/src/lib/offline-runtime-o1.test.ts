import { MutationObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@kiotviet-lite/shared'

import { describeOfflineState, indicatorAriaLabel } from '@/components/shared/OfflineIndicator'
import { bootAuth } from '@/features/auth/boot-auth'
import { logoutMutationOptions } from '@/features/auth/use-logout'
import { updateBlocker } from '@/pwa/update-gate'
import {
  isLogoutPending,
  loadOfflineProfile,
  OFFLINE_PROFILE_KEY,
  OFFLINE_PROFILE_MAX_AGE_MS,
  useAuthStore,
} from '@/stores/use-auth-store'
import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { apiFetch } from './api-client'
import {
  requestSync,
  runSyncCycle,
  startOfflineSyncRuntime,
  SYNC_INTERVAL_MS,
} from './offline-sync-runtime'
import type { PushOutcome } from './order-sync'
import { queryClient } from './query-client'

const USER: AuthUser = {
  id: '0199aa00-0000-7000-8000-000000000101',
  storeId: '0199aa00-0000-7000-8000-00000000000a',
  name: 'Thu ngân',
  phone: '0901000003',
  role: 'staff',
} as AuthUser

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  clear() {
    this.data.clear()
  }
}

/** Web Locks tối giản: khóa độc quyền, xếp hàng, hỗ trợ ifAvailable (như nhiều tab cùng máy) */
function fakeLocks() {
  const held = new Map<string, Promise<unknown>>()
  return {
    async request(
      name: string,
      optionsOrCb: unknown,
      maybeCb?: (lock: { name: string } | null) => unknown,
    ) {
      const options = (maybeCb ? optionsOrCb : {}) as { ifAvailable?: boolean }
      const cb = (maybeCb ?? optionsOrCb) as (lock: { name: string } | null) => unknown
      if (options.ifAvailable && held.has(name)) return cb(null)
      while (held.has(name)) await held.get(name)!.catch(() => {})
      const run = Promise.resolve().then(() => cb({ name }))
      held.set(name, run)
      try {
        return await run
      } finally {
        held.delete(name)
      }
    },
  }
}

const IDLE: PushOutcome = { synced: 0, errors: 0, retrying: 0, blocked: null }

function baseDeps() {
  return {
    getDB: vi.fn(async () => ({}) as never),
    probe: vi.fn(async () => true),
    ensureSession: vi.fn(async () => true),
    push: vi.fn(async (): Promise<PushOutcome> => IDLE),
    pullCatalog: vi.fn(async () => {}),
  }
}

function deps(overrides: Partial<ReturnType<typeof baseDeps>> = {}) {
  return { ...baseDeps(), ...overrides }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('navigator', { onLine: true })
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    booted: false,
    networkError: false,
    offlineSession: false,
  })
  useOfflineStore.setState({
    status: 'online',
    connectivity: 'online',
    pendingOrderCount: 0,
    errorOrderCount: 0,
    errorMessage: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('OFF-03: tải lại khi mất mạng vẫn vào được phiên bán', () => {
  it('đăng nhập lưu hồ sơ tối thiểu KHÔNG kèm token', () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 'bi-mat-token' })

    const raw = localStorage.getItem(OFFLINE_PROFILE_KEY)!
    expect(raw).not.toContain('bi-mat-token')
    expect(JSON.parse(raw)).toEqual({ user: USER, savedAt: expect.any(Number) })
    expect(loadOfflineProfile()).toEqual(USER)
  })

  it('hồ sơ quá 7 ngày hoặc đã đăng xuất thì không dùng', () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    expect(loadOfflineProfile(Date.now() + OFFLINE_PROFILE_MAX_AGE_MS + 1)).toBeNull()

    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    useAuthStore.getState().clearAuth()
    expect(loadOfflineProfile()).toBeNull()
  })

  it('mở app khi mất mạng: vào phiên ngoại tuyến, không token', async () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await bootAuth()

    expect(useAuthStore.getState()).toMatchObject({
      user: USER,
      accessToken: null,
      isAuthenticated: true,
      booted: true,
      offlineSession: true,
    })
  })

  it('máy chủ 502 lúc mở app cũng không đá về đăng nhập', async () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })))

    await bootAuth()

    expect(useAuthStore.getState()).toMatchObject({ user: USER, offlineSession: true })
  })

  it('cookie hết hạn (401) thì về đăng nhập như cũ', async () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })),
    )

    await bootAuth()

    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false })
  })

  it('mất mạng khi làm mới token giữa phiên: không xóa phiên, không chuyển trang', async () => {
    useAuthStore.getState().setAuth({ user: USER, accessToken: 'het-han' })
    const location = { href: '/pos' }
    vi.stubGlobal('window', { location })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    )

    await expect(apiFetch('/api/v1/products')).rejects.toBeTruthy()

    expect(useAuthStore.getState().user).toEqual(USER)
    expect(location.href).toBe('/pos')
  })
})

describe('OFF-05: đăng xuất khi mất mạng trên máy dùng chung', () => {
  it('lần mở app sau gửi lại lệnh đăng xuất, KHÔNG làm mới phiên người trước', async () => {
    vi.stubGlobal('caches', undefined)
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await new MutationObserver(queryClient, logoutMutationOptions).mutate().catch(() => {})
    expect(isLogoutPending()).toBe(true)
    expect(loadOfflineProfile()).toBeNull()

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await bootAuth()

    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((u) => u.endsWith('/api/v1/auth/logout'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/api/v1/auth/refresh'))).toBe(false)
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false })
    expect(isLogoutPending()).toBe(false)
  })

  it('đăng nhập lại thành công thì bỏ cờ', () => {
    localStorage.setItem('kvl:logout-pending', '1')
    useAuthStore.getState().setAuth({ user: USER, accessToken: 't' })
    expect(isLogoutPending()).toBe(false)
  })
})

describe('OFF-02: lượt đồng bộ tự động', () => {
  it('máy mất mạng: không gọi máy chủ, chỉ báo ngoại tuyến', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const d = deps()

    expect(await runSyncCycle('online', d)).toBe('offline')
    expect(d.probe).not.toHaveBeenCalled()
    expect(useOfflineStore.getState()).toMatchObject({ connectivity: 'offline', status: 'offline' })
  })

  it('có mạng nhưng máy chủ không trả lời trong hạn: trạng thái "không tới được", không đẩy', async () => {
    const d = deps({ probe: vi.fn(async () => false) })

    expect(await runSyncCycle('interval', d)).toBe('unreachable')
    expect(d.push).not.toHaveBeenCalled()
    expect(useOfflineStore.getState().connectivity).toBe('unreachable')
  })

  it('có mạng lại: làm mới phiên rồi đẩy ngay, bỏ qua lịch lùi', async () => {
    useOfflineStore.getState().setConnectivity('offline')
    const d = deps()

    await runSyncCycle('online', d)

    expect(d.ensureSession).toHaveBeenCalled()
    expect(d.push).toHaveBeenCalledWith(expect.anything(), { ignoreBackoff: true })
    expect(useOfflineStore.getState()).toMatchObject({ connectivity: 'online', status: 'online' })
  })

  it('lượt định kỳ tôn trọng lịch lùi; phiên chưa làm mới được thì không đẩy', async () => {
    const d = deps()
    await runSyncCycle('interval', d)
    expect(d.push).toHaveBeenCalledWith(expect.anything(), { ignoreBackoff: false })

    const noSession = deps({ ensureSession: vi.fn(async () => false) })
    await runSyncCycle('online', noSession)
    expect(noSession.push).not.toHaveBeenCalled()
  })

  it('GL-03: bấm "Đồng bộ ngay" thì đẩy đơn rồi kéo danh mục; lượt tự động chỉ đẩy', async () => {
    const order: string[] = []
    const d = deps({
      push: vi.fn(async (): Promise<PushOutcome> => {
        order.push('push')
        return IDLE
      }),
      pullCatalog: vi.fn(async () => {
        order.push('catalog')
      }),
    })
    await runSyncCycle('manual', d)
    expect(order).toEqual(['push', 'catalog'])

    const auto = deps()
    await runSyncCycle('interval', auto)
    await runSyncCycle('online', auto)
    expect(auto.pullCatalog).not.toHaveBeenCalled()
  })

  it('GL-03: kéo danh mục lỗi không làm hỏng lượt đẩy đơn', async () => {
    const d = deps({ pullCatalog: vi.fn(async () => Promise.reject(new Error('502'))) })
    await expect(runSyncCycle('manual', d)).resolves.toBe('online')
    expect(d.push).toHaveBeenCalled()
  })

  it('gọi chồng nhau trong một tab chỉ chạy một lượt', async () => {
    let release!: () => void
    const d = deps({
      push: vi.fn(
        () =>
          new Promise<PushOutcome>((resolve) => {
            release = () => resolve(IDLE)
          }),
      ),
    })

    const first = requestSync('online', d)
    const second = requestSync('manual', d)
    await vi.waitFor(() => expect(d.push).toHaveBeenCalled())
    release()
    await Promise.all([first, second])

    expect(d.push).toHaveBeenCalledTimes(1)
  })

  it('hai tab: chỉ tab giữ khóa leader chạy lịch định kỳ', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { onLine: true, locks: fakeLocks() })
    useAuthStore.setState({ user: USER, accessToken: 't', isAuthenticated: true })
    useOfflineStore.setState({ pendingOrderCount: 3 })
    const tab1 = deps()
    const tab2 = deps()

    const stop1 = startOfflineSyncRuntime(tab1)
    const stop2 = startOfflineSyncRuntime(tab2)
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2 + 10)

    expect(tab1.push.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(tab2.push).not.toHaveBeenCalled()

    // Tab 1 đóng: tab 2 nhận khóa và tiếp tục đồng bộ
    stop1()
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS + 10)
    expect(tab2.push).toHaveBeenCalled()
    stop2()
  })

  it('hết đơn chờ và đang có mạng: lịch định kỳ không gọi máy chủ', async () => {
    vi.useFakeTimers()
    useAuthStore.setState({ user: USER, accessToken: 't', isAuthenticated: true })
    const d = deps()

    const stop = startOfflineSyncRuntime(d)
    await vi.advanceTimersByTimeAsync(10)
    const afterStartup = d.probe.mock.calls.length
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3)
    stop()

    expect(d.probe.mock.calls.length).toBe(afterStartup)
  })
})

describe('OFF-18: chỉ cho tải lại bản mới khi không có giỏ đang mở', () => {
  it('giỏ có hàng hoặc đang đồng bộ thì chặn, giỏ trống thì cho', () => {
    const tabs = useCartStore.getState().tabs
    expect(updateBlocker(tabs, 'online')).toBeNull()
    expect(updateBlocker(tabs, 'syncing')).toMatch(/đồng bộ/)

    const first = Number(Object.keys(tabs)[0])
    const withItem = {
      ...tabs,
      [first]: { ...tabs[first]!, items: [{} as never] },
    }
    expect(updateBlocker(withItem, 'online')).toMatch(/1 đơn bán dở/)
  })
})

describe('OFF-20: chỉ báo có câu giải thích và nhãn đọc màn hình', () => {
  it('ngoại tuyến, không tới được máy chủ có câu giải thích riêng', () => {
    expect(describeOfflineState('offline', 'offline').explanation).toMatch(
      /chế độ ngoại tuyến.*lưu cục bộ.*tự động đồng bộ/,
    )
    expect(describeOfflineState('unreachable', 'offline')).toMatchObject({
      title: 'Không kết nối được máy chủ',
    })
    expect(describeOfflineState('online', 'online').explanation).toBeNull()
  })

  it('nhãn tách số đơn chờ và đơn lỗi', () => {
    expect(
      indicatorAriaLabel({ connectivity: 'offline', status: 'offline', pending: 3, errors: 1 }),
    ).toBe('Đang ngoại tuyến, 3 đơn ngoại tuyến chưa đồng bộ, 1 đơn lỗi')
  })
})
