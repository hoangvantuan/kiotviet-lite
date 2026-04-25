import { Link } from '@tanstack/react-router'
import { ArrowLeft, ShoppingCart } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'

export function PosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Link
          to="/"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Quay về trang chủ"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold text-foreground">Bán hàng</h1>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={ShoppingCart}
          title="Màn hình bán hàng"
          description="Chức năng POS sẽ được triển khai ở Epic 3."
        />
      </div>
    </div>
  )
}
