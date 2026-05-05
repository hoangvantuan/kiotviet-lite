import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, RotateCcw } from 'lucide-react'

import { RETURN_REASON_LABELS } from '@kiotviet-lite/shared'

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
import { usePrintSettingsQuery } from '@/features/settings/use-print-settings'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { useAuthStore } from '@/stores/use-auth-store'

import { OrderInvoiceA4, OrderInvoiceA5, OrderInvoiceThermal } from './order-invoice-template'
import { PrintButton } from './print-button'
import { ReturnDialog } from './return-dialog'
import { useOrderQuery, useOrderReturnsQuery } from './use-orders'
import { type PrintFormat, toThermalOrder, usePrintOrder } from './use-print-order'

interface OrderDetailViewProps {
  orderId: string
}

import { OrderStatusBadge as StatusBadge, PaymentStatusBadge } from './order-status-badges'

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
  const returnsQuery = useOrderReturnsQuery(orderId)
  const [returnOpen, setReturnOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const canReturn = user?.role === 'owner' || user?.role === 'manager'
  const { printOrder } = usePrintOrder()
  const printSettingsQuery = usePrintSettingsQuery()

  function handlePrint(format: PrintFormat) {
    const order = query.data
    if (!order) return
    const storeInfo = { name: user?.name ?? 'Cửa hàng' }
    printOrder({
      order: toThermalOrder(order),
      store: storeInfo,
      format,
      isReprint: true,
      printSettings: printSettingsQuery.data,
    })
  }

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
  const returns = returnsQuery.data ?? []
  const showReturnButton =
    canReturn && (order.status === 'completed' || order.status === 'partial_return')

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
        <div className="flex gap-2">
          {showReturnButton && (
            <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
              <RotateCcw className="size-4 mr-1" /> Trả hàng
            </Button>
          )}
          <PrintButton onPrint={handlePrint} label="In lại" size="sm" />
        </div>
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

      {/* Return History */}
      {returns.length > 0 && (
        <section className="rounded-md border">
          <div className="p-3 border-b">
            <h2 className="text-sm font-semibold">Lịch sử trả hàng</h2>
          </div>
          <div className="divide-y">
            {returns.map((ret) => (
              <div key={ret.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm font-medium">{ret.returnNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDateTime(ret.createdAt)}
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {formatVndWithSuffix(ret.totalAmount)}
                  </span>
                </div>
                {ret.createdByName && (
                  <p className="text-xs text-muted-foreground">Người xử lý: {ret.createdByName}</p>
                )}
                <div className="space-y-1">
                  {ret.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {item.productName}
                        {item.variantName ? ` (${item.variantName})` : ''}
                      </span>
                      <span>x{item.quantity}</span>
                      <Badge variant="outline" className="text-xs">
                        {RETURN_REASON_LABELS[item.reason] ?? item.reason}
                      </Badge>
                    </div>
                  ))}
                </div>
                {ret.refundAmount > 0 && (
                  <p className="text-xs text-blue-600">
                    Hoàn tiền: {formatVndWithSuffix(ret.refundAmount)}
                  </p>
                )}
                {ret.debtReductionAmount > 0 && (
                  <p className="text-xs text-green-600">
                    Giảm nợ: {formatVndWithSuffix(ret.debtReductionAmount)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Return Dialog */}
      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        orderId={orderId}
        orderNumber={order.orderNumber}
      />

      {/* Print templates (hidden, only visible during window.print) */}
      <OrderInvoiceThermal order={order} isReprint printSettings={printSettingsQuery.data} />
      <OrderInvoiceA4 order={order} isReprint printSettings={printSettingsQuery.data} />
      <OrderInvoiceA5 order={order} isReprint printSettings={printSettingsQuery.data} />
    </div>
  )
}
