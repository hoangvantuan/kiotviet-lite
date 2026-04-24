import { useMutation } from '@tanstack/react-query'

import type { RegisterInput } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { registerApi } from './auth-api'

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (input: RegisterInput) => registerApi(input),
    onSuccess: (res) => {
      setAuth({ user: res.data.user, accessToken: res.data.accessToken })
    },
  })
}
