import { create } from 'zustand'

export type OfflineStatus = 'online' | 'offline' | 'syncing' | 'error'

interface OfflineState {
  status: OfflineStatus
  pendingOrderCount: number
  lastSyncedAt: string | null
  errorMessage: string | null
  setStatus: (status: OfflineStatus) => void
  setPendingCount: (count: number) => void
  setLastSynced: (at: string) => void
  setError: (message: string) => void
  clearError: () => void
}

export const useOfflineStore = create<OfflineState>((set) => ({
  status: navigator.onLine ? 'online' : 'offline',
  pendingOrderCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
  setStatus: (status) =>
    set((prev) => ({ status, errorMessage: status === 'error' ? prev.errorMessage : null })),
  setPendingCount: (count) => set({ pendingOrderCount: count }),
  setLastSynced: (at) => set({ lastSyncedAt: at }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  clearError: () => set({ status: 'online', errorMessage: null }),
}))
