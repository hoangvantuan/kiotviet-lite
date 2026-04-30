import { useMemo, useState } from 'react'
import { Percent, Plus, SearchX } from 'lucide-react'

import type { CategoryDiscountListItem, ListCategoryDiscountsQuery } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'

import { useCategoryDiscountQuery, useCategoryDiscountsQuery } from '../use-category-discounts'
import { CategoryDiscountsCardList } from './CategoryDiscountsCardList'
import {
  CategoryDiscountsFilters,
  type CategoryDiscountsFiltersValue,
} from './CategoryDiscountsFilters'
import { CategoryDiscountsTable } from './CategoryDiscountsTable'
import { CreateCategoryDiscountDialog } from './CreateCategoryDiscountDialog'
import { DeleteCategoryDiscountDialog } from './DeleteCategoryDiscountDialog'
import { EditCategoryDiscountDialog } from './EditCategoryDiscountDialog'

const DEFAULT_FILTERS: CategoryDiscountsFiltersValue = {
  search: '',
  categoryId: '',
  customerGroupId: '',
  effectiveStatus: 'all',
}

const PAGE_SIZE = 20

export function CategoryDiscountsManager() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [filters, setFilters] = useState<CategoryDiscountsFiltersValue>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CategoryDiscountListItem | null>(null)

  const debouncedSearch = useDebounced(filters.search, 300)

  const apiQuery: Partial<ListCategoryDiscountsQuery> = useMemo(() => {
    const q: Partial<ListCategoryDiscountsQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    if (filters.categoryId) q.categoryId = filters.categoryId
    if (filters.customerGroupId) q.customerGroupId = filters.customerGroupId
    if (filters.effectiveStatus !== 'all') q.effectiveStatus = filters.effectiveStatus
    return q
  }, [page, debouncedSearch, filters.categoryId, filters.customerGroupId, filters.effectiveStatus])

  const listQuery = useCategoryDiscountsQuery(apiQuery)
  const editQuery = useCategoryDiscountQuery(editTargetId ?? undefined)

  const handleFilterChange = (partial: Partial<CategoryDiscountsFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }

  const items = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const isFiltered =
    debouncedSearch.trim().length > 0 ||
    filters.categoryId.length > 0 ||
    filters.customerGroupId.length > 0 ||
    filters.effectiveStatus !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Chiết khấu danh mục</h2>
          <p className="text-sm text-muted-foreground">
            Tạo quy tắc giảm giá theo danh mục cho khách hàng hoặc nhóm KH.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm chiết khấu</span>
          </Button>
        </div>
      </div>

      <CategoryDiscountsFilters value={filters} onChange={handleFilterChange} />

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách chiết khấu.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={Percent}
          title="Chưa có chiết khấu danh mục"
          description="Tạo rule giảm giá cho khách VIP hoặc nhóm KH."
          actionLabel="Thêm chiết khấu"
          onAction={() => setCreateOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy chiết khấu"
          description="Thử bỏ bớt bộ lọc để xem thêm kết quả."
        />
      ) : isDesktop ? (
        <CategoryDiscountsTable
          items={items}
          onEdit={(p) => setEditTargetId(p.id)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      ) : (
        <CategoryDiscountsCardList
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
          unitLabel="chiết khấu"
        />
      )}

      <CreateCategoryDiscountDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditCategoryDiscountDialog
        open={editTargetId !== null}
        onOpenChange={(v) => {
          if (!v) setEditTargetId(null)
        }}
        categoryDiscount={editQuery.data ?? null}
      />
      <DeleteCategoryDiscountDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        categoryDiscount={deleteTarget}
      />
    </div>
  )
}
