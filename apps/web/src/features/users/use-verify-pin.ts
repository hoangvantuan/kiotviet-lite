import { useMutation } from '@tanstack/react-query'

import type { VerifyPinInput } from '@kiotviet-lite/shared'

import { verifyPinApi } from './users-api'

export function useVerifyPin() {
  return useMutation({
    mutationFn: (input: VerifyPinInput) => verifyPinApi(input),
  })
}
