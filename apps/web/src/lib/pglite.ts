import { PGlite, type PGliteInterface } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import * as schema from '@kiotviet-lite/shared/schema'

import { OFFLINE_DB_STATUS_CHANNEL, type OfflineDBStatus } from './offline-db-status'
import { runPGliteMigrations } from './pglite-migrations'

export type PGliteDB = ReturnType<typeof drizzle<typeof schema>>

export const OFFLINE_DB_DIR = 'idb://kiotviet-lite'

let instance: { pglite: PGliteInterface; db: PGliteDB } | null = null
let initialization: Promise<PGliteDB> | null = null

export function createPGliteClient(dataDir?: string) {
  const pglite = new PGlite(dataDir ?? OFFLINE_DB_DIR)

  const db = drizzle(pglite, {
    schema,
    casing: 'snake_case',
  })

  return { pglite, db }
}

export async function initPGliteSchema(pglite: PGliteInterface, migrationSQL: string) {
  await pglite.exec(migrationSQL)
}

/**
 * OFF-04: khóa bầu tab chủ của PGliteWorker. Mặc định thư viện dùng `${import.meta.url}:${dataDir}`,
 * mà tên tệp worker có mã băm theo bản build: tab bản cũ và tab bản mới mỗi bên tự làm chủ, cùng mở
 * `idb://kiotviet-lite` và ghi đè hệ thống tệp của nhau. Id cố định để mọi bản build bầu chung.
 */
export const OFFLINE_DB_WORKER_ID = 'kvl-offline-db'

/** Phiên bản schema PGlite mà mã của bản build này đọc ghi */
export const OFFLINE_DB_SCHEMA_VERSION = Math.max(...pgliteMigrations.map((m) => m.version))

/** Thời gian tối đa chờ PGlite mở xong và trả lời lần đầu trước khi báo lỗi cho người dùng */
export const OFFLINE_DB_READY_TIMEOUT_MS = 15_000
export const OFFLINE_DB_NOT_READY_MESSAGE =
  'Dữ liệu ngoại tuyến chưa sẵn sàng trên máy này. Kiểm tra mạng rồi thử lại.'
export const OFFLINE_DB_RELOAD_MESSAGE =
  'Ứng dụng đang mở hai phiên bản khác nhau ở các tab, cần tải lại trang (tải lại mọi tab đang mở ứng dụng) rồi thử lại.'
export const OFFLINE_DB_LEGACY_TAB_MESSAGE =
  'Một tab khác đang mở bản cũ của ứng dụng. Tải lại hoặc đóng tab đó để tiếp tục bán ngoại tuyến.'

/** Tham số tạo PGliteWorker, tách riêng để kiểm */
export function offlineWorkerOptions(): { dataDir: string; id: string } {
  return { dataDir: OFFLINE_DB_DIR, id: OFFLINE_DB_WORKER_ID }
}

/**
 * Trình duyệt có Worker dạng module và Web Locks thì mọi tab dùng chung một PGlite qua tab chủ
 * (OFF-04). Trình duyệt không hỗ trợ worker module vẫn tạo được Worker nhưng nạp như script cổ
 * điển rồi lỗi cú pháp ở `import`: nhận biết bằng việc trình duyệt có đọc tùy chọn `type` hay không.
 */
export function supportsSharedWorkerDB(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('locks' in navigator)
  ) {
    return false
  }
  let readsType = false
  const probe = {
    get type(): WorkerType {
      readsType = true
      return 'module'
    },
  }
  try {
    new Worker('data:,', probe).terminate()
  } catch {
    // CSP chặn URL data: vẫn đọc tùy chọn trước khi ném lỗi
  }
  return readsType
}

/** Worker đang mở: `heardFrom` là đã nạp xong module và nói chuyện được với tab này */
let workerHandle: { worker: Worker; heardFrom: boolean } | null = null
let statusChannel: BroadcastChannel | null = null
let legacyTabOpen = false

function listenWorkerStatus() {
  if (statusChannel || typeof BroadcastChannel === 'undefined') return
  statusChannel = new BroadcastChannel(OFFLINE_DB_STATUS_CHANNEL)
  statusChannel.onmessage = (event: MessageEvent<OfflineDBStatus>) => {
    if (event.data?.type === 'legacy-tab-open') legacyTabOpen = true
    if (event.data?.type === 'opened') legacyTabOpen = false
  }
}

function abandonWorker(worker: Worker) {
  worker.terminate()
  if (workerHandle?.worker === worker) workerHandle = null
}

async function openOfflineDB(): Promise<PGliteInterface> {
  if (supportsSharedWorkerDB()) {
    listenWorkerStatus()
    const { PGliteWorker } = await import('@electric-sql/pglite/worker')
    const worker = new Worker(new URL('./pglite.worker.ts', import.meta.url), { type: 'module' })
    const handle = { worker, heardFrom: false }
    workerHandle = handle
    worker.addEventListener('message', () => (handle.heardFrom = true), { once: true })
    // Module worker không nạp được (mất mạng lúc tải, lỗi 404): PGliteWorker.create chờ mãi
    const loadFailed = new Promise<never>((_, reject) => {
      worker.addEventListener(
        'error',
        (event) => {
          event.preventDefault()
          reject(new Error(OFFLINE_DB_NOT_READY_MESSAGE))
        },
        { once: true },
      )
    })
    loadFailed.catch(() => {})
    try {
      const pglite = await Promise.race([
        PGliteWorker.create(worker, offlineWorkerOptions()),
        loadFailed,
      ])
      // Tab chủ đổi (tab chủ cũ đóng) thì kiểm lại phiên bản schema với tab chủ mới
      pglite.onLeaderChange(() => {
        readyProbe = null
      })
      return pglite
    } catch (error) {
      abandonWorker(worker)
      throw error
    }
  }
  // Trình duyệt quá cũ: mở trực tiếp như trước, chỉ an toàn khi dùng một tab
  const pglite = await PGlite.create(OFFLINE_DB_DIR)
  const { needsResync } = await runPGliteMigrations(pglite, pgliteMigrations)
  if (needsResync) {
    console.warn('[PGlite] Máy cũ hơn nhiều phiên bản, dữ liệu danh mục cần tải lại toàn bộ')
  }
  return pglite
}

export function initializeOfflineDB(): Promise<PGliteDB> {
  if (instance) return Promise.resolve(instance.db)

  initialization ??= (async () => {
    const pglite = await openOfflineDB()
    // drizzle chỉ gọi query/exec/transaction, PGliteWorker có đủ các hàm đó
    const db = drizzle(pglite as PGlite, { schema, casing: 'snake_case' })
    instance = { pglite, db }
    return db
  })().catch((error: unknown) => {
    initialization = null
    throw error
  })

  return initialization
}

let readyProbe: Promise<void> | null = null

function notReadyError(): Error {
  return new Error(legacyTabOpen ? OFFLINE_DB_LEGACY_TAB_MESSAGE : OFFLINE_DB_NOT_READY_MESSAGE)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(notReadyError()), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * OFF-04: PGliteWorker không báo lỗi khi worker chủ chưa mở được cơ sở dữ liệu, truy vấn chỉ
 * chờ mãi. Lần đầu dùng thì thăm dò có hạn giờ: quá hạn thì báo lỗi rõ ràng thay vì treo (ví dụ
 * nút "Hoàn thành" quay mãi). Lượt thăm dò chạy tiếp ở nền, lần gọi sau dùng lại nên không mở
 * thêm worker; worker tự thử mở lại (pglite.worker.ts).
 *
 * Lượt thăm dò đọc phiên bản schema: tab chủ chạy bản build khác (schema cũ hơn hoặc mới hơn bản
 * của tab này) thì báo cần tải lại trang và không cho ghi, tránh ghi hàng chờ thiếu cột.
 */
export function whenOfflineDBReady(
  pglite: PGliteInterface,
  timeoutMs = OFFLINE_DB_READY_TIMEOUT_MS,
): Promise<void> {
  readyProbe ??= pglite
    .query<{
      version: number
    }>('SELECT COALESCE(MAX(version), 0)::int AS version FROM schema_version')
    .then(
      (result) => {
        if (Number(result.rows[0]?.version) !== OFFLINE_DB_SCHEMA_VERSION) {
          readyProbe = null
          throw new Error(OFFLINE_DB_RELOAD_MESSAGE)
        }
        // Tín hiệu cho chẩn đoán và E2E: cơ sở dữ liệu ngoại tuyến đã mở xong trên tab này
        if (typeof document !== 'undefined') document.documentElement.dataset.offlineDb = 'ready'
      },
      (error: unknown) => {
        readyProbe = null
        throw error
      },
    )
  return withTimeout(readyProbe, timeoutMs)
}

/**
 * Mở PGlite (nếu chưa), chờ nó trả lời được, rồi trả về kết nối thô. Cả bước tạo worker lẫn lượt
 * thăm dò nằm trong cùng một hạn giờ. Hết hạn mà worker chưa từng gửi tin nào (module không nạp
 * được) thì hủy worker để lần sau tạo mới; worker đã chạy thì giữ, nó đang tự thử mở lại.
 */
export async function getOfflineDB(
  timeoutMs = OFFLINE_DB_READY_TIMEOUT_MS,
): Promise<PGliteInterface> {
  const deadline = Date.now() + timeoutMs
  try {
    await withTimeout(initializeOfflineDB(), timeoutMs)
  } catch (error) {
    const handle = workerHandle
    if (!instance && handle && !handle.heardFrom) {
      abandonWorker(handle.worker)
      initialization = null
    }
    throw error
  }
  const pglite = instance!.pglite
  await whenOfflineDBReady(pglite, Math.max(0, deadline - Date.now()))
  return pglite
}

export function getPGliteDB(): PGliteDB {
  if (!instance) throw new Error('PGlite not initialized. Call initializeOfflineDB() first.')
  return instance.db
}

export function getPGliteRaw(): PGliteInterface {
  if (!instance) throw new Error('PGlite not initialized. Call initializeOfflineDB() first.')
  return instance.pglite
}

export function getPGliteClient(): PGliteInterface | null {
  return instance?.pglite ?? null
}

export async function closePGlite(): Promise<void> {
  if (instance) {
    await instance.pglite.close()
    instance = null
  }
  initialization = null
  if (workerHandle) abandonWorker(workerHandle.worker)
  statusChannel?.close()
  statusChannel = null
  legacyTabOpen = false
  readyProbe = null
}
