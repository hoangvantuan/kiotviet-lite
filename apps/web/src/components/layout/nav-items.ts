import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  FolderTree,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from 'lucide-react'

import type { Permission } from '@kiotviet-lite/shared'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  requiredPermission?: Permission
}

export function findActivePath(currentPath: string, paths: string[]): string | null {
  if (currentPath === '/') return paths.includes('/') ? '/' : null
  let best: string | null = null
  for (const p of paths) {
    if (p === '/') continue
    if (currentPath === p || currentPath.startsWith(p + '/')) {
      if (!best || p.length > best.length) best = p
    }
  }
  return best
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/pos', label: 'Bán hàng', icon: ShoppingCart, requiredPermission: 'pos.sell' },
  { path: '/products', label: 'Hàng hóa', icon: Package, requiredPermission: 'products.manage' },
  {
    path: '/products/categories',
    label: 'Danh mục',
    icon: FolderTree,
    requiredPermission: 'products.manage',
  },
  { path: '/customers', label: 'Khách hàng', icon: Users, requiredPermission: 'customers.manage' },
  { path: '/reports', label: 'Báo cáo', icon: BarChart3, requiredPermission: 'reports.view' },
  { path: '/settings', label: 'Cài đặt', icon: Settings, requiredPermission: 'audit.viewOwn' },
]
