import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(path.resolve(__dirname, '../../public/sw-cleanup.js'), 'utf8')

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void

/** Chạy sw-cleanup.js trong một ServiceWorkerGlobalScope giả, trả hàm phát sự kiện. */
function loadServiceWorker(existingCaches: string[]) {
  const names = new Set(existingCaches)
  const listeners = new Map<string, Listener[]>()
  const caches = {
    has: vi.fn(async (name: string) => names.has(name)),
    delete: vi.fn(async (name: string) => names.delete(name)),
  }
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    skipWaiting: vi.fn(async () => {}),
  }
  new Function('self', 'caches', source)(self, caches)

  async function dispatch(type: string) {
    const pending: Promise<unknown>[] = []
    for (const fn of listeners.get(type) ?? []) fn({ waitUntil: (p) => pending.push(p) })
    await Promise.all(pending)
  }
  return { self, caches, names, dispatch }
}

describe('sw-cleanup.js (C-01)', () => {
  it('activate xóa api-cache mà bản cũ để lại', async () => {
    const sw = loadServiceWorker(['api-cache', 'workbox-precache-v2-http://x/'])
    await sw.dispatch('activate')
    expect(sw.caches.delete).toHaveBeenCalledWith('api-cache')
    expect([...sw.names]).toEqual(['workbox-precache-v2-http://x/'])
  })

  it('install chiếm quyền ngay khi máy còn api-cache của bản cũ', async () => {
    const sw = loadServiceWorker(['api-cache'])
    await sw.dispatch('install')
    expect(sw.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('install không tự chiếm quyền khi không còn api-cache (chờ người dùng cập nhật)', async () => {
    const sw = loadServiceWorker([])
    await sw.dispatch('install')
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
  })
})
