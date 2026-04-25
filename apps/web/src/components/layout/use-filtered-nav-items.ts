import { hasPermission } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { NAV_ITEMS, type NavItem } from './nav-items'

export function useFilteredNavItems(): NavItem[] {
  const role = useAuthStore((s) => s.user?.role)
  if (!role) return []
  return NAV_ITEMS.filter(
    (item) => !item.requiredPermission || hasPermission(role, item.requiredPermission),
  )
}
