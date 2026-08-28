import { useState } from 'react'
import { ShoppingCart, Trash2 } from 'lucide-react'

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
import { CartItem } from './CartItem'
import { CartTabBar } from './CartTabBar'
import { CustomerSearchCombobox } from './CustomerSearchCombobox'
import { OrderDiscountPopover } from './OrderDiscountPopover'

interface CartPanelProps {
  onPayment?: () => void
}

export function CartPanel({ onPayment }: CartPanelProps) {
  const items = useCartStore((s) => s.tabs[s.activeTab]?.items ?? [])
  const orderDiscountType = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountType ?? null)
  const orderDiscountValue = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountValue ?? 0)
  const orderDiscountAmount = useCartStore((s) => s.tabs[s.activeTab]?.orderDiscountAmount ?? 0)
  const subtotal = useCartStore((s) =>
    (s.tabs[s.activeTab]?.items ?? []).reduce((sum, i) => sum + i.lineTotal, 0),
  )
  const totalQty = useCartStore((s) =>
    (s.tabs[s.activeTab]?.items ?? []).reduce((sum, i) => sum + i.quantity, 0),
  )
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
    <div className="flex h-full flex-col">
      <CartTabBar />
      <CustomerSearchCombobox />

      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Giỏ hàng</h2>
          {totalQty > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {totalQty}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Huỷ đơn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Huỷ đơn
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart className="h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Giỏ hàng trống</p>
            <p className="mt-1 text-xs text-muted-foreground">Chọn sản phẩm để thêm vào giỏ hàng</p>
          </div>
        ) : (
          items.map((item) => <CartItem key={item.id} item={item} />)
        )}
      </div>

      {items.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tổng tiền hàng ({totalQty} SP)</span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatVndWithSuffix(subtotal)}
            </span>
          </div>

          <OrderDiscountPopover
            subtotal={subtotal}
            discountType={orderDiscountType}
            discountValue={orderDiscountValue}
            discountAmount={orderDiscountAmount}
          />

          <div className="flex items-end justify-between border-t border-border pt-2">
            <span className="text-sm font-medium text-foreground">Tổng thanh toán</span>
            <span className="font-mono text-2xl font-bold text-foreground">
              {formatVndWithSuffix(grandTotal)}
            </span>
          </div>

          <Button
            disabled={!canPay}
            onClick={onPayment}
            className="h-12 w-full text-base font-semibold"
          >
            Thanh toán (F2)
          </Button>
        </div>
      )}

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
