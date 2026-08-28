import type { PGlite } from '@electric-sql/pglite'

import { type CreateOrderInput, createOrderSchema } from '@kiotviet-lite/shared'

import { useOfflineStore } from '@/stores/use-offline-store'

export interface OfflineOrder {
  id: string
  storeId: string
  clientId: string
  syncStatus: string
  orderData: CreateOrderInput
  createdAt: string
  syncedAt: string | null
  serverId: string | null
  errorMessage: string | null
  retryCount: number
  lastRetryAt: string | null
}

export async function saveOfflineOrder(
  pglite: PGlite,
  storeId: string,
  orderData: CreateOrderInput,
): Promise<string> {
  createOrderSchema.parse(orderData)

  const clientId = crypto.randomUUID()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await pglite.query(
    `INSERT INTO offline_orders (id, store_id, client_id, sync_status, order_data, created_at)
     VALUES ($1, $2, $3, 'pending', $4, $5)`,
    [id, storeId, clientId, JSON.stringify(orderData), now],
  )

  const counts = await getOrderCounts(pglite)
  useOfflineStore.getState().setPendingCount(counts.pending)

  return clientId
}

export async function getPendingOrders(pglite: PGlite): Promise<OfflineOrder[]> {
  const result = await pglite.query<{
    id: string
    store_id: string
    client_id: string
    sync_status: string
    order_data: string
    created_at: string
    synced_at: string | null
    server_id: string | null
    error_message: string | null
    retry_count: number
    last_retry_at: string | null
  }>(`SELECT * FROM offline_orders WHERE sync_status = 'pending' ORDER BY created_at ASC`)

  return result.rows.map(mapRow)
}

export async function getErrorOrders(pglite: PGlite): Promise<OfflineOrder[]> {
  const result = await pglite.query<{
    id: string
    store_id: string
    client_id: string
    sync_status: string
    order_data: string
    created_at: string
    synced_at: string | null
    server_id: string | null
    error_message: string | null
    retry_count: number
    last_retry_at: string | null
  }>(`SELECT * FROM offline_orders WHERE sync_status = 'error' ORDER BY created_at ASC`)

  return result.rows.map(mapRow)
}

export async function markOrderSynced(
  pglite: PGlite,
  clientId: string,
  serverId: string,
): Promise<void> {
  await pglite.query(
    `UPDATE offline_orders SET sync_status = 'synced', server_id = $1, synced_at = $2, error_message = NULL
     WHERE client_id = $3`,
    [serverId, new Date().toISOString(), clientId],
  )

  const counts = await getOrderCounts(pglite)
  useOfflineStore.getState().setPendingCount(counts.pending)
}

export async function markOrderError(
  pglite: PGlite,
  clientId: string,
  errorMsg: string,
): Promise<void> {
  await pglite.query(
    `UPDATE offline_orders SET sync_status = 'error', error_message = $1,
     retry_count = COALESCE(retry_count, 0) + 1, last_retry_at = $2
     WHERE client_id = $3`,
    [errorMsg, new Date().toISOString(), clientId],
  )

  const counts = await getOrderCounts(pglite)
  useOfflineStore.getState().setPendingCount(counts.pending)
}

export async function resetErrorOrders(pglite: PGlite): Promise<number> {
  const result = await pglite.query(
    `UPDATE offline_orders SET sync_status = 'pending', error_message = NULL
     WHERE sync_status = 'error'`,
  )
  const counts = await getOrderCounts(pglite)
  useOfflineStore.getState().setPendingCount(counts.pending)
  return result.affectedRows ?? 0
}

export async function resetSingleErrorOrder(pglite: PGlite, clientId: string): Promise<boolean> {
  const result = await pglite.query(
    `UPDATE offline_orders SET sync_status = 'pending', error_message = NULL
     WHERE client_id = $1 AND sync_status = 'error'`,
    [clientId],
  )
  const counts = await getOrderCounts(pglite)
  useOfflineStore.getState().setPendingCount(counts.pending)
  return (result.affectedRows ?? 0) > 0
}

export async function getOrderCounts(
  pglite: PGlite,
): Promise<{ pending: number; synced: number; error: number }> {
  const result = await pglite.query<{ sync_status: string; count: string }>(
    `SELECT sync_status, COUNT(*)::text as count FROM offline_orders GROUP BY sync_status`,
  )

  const counts = { pending: 0, synced: 0, error: 0 }
  for (const row of result.rows) {
    const c = parseInt(row.count, 10)
    if (row.sync_status === 'pending') counts.pending = c
    else if (row.sync_status === 'synced') counts.synced = c
    else if (row.sync_status === 'error') counts.error = c
  }
  return counts
}

function mapRow(row: {
  id: string
  store_id: string
  client_id: string
  sync_status: string
  order_data: string
  created_at: string
  synced_at: string | null
  server_id: string | null
  error_message: string | null
  retry_count: number
  last_retry_at: string | null
}): OfflineOrder {
  return {
    id: row.id,
    storeId: row.store_id,
    clientId: row.client_id,
    syncStatus: row.sync_status,
    orderData: typeof row.order_data === 'string' ? JSON.parse(row.order_data) : row.order_data,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    serverId: row.server_id,
    errorMessage: row.error_message,
    retryCount: row.retry_count ?? 0,
    lastRetryAt: row.last_retry_at,
  }
}
