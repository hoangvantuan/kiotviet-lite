import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { bootAuth } from './features/auth/boot-auth'
import { repriceTabAction } from './features/pos/hooks/use-auto-reprice'
import { queryClient } from './lib/query-client'
import { router } from './router'
import { startCartPersistence } from './stores/cart-persistence'

import './globals.css'

// Giỏ POS khôi phục khi đăng nhập hoặc tải lại; giá có thể đã đổi nên tính lại
startCartPersistence({
  onRestore: (tabIndexes) => tabIndexes.forEach((tab) => repriceTabAction(tab)),
})

if (import.meta.env.VITE_E2E_HOOKS === '1') {
  void import('./lib/e2e-hooks').then((m) => m.installE2EHooks())
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
