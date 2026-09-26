import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFLINE_DB_STATUS_CHANNEL, waitForOtherConnectionsClosed } from './offline-db-status'
import {
  closePGlite,
  getOfflineDB,
  OFFLINE_DB_DIR,
  OFFLINE_DB_LEGACY_TAB_MESSAGE,
  OFFLINE_DB_NOT_READY_MESSAGE,
  OFFLINE_DB_RELOAD_MESSAGE,
  OFFLINE_DB_SCHEMA_VERSION,
  OFFLINE_DB_WORKER_ID,
  supportsSharedWorkerDB,
} from './pglite'

const create = vi.hoisted(() => vi.fn())
vi.mock('@electric-sql/pglite/worker', () => ({ PGliteWorker: { create } }))

/** Worker giả: ghi lại tham số tạo, cho bài kiểm phát sự kiện `message` và `error` */
class FakeWorker {
  static created: FakeWorker[] = []
  static readsType = true
  readonly listeners = new Map<string, Array<(event: unknown) => void>>()
  readonly terminate = vi.fn()
  readonly options: WorkerOptions | undefined

  constructor(
    readonly url: string | URL,
    options?: WorkerOptions,
  ) {
    // Trình duyệt hỗ trợ worker module mới đọc tùy chọn `type`
    this.options = FakeWorker.readsType ? { type: options?.type } : undefined
    if (url !== 'data:,') FakeWorker.created.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emit(type: string, event: unknown = { preventDefault() {} }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

/** PGliteWorker giả trả lời phiên bản schema `version` */
function fakePGlite(version = OFFLINE_DB_SCHEMA_VERSION) {
  const leaderChange: Array<() => void> = []
  const pglite = {
    version,
    query: vi.fn(async () => ({ rows: [{ version: pglite.version }] })),
    close: vi.fn(async () => {}),
    onLeaderChange: (cb: () => void) => {
      leaderChange.push(cb)
      return () => {}
    },
    changeLeader: () => leaderChange.forEach((cb) => cb()),
  }
  return pglite
}

beforeEach(() => {
  FakeWorker.created = []
  FakeWorker.readsType = true
  create.mockReset()
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { locks: {}, onLine: true })
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(async () => {
  await closePGlite()
  vi.unstubAllGlobals()
})

describe('OFF-04: PGliteWorker dùng chung giữa các bản build', () => {
  it('tạo worker module với id cố định, không phụ thuộc tên tệp worker có mã băm', async () => {
    const pglite = fakePGlite()
    create.mockResolvedValue(pglite)

    await expect(getOfflineDB(1000)).resolves.toBe(pglite)

    expect(FakeWorker.created).toHaveLength(1)
    expect(FakeWorker.created[0]!.options).toEqual({ type: 'module' })
    expect(create).toHaveBeenCalledWith(FakeWorker.created[0], {
      dataDir: OFFLINE_DB_DIR,
      id: OFFLINE_DB_WORKER_ID,
    })
  })

  it('tab chủ chạy schema khác bản của tab này: báo cần tải lại trang, không trả kết nối để ghi', async () => {
    const pglite = fakePGlite(OFFLINE_DB_SCHEMA_VERSION - 1)
    create.mockResolvedValue(pglite)

    await expect(getOfflineDB(1000)).rejects.toThrow(OFFLINE_DB_RELOAD_MESSAGE)
    expect(OFFLINE_DB_RELOAD_MESSAGE).toContain('cần tải lại trang')

    // Tab chủ cũ đóng, tab chủ mới đã nâng schema: kiểm lại và dùng được
    pglite.version = OFFLINE_DB_SCHEMA_VERSION
    pglite.changeLeader()
    await expect(getOfflineDB(1000)).resolves.toBe(pglite)
  })

  it('tab chủ mới chạy bản cũ hơn sau khi tab chủ cũ đóng: kiểm lại và chặn ghi', async () => {
    const pglite = fakePGlite()
    create.mockResolvedValue(pglite)
    await expect(getOfflineDB(1000)).resolves.toBe(pglite)

    pglite.version = OFFLINE_DB_SCHEMA_VERSION + 1
    pglite.changeLeader()
    await expect(getOfflineDB(1000)).rejects.toThrow(OFFLINE_DB_RELOAD_MESSAGE)
  })
})

describe('OFF-04: hạn giờ bao cả bước tạo worker (MAJOR 2)', () => {
  it('module worker không nạp được (sự kiện error): báo lỗi ngay, hủy worker, lần sau tạo worker mới', async () => {
    create.mockReturnValue(new Promise(() => {}))

    const pending = getOfflineDB(5_000)
    await vi.waitFor(() => expect(FakeWorker.created).toHaveLength(1))
    FakeWorker.created[0]!.emit('error')

    await expect(pending).rejects.toThrow(OFFLINE_DB_NOT_READY_MESSAGE)
    expect(FakeWorker.created[0]!.terminate).toHaveBeenCalled()

    create.mockResolvedValue(fakePGlite())
    await expect(getOfflineDB(1000)).resolves.toBeDefined()
    expect(FakeWorker.created).toHaveLength(2)
  })

  it('worker im lặng tới hết hạn (chưa nạp xong module): báo lỗi và hủy worker', async () => {
    create.mockReturnValue(new Promise(() => {}))

    await expect(getOfflineDB(30)).rejects.toThrow(OFFLINE_DB_NOT_READY_MESSAGE)
    expect(FakeWorker.created[0]!.terminate).toHaveBeenCalled()
  })

  it('worker đã chạy nhưng đang chờ mở cơ sở dữ liệu: báo lỗi, giữ worker để nó tự mở tiếp', async () => {
    create.mockReturnValue(new Promise(() => {}))

    const pending = getOfflineDB(300)
    pending.catch(() => {})
    await vi.waitFor(() => expect(FakeWorker.created).toHaveLength(1), { interval: 5 })
    FakeWorker.created[0]!.emit('message', { data: { type: 'here' } })

    await expect(pending).rejects.toThrow(OFFLINE_DB_NOT_READY_MESSAGE)
    expect(FakeWorker.created[0]!.terminate).not.toHaveBeenCalled()
    // Lần gọi sau dùng lại worker đang mở, không tạo thêm
    await expect(getOfflineDB(30)).rejects.toThrow()
    expect(FakeWorker.created).toHaveLength(1)
  })

  it('worker chủ báo có tab bản cũ giữ cơ sở dữ liệu: hết hạn thì nói rõ cần đóng tab đó', async () => {
    create.mockReturnValue(new Promise(() => {}))
    const pending = getOfflineDB(300)
    pending.catch(() => {})
    await vi.waitFor(() => expect(FakeWorker.created).toHaveLength(1), { interval: 5 })
    FakeWorker.created[0]!.emit('message', { data: { type: 'here' } })

    const channel = new BroadcastChannel(OFFLINE_DB_STATUS_CHANNEL)
    channel.postMessage({ type: 'legacy-tab-open' })
    channel.close()

    await expect(pending).rejects.toThrow(OFFLINE_DB_LEGACY_TAB_MESSAGE)
  })

  it('trình duyệt không hỗ trợ worker module thì không dùng worker dùng chung', () => {
    expect(supportsSharedWorkerDB()).toBe(true)
    FakeWorker.readsType = false
    expect(supportsSharedWorkerDB()).toBe(false)
  })
})

/**
 * IndexedDB giả đủ cho waitForOtherConnectionsClosed: `openConnections` là số kết nối tab khác đang
 * giữ; mở với phiên bản cao hơn thì báo blocked tới khi các kết nối đó đóng.
 */
function fakeIndexedDB(existing: { name: string; version: number } | null, openConnections = 0) {
  let connections = openConnections
  let waiting: (() => void) | null = null
  const opened: number[] = []
  const factory = {
    databases: async () => (existing ? [existing] : []),
    open: (_name: string, version: number) => {
      opened.push(version)
      const request = {
        transaction: { abort: vi.fn() },
        result: { close: vi.fn() },
      } as unknown as IDBOpenDBRequest & { transaction: { abort: () => void } }
      const upgrade = () => {
        request.onupgradeneeded?.({} as IDBVersionChangeEvent)
        expect(request.transaction.abort).toHaveBeenCalled()
        request.onerror?.({ preventDefault() {} } as unknown as Event)
      }
      queueMicrotask(() => {
        if (connections > 0) {
          request.onblocked?.({} as IDBVersionChangeEvent)
          waiting = upgrade
        } else {
          upgrade()
        }
      })
      return request
    },
  }
  return {
    factory: factory as unknown as IDBFactory,
    opened,
    closeOtherTabs: () => {
      connections = 0
      waiting?.()
    },
  }
}

describe('OFF-04 chuyển tiếp: tab bản cũ mở PGlite thẳng, không khóa', () => {
  const NAME = '/pglite/kiotviet-lite'

  it('không có tab khác giữ cơ sở dữ liệu: đi tiếp ngay, hủy bước nâng cấp nên phiên bản giữ nguyên', async () => {
    const idb = fakeIndexedDB({ name: NAME, version: 21 })
    const onBlocked = vi.fn()

    await waitForOtherConnectionsClosed(idb.factory, NAME, onBlocked)

    expect(onBlocked).not.toHaveBeenCalled()
    expect(idb.opened).toEqual([22])
  })

  it('tab bản cũ còn giữ kết nối: báo và chờ tới khi tab đó đóng', async () => {
    const idb = fakeIndexedDB({ name: NAME, version: 21 }, 1)
    const onBlocked = vi.fn()
    let done = false

    const waiting = waitForOtherConnectionsClosed(idb.factory, NAME, onBlocked).then(() => {
      done = true
    })
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(done).toBe(false)

    idb.closeOtherTabs()
    await waiting
    expect(done).toBe(true)
  })

  it('máy chưa từng mở cơ sở dữ liệu ngoại tuyến: không mở gì cả', async () => {
    const idb = fakeIndexedDB(null)
    await waitForOtherConnectionsClosed(idb.factory, NAME, vi.fn())
    expect(idb.opened).toEqual([])
  })
})
