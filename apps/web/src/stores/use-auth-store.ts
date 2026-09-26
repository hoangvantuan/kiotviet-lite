import { create } from 'zustand'

import { type AuthUser, authUserSchema } from '@kiotviet-lite/shared'

/**
 * OFF-03: hồ sơ tối thiểu của người vừa đăng nhập (người dùng, cửa hàng, vai trò) để tải lại
 * trang khi mất mạng vẫn bán được. KHÔNG có token: access token chỉ ở bộ nhớ, refresh token vẫn
 * là cookie httpOnly như cũ. Phiên ngoại tuyến không gọi được API nào; có mạng lại thì làm mới
 * phiên bằng cookie, cookie hết hạn thì phải đăng nhập lại (đơn chờ vẫn nằm trong PGlite).
 */
export const OFFLINE_PROFILE_KEY = 'kvl:offline-profile'
/** Bằng thời hạn refresh token: quá hạn này cookie cũng đã hết, không cho bán ngoại tuyến nữa */
export const OFFLINE_PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface OfflineProfile {
  user: AuthUser
  savedAt: number
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function saveOfflineProfile(user: AuthUser): void {
  try {
    const profile: OfflineProfile = { user, savedAt: Date.now() }
    storage()?.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Hết dung lượng hoặc bị chặn: chỉ mất khả năng tải lại khi ngoại tuyến
  }
}

export function clearOfflineProfile(): void {
  try {
    storage()?.removeItem(OFFLINE_PROFILE_KEY)
  } catch {
    // localStorage unavailable
  }
}

export function loadOfflineProfile(now = Date.now()): AuthUser | null {
  try {
    const raw = storage()?.getItem(OFFLINE_PROFILE_KEY)
    if (!raw) return null
    const profile = JSON.parse(raw) as Partial<OfflineProfile>
    const user = authUserSchema.safeParse(profile.user)
    if (
      !user.success ||
      typeof profile.savedAt !== 'number' ||
      now - profile.savedAt > OFFLINE_PROFILE_MAX_AGE_MS
    ) {
      clearOfflineProfile()
      return null
    }
    return user.data
  } catch {
    return null
  }
}

/**
 * OFF-05: đăng xuất khi mất mạng thì máy chủ không nhận được lệnh, cookie refresh của người vừa
 * đăng xuất vẫn còn hạn. Cờ này bắt lần mở app sau gửi lại lệnh đăng xuất thay vì làm mới phiên,
 * để máy dùng chung không tự đăng nhập lại người trước.
 */
export const LOGOUT_PENDING_KEY = 'kvl:logout-pending'

export function markLogoutPending(): void {
  try {
    storage()?.setItem(LOGOUT_PENDING_KEY, '1')
  } catch {
    // localStorage unavailable
  }
}

export function clearLogoutPending(): void {
  try {
    storage()?.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // localStorage unavailable
  }
}

export function isLogoutPending(): boolean {
  try {
    return storage()?.getItem(LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  booted: boolean
  networkError: boolean
  /** Phiên dựng từ hồ sơ đã lưu khi không gọi được máy chủ (OFF-03): chưa có token */
  offlineSession: boolean
  setAuth: (input: { user: AuthUser; accessToken: string }) => void
  setAccessToken: (token: string) => void
  startOfflineSession: (user: AuthUser) => void
  clearAuth: () => void
  markBooted: () => void
  setNetworkError: (error: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  booted: false,
  networkError: false,
  offlineSession: false,
  setAuth: ({ user, accessToken }) => {
    // Đăng nhập thành công thì cookie mới đã thay cookie của người trước
    clearLogoutPending()
    saveOfflineProfile(user)
    set({
      user,
      accessToken,
      isAuthenticated: true,
      booted: true,
      networkError: false,
      offlineSession: false,
    })
  },
  setAccessToken: (token) =>
    set((state) => ({ accessToken: token, isAuthenticated: state.user !== null })),
  startOfflineSession: (user) =>
    set({
      user,
      accessToken: null,
      isAuthenticated: true,
      booted: true,
      networkError: true,
      offlineSession: true,
    }),
  clearAuth: () => {
    clearOfflineProfile()
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      networkError: false,
      offlineSession: false,
    })
  },
  markBooted: () => set({ booted: true }),
  setNetworkError: (error) => set({ networkError: error }),
}))
