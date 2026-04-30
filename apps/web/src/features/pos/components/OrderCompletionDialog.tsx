import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVndWithSuffix } from '@/lib/currency'

import type { OrderDetail } from '../types'

const AUTO_CLOSE_MS = 3000

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Tien mat',
  transfer: 'Chuyen khoan',
  qr: 'QR Code',
  combined: 'Ket hop',
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

  if (!order) return null

  const showChange =
    (order.paymentMethod === 'cash' || order.paymentMethod === 'combined') && order.change > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDown={handleInteraction}
        onKeyDown={handleInteraction}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">Don hang hoan thanh</DialogTitle>
          <DialogDescription className="sr-only">
            Thong tin tom tat hoa don sau thanh toan
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2">
          <CheckCircle className="h-12 w-12 text-green-600" />
          <p className="text-lg font-semibold text-foreground">Don hang hoan thanh!</p>
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
            <span>Tong:</span>
            <span className="font-mono">{formatVndWithSuffix(order.total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Thanh toan:</span>
            <span>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</span>
          </div>
          {order.paymentMethod === 'cash' && order.cashAmount != null && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Khach dua:</span>
              <span className="font-mono">{formatVndWithSuffix(order.cashAmount)}</span>
            </div>
          )}
          {showChange && (
            <div className="flex justify-between text-sm font-semibold text-green-600">
              <span>Tien thua:</span>
              <span className="font-mono">{formatVndWithSuffix(order.change)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled
            className="flex-1"
            title="In hoa don se kich hoat o Story 7.3"
          >
            <Printer className="mr-2 h-4 w-4" />
            In hoa don
          </Button>
          <Button type="button" onClick={handleNewOrder} className="flex-1">
            Don hang moi
          </Button>
        </div>

        {/* Countdown */}
        {countdown > 0 && !userInteracted.current && (
          <p className="text-center text-xs text-muted-foreground">
            Tu dong dong sau {countdown} giay...
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
