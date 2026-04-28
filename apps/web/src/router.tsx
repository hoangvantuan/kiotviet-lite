import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'

import { hasPermission, type Permission } from '@kiotviet-lite/shared'

import { AppLayout } from '@/components/layout/app-layout'
import { ErrorBoundary } from '@/components/layout/error-boundary'
import { Toaster } from '@/components/ui/sonner'
import { useMediaQuery as useMediaQueryRoot } from '@/hooks/use-media-query'
import { CustomersGroupsPage } from '@/pages/customers-groups-page'
import { CustomersPage } from '@/pages/customers-page'
import { HomePage } from '@/pages/home-page'
import { LoginPage } from '@/pages/login-page'
import { PosPage } from '@/pages/pos-page'
import { PricingDetailPage } from '@/pages/pricing-detail-page'
import { PricingPage } from '@/pages/pricing-page'
import { ProductsCategoriesPage } from '@/pages/products-categories-page'
import { ProductsPage } from '@/pages/products-page'
import { PurchaseOrderCreatePage } from '@/pages/purchase-order-create-page'
import { PurchaseOrderDetailPage } from '@/pages/purchase-order-detail-page'
import { PurchaseOrdersPage } from '@/pages/purchase-orders-page'
import { RegisterPage } from '@/pages/register-page'
import { ReportsPage } from '@/pages/reports-page'
import { SettingsAuditPage } from '@/pages/settings-audit-page'
import { SettingsPage } from '@/pages/settings-page'
import { SettingsStaffPage } from '@/pages/settings-staff-page'
import { SettingsStorePage } from '@/pages/settings-store-page'
import { SuppliersPage } from '@/pages/suppliers-page'
import { useAuthStore } from '@/stores/use-auth-store'

const rootRoute = createRootRoute({
  component: RootComponent,
})

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

const homeSearchSchema = z.object({
  error: z.string().optional(),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: loginSearchSchema,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: RegisterPage,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  beforeLoad: ({ location }) => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})

const appLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: '_app-layout',
  component: AppLayout,
})

function requirePermissionGuard(perm: Permission) {
  return () => {
    const role = useAuthStore.getState().user?.role
    if (!role || !hasPermission(role, perm)) {
      throw redirect({ to: '/', search: { error: 'forbidden' } })
    }
  }
}

const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  validateSearch: homeSearchSchema,
  component: HomePage,
})

const productsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/products',
  beforeLoad: requirePermissionGuard('products.manage'),
  component: ProductsPage,
})

const productsCategoriesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/products/categories',
  beforeLoad: requirePermissionGuard('products.manage'),
  component: ProductsCategoriesPage,
})

const customersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/customers',
  beforeLoad: requirePermissionGuard('customers.manage'),
  component: CustomersPage,
})

const customersGroupsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/customers/groups',
  beforeLoad: requirePermissionGuard('customers.manage'),
  component: CustomersGroupsPage,
})

const pricingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/pricing',
  beforeLoad: requirePermissionGuard('pricing.manage'),
  component: PricingPage,
})

const pricingDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/pricing/$id',
  beforeLoad: requirePermissionGuard('pricing.manage'),
  component: PricingDetailPage,
})

const inventorySuppliersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventory/suppliers',
  beforeLoad: requirePermissionGuard('inventory.manage'),
  component: SuppliersPage,
})

const inventoryPurchaseOrdersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventory/purchase-orders',
  beforeLoad: requirePermissionGuard('inventory.manage'),
  component: PurchaseOrdersPage,
})

const inventoryPurchaseOrderCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventory/purchase-orders/new',
  beforeLoad: requirePermissionGuard('inventory.manage'),
  component: PurchaseOrderCreatePage,
})

const inventoryPurchaseOrderDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventory/purchase-orders/$orderId',
  beforeLoad: requirePermissionGuard('inventory.manage'),
  component: PurchaseOrderDetailPage,
})

const reportsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/reports',
  beforeLoad: requirePermissionGuard('reports.view'),
  component: ReportsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  beforeLoad: requirePermissionGuard('audit.viewOwn'),
  component: SettingsPage,
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: () => {
    const role = useAuthStore.getState().user?.role
    if (role && hasPermission(role, 'store.manage')) {
      throw redirect({ to: '/settings/store' })
    }
    if (role && hasPermission(role, 'users.manage')) {
      throw redirect({ to: '/settings/staff' })
    }
    throw redirect({ to: '/settings/audit' })
  },
})

const settingsStoreRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'store',
  beforeLoad: requirePermissionGuard('store.manage'),
  component: SettingsStorePage,
})

const settingsStaffRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'staff',
  beforeLoad: requirePermissionGuard('users.manage'),
  component: SettingsStaffPage,
})

const settingsAuditRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'audit',
  beforeLoad: requirePermissionGuard('audit.viewOwn'),
  component: SettingsAuditPage,
})

const posRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/pos',
  beforeLoad: requirePermissionGuard('pos.sell'),
  component: PosPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  authenticatedRoute.addChildren([
    appLayoutRoute.addChildren([
      homeRoute,
      productsRoute,
      productsCategoriesRoute,
      customersRoute,
      customersGroupsRoute,
      pricingRoute,
      pricingDetailRoute,
      inventorySuppliersRoute,
      inventoryPurchaseOrdersRoute,
      inventoryPurchaseOrderCreateRoute,
      inventoryPurchaseOrderDetailRoute,
      reportsRoute,
      settingsRoute.addChildren([
        settingsIndexRoute,
        settingsStoreRoute,
        settingsStaffRoute,
        settingsAuditRoute,
      ]),
    ]),
    posRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function RootComponent() {
  return (
    <ErrorBoundary>
      <Outlet />
      <ResponsiveToaster />
    </ErrorBoundary>
  )
}

function ResponsiveToaster() {
  const isDesktop = useMediaQueryRoot('(min-width: 768px)')
  return (
    <Toaster
      position={isDesktop ? 'top-right' : 'top-center'}
      toastOptions={{
        classNames: { toast: 'md:max-w-sm' },
      }}
      closeButton
    />
  )
}
