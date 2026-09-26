import type { PGlite } from '@electric-sql/pglite'
import { expect, it, vi } from 'vitest'

import { useOfflineStore } from '@/stores/use-offline-store'

import { startSyncCycle } from './order-sync'

vi.hoisted(() => {
  vi.stubGlobal('navigator', { onLine: false })
})

// GL-03: kéo danh mục nằm ở sync-engine (có test riêng); ở đây chỉ cần một lượt kéo thất bại với
// lỗi mang dữ liệu riêng tư để kiểm cách order-sync giữ mốc và che thông tin
vi.mock('./sync-engine', () => ({
  runIncrementalSync: vi.fn().mockRejectedValue(new Error('Customer private data')),
}))

it('keeps the incremental watermark while exposing only a safe local failure ID', async () => {
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  useOfflineStore.getState().setLastSynced('2026-01-01T00:00:00.000Z')

  const pglite = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM offline_orders')) return { rows: [] }
      if (sql.includes('COUNT(*)')) return { rows: [] }
      return { rows: [] }
    }),
  } as unknown as PGlite
  const watermark = await startSyncCycle(pglite, undefined, undefined, '2026-01-01T00:00:00.000Z')
  expect(watermark).toBe('2026-01-01T00:00:00.000Z')
  expect(useOfflineStore.getState().status).toBe('error')
  const id = useOfflineStore.getState().errorMessage?.match(/[0-9a-f-]{36}/)?.[0]
  expect(id).toBeTruthy()
  expect(warn).toHaveBeenCalledWith('Browser diagnostic', {
    event: 'incremental_sync',
    status: 0,
    code: 'CLIENT_ERROR',
    requestId: id,
  })
  const queued = JSON.parse(stored.get('kiotviet-browser-diagnostics') ?? '[]')
  expect(queued).toEqual([{ kind: 'incremental_sync_error', requestId: id, code: 'CLIENT_ERROR' }])
  expect(JSON.stringify(queued)).not.toContain('private')
  warn.mockRestore()
})
