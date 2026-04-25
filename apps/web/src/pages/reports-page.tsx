import { BarChart3 } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'

export function ReportsPage() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Chưa có dữ liệu báo cáo"
      description="Báo cáo sẽ hiển thị khi có dữ liệu bán hàng."
    />
  )
}
