import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'

import { Toaster } from '@/components/ui/sonner'
import { HomePage } from '@/pages/home-page'
import { LoginPage } from '@/pages/login-page'
import { RegisterPage } from '@/pages/register-page'
import { useAuthStore } from '@/stores/use-auth-store'

const rootRoute = createRootRoute({
  component: RootComponent,
})

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
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
  component: AuthenticatedLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: HomePage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  authenticatedRoute.addChildren([homeRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  )
}

function AuthenticatedLayout() {
  return <Outlet />
}
