import { create } from 'zustand'

/** GL-03, OFF-15: trạng thái bản sao danh mục trên máy bán hàng */
interface CatalogSyncState {
  status: 'idle' | 'syncing' | 'error'
  /** Đang tải lần đầu (chưa có bản sao dùng được) */
  initial: boolean
  loaded: number
  total: number | null
  /** Thời điểm máy chủ của lượt đồng bộ trọn vẹn gần nhất */
  syncedAt: string | null
  errorMessage: string | null
  start: (initial: boolean) => void
  progress: (loaded: number, total: number | null) => void
  finish: (syncedAt: string) => void
  fail: (message: string) => void
  setSyncedAt: (syncedAt: string | null) => void
  reset: () => void
}

export const useCatalogSyncStore = create<CatalogSyncState>((set) => ({
  status: 'idle',
  initial: false,
  loaded: 0,
  total: null,
  syncedAt: null,
  errorMessage: null,
  start: (initial) =>
    set({ status: 'syncing', initial, loaded: 0, total: null, errorMessage: null }),
  progress: (loaded, total) => set({ loaded, total }),
  finish: (syncedAt) => set({ status: 'idle', initial: false, syncedAt, errorMessage: null }),
  fail: (message) => set({ status: 'error', errorMessage: message }),
  setSyncedAt: (syncedAt) => set({ syncedAt }),
  reset: () =>
    set({
      status: 'idle',
      initial: false,
      loaded: 0,
      total: null,
      syncedAt: null,
      errorMessage: null,
    }),
}))
