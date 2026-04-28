import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import type { PaymentStatus } from '@kiotviet-lite/shared'

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

import { usePurchaseOrderQuery } from './use-purchase-orders'

interface PurchaseOrderDetailViewProps {
  orderId: string
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
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

export function PurchaseOrderDetailView({ orderId }: PurchaseOrderDetailViewProps) {
  const query = usePurchaseOrderQuery(orderId)

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
        <p className="text-sm text-destructive">Không tải được phiếu nhập. Thử lại sau.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/inventory/purchase-orders">
            <ChevronLeft className="size-4 mr-1" /> Về danh sách
          </Link>
        </Button>
      </div>
    )
  }

  const order = query.data
  const remaining = Math.max(0, order.totalAmount - order.paidAmount)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory/purchase-orders">
            <ChevronLeft className="size-4 mr-1" /> Phiếu nhập kho
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold font-mono">{order.code}</h1>
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tạo lúc {formatDateTime(order.createdAt)}
            {order.createdByName ? ` bởi ${order.createdByName}` : ''}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Nhà cung cấp</h2>
          <p className="font-medium mt-1">{order.supplier.name}</p>
          {order.supplier.phone && (
            <p className="text-sm text-muted-foreground font-mono">{order.supplier.phone}</p>
          )}
        </div>
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ngày nhập</h2>
          <p className="font-medium mt-1">{formatDateTime(order.purchaseDate)}</p>
        </div>
      </section>

      <section className="rounded-md border">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">SL</TableHead>
                <TableHead className="text-right">Đơn giá</TableHead>
                <TableHead className="text-right">CK</TableHead>
                <TableHead className="text-right">Thành tiền</TableHead>
                <TableHead className="text-right">Giá vốn sau</TableHead>
                <TableHead className="text-right">Tồn sau</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <div className="font-medium">{it.productNameSnapshot}</div>
                    {it.variantLabelSnapshot && (
                      <div className="text-xs text-muted-foreground">{it.variantLabelSnapshot}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{it.productSkuSnapshot}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{formatVnd(it.unitPrice)}</TableCell>
                  <TableCell className="text-right">
                    {it.discountAmount > 0 ? `-${formatVnd(it.discountAmount)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatVnd(it.lineTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.costAfter !== null ? formatVnd(it.costAfter) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {it.stockAfter !== null ? it.stockAfter : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden divide-y">
          {order.items.map((it) => (
            <div key={it.id} className="p-3 space-y-1">
              <div className="font-medium">{it.productNameSnapshot}</div>
              {it.variantLabelSnapshot && (
                <div className="text-xs text-muted-foreground">{it.variantLabelSnapshot}</div>
              )}
              <div className="text-xs font-mono text-muted-foreground">{it.productSkuSnapshot}</div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SL × Đơn giá</span>
                <span>
                  {it.quantity} × {formatVnd(it.unitPrice)}
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
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Giá vốn / Tồn sau nhập</span>
                <span>
                  {it.costAfter !== null ? formatVnd(it.costAfter) : '—'} /{' '}
                  {it.stockAfter !== null ? it.stockAfter : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border p-4 max-w-md ml-auto space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tạm tính ({order.itemCount} sản phẩm)</span>
          <span>{formatVndWithSuffix(order.subtotal)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Chiết khấu tổng
              {order.discountTotalType === 'percent'
                ? ` (${(order.discountTotalValue / 100).toFixed(2)}%)`
                : ''}
            </span>
            <span>-{formatVndWithSuffix(order.discountTotal)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Tổng thanh toán</span>
          <span>{formatVndWithSuffix(order.totalAmount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Đã trả</span>
          <span>{formatVndWithSuffix(order.paidAmount)}</span>
        </div>
        {remaining > 0 && (
          <div className="flex justify-between text-sm font-medium text-yellow-700">
            <span>Còn nợ</span>
            <span>{formatVndWithSuffix(remaining)}</span>
          </div>
        )}
      </section>

      {order.note && (
        <section className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground mb-1">Ghi chú</h2>
          <p className="text-sm whitespace-pre-wrap">{order.note}</p>
        </section>
      )}
    </div>
  )
}
