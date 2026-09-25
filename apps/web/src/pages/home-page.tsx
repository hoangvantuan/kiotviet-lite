import { useNavigate } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { hasPermission } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { useAuthStore } from '@/stores/use-auth-store'

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  // Chỉ gợi ý xem báo cáo khi vai trò có quyền xem (staff không có)
  const canViewReports = !!user?.role && hasPermission(user.role, 'reports.view')
  const canSell = !!user?.role && hasPermission(user.role, 'pos.sell')

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">
        Xin chào, {user?.name || 'bạn'}
      </h1>
      {canViewReports ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Chào mừng đến với KiotViet Lite"
          description="Số liệu doanh thu, lợi nhuận và công nợ nằm trong mục Báo cáo."
          actionLabel="Xem báo cáo"
          onAction={() => navigate({ to: '/reports/dashboard' })}
        />
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Chào mừng đến với KiotViet Lite"
          description="Chọn một mục ở menu để bắt đầu làm việc."
          actionLabel={canSell ? 'Mở màn bán hàng' : undefined}
          onAction={canSell ? () => navigate({ to: '/pos' }) : undefined}
        />
      )}
    </div>
  )
}
