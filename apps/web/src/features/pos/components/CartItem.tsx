import { Minus, Plus, Trash2 } from 'lucide-react'

import { formatVndWithSuffix } from '@/lib/currency'
import { type CartItem as CartItemType, useCartStore } from '@/stores/use-cart-store'

interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  const lineTotal = item.unitPrice * item.quantity

  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
        {item.variantName && (
          <p className="truncate text-xs text-muted-foreground">{item.variantName}</p>
        )}
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {formatVndWithSuffix(item.unitPrice)}
          {item.unitName && <span className="font-sans"> / {item.unitName}</span>}
        </p>
        {item.notes && (
          <p className="mt-0.5 truncate text-xs italic text-muted-foreground">{item.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => updateQuantity(item.id, item.quantity - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Giảm số lượng"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center font-mono text-sm font-medium">{item.quantity}</span>
        <button
          type="button"
          onClick={() => updateQuantity(item.id, item.quantity + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Tăng số lượng"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="font-mono text-sm font-semibold text-foreground">
          {formatVndWithSuffix(lineTotal)}
        </p>
        <button
          type="button"
          onClick={() => removeItem(item.id)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Xóa sản phẩm"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
