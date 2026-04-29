import { useMemo, useState } from 'react'
import { Plus, SearchX, UserCheck } from 'lucide-react'

import type { CustomerPriceListItem, ListCustomerPricesQuery } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'

import { useCustomerPriceQuery, useCustomerPricesQuery } from '../use-customer-prices'
import { CreateCustomerPriceDialog } from './CreateCustomerPriceDialog'
import { CustomerPricesCardList } from './CustomerPricesCardList'
import { CustomerPricesFilters, type CustomerPricesFiltersValue } from './CustomerPricesFilters'
import { CustomerPricesTable } from './CustomerPricesTable'
import { DeleteCustomerPriceDialog } from './DeleteCustomerPriceDialog'
import { EditCustomerPriceDialog } from './EditCustomerPriceDialog'

const DEFAULT_FILTERS: CustomerPricesFiltersValue = {
  search: '',
  customerId: '',
  productId: '',
}

const PAGE_SIZE = 20

export function CustomerPricesManager() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [filters, setFilters] = useState<CustomerPricesFiltersValue>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomerPriceListItem | null>(null)

  const debouncedSearch = useDebounced(filters.search, 300)

  const apiQuery: Partial<ListCustomerPricesQuery> = useMemo(() => {
    const q: Partial<ListCustomerPricesQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    if (filters.customerId) q.customerId = filters.customerId
    if (filters.productId) q.productId = filters.productId
    return q
  }, [page, debouncedSearch, filters.customerId, filters.productId])

  const listQuery = useCustomerPricesQuery(apiQuery)
  const editQuery = useCustomerPriceQuery(editTargetId ?? undefined)

  const handleFilterChange = (partial: Partial<CustomerPricesFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
    setPage(1)
  }

  const items = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const isFiltered =
    debouncedSearch.trim().length > 0 ||
    filters.customerId.length > 0 ||
    filters.productId.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Giá riêng khách hàng</h2>
          <p className="text-sm text-muted-foreground">
            Cấu hình giá đặc biệt cho cặp khách hàng × sản phẩm.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm giá riêng</span>
          </Button>
        </div>
      </div>

      <CustomerPricesFilters value={filters} onChange={handleFilterChange} />

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách giá riêng.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={UserCheck}
          title="Chưa có giá riêng nào"
          description="Tạo giá riêng đầu tiên cho khách hàng VIP hoặc hợp đồng dài hạn."
          actionLabel="Thêm giá riêng"
          onAction={() => setCreateOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy giá riêng"
          description="Thử bỏ bớt bộ lọc để xem thêm kết quả."
        />
      ) : isDesktop ? (
        <CustomerPricesTable
          items={items}
          onEdit={(p) => setEditTargetId(p.id)}
          onDelete={(p) => setDeleteTarget(p)}
        />
      ) : (
        <CustomerPricesCardList
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
          unitLabel="giá riêng"
        />
      )}

      <CreateCustomerPriceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditCustomerPriceDialog
        open={editTargetId !== null}
        onOpenChange={(v) => {
          if (!v) setEditTargetId(null)
        }}
        customerPrice={editQuery.data ?? null}
      />
      <DeleteCustomerPriceDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        customerPrice={deleteTarget}
      />
    </div>
  )
}
