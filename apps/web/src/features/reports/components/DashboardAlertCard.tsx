import { type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react'

import type { LowStockAlert, OverdueDebt } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'

function AlertCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface AlertCardBaseProps {
  title: string
  count: number
  emptyMessage: string
  ctaLabel: string
  ctaHref: string
  isLoading?: boolean
  isError?: boolean
  children: ReactNode
}

function AlertCardBase({
  title,
  count,
  emptyMessage,
  ctaLabel,
  ctaHref,
  isLoading,
  isError,
  children,
}: AlertCardBaseProps) {
  if (isLoading) return <AlertCardSkeleton />

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Lỗi tải dữ liệu</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {count > 0 && (
            <Badge variant="destructive" className="text-xs">
              {count}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <div className="flex items-center gap-2 py-4 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">{children}</div>
            <Link
              to={ctaHref}
              className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {ctaLabel}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Low Stock Alert Card

interface LowStockAlertCardProps {
  data: LowStockAlert[] | undefined
  isLoading?: boolean
  isError?: boolean
}

export function LowStockAlertCard({ data, isLoading, isError }: LowStockAlertCardProps) {
  const alerts = data ?? []

  return (
    <AlertCardBase
      title="Cảnh báo tồn kho"
      count={alerts.length}
      emptyMessage="Tất cả sản phẩm đủ tồn kho"
      ctaLabel="Xem tất cả"
      ctaHref="/products?filter=low-stock"
      isLoading={isLoading}
      isError={isError}
    >
      {alerts.map((alert) => (
        <div
          key={alert.productId}
          className="flex items-center justify-between rounded-md border p-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle
              className={cn(
                'h-4 w-4 shrink-0',
                alert.status === 'out' ? 'text-red-500' : 'text-yellow-500',
              )}
            />
            <span className="text-sm truncate">{alert.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {alert.status === 'out' ? (
              <Badge variant="destructive" className="text-xs">
                Hết hàng
              </Badge>
            ) : (
              <span className="text-sm text-yellow-600 font-mono">
                {alert.currentStock}/{alert.minStock}
              </span>
            )}
          </div>
        </div>
      ))}
    </AlertCardBase>
  )
}

// Overdue Debt Alert Card

function getOverdueColor(days: number): string {
  if (days > 90) return 'text-red-600'
  if (days > 60) return 'text-orange-600'
  return 'text-yellow-600'
}

interface OverdueDebtCardProps {
  data: OverdueDebt[] | undefined
  isLoading?: boolean
  isError?: boolean
}

export function OverdueDebtCard({ data, isLoading, isError }: OverdueDebtCardProps) {
  const debts = data ?? []

  return (
    <AlertCardBase
      title="Nợ quá hạn"
      count={debts.length}
      emptyMessage="Không có khách hàng nợ quá hạn"
      ctaLabel="Xem tất cả"
      ctaHref="/debts?filter=overdue"
      isLoading={isLoading}
      isError={isError}
    >
      {debts.map((debt) => (
        <div
          key={debt.customerId}
          className="flex items-center justify-between rounded-md border p-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm truncate">{debt.name}</p>
            <p className={cn('text-xs', getOverdueColor(debt.maxOverdueDays))}>
              Quá hạn {debt.maxOverdueDays} ngày
            </p>
          </div>
          <p className="text-sm font-mono font-bold shrink-0 ml-2">{formatVnd(debt.totalDebt)} đ</p>
        </div>
      ))}
    </AlertCardBase>
  )
}
