import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Printer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'

import { useOrderQuery } from './use-orders'

interface OrderDetailViewProps {
  orderId: string
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Đã thanh toán',
  partial: 'Thanh toán một phần',
  unpaid: 'Chưa thanh toán',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  qr: 'QR',
  combined: 'Kết hợp',
  debt: 'Ghi nợ',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'cancelled') {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
        {STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  return <Badge variant="outline">{STATUS_LABELS[status] ?? status}</Badge>
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">
        {PAYMENT_STATUS_LABELS[status] ?? status}
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('vi-VN', {
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

export function OrderDetailView({ orderId }: OrderDetailViewProps) {
  const navigate = useNavigate()
  const query = useOrderQuery(orderId)

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-8 w-1/3 rounded-md bg-muted animate-pulse" />
        <div className="h-32 rounded-md bg-muted animate-pulse" />
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-destructive">Không tải được hóa đơn. Thử lại sau.</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate({ to: '/orders' })}>
          <ChevronLeft className="size-4 mr-1" /> Về danh sách
        </Button>
      </div>
    )
  }

  const order = query.data

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Back button */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/orders' })}>
          <ChevronLeft className="size-4 mr-1" /> Hóa đơn
        </Button>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold font-mono">{order.orderNumber}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tạo lúc {formatDateTime(order.createdAt)}
            {order.createdByName ? ` bởi ${order.createdByName}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <Printer className="size-4 mr-1" /> In lại
        </Button>
      </header>

      {/* Customer info + Payment method */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Khách hàng</h2>
          <p className="font-medium mt-1">{order.customerName ?? 'Khách lẻ'}</p>
          {order.customerPhone && (
            <p className="text-sm text-muted-foreground font-mono">{order.customerPhone}</p>
          )}
          {order.customerGroupName && (
            <p className="text-xs text-muted-foreground mt-1">Nhóm: {order.customerGroupName}</p>
          )}
        </div>
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Phương thức thanh toán</h2>
          <p className="font-medium mt-1">
            {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
          <div className="mt-1">
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
      </section>

      {/* Items table */}
      <section className="rounded-md border">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">STT</TableHead>
                <TableHead>Tên SP</TableHead>
                <TableHead>ĐVT</TableHead>
                <TableHead className="text-right">SL</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">CK</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it, idx) => (
                <TableRow key={it.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{it.productName}</div>
                    {it.variantName && (
                      <div className="text-xs text-muted-foreground">{it.variantName}</div>
                    )}
                  </TableCell>
                  <TableCell>{it.unit ?? ''}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{formatVnd(it.unitPrice)}</TableCell>
                  <TableCell className="text-right">
                    {it.discountAmount > 0 ? `-${formatVnd(it.discountAmount)}` : ''}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatVnd(it.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile items */}
        <div className="md:hidden divide-y">
          {order.items.map((it, idx) => (
            <div key={it.id} className="p-3 space-y-1">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-muted-foreground mr-1">{idx + 1}.</span>
                  <span className="font-medium">{it.productName}</span>
                </div>
              </div>
              {it.variantName && (
                <div className="text-xs text-muted-foreground">{it.variantName}</div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SL x Đơn giá</span>
                <span>
                  {it.quantity} x {formatVnd(it.unitPrice)}
                </span>
              </div>
              {it.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chiết khấu</span>
                  <span>-{formatVnd(it.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span>Thành tiền</span>
                <span>{formatVndWithSuffix(it.lineTotal)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Totals */}
      <section className="rounded-md border p-4 max-w-md ml-auto space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tạm tính ({order.items.length} sản phẩm)</span>
          <span>{formatVndWithSuffix(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Chiết khấu
              {order.discountType === 'percent' && order.discountValue
                ? ` (${order.discountValue}%)`
                : ''}
            </span>
            <span>-{formatVndWithSuffix(order.discountAmount)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Tổng thanh toán</span>
          <span>{formatVndWithSuffix(order.total)}</span>
        </div>
        {order.cashAmount != null && order.cashAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tiền mặt</span>
            <span>{formatVndWithSuffix(order.cashAmount)}</span>
          </div>
        )}
        {order.transferAmount != null && order.transferAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Chuyển khoản</span>
            <span>{formatVndWithSuffix(order.transferAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Đã thanh toán</span>
          <span>{formatVndWithSuffix(order.paidAmount)}</span>
        </div>
        {order.change > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tiền thừa trả khách</span>
            <span>{formatVndWithSuffix(order.change)}</span>
          </div>
        )}
        {order.paymentStatus !== 'paid' && order.debtAmount > 0 && (
          <div className="flex justify-between text-sm font-medium text-yellow-700">
            <span>Còn nợ</span>
            <span>{formatVndWithSuffix(order.debtAmount)}</span>
          </div>
        )}
      </section>

      {/* Note */}
      {order.note && (
        <section className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground mb-1">Ghi chú</h2>
          <p className="text-sm whitespace-pre-wrap">{order.note}</p>
        </section>
      )}
    </div>
  )
}
