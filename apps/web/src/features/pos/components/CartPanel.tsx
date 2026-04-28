import { ShoppingCart, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatVndWithSuffix } from '@/lib/currency'
import { useCartStore } from '@/stores/use-cart-store'

import { CartItem } from './CartItem'

export function CartPanel() {
  const items = useCartStore((s) => s.items)
  const clearCart = useCartStore((s) => s.clearCart)
  const count = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0))
  const total = useCartStore((s) => s.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Giỏ hàng</h2>
          {count > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa tất cả
          </button>
        )}
      </div>

      {/* Items list */}
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

      {/* Footer */}
      {items.length > 0 && (
        <div className="shrink-0 border-t border-border bg-background p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tổng ({count} sản phẩm)</span>
            <span className="font-mono text-2xl font-bold text-foreground">
              {formatVndWithSuffix(total)}
            </span>
          </div>
          <Button
            disabled
            className="h-12 w-full text-base font-semibold"
            title="Chức năng thanh toán sẽ có ở Story 3.3"
          >
            Thanh toán
          </Button>
        </div>
      )}
    </div>
  )
}
