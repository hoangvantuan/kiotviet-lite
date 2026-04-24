import { useMutation } from '@tanstack/react-query'

import type { LoginInput } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { loginApi } from './auth-api'

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (input: LoginInput) => loginApi(input),
    onSuccess: (res) => {
      setAuth({ user: res.data.user, accessToken: res.data.accessToken })
    },
  })
}
