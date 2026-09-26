import { type KeyboardEvent, useRef } from 'react'
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

import {
  OrderInvoiceA4,
  OrderInvoiceA5,
  OrderInvoiceThermal,
} from '../../orders/order-invoice-template'
import type { OrderDetailResponse } from '../../orders/orders-api'
import { PrintButton } from '../../orders/print-button'
import { useInvoiceStoreInfo } from '../../orders/use-invoice-store-info'
import {
  getDefaultFormat,
  type PrintFormat,
  toThermalOrder,
  usePrintOrder,
} from '../../orders/use-print-order'
import type { OrderDetail } from '../types'

/** Adapt POS OrderDetail to OrderDetailResponse for print templates */
function toOrderDetailResponse(order: OrderDetail): OrderDetailResponse {
  return {
    ...order,
    customerCode: order.customerCode ?? null,
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    customerGroupName: null,
    customerCurrentDebt: order.customerCurrentDebt ?? null,
    oldDebt: order.oldDebt ?? null,
    createdByName: null,
    discountType: null,
    discountValue: 0,
    paidAmount: order.total - (order.debtAmount ?? 0),
    updatedAt: order.createdAt,
    items: (order.items ?? []).map((item, idx) => ({
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
  const newOrderRef = useRef<HTMLButtonElement>(null)

  const { printOrder } = usePrintOrder()
  const printSettingsQuery = usePrintSettingsQuery()
  const storeInfo = useInvoiceStoreInfo()

  // POS-17: hộp thoại không tự đóng; người bán chủ động bấm In hoặc Đơn hàng mới
  function handleNewOrder() {
    onNewOrder()
  }

  /** Phím tắt: Enter mở đơn mới, P hoặc Ctrl+P in hoá đơn theo khổ mặc định */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.altKey) return
    const target = e.target as HTMLElement
    // Nút khác đang được chọn (menu khổ in) thì để Enter bấm đúng nút đó
    if (e.key === 'Enter' && (target === newOrderRef.current || target.tagName !== 'BUTTON')) {
      e.preventDefault()
      handleNewOrder()
      return
    }
    if (e.key.toLowerCase() === 'p' && !e.shiftKey) {
      e.preventDefault()
      handlePrint(getDefaultFormat())
    }
  }

  function handlePrint(format: PrintFormat) {
    if (!order) return
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
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(e) => {
            // Chọn sẵn nút Đơn hàng mới để Enter luôn mở đơn mới, không lỡ tay in
            e.preventDefault()
            newOrderRef.current?.focus()
          }}
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
            {(order.items ?? []).map((item, idx) => (
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
            <Button
              ref={newOrderRef}
              type="button"
              onClick={handleNewOrder}
              className="flex-1"
              aria-keyshortcuts="Enter"
            >
              Đơn hàng mới
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Phím tắt: <kbd className="font-mono">Enter</kbd> đơn hàng mới,{' '}
            <kbd className="font-mono">P</kbd> in hoá đơn
          </p>
        </DialogContent>
      </Dialog>

      {/* Print templates (hidden, only visible during window.print) */}
      {order && (
        <>
          <OrderInvoiceThermal
            order={orderForTemplate}
            store={storeInfo}
            printSettings={printSettingsQuery.data}
          />
          <OrderInvoiceA4
            order={orderForTemplate}
            store={storeInfo}
            printSettings={printSettingsQuery.data}
          />
          <OrderInvoiceA5
            order={orderForTemplate}
            store={storeInfo}
            printSettings={printSettingsQuery.data}
          />
        </>
      )}
    </>
  )
}
