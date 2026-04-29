import { Pencil, Trash2 } from 'lucide-react'

import type { CustomerPriceListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { formatVnd } from '@/lib/currency'

interface Props {
  items: CustomerPriceListItem[]
  onEdit: (p: CustomerPriceListItem) => void
  onDelete: (p: CustomerPriceListItem) => void
}

export function CustomerPricesCardList({ items, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-2">
      {items.map((p) => {
        const diff = p.productSellingPrice
          ? Math.round(((p.price - p.productSellingPrice) / p.productSellingPrice) * 100)
          : 0
        return (
          <div key={p.id} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.customerName}</div>
                <div className="text-xs text-muted-foreground">{p.customerPhone}</div>
                <div className="mt-2 text-sm">
                  <span className="font-medium">{p.productName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">SKU {p.productSku}</span>
                </div>
                <div className="mt-1 text-sm">
                  Giá riêng: <span className="font-semibold">{formatVnd(p.price)}đ</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Giá lẻ {formatVnd(p.productSellingPrice)}đ
                    {diff !== 0 ? `, ${diff > 0 ? '+' : ''}${diff}%` : ''})
                  </span>
                </div>
                {p.note && (
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.note}</div>
                )}
              </div>
              <div className="flex flex-col">
                <Button variant="ghost" size="icon" onClick={() => onEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(p)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
