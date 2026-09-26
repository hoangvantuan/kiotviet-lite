/**
 * OFF-02: đồng bộ đơn ngoại tuyến tự chạy, không cần bấm.
 *
 * Kích hoạt: mở app (hay đăng nhập), sự kiện `online`, và định kỳ khi còn đơn chờ hoặc máy chủ
 * chưa tới được. Mỗi lượt thăm dò máy chủ có hạn giờ trước, vì `navigator.onLine` chỉ nói máy có
 * mạng, không nói máy chủ có tới được không.
 *
 * Nhiều tab: chỉ tab giữ khóa `kvl-sync-leader` lên lịch định kỳ; mọi lượt đẩy (tự động hay bấm
 * tay, ở tab nào) chạy trong khóa `kvl-sync-cycle` nên không bao giờ có hai tab cùng đẩy. Tab
 * khác biết kết quả qua BroadcastChannel (offline-channel.ts).
 */
import type { PGliteInterface } from '@electric-sql/pglite'

import { meApi, refreshApi } from '@/features/auth/auth-api'
import { useAuthStore } from '@/stores/use-auth-store'
import { type Connectivity, useOfflineStore } from '@/stores/use-offline-store'

import { API_BASE_URL } from './api-client'
import { onOfflineBroadcast } from './offline-channel'
import { purgeSyncedOrders, refreshOutboxCounts } from './offline-orders'
import { clearOfflineStoreData } from './offline-store-data'
import { pushPendingOrders } from './order-sync'
import { getOfflineDB } from './pglite'

export const SYNC_LEADER_LOCK = 'kvl-sync-leader'
export const SYNC_CYCLE_LOCK = 'kvl-sync-cycle'
/** Chu kỳ kiểm tra khi còn đơn chờ; đơn gặp lỗi tạm thời còn có lịch lùi dần riêng */
export const SYNC_INTERVAL_MS = 15_000
export const HEALTH_PROBE_TIMEOUT_MS = 5_000
/** Cửa hàng có dữ liệu đang nằm trong PGlite, để biết khi nào đổi cửa hàng (OFF-05) */
export const OFFLINE_DATA_STORE_KEY = 'kvl:offline-data-store'

export type SyncTrigger = 'startup' | 'online' | 'interval' | 'manual' | 'session'

/** Máy chủ có trả lời trong hạn giờ không (không chạm DB, không cần đăng nhập) */
export async function probeServer(timeoutMs = HEALTH_PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/health/live`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * OFF-03: phiên ngoại tuyến chưa có token. Có mạng lại thì làm mới bằng cookie; cookie hết hạn
 * thì về đăng nhập, đơn chờ vẫn nằm trong PGlite và đồng bộ khi đăng nhập lại.
 */
export async function ensureOnlineSession(): Promise<boolean> {
  const auth = useAuthStore.getState()
  if (!auth.user) return false
  if (auth.accessToken) return true

  const result = await refreshApi()
  if (result.status === 'network_error') return false
  if (result.status === 'unauthenticated') {
    useAuthStore.getState().clearAuth()
    if (typeof window !== 'undefined') window.location.href = '/login'
    return false
  }
  useAuthStore.getState().setAccessToken(result.accessToken)
  try {
    const { data: user } = await meApi()
    useAuthStore.getState().setAuth({ user, accessToken: result.accessToken })
  } catch {
    // Có token là đủ để đẩy đơn; hồ sơ cập nhật ở lượt sau
  }
  return true
}

interface RuntimeDeps {
  getDB: () => Promise<PGliteInterface>
  probe: () => Promise<boolean>
  ensureSession: () => Promise<boolean>
  push: typeof pushPendingOrders
}

const defaultDeps: RuntimeDeps = {
  getDB: getOfflineDB,
  probe: () => probeServer(),
  ensureSession: ensureOnlineSession,
  push: pushPendingOrders,
}

function locks(): LockManager | null {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function readDataStore(): string | null {
  try {
    return localStorage.getItem(OFFLINE_DATA_STORE_KEY)
  } catch {
    return null
  }
}

function writeDataStore(storeId: string | null): void {
  try {
    if (storeId) localStorage.setItem(OFFLINE_DATA_STORE_KEY, storeId)
    else localStorage.removeItem(OFFLINE_DATA_STORE_KEY)
  } catch {
    // localStorage unavailable
  }
}

/** Đăng xuất: PGlite không còn dữ liệu của cửa hàng nào (đơn chờ vẫn giữ) */
export function forgetOfflineDataStore(): void {
  writeDataStore(null)
}

/**
 * Một lượt đồng bộ: thăm dò máy chủ, làm mới phiên nếu cần, rồi đẩy hàng chờ. Trả về kết nối
 * đo được để nơi gọi cập nhật chỉ báo.
 */
export async function runSyncCycle(
  trigger: SyncTrigger,
  deps: RuntimeDeps = defaultDeps,
): Promise<Connectivity> {
  const store = useOfflineStore.getState()
  if (!isBrowserOnline()) {
    store.setConnectivity('offline')
    return 'offline'
  }
  const reachable = await deps.probe()
  if (!reachable) {
    store.setConnectivity('unreachable')
    return 'unreachable'
  }
  store.setConnectivity('online')
  if (!(await deps.ensureSession())) return 'online'

  const pglite = await deps.getDB()
  // Có mạng lại, mở app, hay bấm tay: thử ngay cả đơn đang chờ tới lượt thử lại
  await deps.push(pglite, { ignoreBackoff: trigger !== 'interval' })
  return 'online'
}

let cycleInFlight: Promise<Connectivity> | null = null

/** Chạy một lượt, không chồng lượt trong tab và giữa các tab (khóa `kvl-sync-cycle`) */
export function requestSync(
  trigger: SyncTrigger,
  deps: RuntimeDeps = defaultDeps,
): Promise<Connectivity | null> {
  if (cycleInFlight) return cycleInFlight
  const lockManager = locks()
  const run = () => runSyncCycle(trigger, deps)
  const promise: Promise<Connectivity | null> = lockManager
    ? lockManager
        .request(
          SYNC_CYCLE_LOCK,
          // Tự động: tab khác đang đẩy thì bỏ lượt này. Bấm tay: chờ lượt kia xong rồi chạy.
          { ifAvailable: trigger !== 'manual' },
          async (lock) => (lock ? run() : null),
        )
        // lib.dom khai báo kiểu Promise lồng hai lớp; then() làm phẳng kiểu cho đúng thực tế
        .then((value) => value)
    : run()
  cycleInFlight = promise.then(
    (v) => v ?? useOfflineStore.getState().connectivity,
    () => useOfflineStore.getState().connectivity,
  )
  const clear = () => {
    cycleInFlight = null
  }
  cycleInFlight.then(clear, clear)
  return promise.catch((error: unknown) => {
    console.warn('[offline-sync] lượt đồng bộ lỗi', error)
    return null
  })
}

/**
 * Đổi cửa hàng trên cùng máy (OFF-05): xóa dữ liệu cửa hàng cũ trong PGlite trước khi dùng.
 * Đơn chờ của cửa hàng cũ giữ lại, chỉ được đẩy khi người của cửa hàng đó đăng nhập.
 */
export async function bindOfflineDataToStore(pglite: PGliteInterface, storeId: string) {
  const previous = readDataStore()
  if (previous && previous !== storeId) await clearOfflineStoreData(pglite)
  writeDataStore(storeId)
  await refreshOutboxCounts(pglite)
}

/** Gắn vào ứng dụng một lần (RootComponent). Trả về hàm dừng. */
export function startOfflineSyncRuntime(deps: RuntimeDeps = defaultDeps): () => void {
  let stopped = false
  let isLeader = false
  let timer: ReturnType<typeof setInterval> | null = null
  let releaseLeader: (() => void) | null = null
  const cleanups: Array<() => void> = []

  const tick = () => {
    if (stopped || !isLeader || !useAuthStore.getState().user) return
    const { pendingOrderCount, connectivity } = useOfflineStore.getState()
    if (pendingOrderCount > 0 || connectivity !== 'online') void requestSync('interval', deps)
  }

  const becomeLeader = () => {
    isLeader = true
    timer = setInterval(tick, SYNC_INTERVAL_MS)
    void deps
      .getDB()
      .then((db) => purgeSyncedOrders(db))
      .catch(() => {})
    if (useAuthStore.getState().user) void requestSync('startup', deps)
  }

  const lockManager = locks()
  if (lockManager) {
    void lockManager
      .request(SYNC_LEADER_LOCK, () => {
        if (stopped) return
        becomeLeader()
        // Giữ khóa tới khi tab đóng hoặc runtime dừng
        return new Promise<void>((resolve) => {
          releaseLeader = resolve
        })
      })
      .catch(() => {})
  } else {
    becomeLeader()
  }

  // Người dùng đổi (đăng nhập, phiên ngoại tuyến, đổi cửa hàng): mở PGlite, đọc lại số đơn
  const onUser = (storeId: string | null) => {
    if (!storeId) return
    void deps
      .getDB()
      .then((db) => bindOfflineDataToStore(db, storeId))
      .then(() => {
        if (isLeader) void requestSync('session', deps)
      })
      .catch((error: unknown) => console.warn('[offline-sync] không mở được PGlite', error))
  }
  cleanups.push(
    useAuthStore.subscribe((state, prev) => {
      if (state.user?.storeId !== prev.user?.storeId || state.user?.id !== prev.user?.id) {
        onUser(state.user?.storeId ?? null)
      } else if (state.accessToken && !prev.accessToken && isLeader) {
        // Phiên ngoại tuyến vừa có token: đẩy ngay
        void requestSync('session', deps)
      }
    }),
  )
  onUser(useAuthStore.getState().user?.storeId ?? null)

  if (typeof window !== 'undefined') {
    const handleOnline = () => {
      // Mọi tab đều nghe; khóa lượt bảo đảm chỉ một tab đẩy
      void requestSync('online', deps)
    }
    const handleOffline = () => useOfflineStore.getState().setConnectivity('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    cleanups.push(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    })
  }

  // Tab khác vừa bán, vừa đồng bộ: đọc lại số đơn và trạng thái cho giống nhau (OFF-14)
  cleanups.push(
    onOfflineBroadcast((message) => {
      if (message.type === 'outbox-changed') {
        void deps
          .getDB()
          .then((db) => refreshOutboxCounts(db))
          .catch(() => {})
      } else if (message.type === 'sync-state') {
        const store = useOfflineStore.getState()
        if (message.lastSyncedAt) store.setLastSynced(message.lastSyncedAt)
        if (message.status === 'error' && message.errorMessage) store.setError(message.errorMessage)
        else if (message.status === 'syncing') store.setStatus('syncing')
        else if (store.status !== 'offline') {
          store.setStatus(store.connectivity === 'online' ? 'online' : 'offline')
        }
      }
    }),
  )

  return () => {
    stopped = true
    if (timer) clearInterval(timer)
    releaseLeader?.()
    for (const cleanup of cleanups) cleanup()
  }
}
