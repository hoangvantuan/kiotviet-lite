import { Link } from '@tanstack/react-router'
import { ChevronLeft, Mail, Pencil, Phone, Tag } from 'lucide-react'

import type { CustomerDetail } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatVnd } from '@/lib/currency'

interface CustomerDetailHeaderProps {
  customer: CustomerDetail
  onEdit: () => void
}

function DebtStatusBadge({
  currentDebt,
  effectiveDebtLimit,
}: {
  currentDebt: number
  effectiveDebtLimit: number | null
}) {
  if (currentDebt === 0) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        Không nợ
      </Badge>
    )
  }
  if (effectiveDebtLimit === null || effectiveDebtLimit === 0) {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {formatVnd(currentDebt)} ₫
      </Badge>
    )
  }
  const ratio = currentDebt / effectiveDebtLimit
  if (ratio > 1) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
        {formatVnd(currentDebt)} ₫ (vượt hạn mức)
      </Badge>
    )
  }
  if (ratio >= 0.8) {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {formatVnd(currentDebt)} ₫ ({Math.round(ratio * 100)}%)
      </Badge>
    )
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200" variant="outline">
      {formatVnd(currentDebt)} ₫
    </Badge>
  )
}

export function CustomerDetailHeader({ customer, onEdit }: CustomerDetailHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/customers" className="hover:text-foreground hover:underline">
                Khách hàng
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-foreground" aria-current="page">
              {customer.name}
            </li>
          </ol>
        </nav>
        <Button asChild variant="ghost" size="sm">
          <Link to="/customers">
            <ChevronLeft className="size-4 mr-1" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="size-4" />
                <span className="font-mono">{customer.phone}</span>
              </span>
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="size-4" />
                  {customer.email}
                </span>
              )}
              {customer.groupName && (
                <span className="flex items-center gap-1">
                  <Tag className="size-4" />
                  {customer.groupName}
                </span>
              )}
            </div>
          </div>
          <Button onClick={onEdit} size="sm">
            <Pencil className="size-4 mr-1" />
            Sửa
          </Button>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Tổng đã mua</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatVnd(customer.totalPurchased)} ₫
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Số lần mua</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{customer.purchaseCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Công nợ hiện tại</p>
            <div className="mt-1">
              <DebtStatusBadge
                currentDebt={customer.currentDebt}
                effectiveDebtLimit={customer.effectiveDebtLimit}
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hạn mức nợ</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {customer.effectiveDebtLimit === null
                ? 'Không giới hạn'
                : `${formatVnd(customer.effectiveDebtLimit)} ₫`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
