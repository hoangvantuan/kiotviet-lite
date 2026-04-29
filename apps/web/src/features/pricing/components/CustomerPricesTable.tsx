import { Pencil, Trash2 } from 'lucide-react'

import type { CustomerPriceListItem } from '@kiotviet-lite/shared'

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
  items: CustomerPriceListItem[]
  onEdit: (p: CustomerPriceListItem) => void
  onDelete: (p: CustomerPriceListItem) => void
}

export function CustomerPricesTable({ items, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Khách hàng</TableHead>
            <TableHead>Sản phẩm</TableHead>
            <TableHead className="text-right">Giá lẻ chuẩn</TableHead>
            <TableHead className="text-right">Giá riêng</TableHead>
            <TableHead className="text-right">Chênh lệch</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const diff = p.productSellingPrice
              ? Math.round(((p.price - p.productSellingPrice) / p.productSellingPrice) * 100)
              : 0
            const diffLabel = diff === 0 ? '0%' : diff > 0 ? `+${diff}%` : `${diff}%`
            const diffVariant: 'default' | 'destructive' | 'secondary' =
              diff > 0 ? 'destructive' : diff < 0 ? 'default' : 'secondary'

            return (
              <TableRow key={p.id}>
                <TableCell className="align-top">
                  <div className="font-medium">{p.customerName}</div>
                  <div className="text-xs text-muted-foreground">{p.customerPhone}</div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="font-medium">{p.productName}</div>
                  <div className="text-xs text-muted-foreground">SKU {p.productSku}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatVnd(p.productSellingPrice)}đ
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatVnd(p.price)}đ
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={diffVariant}>{diffLabel}</Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
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
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
