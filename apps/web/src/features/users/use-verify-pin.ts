import { useMutation } from '@tanstack/react-query'

import type { VerifyPinInput } from '@kiotviet-lite/shared'

import { verifyPinApi } from './users-api'

export function useVerifyPin() {
  return useMutation({
    // OFF-12: không tạm dừng im lặng khi mất mạng; lỗi mạng trả về ngay để hộp PIN báo rõ
    networkMode: 'always',
    mutationFn: (input: VerifyPinInput) => verifyPinApi(input),
  })
}
