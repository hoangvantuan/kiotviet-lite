import { useMemo, useState } from 'react'
import { Package, Plus, SearchX, Trash2 } from 'lucide-react'

import type { ListProductsQuery, ProductListItem, StockFilter } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'

import { useCategoriesQuery } from '../categories/use-categories'
import { DeleteProductDialog } from './delete-product-dialog'
import { ProductCardList } from './product-card-list'
import { ProductFilters, type ProductFiltersValue } from './product-filters'
import { ProductFormDialog } from './product-form-dialog'
import { ProductTable } from './product-table'
import { TrashedProductsSheet } from './trashed-products-sheet'
import { useProductQuery, useProductsQuery } from './use-products'

const DEFAULT_FILTERS: ProductFiltersValue = {
  search: '',
  categoryId: 'all',
  status: 'all',
  stockFilter: 'all',
}

const PAGE_SIZE = 20

export function ProductsManager() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [filters, setFilters] = useState<ProductFiltersValue>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null)
  const [trashedOpen, setTrashedOpen] = useState(false)

  const debouncedSearch = useDebounced(filters.search, 300)

  const apiQuery: Partial<ListProductsQuery> = useMemo(() => {
    const q: Partial<ListProductsQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    if (filters.categoryId !== 'all') {
      q.categoryId = filters.categoryId === 'none' ? 'none' : filters.categoryId
    }
    if (filters.status !== 'all') q.status = filters.status
    if (filters.stockFilter !== 'all') q.stockFilter = filters.stockFilter as StockFilter
    return q
  }, [page, debouncedSearch, filters.categoryId, filters.status, filters.stockFilter])

  const productsQuery = useProductsQuery(apiQuery)
  const categoriesQuery = useCategoriesQuery()
  const editProductQuery = useProductQuery(editTargetId ?? undefined)

  const handleFilterChange = (partial: Partial<ProductFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }

  const items = productsQuery.data?.data ?? []
  const meta = productsQuery.data?.meta
  const isFiltered =
    debouncedSearch.trim().length > 0 ||
    filters.categoryId !== 'all' ||
    filters.status !== 'all' ||
    filters.stockFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sản phẩm</h2>
          <p className="text-sm text-muted-foreground">Quản lý danh sách hàng hoá của cửa hàng.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Button variant="outline" size="sm" onClick={() => setTrashedOpen(true)}>
            <Trash2 className="h-4 w-4" />
            <span>Sản phẩm đã xoá</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm sản phẩm</span>
          </Button>
        </div>
      </div>

      <ProductFilters
        value={filters}
        onChange={handleFilterChange}
        categories={categoriesQuery.data ?? []}
      />

      {productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : productsQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách sản phẩm.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={Package}
          title="Chưa có sản phẩm nào"
          description="Thêm sản phẩm đầu tiên để bắt đầu bán hàng."
          actionLabel="Thêm sản phẩm"
          onAction={() => setCreateOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy sản phẩm"
          description="Thử bỏ bớt bộ lọc để xem thêm kết quả."
        />
      ) : isDesktop ? (
        <ProductTable
          items={items}
          onEdit={(p) => setEditTargetId(p.id)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      ) : (
        <ProductCardList
          items={items}
          onEdit={(p) => setEditTargetId(p.id)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      )}

      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="sản phẩm"
        />
      )}

      <ProductFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categoriesQuery.data ?? []}
      />
      {editProductQuery.data && (
        <ProductFormDialog
          mode="edit"
          open={editTargetId !== null}
          onOpenChange={(v) => {
            if (!v) setEditTargetId(null)
          }}
          product={editProductQuery.data}
          categories={categoriesQuery.data ?? []}
        />
      )}
      <DeleteProductDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        product={deleteTarget}
      />
      <TrashedProductsSheet open={trashedOpen} onOpenChange={setTrashedOpen} />
    </div>
  )
}
