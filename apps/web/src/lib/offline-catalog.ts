import type { PGlite } from '@electric-sql/pglite'

import {
  type DebtInfo,
  hasPermission,
  type PosProductItem,
  type ResolvedPriceItem,
  type ResolvePricesInput,
} from '@kiotviet-lite/shared'
import {
  type CatalogCustomer,
  getCatalogCustomerDebt,
  getCatalogPulledAt,
  getCatalogSyncMeta,
  type OfflineDb,
  purgeCatalogCostIfForbidden,
  resolvePricesOffline,
  searchCatalogCustomers,
  searchCatalogProducts,
} from '@kiotviet-lite/shared/offline'

import { useAuthStore } from '@/stores/use-auth-store'

import { ApiClientError } from './api-client'
import { getOfflineDB } from './pglite'

/**
 * OFF-09, OFF-15: tra cứu trên bản sao danh mục trong PGlite khi máy không tới được máy chủ.
 * Mọi hàm dùng cửa hàng và quyền của người đang đăng nhập; chưa có bản sao thì báo rõ.
 */

export class CatalogUnavailableError extends Error {
  constructor() {
    super('Chưa có dữ liệu danh mục trên máy này. Cần kết nối mạng để tải lần đầu.')
    this.name = 'CatalogUnavailableError'
  }
}

async function context(pglite?: PGlite) {
  const user = useAuthStore.getState().user
  if (!user) throw new Error('Chưa đăng nhập')
  const db = (pglite ?? (await getOfflineDB())) as unknown as OfflineDb
  const includeCost = hasPermission(user.role, 'products.viewCost')
  // Nhân viên đăng nhập ngoại tuyến trên máy chủ đã tải: giá vốn không được nằm lại trên máy
  await purgeCatalogCostIfForbidden(db, user.storeId, includeCost)
  const meta = await getCatalogSyncMeta(db, user.storeId)
  if (!meta?.syncedAt) throw new CatalogUnavailableError()
  return {
    db,
    storeId: user.storeId,
    includeCost,
    syncedAt: meta.syncedAt,
  }
}

/** Lỗi do không tới được máy chủ (mất mạng, hết giờ chờ): nên chuyển sang dữ liệu cục bộ */
export function isUnreachableError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'NETWORK_ERROR'
}

/** Máy đang báo ngoại tuyến thì đi thẳng dữ liệu cục bộ, khỏi chờ request hết giờ */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export async function searchProductsOffline(
  params: { search?: string; categoryId?: string },
  pglite?: PGlite,
): Promise<PosProductItem[]> {
  const { db, storeId, includeCost } = await context(pglite)
  return searchCatalogProducts(db, { storeId, includeCost, ...params })
}

export async function searchCustomersOffline(
  search: string,
  pglite?: PGlite,
): Promise<CatalogCustomer[]> {
  const { db, storeId } = await context(pglite)
  return searchCatalogCustomers(db, { storeId, search })
}

export async function resolvePricesFromCatalog(
  input: ResolvePricesInput,
  pglite?: PGlite,
): Promise<ResolvedPriceItem[]> {
  const { db, storeId } = await context(pglite)
  return resolvePricesOffline(db, { storeId, input })
}

export interface OfflineDebtInfo extends DebtInfo {
  /** Thời điểm đồng bộ của số nợ và hạn mức */
  syncedAt: string
  /** Nợ của các đơn ghi nợ trên máy này mà bản sao chưa phản ánh (đã cộng vào currentDebt) */
  pendingDebt: number
}

/**
 * OFF-15: nợ hiện tại và hạn mức của khách theo lần đồng bộ gần nhất, cộng thêm nợ của đơn ghi
 * nợ trên máy này chưa có trong bản sao: đơn còn chờ đồng bộ, hoặc đã lên máy chủ sau lúc kéo dữ
 * liệu khách (không phải lúc bắt đầu lượt, khách được kéo sau vài loại khác). Đơn bị máy chủ từ
 * chối (error) không tạo nợ. Máy chủ vẫn kiểm lại hạn mức khi nhận đơn (ADR-0009).
 */
export async function getCustomerDebtOffline(
  customerId: string,
  pglite?: PGlite,
): Promise<OfflineDebtInfo | null> {
  const { db, storeId, syncedAt } = await context(pglite)
  const info = await getCatalogCustomerDebt(db, { storeId, customerId })
  if (!info) return null
  const customersPulledAt = (await getCatalogPulledAt(db, storeId, 'customers')) ?? syncedAt
  const pending = await db.query<{ amount: string | number | null }>(
    `SELECT COALESCE(SUM((order_data->>'debtAmount')::bigint), 0) AS amount
     FROM offline_orders
     WHERE store_id = $1 AND order_data->>'customerId' = $2
       AND (sync_status = 'pending' OR (sync_status = 'synced' AND synced_at > $3::timestamptz))`,
    [storeId, customerId, customersPulledAt],
  )
  const pendingDebt = Number(pending.rows[0]?.amount ?? 0)
  return {
    customerId: info.customerId,
    customerName: info.customerName,
    groupId: info.groupId,
    groupName: info.groupName,
    currentDebt: info.currentDebt + pendingDebt,
    customerDebtLimit: info.customerDebtLimit,
    groupDebtLimit: info.groupDebtLimit,
    effectiveDebtLimit: info.effectiveDebtLimit,
    syncedAt,
    pendingDebt,
  }
}
