import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'

import type { CustomerOrderStatus, ListCustomerOrdersQuery } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/badge'
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
import { formatVnd } from '@/lib/currency'

import { useCustomerOrders } from '../hooks/use-customer-detail'

const PAGE_SIZE = 20
const ALL_STATUS_VALUE = '__ALL__'

const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  draft: 'Nháp',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  refunded: 'Hoàn tiền',
}

function StatusBadge({ status }: { status: CustomerOrderStatus }) {
  const cls =
    status === 'completed'
      ? 'bg-green-100 text-green-700 border-green-200'
      : status === 'cancelled'
        ? 'bg-red-100 text-red-700 border-red-200'
        : status === 'refunded'
          ? 'bg-orange-100 text-orange-700 border-orange-200'
          : 'bg-slate-100 text-slate-700 border-slate-200'
  return (
    <Badge variant="outline" className={cls}>
      {STATUS_LABELS[status]}
    </Badge>
  )
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

interface CustomerOrdersTabProps {
  customerId: string
}

export function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUS_VALUE)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  const apiQuery: Partial<ListCustomerOrdersQuery> = useMemo(() => {
    const q: Partial<ListCustomerOrdersQuery> = { page, pageSize: PAGE_SIZE }
    if (statusFilter !== ALL_STATUS_VALUE) {
      q.status = statusFilter as CustomerOrderStatus
    }
    if (dateFrom) q.dateFrom = dateFrom
    if (dateTo) q.dateTo = dateTo
    return q
  }, [page, statusFilter, dateFrom, dateTo])

  const ordersQuery = useCustomerOrders(customerId, apiQuery)
  const items = ordersQuery.data?.data ?? []
  const meta = ordersQuery.data?.meta

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-44">
          <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="md:w-44">
          <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="md:w-48">
          <label className="mb-1 block text-xs text-muted-foreground">Trạng thái</label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS_VALUE}>Tất cả trạng thái</SelectItem>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="completed">Hoàn tất</SelectItem>
              <SelectItem value="cancelled">Đã huỷ</SelectItem>
              <SelectItem value="refunded">Hoàn tiền</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải đơn hàng…</p>
      ) : ordersQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách đơn hàng.</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Chưa có đơn hàng nào"
          description="Khách hàng này chưa phát sinh đơn hàng."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{order.orderCode}</span>
                      {order.debtLimitExceeded && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-amber-500 bg-amber-50 text-amber-700 font-normal"
                        >
                          Vượt hạn mức
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(order.date)}
                  </TableCell>
                  <TableCell className="text-right">{formatVnd(order.total)} ₫</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="đơn hàng"
        />
      )}
    </div>
  )
}
