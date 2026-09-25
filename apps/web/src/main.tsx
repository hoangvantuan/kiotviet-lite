import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { meApi, refreshApi } from './features/auth/auth-api'
import { repriceTabAction } from './features/pos/hooks/use-auto-reprice'
import { queryClient } from './lib/query-client'
import { router } from './router'
import { startCartPersistence } from './stores/cart-persistence'
import { useAuthStore } from './stores/use-auth-store'

import './globals.css'

// Giỏ POS khôi phục khi đăng nhập hoặc tải lại; giá có thể đã đổi nên tính lại
startCartPersistence({
  onRestore: (tabIndexes) => tabIndexes.forEach((tab) => repriceTabAction(tab)),
})

async function bootAuth() {
  const refreshResult = await refreshApi()
  if (!refreshResult || ('error' in refreshResult)) {
    if (refreshResult && 'error' in refreshResult && refreshResult.error === 'network') {
      useAuthStore.getState().setNetworkError(true)
    }
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
