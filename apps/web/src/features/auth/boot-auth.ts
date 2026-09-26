import {
  clearLogoutPending,
  isLogoutPending,
  loadOfflineProfile,
  useAuthStore,
} from '@/stores/use-auth-store'

import { isNetworkError, logoutApi, meApi, refreshApi } from './auth-api'

/** Gửi lại lệnh đăng xuất còn dở. Trả về false khi vẫn chưa tới được máy chủ. */
async function finishPendingLogout(): Promise<boolean> {
  try {
    await logoutApi()
  } catch (err) {
    if (isNetworkError(err)) return false
    // Máy chủ đã trả lời (kể cả 401 vì phiên đã hết): cookie không còn dùng được nữa
  }
  clearLogoutPending()
  return true
}

/**
 * Dựng phiên lúc mở app: làm mới access token bằng cookie refresh rồi lấy hồ sơ.
 *
 * OFF-03: tải lại trang khi mất mạng không được đá về đăng nhập. Có hồ sơ của lần đăng nhập trước
 * thì vào phiên ngoại tuyến (không token, chỉ bán được POS), có mạng lại runtime đồng bộ sẽ làm
 * mới phiên. Chỉ khi máy chủ trả lời "chưa đăng nhập" (401, 403) mới về trang đăng nhập.
 */
export async function bootAuth(): Promise<void> {
  if (isLogoutPending()) {
    // Người trước đăng xuất khi mất mạng (OFF-05): không làm mới phiên của họ, không vào phiên
    // ngoại tuyến; ai bán tiếp phải đăng nhập
    const done = await finishPendingLogout()
    useAuthStore.getState().setNetworkError(!done)
    useAuthStore.getState().markBooted()
    return
  }
  const refreshResult = await refreshApi()
  if (refreshResult.status === 'network_error') {
    const profile = loadOfflineProfile()
    if (profile) {
      useAuthStore.getState().startOfflineSession(profile)
      return
    }
  }
  if (refreshResult.status !== 'ok') {
    useAuthStore.getState().setNetworkError(refreshResult.status === 'network_error')
    useAuthStore.getState().markBooted()
    return
  }
  useAuthStore.getState().setAccessToken(refreshResult.accessToken)
  try {
    const { data: user } = await meApi()
    useAuthStore.getState().setAuth({ user, accessToken: refreshResult.accessToken })
  } catch {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().markBooted()
  }
}
