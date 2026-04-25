import { hasPermission, type Permission } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

export function usePermission(perm: Permission): boolean {
  const role = useAuthStore((s) => s.user?.role)
  if (!role) return false
  return hasPermission(role, perm)
}
