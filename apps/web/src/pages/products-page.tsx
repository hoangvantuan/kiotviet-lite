import { Link } from '@tanstack/react-router'
import { FolderTree, Package } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'

// Story 2.1: thêm link tới categories. Story 2.2 sẽ refactor toàn bộ ProductsPage
export function ProductsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sản phẩm</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý sản phẩm và danh mục cho cửa hàng.
          </p>
        </div>
        <Button asChild variant="outline" className="self-start md:self-auto">
          <Link to="/products/categories">
            <FolderTree className="h-4 w-4" />
            <span>Quản lý danh mục</span>
          </Link>
        </Button>
      </div>
      <EmptyState
        icon={Package}
        title="Chưa có sản phẩm nào"
        description="Quản lý sản phẩm sẽ được triển khai ở Epic 2."
      />
    </div>
  )
}
