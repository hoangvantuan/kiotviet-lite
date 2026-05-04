import { useState } from 'react'
import { HandCoins, Plus, SearchX } from 'lucide-react'

import type { ReceiptDetail } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { useDebounced } from '@/hooks/use-debounced'
import { formatVndWithSuffix } from '@/lib/currency'
import { showSuccess } from '@/lib/toast'

import { CreateReceiptDialog } from './create-receipt-dialog'
import { ReceiptDetailDialog } from './receipt-detail-dialog'
import { ReceiptSuccessDialog } from './receipt-success-dialog'
import { ReceiptsCardList } from './receipts-card-list'
import { ReceiptsFilters } from './receipts-filters'
import { ReceiptsTable } from './receipts-table'
import { useReceiptsQuery } from './use-receipts'

const PAGE_SIZE = 20

function toIsoStart(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T00:00:00`).toISOString()
}

function toIsoEnd(date: string): string | undefined {
  if (!date) return undefined
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export function ReceiptsManager() {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [customerId, setCustomerId] = useState<string | undefined>(undefined)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const [createOpen, setCreateOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [createdReceipt, setCreatedReceipt] = useState<ReceiptDetail | null>(null)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const receiptsQuery = useReceiptsQuery({
    page,
    pageSize: PAGE_SIZE,
    customerId,
    fromDate: toIsoStart(fromDate),
    toDate: toIsoEnd(toDate),
    search: debouncedSearch.trim() || undefined,
  })

  const items = receiptsQuery.data?.data ?? []
  const meta = receiptsQuery.data?.meta
  const isLoading = receiptsQuery.isLoading
  const isError = receiptsQuery.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter =
    debouncedSearch.trim() !== '' || customerId !== undefined || fromDate !== '' || toDate !== ''

  const handleCreated = (receipt: ReceiptDetail) => {
    const debtAfter = receipt.debtAfter ?? 0
    showSuccess(
      `Đã tạo phiếu thu ${formatVndWithSuffix(receipt.amount)} cho ${receipt.customerName ?? 'KH'}. Nợ còn lại: ${formatVndWithSuffix(debtAfter)}`,
    )
    setCreatedReceipt(receipt)
    setSuccessOpen(true)
  }

  const handleView = (id: string) => {
    setDetailId(id)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu thu nợ khách hàng</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý phiếu thu và phân bổ vào các khoản nợ của khách hàng
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1" /> Tạo phiếu thu
        </Button>
      </header>

      <ReceiptsFilters
        searchInput={searchInput}
        onSearchInputChange={(v) => {
          setSearchInput(v)
          setPage(1)
        }}
        customerId={customerId}
        onCustomerIdChange={(v) => {
          setCustomerId(v)
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
          icon={HandCoins}
          title="Chưa có phiếu thu nào"
          description="Tạo phiếu thu đầu tiên để ghi nhận thu nợ KH"
          actionLabel="Tạo phiếu thu"
          onAction={() => setCreateOpen(true)}
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy phiếu thu"
          description="Thử thay đổi từ khoá hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && (
        <>
          <div className="hidden md:block">
            <ReceiptsTable items={items} onView={handleView} />
          </div>
          <div className="md:hidden">
            <ReceiptsCardList items={items} onView={handleView} />
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

      <CreateReceiptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <ReceiptSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        receipt={createdReceipt}
      />

      <ReceiptDetailDialog open={detailOpen} onOpenChange={setDetailOpen} receiptId={detailId} />
    </div>
  )
}
