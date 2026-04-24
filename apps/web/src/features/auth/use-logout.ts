import { useMutation } from '@tanstack/react-query'

import { useAuthStore } from '@/stores/use-auth-store'

import { logoutApi } from './auth-api'

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)

  return useMutation({
    mutationFn: () => logoutApi(),
    onSettled: () => {
      clearAuth()
    },
  })
}
