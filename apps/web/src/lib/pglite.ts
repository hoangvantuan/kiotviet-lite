import { PGlite, type PGliteInterface } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'
import * as schema from '@kiotviet-lite/shared/schema'

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

/** Trình duyệt có Worker và Web Locks thì mọi tab dùng chung một PGlite qua tab chủ (OFF-04) */
function supportsSharedWorkerDB(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'locks' in navigator
  )
}

async function openOfflineDB(): Promise<PGliteInterface> {
  if (supportsSharedWorkerDB()) {
    const { PGliteWorker } = await import('@electric-sql/pglite/worker')
    return PGliteWorker.create(
      new Worker(new URL('./pglite.worker.ts', import.meta.url), { type: 'module' }),
      { dataDir: OFFLINE_DB_DIR },
    )
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

/** Thời gian tối đa chờ PGlite trả lời lần đầu trước khi báo lỗi cho người dùng */
export const OFFLINE_DB_READY_TIMEOUT_MS = 15_000
export const OFFLINE_DB_NOT_READY_MESSAGE =
  'Dữ liệu ngoại tuyến chưa sẵn sàng trên máy này. Kiểm tra mạng rồi thử lại.'

let readyProbe: Promise<void> | null = null

/**
 * OFF-04: PGliteWorker không báo lỗi khi worker chủ chưa mở được cơ sở dữ liệu, truy vấn chỉ
 * chờ mãi. Lần đầu dùng thì thăm dò bằng `SELECT 1` có hạn giờ: quá hạn thì báo lỗi rõ ràng thay
 * vì treo (ví dụ nút "Hoàn thành" quay mãi). Lượt thăm dò chạy tiếp ở nền, lần gọi sau dùng lại
 * nên không mở thêm worker; worker tự thử mở lại (pglite.worker.ts).
 */
export function whenOfflineDBReady(
  pglite: PGliteInterface,
  timeoutMs = OFFLINE_DB_READY_TIMEOUT_MS,
): Promise<void> {
  readyProbe ??= pglite.query('SELECT 1').then(
    () => {
      // Tín hiệu cho chẩn đoán và E2E: cơ sở dữ liệu ngoại tuyến đã mở xong trên tab này
      if (typeof document !== 'undefined') document.documentElement.dataset.offlineDb = 'ready'
    },
    (error: unknown) => {
      readyProbe = null
      throw error
    },
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(OFFLINE_DB_NOT_READY_MESSAGE)), timeoutMs)
  })
  return Promise.race([readyProbe, timeout]).finally(() => clearTimeout(timer))
}

/** Mở PGlite (nếu chưa), chờ nó trả lời được, rồi trả về kết nối thô */
export async function getOfflineDB(): Promise<PGliteInterface> {
  await initializeOfflineDB()
  const pglite = instance!.pglite
  await whenOfflineDBReady(pglite)
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
    initialization = null
  }
  readyProbe = null
}
