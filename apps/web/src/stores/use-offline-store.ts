import { create } from 'zustand'

export type OfflineStatus = 'online' | 'offline' | 'syncing' | 'error'

/** ADR-0009: đơn ngoại tuyến đã đồng bộ nhưng vi phạm chính sách, đang chờ chủ duyệt */
export interface ReviewPendingOrder {
  clientId: string
  serverId: string
  total: number
}

interface OfflineState {
  status: OfflineStatus
  pendingOrderCount: number
  lastSyncedAt: string | null
  errorMessage: string | null
  reviewPendingOrders: ReviewPendingOrder[]
  setStatus: (status: OfflineStatus) => void
  setPendingCount: (count: number) => void
  setLastSynced: (at: string) => void
  setError: (message: string) => void
  clearError: () => void
  addReviewPending: (orders: ReviewPendingOrder[]) => void
  dismissReviewPending: () => void
}

export const useOfflineStore = create<OfflineState>((set) => ({
  status: navigator.onLine ? 'online' : 'offline',
  pendingOrderCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
  reviewPendingOrders: [],
  setStatus: (status) =>
    set((prev) => ({ status, errorMessage: status === 'error' ? prev.errorMessage : null })),
  setPendingCount: (count) => set({ pendingOrderCount: count }),
  setLastSynced: (at) => set({ lastSyncedAt: at }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  clearError: () => set({ status: 'online', errorMessage: null }),
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
