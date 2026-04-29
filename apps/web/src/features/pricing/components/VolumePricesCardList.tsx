import { Pencil, Trash2 } from 'lucide-react'

import type { VolumePricesListItem } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatVnd } from '@/lib/currency'

interface Props {
  items: VolumePricesListItem[]
  onEdit: (item: VolumePricesListItem) => void
  onClear: (item: VolumePricesListItem) => void
}

export function VolumePricesCardList({ items, onEdit, onClear }: Props) {
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p.productId} className="rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.productName}</div>
              <div className="text-xs text-muted-foreground">SKU {p.productSku}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Giá lẻ chuẩn: {formatVnd(p.productSellingPrice)}đ
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={p.tierCount > 0 ? 'default' : 'secondary'}>
                  {p.tierCount}/5 mức
                </Badge>
                {p.tierCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {p.minPrice === p.maxPrice
                      ? `${formatVnd(p.minPrice)}đ`
                      : `${formatVnd(p.minPrice)}đ – ${formatVnd(p.maxPrice)}đ`}
                  </span>
                )}
              </div>
              {p.topTiers.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {p.topTiers.map((t) => (
                    <li key={t.id}>
                      Từ {t.minQty.toLocaleString('vi-VN')}: {formatVnd(t.price)}đ
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(p)} aria-label="Sửa">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onClear(p)}
                aria-label="Xoá toàn bộ mức giá"
                disabled={p.tierCount === 0}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
