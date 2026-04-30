import { useState } from 'react'
import { Plus, SearchX, Wallet } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { useAuthStore } from '@/stores/use-auth-store'

import { CreateSupplierPaymentDialog } from './create-supplier-payment-dialog'
import { SupplierPaymentsCardList } from './supplier-payments-card-list'
import { SupplierPaymentsFilters } from './supplier-payments-filters'
import { SupplierPaymentsTable } from './supplier-payments-table'
import { useSupplierPaymentsQuery } from './use-supplier-payments'

const PAGE_SIZE = 20

function toIsoStart(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T00:00:00`).toISOString()
}

function toIsoEnd(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export function SupplierPaymentsManager() {
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'owner'

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  const paymentsQuery = useSupplierPaymentsQuery({
    page,
    pageSize: PAGE_SIZE,
    supplierId,
    fromDate: toIsoStart(fromDate),
    toDate: toIsoEnd(toDate),
    search: debouncedSearch.trim() || undefined,
  })

  const items = paymentsQuery.data?.data ?? []
  const meta = paymentsQuery.data?.meta
  const isLoading = paymentsQuery.isLoading
  const isError = paymentsQuery.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter =
    debouncedSearch.trim() !== '' || supplierId !== undefined || fromDate !== '' || toDate !== ''

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu chi trả nợ NCC</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý phiếu chi thanh toán công nợ phải trả nhà cung cấp
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" /> Tạo phiếu chi
          </Button>
        )}
      </header>

      <SupplierPaymentsFilters
        searchInput={searchInput}
        onSearchInputChange={(v) => {
          setSearchInput(v)
          setPage(1)
        }}
        supplierId={supplierId}
        onSupplierIdChange={(v) => {
          setSupplierId(v)
          setPage(1)
        }}
        fromDate={fromDate}
        onFromDateChange={(v) => {
          setFromDate(v)
          setPage(1)
        }}
        toDate={toDate}
        onToDateChange={(v) => {
          setToDate(v)
          setPage(1)
        }}
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Không tải được danh sách. Thử lại sau.</p>
      )}

      {isEmpty && !hasFilter && (
        <EmptyState
          icon={Wallet}
          title="Chưa có phiếu chi nào"
          description={
            isOwner
              ? 'Tạo phiếu chi đầu tiên để thanh toán nợ NCC'
              : 'Chưa có phiếu chi nào trong khoảng thời gian này'
          }
          actionLabel={isOwner ? 'Tạo phiếu chi' : undefined}
          onAction={isOwner ? () => setCreateOpen(true) : undefined}
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy phiếu chi"
          description="Thử thay đổi từ khoá hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && (
        <>
          <div className="hidden md:block">
            <SupplierPaymentsTable items={items} />
          </div>
          <div className="md:hidden">
            <SupplierPaymentsCardList items={items} />
          </div>
        </>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="phiếu"
        />
      )}

      {isOwner && <CreateSupplierPaymentDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}
