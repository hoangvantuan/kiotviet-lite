import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus, SearchX, Tags, Trash2 } from 'lucide-react'

import type { ListPriceListsQuery, PriceListListItem } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'

import { usePriceListQuery, usePriceListsQuery } from '../use-price-lists'
import { CreatePriceListDialog } from './CreatePriceListDialog'
import { DeletePriceListDialog } from './DeletePriceListDialog'
import { EditPriceListDialog } from './EditPriceListDialog'
import { PriceListCardList } from './PriceListCardList'
import { PriceListFilters, type PriceListFiltersValue } from './PriceListFilters'
import { PriceListTable } from './PriceListTable'
import { TrashedPriceListsSheet } from './TrashedPriceListsSheet'

const DEFAULT_FILTERS: PriceListFiltersValue = {
  search: '',
  method: 'all',
  status: 'all',
}

const PAGE_SIZE = 20

export function PriceListsManager() {
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [filters, setFilters] = useState<PriceListFiltersValue>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PriceListListItem | null>(null)
  const [trashedOpen, setTrashedOpen] = useState(false)

  const debouncedSearch = useDebounced(filters.search, 300)

  const apiQuery: Partial<ListPriceListsQuery> = useMemo(() => {
    const q: Partial<ListPriceListsQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    if (filters.method !== 'all') q.method = filters.method
    if (filters.status !== 'all') q.status = filters.status
    return q
  }, [page, debouncedSearch, filters.method, filters.status])

  const listQuery = usePriceListsQuery(apiQuery)
  const editQuery = usePriceListQuery(editTargetId ?? undefined)

  const handleFilterChange = (partial: Partial<PriceListFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }

  const items = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const isFiltered =
    debouncedSearch.trim().length > 0 || filters.method !== 'all' || filters.status !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bảng giá</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý bảng giá: trực tiếp hoặc theo công thức.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Button variant="outline" size="sm" onClick={() => setTrashedOpen(true)}>
            <Trash2 className="h-4 w-4" />
            <span>Bảng giá đã xoá</span>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm bảng giá</span>
          </Button>
        </div>
      </div>

      <PriceListFilters value={filters} onChange={handleFilterChange} />

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách bảng giá.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={Tags}
          title="Chưa có bảng giá nào"
          description="Tạo bảng giá đầu tiên để áp dụng cho khách hàng/khu vực."
          actionLabel="Thêm bảng giá"
          onAction={() => setCreateOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy bảng giá"
          description="Thử bỏ bớt bộ lọc để xem thêm kết quả."
        />
      ) : isDesktop ? (
        <PriceListTable
          items={items}
          onOpen={(id) => navigate({ to: '/pricing/$id', params: { id } })}
          onEdit={(p) => setEditTargetId(p.id)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      ) : (
        <PriceListCardList
          items={items}
          onOpen={(id) => navigate({ to: '/pricing/$id', params: { id } })}
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
          unitLabel="bảng giá"
        />
      )}

      <CreatePriceListDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditPriceListDialog
        open={editTargetId !== null}
        onOpenChange={(v) => {
          if (!v) setEditTargetId(null)
        }}
        priceList={editQuery.data ?? null}
      />
      <DeletePriceListDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        priceList={deleteTarget}
      />
      <TrashedPriceListsSheet open={trashedOpen} onOpenChange={setTrashedOpen} />
    </div>
  )
}
