import { MoreVertical, Package, Pencil, Trash2 } from 'lucide-react'

import type { ProductListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatVndWithSuffix } from '@/lib/currency'

import { StockBadge } from './stock-badge'

interface ProductCardListProps {
  items: ProductListItem[]
  onEdit: (p: ProductListItem) => void
  onDelete: (p: ProductListItem) => void
}

export function ProductCardList({ items, onEdit, onDelete }: ProductCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <div
          key={p.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
        >
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="flex flex-1 items-start gap-3 text-left"
          >
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt={p.name}
                className="h-16 w-16 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium text-foreground">{p.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
              <p className="text-sm font-medium tabular-nums">
                {formatVndWithSuffix(p.sellingPrice)}
              </p>
              <div className="flex items-center gap-2">
                <StockBadge
                  trackInventory={p.trackInventory}
                  currentStock={p.currentStock}
                  minStock={p.minStock}
                />
                {p.status === 'inactive' && (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Ngừng bán
                  </span>
                )}
              </div>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Thao tác cho ${p.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(p)}>
                <Pencil className="mr-2 h-4 w-4" />
                Sửa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(p)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xoá
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}
