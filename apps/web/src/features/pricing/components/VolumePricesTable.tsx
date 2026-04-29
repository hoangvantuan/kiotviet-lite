import { Pencil, Trash2 } from 'lucide-react'

import type { VolumePricesListItem } from '@kiotviet-lite/shared'

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
  items: VolumePricesListItem[]
  onEdit: (item: VolumePricesListItem) => void
  onClear: (item: VolumePricesListItem) => void
}

export function VolumePricesTable({ items, onEdit, onClear }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead className="text-right">Giá lẻ chuẩn</TableHead>
            <TableHead className="text-center">Số mức giá</TableHead>
            <TableHead>Top mức giá</TableHead>
            <TableHead className="text-right">Khoảng giá</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.productId}>
              <TableCell className="align-top">
                <div className="font-medium">{p.productName}</div>
                <div className="text-xs text-muted-foreground">SKU {p.productSku}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatVnd(p.productSellingPrice)}đ
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={p.tierCount > 0 ? 'default' : 'secondary'}>{p.tierCount}/5</Badge>
              </TableCell>
              <TableCell className="align-top">
                {p.topTiers.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {p.topTiers.map((t) => (
                      <li key={t.id}>
                        Từ {t.minQty.toLocaleString('vi-VN')}: {formatVnd(t.price)}đ
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {p.tierCount === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : p.minPrice === p.maxPrice ? (
                  <span>{formatVnd(p.minPrice)}đ</span>
                ) : (
                  <span>
                    {formatVnd(p.minPrice)}đ – {formatVnd(p.maxPrice)}đ
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
