import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { meApi, refreshApi } from './features/auth/auth-api'
import { router } from './router'
import { useAuthStore } from './stores/use-auth-store'

import './globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

async function bootAuth() {
  const refreshResult = await refreshApi()
  if (!refreshResult) {
    useAuthStore.getState().markBooted()
    return
  }
  useAuthStore.getState().setAccessToken(refreshResult.accessToken)
  try {
    const { data: user } = await meApi()
    useAuthStore.getState().setAuth({ user, accessToken: refreshResult.accessToken })
  } catch {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().markBooted()
  }
}

bootAuth().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
