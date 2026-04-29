import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ClipboardCheck, Plus, SearchX } from 'lucide-react'

import type { StockCheckListItem, StockCheckStatus } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDebounced } from '@/hooks/use-debounced'

import { StockCheckStatusBadge } from './stock-check-status-badge'
import { useStockChecksQuery } from './use-stock-checks'

const PAGE_SIZE = 20

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function toLocalIsoString(localDateTime: string): string {
  return new Date(localDateTime).toISOString()
}

export function StockCheckManager() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [status, setStatus] = useState<StockCheckStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const query = useStockChecksQuery({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate ? toLocalIsoString(`${fromDate}T00:00:00`) : undefined,
    toDate: toDate ? toLocalIsoString(`${toDate}T23:59:59`) : undefined,
  })

  const items = query.data?.data ?? []
  const meta = query.data?.meta
  const counts = meta?.counts
  const isLoading = query.isLoading
  const isError = query.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter =
    debouncedSearch.trim() !== '' || status !== 'all' || fromDate !== '' || toDate !== ''

  const resetFilters = () => {
    setSearchInput('')
    setStatus('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kiểm kho</h1>
          <p className="text-sm text-muted-foreground">
            Tạo phiếu kiểm để đối chiếu tồn kho thực tế.
          </p>
        </div>
        <Button asChild>
          <Link to="/inventory/stock-checks/new">
            <Plus className="size-4 mr-1" /> Tạo phiếu kiểm kho
          </Link>
        </Button>
      </header>

      {counts && (
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => {
              setStatus('all')
              setPage(1)
            }}
            className={`rounded-md border px-3 py-1 ${status === 'all' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            Tất cả ({counts.total})
          </button>
          <button
            onClick={() => {
              setStatus('draft')
              setPage(1)
            }}
            className={`rounded-md border px-3 py-1 ${status === 'draft' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            Đang nháp ({counts.draft})
          </button>
          <button
            onClick={() => {
              setStatus('confirmed')
              setPage(1)
            }}
            className={`rounded-md border px-3 py-1 ${status === 'confirmed' ? 'bg-primary text-primary-foreground' : ''}`}
          >
            Đã xác nhận ({counts.confirmed})
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Tìm theo mã phiếu..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
        />
        <Select
          value={status}
          onValueChange={(v: StockCheckStatus | 'all') => {
            setStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="draft">Nháp</SelectItem>
            <SelectItem value="confirmed">Đã xác nhận</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value)
            setPage(1)
          }}
          aria-label="Từ ngày"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value)
            setPage(1)
          }}
          aria-label="Đến ngày"
        />
        <Button variant="outline" onClick={resetFilters}>
          Reset
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Không tải được danh sách phiếu kiểm kho.</p>
      )}

      {isEmpty && !hasFilter && (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có phiếu kiểm kho"
          description="Tạo phiếu kiểm đầu tiên để đối chiếu tồn kho thực tế."
          actionLabel="Tạo phiếu kiểm kho"
          onAction={() => navigate({ to: '/inventory/stock-checks/new' })}
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy phiếu kiểm"
          description="Thử thay đổi từ khoá hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && <StockCheckTable items={items} />}

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

function StockCheckTable({ items }: { items: StockCheckListItem[] }) {
  return (
    <>
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">SP</TableHead>
              <TableHead className="text-right">Tăng</TableHead>
              <TableHead className="text-right">Giảm</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Người xác nhận</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Ngày xác nhận</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-mono font-medium">
                  <Link
                    to="/inventory/stock-checks/$id"
                    params={{ id: it.id }}
                    className="hover:underline"
                  >
                    {it.code}
                  </Link>
                </TableCell>
                <TableCell>
                  <StockCheckStatusBadge status={it.status} />
                </TableCell>
                <TableCell className="text-right">{it.totalItems}</TableCell>
                <TableCell className="text-right text-green-600 font-medium">
                  +{it.totalDiffPositive}
                </TableCell>
                <TableCell className="text-right text-red-600 font-medium">
                  -{it.totalDiffNegative}
                </TableCell>
                <TableCell>{it.createdByName ?? '—'}</TableCell>
                <TableCell>{it.confirmedByName ?? '—'}</TableCell>
                <TableCell>{formatDateTime(it.createdAt)}</TableCell>
                <TableCell>{formatDateTime(it.confirmedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <Link
            key={it.id}
            to="/inventory/stock-checks/$id"
            params={{ id: it.id }}
            className="block rounded-md border p-3 hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{it.code}</span>
              <StockCheckStatusBadge status={it.status} />
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">{formatDateTime(it.createdAt)}</span>
              <span>
                <span className="text-green-600">+{it.totalDiffPositive}</span>{' '}
                <span className="text-red-600">-{it.totalDiffNegative}</span>{' '}
                <span className="text-muted-foreground">({it.totalItems} SP)</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
