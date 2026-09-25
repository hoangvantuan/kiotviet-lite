import { useMutation } from '@tanstack/react-query'

import { endSession } from '@/lib/session'

import { logoutApi } from './auth-api'

export const logoutMutationOptions = {
  mutationFn: () => logoutApi(),
  // Dọn dữ liệu phiên kể cả khi gọi API thất bại (mất mạng), máy vẫn phải sạch
  onSettled: () => endSession(),
}

export function useLogout() {
  return useMutation(logoutMutationOptions)
}
