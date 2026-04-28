import { Pencil, Trash2 } from 'lucide-react'

import type { PriceListDetail, PriceListItemListItem } from '@kiotviet-lite/shared'

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

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

interface Props {
  priceList: PriceListDetail
  items: PriceListItemListItem[]
  onEdit: (item: PriceListItemListItem) => void
  onDelete: (item: PriceListItemListItem) => void
}

export function PriceListItemsTable({ priceList, items, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Giá gốc</TableHead>
            <TableHead className="text-right">Giá bảng</TableHead>
            {priceList.method === 'formula' && <TableHead>Override</TableHead>}
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.productName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{it.productSku}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {VND_FORMATTER.format(it.productSellingPrice)}đ
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {VND_FORMATTER.format(it.price)}đ
              </TableCell>
              {priceList.method === 'formula' && (
                <TableCell>
                  {it.isOverridden ? (
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      Override
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Theo công thức</span>
                  )}
                </TableCell>
              )}
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(it)}
                  aria-label={`Sửa ${it.productName}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(it)}
                  aria-label={`Xoá ${it.productName}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
