import { useMemo } from 'react'

import { hasPermission, type Permission } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

export interface PermissionsApi {
  has: (perm: Permission) => boolean
  hasAny: (perms: Permission[]) => boolean
  hasAll: (perms: Permission[]) => boolean
}

export function usePermissions(): PermissionsApi {
  const user = useAuthStore((s) => s.user)

  return useMemo<PermissionsApi>(() => {
    const role = user?.role
    return {
      has: (perm) => (role ? hasPermission(role, perm) : false),
      hasAny: (perms) => (role ? perms.some((p) => hasPermission(role, p)) : false),
      hasAll: (perms) => (role ? perms.every((p) => hasPermission(role, p)) : false),
    }
  }, [user?.role])
}
