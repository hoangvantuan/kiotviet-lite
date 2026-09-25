import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { showError } from './toast'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.skipGlobalError) return
      showError(error.message || 'Đã xảy ra lỗi khi tải dữ liệu')
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.skipGlobalError) return
      if (mutation.options.onError) return
      showError(error.message || 'Đã xảy ra lỗi')
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    // R4 (UX-03): mutation không tự tạm dừng khi trình duyệt báo mất mạng rồi âm thầm gửi lại
    // sau đó; request thất bại ngay để người dùng thấy và tự quyết định lưu lại
    mutations: {
      networkMode: 'always',
    },
  },
})
