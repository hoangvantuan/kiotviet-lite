import { Pencil, Trash2, Users } from 'lucide-react'

import type { CategoryDiscountListItem, EffectiveStatus } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatVnd } from '@/lib/currency'

interface Props {
  items: CategoryDiscountListItem[]
  onEdit: (p: CategoryDiscountListItem) => void
  onDelete: (p: CategoryDiscountListItem) => void
}

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  pending: 'Sắp hiệu lực',
  active: 'Đang hiệu lực',
  expired: 'Hết hạn',
  inactive: 'Đã tắt',
}

const STATUS_VARIANT: Record<EffectiveStatus, 'default' | 'destructive' | 'secondary'> = {
  pending: 'secondary',
  active: 'default',
  expired: 'destructive',
  inactive: 'secondary',
}

export function CategoryDiscountsCardList({ items, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p.id} className="rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.categoryName}</span>
                <Badge variant={STATUS_VARIANT[p.effectiveStatus]}>
                  {STATUS_LABEL[p.effectiveStatus]}
                </Badge>
              </div>
              <div className="mt-1 text-sm">
                {p.customerName ? (
                  <span>
                    KH: <span className="font-medium">{p.customerName}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{p.customerPhone}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{p.customerGroupName ?? '—'}</span>
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm">
                Giảm:{' '}
                <span className="font-semibold">
                  {p.discountType === 'percent'
                    ? `${p.discountValue}%`
                    : `${formatVnd(p.discountValue)}đ`}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">SL ≥ {p.minQty}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {p.effectiveFrom || p.effectiveTo
                  ? `${p.effectiveFrom ?? '—'} → ${p.effectiveTo ?? '—'}`
                  : 'Vô hạn'}
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
      ))}
    </div>
  )
}
