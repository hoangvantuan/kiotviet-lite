import { useMutation } from '@tanstack/react-query'

import { endSession } from '@/lib/session'
import { markLogoutPending } from '@/stores/use-auth-store'

import { isNetworkError, logoutApi } from './auth-api'

export const logoutMutationOptions = {
  mutationFn: async () => {
    try {
      await logoutApi()
    } catch (err) {
      // Máy chủ chưa nhận lệnh đăng xuất: lần mở app sau gửi lại (OFF-05)
      if (isNetworkError(err)) markLogoutPending()
      throw err
    }
  },
  // Dọn dữ liệu phiên kể cả khi gọi API thất bại (mất mạng), máy vẫn phải sạch
  onSettled: () => endSession(),
}

export function useLogout() {
  return useMutation(logoutMutationOptions)
}
