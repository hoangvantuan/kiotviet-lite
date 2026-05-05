import type { PGlite } from '@electric-sql/pglite'

import { useOfflineStore } from '@/stores/use-offline-store'

import {
  getErrorOrders,
  getOrderCounts,
  getPendingOrders,
  markOrderError,
  markOrderSynced,
} from './offline-orders'
import { runIncrementalSync } from './sync-engine'

interface SyncPushResponse {
  data: {
    results: Array<{
      clientId: string
      serverId?: string
      status: 'synced' | 'error' | 'duplicate'
      error?: { code: string; message: string }
    }>
    syncedAt: string
  }
}

const RETRY_BASE = 2000
const RETRY_MULTIPLIER = 4
const MAX_RETRIES = 3

async function fetchWithRetryPerOrder(
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) return res
      if (res.status === 401) throw new Error('Unauthorized')
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err as Error
    }
    if (i < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_BASE * RETRY_MULTIPLIER ** i))
    }
  }
  throw lastError
}

export async function pushPendingOrders(
  pglite: PGlite,
  apiBase: string,
  token: string,
): Promise<{ synced: number; errors: number }> {
  const pending = await getPendingOrders(pglite)
  if (pending.length === 0) return { synced: 0, errors: 0 }

  const store = useOfflineStore.getState()
  store.setStatus('syncing')

  let synced = 0
  let errors = 0

  try {
    const ordersPayload = pending.map((o) => ({
      clientId: o.clientId,
      createdAt: o.createdAt,
      orderData: o.orderData,
    }))

    const res = await fetchWithRetryPerOrder(`${apiBase}/api/v1/sync/push`, token, {
      orders: ordersPayload,
    })

    const json: SyncPushResponse = await res.json()

    for (const result of json.data.results) {
      if (result.status === 'synced' || result.status === 'duplicate') {
        await markOrderSynced(pglite, result.clientId, result.serverId ?? '')
        synced++
      } else {
        await markOrderError(pglite, result.clientId, result.error?.message ?? 'Unknown error')
        errors++
      }
    }

    store.setLastSynced(json.data.syncedAt)
  } catch (err) {
    for (const o of pending) {
      await markOrderError(pglite, o.clientId, err instanceof Error ? err.message : 'Network error')
    }
    errors = pending.length
  }

  const counts = await getOrderCounts(pglite)
  store.setPendingCount(counts.pending)

  if (counts.pending === 0 && counts.error === 0) {
    store.setStatus('online')
  } else if (counts.error > 0) {
    store.setError(`${counts.error} đơn hàng đồng bộ lỗi`)
  } else {
    store.setStatus('online')
  }

  return { synced, errors }
}

export async function retryErrorOrders(
  pglite: PGlite,
  apiBase: string,
  token: string,
): Promise<{ synced: number; errors: number }> {
  const errorOrders = await getErrorOrders(pglite)
  if (errorOrders.length === 0) return { synced: 0, errors: 0 }

  // Reset error orders to pending first
  for (const o of errorOrders) {
    await pglite.query(`UPDATE offline_orders SET sync_status = 'pending' WHERE client_id = $1`, [
      o.clientId,
    ])
  }

  return pushPendingOrders(pglite, apiBase, token)
}

export async function startSyncCycle(
  pglite: PGlite,
  apiBase: string,
  token: string,
  lastSyncedAt: string | null,
): Promise<string> {
  const pushResult = await pushPendingOrders(pglite, apiBase, token)

  let newWatermark = lastSyncedAt ?? new Date(0).toISOString()
  if (lastSyncedAt) {
    try {
      newWatermark = await runIncrementalSync(pglite, apiBase, token, lastSyncedAt)
    } catch {
      // Incremental sync failure should not block order push
    }
  }

  const store = useOfflineStore.getState()
  store.setLastSynced(newWatermark)

  if (pushResult.errors === 0) {
    const counts = await getOrderCounts(pglite)
    if (counts.pending === 0 && counts.error === 0) {
      store.setStatus('online')
    }
  }

  return newWatermark
}

let syncInterval: ReturnType<typeof setInterval> | null = null

export function startAutoSync(
  pglite: PGlite,
  apiBase: string,
  getToken: () => string | null,
): () => void {
  const handleOnline = () => {
    const token = getToken()
    if (token) {
      const store = useOfflineStore.getState()
      startSyncCycle(pglite, apiBase, token, store.lastSyncedAt).catch(() => {})
    }
  }

  window.addEventListener('online', handleOnline)

  syncInterval = setInterval(() => {
    if (!navigator.onLine) return
    const token = getToken()
    if (!token) return
    const store = useOfflineStore.getState()
    if (store.pendingOrderCount > 0 || store.status === 'error') {
      startSyncCycle(pglite, apiBase, token, store.lastSyncedAt).catch(() => {})
    }
  }, 60_000)

  return () => {
    window.removeEventListener('online', handleOnline)
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
    }
  }
}
