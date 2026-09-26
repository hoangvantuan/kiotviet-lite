/**
 * OFF-04: chỉ một tab mở PGlite trên `idb://kiotviet-lite`. Mỗi tab tạo một worker này, thư viện
 * bầu một worker làm chủ (Web Locks); chỉ worker chủ chạy `init`, các tab khác gửi truy vấn qua
 * nó. Tab chủ đóng thì worker của tab khác lên làm chủ và mở lại cơ sở dữ liệu, dữ liệu không mất.
 * Migration chạy ở đây để chỉ tab chủ nâng cấp, không có hai tab cùng nâng cấp một lúc.
 */
import { PGlite } from '@electric-sql/pglite'
import { worker } from '@electric-sql/pglite/worker'

import { pgliteMigrations } from '@kiotviet-lite/shared/migrations/pglite'

import {
  OFFLINE_DB_STATUS_CHANNEL,
  type OfflineDBStatus,
  pgliteIndexedDBName,
  waitForOtherConnectionsClosed,
} from './offline-db-status'
import { runPGliteMigrations } from './pglite-migrations'

/** Chờ giữa các lần thử mở lại: 1, 2, 4, 8 rồi tối đa 15 giây */
const MAX_OPEN_RETRY_MS = 15_000

/**
 * Thư viện không xử lý `init` bị lỗi: worker chủ giữ khóa bầu chọn mà không trả lời truy vấn nào,
 * các tab treo mãi. Nên ở đây không bao giờ ném lỗi: mở hỏng (chưa tải được wasm vì vừa mất mạng,
 * bộ nhớ đầy tạm thời...) thì chờ rồi thử lại, mở được lúc nào các truy vấn đang chờ chạy lúc đó.
 */
async function openWithRetry(dataDir: string | undefined): Promise<PGlite> {
  for (let attempt = 0; ; attempt++) {
    let pglite: PGlite | null = null
    try {
      pglite = await PGlite.create({ dataDir })
      const { needsResync } = await runPGliteMigrations(pglite, pgliteMigrations)
      if (needsResync) {
        console.warn('[PGlite] Máy cũ hơn nhiều phiên bản, dữ liệu danh mục cần tải lại toàn bộ')
      }
      return pglite
    } catch (error) {
      // Migration lỗi sau khi đã mở: đóng lại để lần thử sau không giữ hai kết nối vào IndexedDB
      await pglite?.close().catch(() => {})
      const delay = Math.min(MAX_OPEN_RETRY_MS, 1000 * 2 ** attempt)
      console.warn(`[PGlite] Chưa mở được cơ sở dữ liệu, thử lại sau ${delay / 1000} giây`, error)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

function broadcastStatus(status: OfflineDBStatus) {
  const channel = new BroadcastChannel(OFFLINE_DB_STATUS_CHANNEL)
  channel.postMessage(status)
  channel.close()
}

/**
 * Tab bản cũ (mở PGlite thẳng, không khóa) còn giữ IndexedDB thì chưa mở, chờ tab đó đóng hoặc tải
 * lại để hai bên không ghi đè nhau (xem offline-db-status.ts). Chỉ kiểm một lần trước lần mở đầu.
 */
async function open(dataDir: string | undefined): Promise<PGlite> {
  const name = pgliteIndexedDBName(dataDir)
  if (name && typeof indexedDB !== 'undefined') {
    await waitForOtherConnectionsClosed(indexedDB, name, () => {
      console.warn('[PGlite] Một tab bản cũ đang mở cơ sở dữ liệu ngoại tuyến, chờ tab đó đóng')
      broadcastStatus({ type: 'legacy-tab-open' })
    })
  }
  const pglite = await openWithRetry(dataDir)
  broadcastStatus({ type: 'opened' })
  return pglite
}

void worker({
  init: (options) => open(options.dataDir),
})
