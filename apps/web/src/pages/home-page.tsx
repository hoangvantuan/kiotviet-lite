import { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { showWarning } from '@/lib/toast'
import { useAuthStore } from '@/stores/use-auth-store'

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const search = useSearch({ strict: false }) as { error?: string }
  const navigate = useNavigate()

  useEffect(() => {
    if (search.error === 'forbidden') {
      showWarning('Bạn không có quyền truy cập trang này')
      navigate({ to: '/', replace: true, search: {} as never })
    }
  }, [search.error, navigate])

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-foreground">Xin chào, {user?.name ?? ''}</h2>
      <EmptyState
        icon={LayoutDashboard}
        title="Chào mừng đến KiotViet Lite"
        description="Dashboard tổng quan sẽ hiển thị khi có dữ liệu bán hàng."
      />
    </div>
  )
}
