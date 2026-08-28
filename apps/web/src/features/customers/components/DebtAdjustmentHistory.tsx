import { useState } from 'react'
import { PenLine } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'
import { formatDateTime as formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'

import { useDebtAdjustments } from '../hooks/use-customer-detail'

interface DebtAdjustmentHistoryProps {
  customerId: string
}

export function DebtAdjustmentHistory({ customerId }: DebtAdjustmentHistoryProps) {
  const [page, setPage] = useState(1)
  const query = useDebtAdjustments(customerId, page)

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải lịch sử điều chỉnh nợ…</p>
  }

  if (query.isError) {
    return <p className="text-sm text-destructive">Không tải được lịch sử điều chỉnh nợ.</p>
  }

  const items = query.data?.data ?? []
  const meta = query.data?.meta

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PenLine}
        title="Chưa có điều chỉnh nợ"
        description="Các điều chỉnh nợ thủ công sẽ hiển thị tại đây"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead className="text-right">Nợ cũ</TableHead>
              <TableHead className="text-right">Nợ mới</TableHead>
              <TableHead className="text-right">Chênh lệch</TableHead>
              <TableHead>Lý do</TableHead>
              <TableHead>Người điều chỉnh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const diff = item.newAmount - item.oldAmount
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">{formatVnd(item.oldAmount)} ₫</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatVnd(item.newAmount)} ₫
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium',
                      diff > 0 ? 'text-red-700' : 'text-green-700',
                    )}
                  >
                    {diff > 0 ? '+' : ''}
                    {formatVnd(diff)} ₫
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate" title={item.reason}>
                    {item.reason}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.adjustedByName ?? 'N/A'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

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
