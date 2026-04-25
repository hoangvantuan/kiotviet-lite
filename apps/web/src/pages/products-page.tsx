import { Package } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'

export function ProductsPage() {
  return (
    <EmptyState
      icon={Package}
      title="Chưa có sản phẩm nào"
      description="Quản lý sản phẩm sẽ được triển khai ở Epic 2."
    />
  )
}
