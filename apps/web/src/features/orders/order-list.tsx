import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Receipt, SearchX, Users, X } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { useCustomersQuery } from '@/features/customers/use-customers'
import { useDebounced } from '@/hooks/use-debounced'
import { formatVndWithSuffix } from '@/lib/currency'

import type { OrderListItem } from './orders-api'
import { useOrdersQuery } from './use-orders'

const PAGE_SIZE = 20

type DatePreset = 'today' | '7days' | '30days' | 'all' | 'custom'

import { OrderStatusBadge as StatusBadge, PaymentStatusBadge } from './order-status-badges'

function formatDate(iso: string): string {
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

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): { fromDate?: string; toDate?: string } {
  if (preset === 'custom') {
    return { fromDate: customFrom, toDate: customTo }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateString(today)

  switch (preset) {
    case 'today':
      return { fromDate: todayStr, toDate: todayStr }
    case '7days': {
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return { fromDate: toLocalDateString(from), toDate: todayStr }
    }
    case '30days': {
      const from = new Date(today)
      from.setDate(from.getDate() - 29)
      return { fromDate: toLocalDateString(from), toDate: todayStr }
    }
    case 'all':
      return {}
  }
}

function CustomerSearchFilter({
  customerId,
  customerName,
  onChange,
}: {
  customerId?: string
  customerName?: string
  onChange: (id: string | undefined, name: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data } = useCustomersQuery({
    search: debouncedSearch || undefined,
    pageSize: 10,
  })
  const customers = data?.data ?? []

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  if (customerId && customerName) {
    return (
      <div className="flex items-center gap-1 h-9 rounded-md border px-3 text-sm">
        <Users className="size-4 text-muted-foreground shrink-0" />
        <span className="truncate">{customerName}</span>
        <button
          type="button"
          className="ml-auto shrink-0"
          onClick={() => onChange(undefined, undefined)}
        >
          <X className="size-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start font-normal h-9 w-full">
          <Users className="size-4 mr-2 text-muted-foreground" />
          <span className="text-muted-foreground">Khách hàng</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          ref={inputRef}
          placeholder="Tìm tên hoặc SĐT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8"
        />
        {customers.length === 0 && debouncedSearch && (
          <p className="text-xs text-muted-foreground text-center py-2">Không tìm thấy</p>
        )}
        <div className="max-h-48 overflow-y-auto">
          {customers.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
              onClick={() => {
                onChange(c.id, c.name)
                setOpen(false)
                setSearch('')
              }}
            >
              <div className="font-medium">{c.name}</div>
              {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function OrderList() {
  const navigate = useNavigate()
  const searchParams = useSearch({ from: '/_authenticated/_app-layout/orders' })

  const [searchInput, setSearchInput] = useState(searchParams.search ?? '')
  const debouncedSearch = useDebounced(searchInput, 300)

  const datePreset = (searchParams.datePreset ?? 'today') as DatePreset
  const page = searchParams.page ?? 1
  const status = searchParams.status ?? undefined
  const paymentMethod = searchParams.paymentMethod ?? undefined
  const paymentStatus = searchParams.paymentStatus ?? undefined
  const customerId = searchParams.customerId ?? undefined
  const customerName = searchParams.customerName ?? undefined
  const customFromDate = searchParams.fromDate
  const customToDate = searchParams.toDate

  const updateSearch = useCallback(
    (updates: Record<string, unknown>) => {
      navigate({
        to: '/orders',
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      })
    },
    [navigate],
  )

  useEffect(() => {
    const prev = searchParams.search
    if (debouncedSearch.trim() !== (prev ?? '')) {
      updateSearch({
        search: debouncedSearch.trim() || undefined,
        page: 1,
      })
    }
  }, [debouncedSearch, searchParams.search, updateSearch])

  const dateRange = getDateRange(datePreset, customFromDate, customToDate)

  const ordersQuery = useOrdersQuery({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    status,
    customerId,
    paymentMethod,
    paymentStatus,
  })

  const items = ordersQuery.data?.data ?? []
  const meta = ordersQuery.data?.meta
  const isLoading = ordersQuery.isLoading
  const isError = ordersQuery.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter =
    debouncedSearch.trim() !== '' ||
    datePreset !== 'all' ||
    status !== undefined ||
    paymentMethod !== undefined ||
    paymentStatus !== undefined ||
    customerId !== undefined

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Hóa đơn</h1>
        <p className="text-sm text-muted-foreground">Danh sách hóa đơn bán hàng.</p>
      </header>

      {/* Date presets */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['today', 'Hôm nay'],
            ['7days', '7 ngày'],
            ['30days', '30 ngày'],
            ['all', 'Tất cả'],
            ['custom', 'Tùy chọn'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={datePreset === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => updateSearch({ datePreset: key, page: 1 })}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Custom date range inputs */}
      {datePreset === 'custom' && (
        <div className="flex gap-2 items-center">
          <Input
            type="date"
            className="w-40"
            value={customFromDate ?? ''}
            onChange={(e) => updateSearch({ fromDate: e.target.value || undefined, page: 1 })}
          />
          <span className="text-muted-foreground text-sm">đến</span>
          <Input
            type="date"
            className="w-40"
            value={customToDate ?? ''}
            onChange={(e) => updateSearch({ toDate: e.target.value || undefined, page: 1 })}
          />
        </div>
      )}

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Tìm theo mã hóa đơn"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <CustomerSearchFilter
          customerId={customerId}
          customerName={customerName}
          onChange={(id, name) => updateSearch({ customerId: id, customerName: name, page: 1 })}
        />
        <Select
          value={status ?? 'all'}
          onValueChange={(v) => updateSearch({ status: v === 'all' ? undefined : v, page: 1 })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="completed">Hoàn thành</SelectItem>
            <SelectItem value="cancelled">Đã hủy</SelectItem>
            <SelectItem value="partial_return">Đã trả 1 phần</SelectItem>
            <SelectItem value="full_return">Đã trả toàn bộ</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={paymentMethod ?? 'all'}
          onValueChange={(v) =>
            updateSearch({ paymentMethod: v === 'all' ? undefined : v, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Phương thức TT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả PT thanh toán</SelectItem>
            <SelectItem value="cash">Tiền mặt</SelectItem>
            <SelectItem value="transfer">Chuyển khoản</SelectItem>
            <SelectItem value="qr">QR</SelectItem>
            <SelectItem value="combined">Kết hợp</SelectItem>
            <SelectItem value="debt">Ghi nợ</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={paymentStatus ?? 'all'}
          onValueChange={(v) =>
            updateSearch({ paymentStatus: v === 'all' ? undefined : v, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Trạng thái TT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả TT thanh toán</SelectItem>
            <SelectItem value="paid">Đã thanh toán</SelectItem>
            <SelectItem value="partial">Một phần</SelectItem>
            <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-destructive">Không tải được danh sách hóa đơn.</p>}

      {isEmpty && !hasFilter && (
        <EmptyState
          icon={Receipt}
          title="Chưa có hóa đơn nào"
          description="Hóa đơn sẽ xuất hiện sau khi bán hàng tại POS"
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy hóa đơn"
          description="Thử thay đổi từ khóa hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && (
        <OrderTable
          items={items}
          onRowClick={(id) => navigate({ to: '/orders/$orderId', params: { orderId: id } })}
        />
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={(p) => updateSearch({ page: p })}
          unitLabel="hóa đơn"
        />
      )}
    </div>
  )
}

function OrderTable({
  items,
  onRowClick,
}: {
  items: OrderListItem[]
  onRowClick: (id: string) => void
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã HĐ</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead className="text-right">Tổng tiền</TableHead>
              <TableHead className="text-right">Khách trả</TableHead>
              <TableHead className="text-right">Còn nợ</TableHead>
              <TableHead>Thanh toán</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Người tạo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow
                key={it.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(it.id)}
              >
                <TableCell className="font-mono font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{it.orderNumber}</span>
                    {it.debtLimitExceeded && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-amber-500 bg-amber-50 text-amber-700 font-normal"
                      >
                        Vượt hạn mức
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{formatDate(it.createdAt)}</TableCell>
                <TableCell>{it.customerName ?? 'Khách lẻ'}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatVndWithSuffix(it.total)}
                </TableCell>
                <TableCell className="text-right">{formatVndWithSuffix(it.paidAmount)}</TableCell>
                <TableCell className="text-right">
                  {it.debtAmount > 0 ? formatVndWithSuffix(it.debtAmount) : ''}
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={it.paymentStatus} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={it.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {it.createdByName ?? ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <div
            key={it.id}
            className="block rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
            onClick={() => onRowClick(it.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-medium">{it.orderNumber}</span>
                {it.debtLimitExceeded && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-amber-500 bg-amber-50 text-amber-700 font-normal"
                  >
                    Vượt hạn mức
                  </Badge>
                )}
              </div>
              <StatusBadge status={it.status} />
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {it.customerName ?? 'Khách lẻ'}
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">{formatDate(it.createdAt)}</span>
              <span className="font-medium">{formatVndWithSuffix(it.total)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <PaymentStatusBadge status={it.paymentStatus} />
              {it.debtAmount > 0 && (
                <span className="text-sm text-yellow-700 font-medium">
                  Nợ: {formatVndWithSuffix(it.debtAmount)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
