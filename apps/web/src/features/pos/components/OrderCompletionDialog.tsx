import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePrintSettingsQuery } from '@/features/settings/use-print-settings'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatVndWithSuffix } from '@/lib/currency'
import { useAuthStore } from '@/stores/use-auth-store'

import {
  OrderInvoiceA4,
  OrderInvoiceA5,
  OrderInvoiceThermal,
} from '../../orders/order-invoice-template'
import type { OrderDetailResponse } from '../../orders/orders-api'
import { PrintButton } from '../../orders/print-button'
import { type PrintFormat, toThermalOrder, usePrintOrder } from '../../orders/use-print-order'
import type { OrderDetail } from '../types'

const AUTO_CLOSE_MS = 3000

/** Adapt POS OrderDetail to OrderDetailResponse for print templates */
function toOrderDetailResponse(order: OrderDetail): OrderDetailResponse {
  return {
    ...order,
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    customerGroupName: null,
    customerCurrentDebt: order.customerCurrentDebt ?? null,
    oldDebt: order.oldDebt ?? null,
    createdByName: null,
    discountType: null,
    discountValue: 0,
    paidAmount: order.total - order.debtAmount,
    updatedAt: order.createdAt,
    items: order.items.map((item, idx) => ({
      id: `item-${idx}`,
      ...item,
      discountType: null,
      discountValue: 0,
      originalPrice: null,
      priceOverride: false,
      sku: item.sku ?? null,
      costPrice: item.costPrice ?? null,
    })),
  }
}

interface OrderCompletionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OrderDetail | null
  onNewOrder: () => void
}

export function OrderCompletionDialog({
  open,
  onOpenChange,
  order,
  onNewOrder,
}: OrderCompletionDialogProps) {
  const [countdown, setCountdown] = useState(AUTO_CLOSE_MS / 1000)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userInteracted = useRef(false)

  const { printOrder } = usePrintOrder()
  const user = useAuthStore((s) => s.user)
  const printSettingsQuery = usePrintSettingsQuery()

  // Ref to always hold the latest onNewOrder callback (avoids stale closure)
  const onNewOrderRef = useRef(onNewOrder)
  useEffect(() => {
    onNewOrderRef.current = onNewOrder
  }, [onNewOrder])

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current)
      autoCloseRef.current = null
    }
  }, [])

  // Start auto-close countdown when dialog opens
  useEffect(() => {
    if (!open) {
      clearTimers()
      return
    }

    userInteracted.current = false
    setCountdown(AUTO_CLOSE_MS / 1000)

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)

    autoCloseRef.current = setTimeout(() => {
      if (!userInteracted.current) {
        clearTimers()
        onNewOrderRef.current()
      }
    }, AUTO_CLOSE_MS)

    return clearTimers
  }, [open, clearTimers])

  function handleInteraction() {
    userInteracted.current = true
    clearTimers()
    setCountdown(0)
  }

  function handleNewOrder() {
    clearTimers()
    onNewOrder()
  }

  function handlePrint(format: PrintFormat) {
    handleInteraction()
    if (!order) return
    // H5: Đọc store name từ auth user nếu có, fallback "Cửa hàng"
    const storeInfo = { name: user?.name ?? 'Cửa hàng' }
    printOrder({
      order: toThermalOrder({
        ...order,
        paidAmount: order.total - order.debtAmount,
      }),
      store: storeInfo,
      format,
      printSettings: printSettingsQuery.data,
    })
  }

  if (!order) return null

  const orderForTemplate = toOrderDetailResponse(order)

  const showChange =
    (order.paymentMethod === 'cash' ||
      order.paymentMethod === 'combined' ||
      order.paymentMethod === 'debt') &&
    order.change > 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDown={handleInteraction}
          onKeyDown={handleInteraction}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">Đơn hàng hoàn thành</DialogTitle>
            <DialogDescription className="sr-only">
              Thông tin tóm tắt hoá đơn sau thanh toán
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="h-12 w-12 text-green-600" />
            <p className="text-lg font-semibold text-foreground">Đơn hàng hoàn thành!</p>
            <p className="font-mono text-lg font-semibold text-foreground">{order.orderNumber}</p>
          </div>

          {/* Item list */}
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {item.productName}
                  {item.variantName && (
                    <span className="text-muted-foreground"> ({item.variantName})</span>
                  )}
                </span>
                <span className="ml-2 shrink-0 text-muted-foreground">x{item.quantity}</span>
                <span className="ml-2 shrink-0 font-mono text-foreground">
                  {formatVndWithSuffix(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-border pt-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Tổng:</span>
              <span className="font-mono">{formatVndWithSuffix(order.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Thanh toán:</span>
              <span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
            </div>
            {order.paymentMethod === 'cash' && order.cashAmount != null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Khách đưa:</span>
                <span className="font-mono">{formatVndWithSuffix(order.cashAmount)}</span>
              </div>
            )}
            {/* Story 5.1: hiển thị tiền mặt trả trước khi ghi nợ */}
            {order.paymentMethod === 'debt' && order.cashAmount != null && order.cashAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiền mặt trả trước:</span>
                <span className="font-mono">{formatVndWithSuffix(order.cashAmount)}</span>
              </div>
            )}
            {/* Story 5.1: highlight khoản ghi nợ */}
            {order.debtAmount > 0 && (
              <div className="flex justify-between text-sm font-semibold text-orange-600">
                <span>Ghi nợ:</span>
                <span className="font-mono">{formatVndWithSuffix(order.debtAmount)}</span>
              </div>
            )}
            {showChange && (
              <div className="flex justify-between text-sm font-semibold text-green-600">
                <span>Tiền thừa:</span>
                <span className="font-mono">{formatVndWithSuffix(order.change)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <PrintButton onPrint={handlePrint} label="In hoá đơn" />
            <Button type="button" onClick={handleNewOrder} className="flex-1">
              Đơn hàng mới
            </Button>
          </div>

          {/* Countdown */}
          {countdown > 0 && !userInteracted.current && (
            <p className="text-center text-xs text-muted-foreground">
              Tự động đóng sau {countdown} giây...
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Print templates (hidden, only visible during window.print) */}
      {order && (
        <>
          <OrderInvoiceThermal order={orderForTemplate} printSettings={printSettingsQuery.data} />
          <OrderInvoiceA4 order={orderForTemplate} printSettings={printSettingsQuery.data} />
          <OrderInvoiceA5 order={orderForTemplate} printSettings={printSettingsQuery.data} />
        </>
      )}
    </>
  )
}
