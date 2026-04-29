import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { useCustomerDebts } from '../hooks/use-customer-detail'

interface CustomerDebtsTabProps {
  customerId: string
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

function DebtProgressBar({
  percent,
  variant,
}: {
  percent: number
  variant: 'safe' | 'warn' | 'danger'
}) {
  const width = Math.min(100, percent)
  const color =
    variant === 'danger' ? 'bg-red-500' : variant === 'warn' ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function CustomerDebtsTab({ customerId }: CustomerDebtsTabProps) {
  const debtsQuery = useCustomerDebts(customerId)

  if (debtsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải công nợ…</p>
  }
  if (debtsQuery.isError || !debtsQuery.data) {
    return <p className="text-sm text-destructive">Không tải được dữ liệu công nợ.</p>
  }

  const { currentDebt, effectiveDebtLimit, usagePercent, items } = debtsQuery.data
  const hasLimit = effectiveDebtLimit !== null && effectiveDebtLimit > 0
  const variant: 'safe' | 'warn' | 'danger' =
    usagePercent > 100 ? 'danger' : usagePercent > 80 ? 'warn' : 'safe'

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Tổng công nợ hiện tại</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {formatVnd(currentDebt)} ₫
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Hạn mức nợ hiệu lực</p>
            <p className="mt-1 text-base font-medium text-foreground">
              {effectiveDebtLimit === null
                ? 'Không giới hạn'
                : `${formatVnd(effectiveDebtLimit)} ₫`}
            </p>
          </div>
        </div>

        {currentDebt === 0 ? (
          <div className="mt-4 flex items-center gap-2">
            <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
              <CheckCircle2 className="size-3 mr-1" />
              Không nợ
            </Badge>
            <span className="text-sm text-muted-foreground">
              Khách hàng không có công nợ chưa thanh toán.
            </span>
          </div>
        ) : hasLimit ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Đã sử dụng</span>
              <span className="font-medium text-foreground">{usagePercent}%</span>
            </div>
            <DebtProgressBar percent={usagePercent} variant={variant} />
            {variant === 'danger' && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                <AlertTriangle className="size-4" />
                <span>Công nợ đã vượt hạn mức cho phép.</span>
              </div>
            )}
            {variant === 'warn' && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-700">
                <AlertTriangle className="size-4" />
                <span>Công nợ sắp chạm hạn mức, cần lưu ý.</span>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Khách hàng này chưa được đặt hạn mức nợ.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Chi tiết các khoản nợ</h3>
        {items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Chưa có khoản nợ chi tiết"
            description="Khi có đơn hàng chưa thanh toán đủ, danh sách sẽ hiển thị tại đây."
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Ngày phát sinh</TableHead>
                  <TableHead className="text-right">Nợ ban đầu</TableHead>
                  <TableHead className="text-right">Đã trả</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((debt) => (
                  <TableRow key={debt.id}>
                    <TableCell className="font-mono text-sm">{debt.orderCode}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(debt.date)}
                    </TableCell>
                    <TableCell className="text-right">{formatVnd(debt.originalAmount)} ₫</TableCell>
                    <TableCell className="text-right text-green-700">
                      {formatVnd(debt.paidAmount)} ₫
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-700">
                      {formatVnd(debt.remainingAmount)} ₫
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
