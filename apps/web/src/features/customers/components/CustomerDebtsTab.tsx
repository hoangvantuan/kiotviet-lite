import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, PenLine, Wallet } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useStoreQuery } from '@/features/settings/use-store-settings'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/use-auth-store'

import { useCustomerDebts } from '../hooks/use-customer-detail'
import { DebtAdjustmentDialog } from './DebtAdjustmentDialog'
import { DebtAdjustmentHistory } from './DebtAdjustmentHistory'

interface CustomerDebtsTabProps {
  customerId: string
  customerName?: string
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

function parseOverdueDays(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b)
}

function getDebtStatusBadge(dateIso: string, remaining: number, overdueDays: number[]) {
  if (remaining === 0) {
    return { label: 'Đã tất toán', className: 'border-gray-200 bg-gray-50 text-gray-600' }
  }
  const daysSince = Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000)
  if (daysSince <= (overdueDays[0] ?? 30)) {
    return { label: 'Trong hạn', className: 'border-green-200 bg-green-50 text-green-700' }
  }
  if (daysSince <= (overdueDays[1] ?? 60)) {
    return {
      label: `Quá hạn ${daysSince} ngày`,
      className: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    }
  }
  if (daysSince <= (overdueDays[2] ?? 90)) {
    return {
      label: `Quá hạn ${daysSince} ngày`,
      className: 'border-orange-200 bg-orange-50 text-orange-700',
    }
  }
  return {
    label: `Quá hạn ${daysSince} ngày`,
    className: 'border-red-200 bg-red-50 text-red-700',
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

export function CustomerDebtsTab({ customerId, customerName }: CustomerDebtsTabProps) {
  const debtsQuery = useCustomerDebts(customerId)
  const storeQuery = useStoreQuery()
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'owner'
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const overdueDays = parseOverdueDays(storeQuery.data?.debtOverdueDays ?? '30,60,90')

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
            <div className="mt-1 flex items-center gap-3">
              <p className="text-2xl font-semibold text-foreground">
                {formatVnd(currentDebt)} ₫
              </p>
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAdjustDialogOpen(true)}
                >
                  <PenLine className="mr-1 size-4" />
                  Điều chỉnh nợ
                </Button>
              )}
            </div>
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
                  <TableHead>Tình trạng</TableHead>
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
                    <TableCell>
                      {(() => {
                        const status = getDebtStatusBadge(debt.date, debt.remainingAmount, overdueDays)
                        return (
                          <Badge variant="outline" className={status.className}>
                            {debt.remainingAmount > 0 && status.label !== 'Trong hạn' && status.label !== 'Đã tất toán' && (
                              <Clock className="mr-1 size-3" />
                            )}
                            {status.label}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Lịch sử điều chỉnh nợ */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Lịch sử điều chỉnh nợ</h3>
        <DebtAdjustmentHistory customerId={customerId} />
      </div>

      {/* Dialog điều chỉnh nợ */}
      {isOwner && (
        <DebtAdjustmentDialog
          open={adjustDialogOpen}
          onOpenChange={setAdjustDialogOpen}
          customerId={customerId}
          customerName={customerName ?? ''}
          currentDebt={currentDebt}
        />
      )}
    </div>
  )
}
