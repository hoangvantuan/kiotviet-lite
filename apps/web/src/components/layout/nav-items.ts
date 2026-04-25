import type { LucideIcon } from 'lucide-react'
import { BarChart3, LayoutDashboard, Package, Settings, ShoppingCart } from 'lucide-react'

import type { Permission } from '@kiotviet-lite/shared'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  requiredPermission?: Permission
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/pos', label: 'Bán hàng', icon: ShoppingCart, requiredPermission: 'pos.sell' },
  { path: '/products', label: 'Hàng hóa', icon: Package, requiredPermission: 'products.manage' },
  { path: '/reports', label: 'Báo cáo', icon: BarChart3, requiredPermission: 'reports.view' },
  { path: '/settings', label: 'Cài đặt', icon: Settings, requiredPermission: 'audit.viewOwn' },
]
