import { create } from 'zustand'

export type OfflineStatus = 'online' | 'offline' | 'syncing' | 'error'

/**
 * Kết nối tới máy chủ (OFF-20): `unreachable` là máy vẫn có mạng nhưng gọi máy chủ không được
 * (wifi không ra Internet, máy chủ bảo trì). Khi đó `status` cũng là 'offline' để POS bán theo
 * nhánh ngoại tuyến, còn chỉ báo nói rõ lý do.
 */
export type Connectivity = 'online' | 'offline' | 'unreachable'

/** ADR-0009: đơn ngoại tuyến đã đồng bộ nhưng vi phạm chính sách, đang chờ chủ duyệt */
export interface ReviewPendingOrder {
  clientId: string
  serverId: string
  /** Mã chứng từ máy chủ cấp (OFF-17): sau đồng bộ chỉ dùng mã này, không dùng mã tạm */
  orderNumber: string | null
  total: number
}

/** Số đơn trong hàng chờ trên máy này, tính theo cửa hàng đang đăng nhập (OFF-05) */
export interface OutboxCounts {
  pending: number
  error: number
  /** Đơn chờ hoặc lỗi của cửa hàng khác: không bao giờ đẩy vào cửa hàng đang đăng nhập */
  otherStores: number
}

interface OfflineState {
  status: OfflineStatus
  connectivity: Connectivity
  pendingOrderCount: number
  errorOrderCount: number
  otherStoreOrderCount: number
  lastSyncedAt: string | null
  errorMessage: string | null
  reviewPendingOrders: ReviewPendingOrder[]
  setStatus: (status: OfflineStatus) => void
  setConnectivity: (connectivity: Connectivity) => void
  setPendingCount: (count: number) => void
  setOutboxCounts: (counts: OutboxCounts) => void
  setLastSynced: (at: string) => void
  setError: (message: string) => void
  clearError: () => void
  addReviewPending: (orders: ReviewPendingOrder[]) => void
  dismissReviewPending: () => void
}

const initiallyOnline = typeof navigator === 'undefined' || navigator.onLine

export const useOfflineStore = create<OfflineState>((set) => ({
  status: initiallyOnline ? 'online' : 'offline',
  connectivity: initiallyOnline ? 'online' : 'offline',
  pendingOrderCount: 0,
  errorOrderCount: 0,
  otherStoreOrderCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
  reviewPendingOrders: [],
  setStatus: (status) =>
    set((prev) => ({ status, errorMessage: status === 'error' ? prev.errorMessage : null })),
  setConnectivity: (connectivity) =>
    set((prev) => {
      if (connectivity === prev.connectivity) return prev
      if (connectivity === 'online') {
        // Có lại mạng: bỏ trạng thái ngoại tuyến, giữ nguyên 'syncing' hay 'error' đang có
        return {
          connectivity,
          status: prev.status === 'offline' ? 'online' : prev.status,
        }
      }
      return { connectivity, status: 'offline', errorMessage: null }
    }),
  setPendingCount: (count) => set({ pendingOrderCount: count }),
  setOutboxCounts: (counts) =>
    set({
      pendingOrderCount: counts.pending,
      errorOrderCount: counts.error,
      otherStoreOrderCount: counts.otherStores,
    }),
  setLastSynced: (at) => set({ lastSyncedAt: at }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  clearError: () =>
    set((prev) => ({
      status: prev.connectivity === 'online' ? 'online' : 'offline',
      errorMessage: null,
    })),
  addReviewPending: (orders) =>
    set((prev) => {
      const known = new Set(prev.reviewPendingOrders.map((o) => o.clientId))
      return {
        reviewPendingOrders: [
          ...prev.reviewPendingOrders,
          ...orders.filter((o) => !known.has(o.clientId)),
        ],
      }
    }),
  dismissReviewPending: () => set({ reviewPendingOrders: [] }),
}))
