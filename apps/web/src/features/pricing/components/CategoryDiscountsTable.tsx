import { Pencil, Trash2, Users } from 'lucide-react'

import type { CategoryDiscountListItem, EffectiveStatus } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function formatDiscount(p: CategoryDiscountListItem): string {
  return p.discountType === 'percent' ? `${p.discountValue}%` : `${formatVnd(p.discountValue)}đ`
}

function formatEffective(p: CategoryDiscountListItem): string {
  if (p.effectiveFrom && p.effectiveTo) return `${p.effectiveFrom} → ${p.effectiveTo}`
  if (p.effectiveFrom) return `Áp dụng từ ${p.effectiveFrom}`
  if (p.effectiveTo) return `Hết hạn ${p.effectiveTo}`
  return 'Vô hạn'
}

export function CategoryDiscountsTable({ items, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Danh mục</TableHead>
            <TableHead>Đối tượng</TableHead>
            <TableHead className="text-right">Mức giảm</TableHead>
            <TableHead className="text-right">SL tối thiểu</TableHead>
            <TableHead>Hiệu lực</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="align-top">
                <div className="font-medium">{p.categoryName}</div>
              </TableCell>
              <TableCell className="align-top">
                {p.customerName ? (
                  <>
                    <div className="font-medium">{p.customerName}</div>
                    <div className="text-xs text-muted-foreground">{p.customerPhone}</div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{p.customerGroupName ?? '—'}</span>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatDiscount(p)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.minQty}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatEffective(p)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[p.effectiveStatus]}>
                  {STATUS_LABEL[p.effectiveStatus]}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                {p.note ?? ''}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => onEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(p)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
