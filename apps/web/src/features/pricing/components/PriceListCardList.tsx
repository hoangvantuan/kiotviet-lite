import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

import { formatFormulaLabel, type PriceListListItem } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { PriceListStatusBadge } from './PriceListStatusBadge'

interface Props {
  items: PriceListListItem[]
  onOpen: (id: string) => void
  onEdit: (p: PriceListListItem) => void
  onDelete: (p: PriceListListItem) => void
}

export function PriceListCardList({ items, onOpen, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p.id} className="rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                {p.name}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{p.method === 'direct' ? 'Trực tiếp' : 'Công thức'}</Badge>
                <PriceListStatusBadge priceList={p} />
              </div>
              {p.method === 'formula' && p.formulaType && p.formulaValue !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFormulaLabel(p.formulaType, p.formulaValue)} • Nền: {p.baseName ?? '—'}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{p.itemCount} sản phẩm</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(p)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(p)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Xoá
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  )
}
