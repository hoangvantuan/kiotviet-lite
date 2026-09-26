import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatVndWithSuffix } from '@/lib/currency'
import { useCartStore } from '@/stores/use-cart-store'

import { useAutoReprice } from '../hooks/use-auto-reprice'
import { CustomerSearchCombobox } from './CustomerSearchCombobox'
import { OrderDiscountPopover } from './OrderDiscountPopover'
import { PriceListSelect } from './PriceListSelect'

interface DesktopCheckoutPanelProps {
  onPayment?: () => void
}

export function DesktopCheckoutPanel({ onPayment }: DesktopCheckoutPanelProps) {
  const items = useCartStore((s) => s.tabs[s.activeTab]?.items ?? [])
  const orderDiscountType = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountType ?? null)
  const orderDiscountValue = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountValue ?? 0)
  const orderDiscountAmount = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountAmount ?? 0)
  const subtotal = useCartStore((s) =>
    (s.tabs[s.activeTab]?.items ?? []).reduce((sum, i) => sum + i.lineTotal, 0),
  )
  // POS-20: "Tổng tiền hàng (N sản phẩm)" đếm số dòng hàng, không cộng số lượng
  const lineCount = useCartStore((s) => (s.tabs[s.activeTab]?.items ?? []).length)
  const clearCart = useCartStore((s) => s.clearCart)

  useAutoReprice()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const grandTotal = subtotal - orderDiscountAmount

  function handleConfirmCancel() {
    clearCart()
    setConfirmOpen(false)
  }

  const canPay = items.length > 0 && grandTotal > 0

  return (
    <div className="flex h-full flex-col justify-between bg-card p-3">
      {/* Top: Customer search & Price List selector */}
      <div className="shrink-0 space-y-2.5">
        <CustomerSearchCombobox />
        <PriceListSelect />
      </div>

      {/* Middle: Spacer / Future order metadata */}
      <div className="flex-1" />

      {/* Bottom: Totals and Checkout Button */}
      <div className="shrink-0 space-y-3 border-t border-border pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tổng tiền hàng ({lineCount} sản phẩm)</span>
          <span className="font-mono font-medium text-foreground">
            {formatVndWithSuffix(subtotal)}
          </span>
        </div>

        <OrderDiscountPopover
          subtotal={subtotal}
          discountType={orderDiscountType}
          discountValue={orderDiscountValue}
          discountAmount={orderDiscountAmount}
        />

        <div className="flex items-baseline justify-between border-t border-border/80 pt-2">
          <span className="text-sm font-semibold text-foreground">Tổng thanh toán</span>
          <span className="font-mono text-2xl font-bold text-primary">
            {formatVndWithSuffix(grandTotal)}
          </span>
        </div>

        <Button
          disabled={!canPay}
          onClick={onPayment}
          className="h-12 w-full text-base font-semibold shadow-sm transition-all"
        >
          Thanh toán (F2)
        </Button>

        {items.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="w-full h-8 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Huỷ đơn hiện tại
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Huỷ đơn hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn huỷ đơn hàng này? Toàn bộ sản phẩm trong tab hiện tại sẽ bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Huỷ đơn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
