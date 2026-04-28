import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ClipboardList, Plus, SearchX } from 'lucide-react'

import type { PaymentStatus, PurchaseOrderListItem } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/badge'
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
import { formatVndWithSuffix } from '@/lib/currency'

import { useSuppliersQuery } from '../suppliers/use-suppliers'
import { usePurchaseOrdersQuery } from './use-purchase-orders'

const PAGE_SIZE = 20

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thanh toán',
  partial: 'Một phần',
  paid: 'Đã thanh toán',
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  if (status === 'paid') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status]}
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status]}
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

function toLocalIsoString(localDateTime: string): string {
  return new Date(localDateTime).toISOString()
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function PurchaseOrderManager() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [supplierId, setSupplierId] = useState<string>('all')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const suppliersQuery = useSuppliersQuery({ page: 1, pageSize: 100, hasDebt: 'all' })
  const supplierOptions = suppliersQuery.data?.data ?? []

  const ordersQuery = usePurchaseOrdersQuery({
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    supplierId: supplierId === 'all' ? undefined : supplierId,
    paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
    fromDate: fromDate ? toLocalIsoString(`${fromDate}T00:00:00`) : undefined,
    toDate: toDate ? toLocalIsoString(`${toDate}T23:59:59`) : undefined,
  })

  const items = ordersQuery.data?.data ?? []
  const meta = ordersQuery.data?.meta
  const isLoading = ordersQuery.isLoading
  const isError = ordersQuery.isError
  const isEmpty = !isLoading && items.length === 0
  const hasFilter =
    debouncedSearch.trim() !== '' ||
    supplierId !== 'all' ||
    paymentStatus !== 'all' ||
    fromDate !== '' ||
    toDate !== ''

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu nhập kho</h1>
          <p className="text-sm text-muted-foreground">
            Danh sách phiếu nhập đã tạo. Phiếu không thể chỉnh sửa sau khi tạo.
          </p>
        </div>
        <Button asChild>
          <Link to="/inventory/purchase-orders/new">
            <Plus className="size-4 mr-1" /> Tạo phiếu nhập
          </Link>
        </Button>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Tìm theo mã phiếu hoặc tên NCC"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
        />
        <Select
          value={supplierId}
          onValueChange={(v) => {
            setSupplierId(v)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Nhà cung cấp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả NCC</SelectItem>
            {supplierOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={paymentStatus}
          onValueChange={(v: PaymentStatus | 'all') => {
            setPaymentStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Trạng thái TT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
            <SelectItem value="partial">Một phần</SelectItem>
            <SelectItem value="paid">Đã thanh toán</SelectItem>
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
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-destructive">Không tải được danh sách phiếu nhập.</p>}

      {isEmpty && !hasFilter && (
        <EmptyState
          icon={ClipboardList}
          title="Chưa có phiếu nhập nào"
          description="Tạo phiếu nhập đầu tiên để cập nhật tồn kho và giá vốn"
          actionLabel="Tạo phiếu nhập"
          onAction={() => navigate({ to: '/inventory/purchase-orders/new' })}
        />
      )}

      {isEmpty && hasFilter && (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy phiếu nhập"
          description="Thử thay đổi từ khoá hoặc bộ lọc."
        />
      )}

      {!isLoading && !isEmpty && <PurchaseOrderTable items={items} />}

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

interface PurchaseOrderTableProps {
  items: PurchaseOrderListItem[]
}

function PurchaseOrderTable({ items }: PurchaseOrderTableProps) {
  return (
    <>
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Ngày nhập</TableHead>
              <TableHead>Nhà cung cấp</TableHead>
              <TableHead className="text-right">SL dòng</TableHead>
              <TableHead className="text-right">Tổng</TableHead>
              <TableHead className="text-right">Đã trả</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-mono font-medium">
                  <Link
                    to="/inventory/purchase-orders/$orderId"
                    params={{ orderId: it.id }}
                    className="hover:underline"
                  >
                    {it.code}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(it.purchaseDate)}</TableCell>
                <TableCell>{it.supplierName}</TableCell>
                <TableCell className="text-right">{it.itemCount}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatVndWithSuffix(it.totalAmount)}
                </TableCell>
                <TableCell className="text-right">{formatVndWithSuffix(it.paidAmount)}</TableCell>
                <TableCell>
                  <PaymentStatusBadge status={it.paymentStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <Link
            key={it.id}
            to="/inventory/purchase-orders/$orderId"
            params={{ orderId: it.id }}
            className="block rounded-md border p-3 hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{it.code}</span>
              <PaymentStatusBadge status={it.paymentStatus} />
            </div>
            <div className="text-sm text-muted-foreground mt-1">{it.supplierName}</div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">{formatDate(it.purchaseDate)}</span>
              <span className="font-medium">{formatVndWithSuffix(it.totalAmount)}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
