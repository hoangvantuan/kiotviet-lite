import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FolderTree,
  HandCoins,
  LayoutDashboard,
  Package,
  PieChart,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
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
  { path: '/orders', label: 'Hóa đơn', icon: Receipt, requiredPermission: 'orders.view' },
  { path: '/products', label: 'Hàng hóa', icon: Package, requiredPermission: 'products.manage' },
  {
    path: '/products/categories',
    label: 'Danh mục',
    icon: FolderTree,
    requiredPermission: 'products.manage',
  },
  { path: '/customers', label: 'Khách hàng', icon: Users, requiredPermission: 'customers.manage' },
  {
    path: '/receipts',
    label: 'Phiếu thu',
    icon: HandCoins,
    requiredPermission: 'customers.manage',
  },
  { path: '/pricing', label: 'Bảng giá', icon: Tags, requiredPermission: 'pricing.manage' },
  {
    path: '/inventory/suppliers',
    label: 'Nhà cung cấp',
    icon: Truck,
    requiredPermission: 'inventory.manage',
  },
  {
    path: '/inventory/purchase-orders',
    label: 'Phiếu nhập kho',
    icon: ClipboardList,
    requiredPermission: 'inventory.manage',
  },
  {
    path: '/inventory/supplier-payments',
    label: 'Phiếu chi NCC',
    icon: Wallet,
    requiredPermission: 'inventory.manage',
  },
  {
    path: '/inventory/stock-checks',
    label: 'Kiểm kho',
    icon: ClipboardCheck,
    requiredPermission: 'inventory.manage',
  },
  {
    path: '/reports/dashboard',
    label: 'Dashboard',
    icon: Activity,
    requiredPermission: 'reports.view',
  },
  {
    path: '/reports/revenue',
    label: 'Doanh thu',
    icon: TrendingUp,
    requiredPermission: 'reports.view',
  },
  {
    path: '/reports/profit',
    label: 'Lợi nhuận',
    icon: DollarSign,
    requiredPermission: 'reports.view',
  },
  {
    path: '/reports/inventory',
    label: 'Tồn kho',
    icon: Warehouse,
    requiredPermission: 'reports.view',
  },
  {
    path: '/reports/pricing',
    label: 'Giá',
    icon: PieChart,
    requiredPermission: 'reports.view',
  },
  { path: '/reports', label: 'Công nợ', icon: BarChart3, requiredPermission: 'reports.view' },
  { path: '/settings', label: 'Cài đặt', icon: Settings, requiredPermission: 'store.manage' },
]
