import { Info, Layers, Package, Pencil, Trash2 } from 'lucide-react'

import type { ProductListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVndWithSuffix } from '@/lib/currency'

import { StockBadge } from './stock-badge'

interface ProductTableProps {
  items: ProductListItem[]
  onEdit: (p: ProductListItem) => void
  onDelete: (p: ProductListItem) => void
}

export function ProductTable({ items, onEdit, onDelete }: ProductTableProps) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Ảnh</TableHead>
            <TableHead>Tên</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Danh mục</TableHead>
            <TableHead className="text-right">Giá bán</TableHead>
            <TableHead className="text-right">
              <span
                className="inline-flex items-center gap-1"
                title="Giá vốn bình quân gia quyền (WAC), tự cập nhật khi nhập hàng"
              >
                Giá vốn
                <Info className="h-3 w-3 text-muted-foreground" />
              </span>
            </TableHead>
            <TableHead className="text-right">Tồn kho</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-1">
                  {p.hasVariants && (
                    <Layers
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-label="Sản phẩm có biến thể"
                    />
                  )}
                  <span>{p.name}</span>
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.categoryName ?? '—'}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {p.hasVariants ? (
                  <span className="text-xs italic text-muted-foreground">Theo biến thể</span>
                ) : (
                  formatVndWithSuffix(p.sellingPrice)
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.hasVariants ? (
                  <span
                    className="text-xs italic text-muted-foreground"
                    title={
                      p.costPrice !== null
                        ? `Giá vốn BQ ở cấp sản phẩm: ${formatVndWithSuffix(p.costPrice)}`
                        : undefined
                    }
                  >
                    Theo biến thể
                  </span>
                ) : p.costPrice === null ? (
                  <span className="text-xs italic text-muted-foreground">Chưa có</span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {formatVndWithSuffix(p.costPrice)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <StockBadge
                  trackInventory={p.trackInventory}
                  currentStock={p.currentStock}
                  minStock={p.minStock}
                />
              </TableCell>
              <TableCell>
                {p.status === 'active' ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Đang bán
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Ngừng bán
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(p)}
                    aria-label={`Sửa ${p.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(p)}
                    aria-label={`Xoá ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
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
