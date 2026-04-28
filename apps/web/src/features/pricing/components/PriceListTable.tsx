import { Pencil, Trash2 } from 'lucide-react'

import { formatFormulaLabel, type PriceListListItem } from '@kiotviet-lite/shared'

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

import { PriceListStatusBadge } from './PriceListStatusBadge'

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

interface Props {
  items: PriceListListItem[]
  onOpen: (id: string) => void
  onEdit: (p: PriceListListItem) => void
  onDelete: (p: PriceListListItem) => void
}

export function PriceListTable({ items, onOpen, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên</TableHead>
            <TableHead>Phương thức</TableHead>
            <TableHead>Bảng giá nền</TableHead>
            <TableHead className="text-right">Số sản phẩm</TableHead>
            <TableHead>Hiệu lực</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const dateRange =
              p.effectiveFrom || p.effectiveTo
                ? `${formatDate(p.effectiveFrom) || '∞'} → ${formatDate(p.effectiveTo) || '∞'}`
                : 'Không giới hạn'
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="text-left text-primary underline-offset-2 hover:underline"
                    onClick={() => onOpen(p.id)}
                  >
                    {p.name}
                  </button>
                  {p.method === 'formula' && p.formulaType && p.formulaValue !== null && (
                    <p className="text-xs text-muted-foreground">
                      {formatFormulaLabel(p.formulaType, p.formulaValue)}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {p.method === 'direct' ? 'Trực tiếp' : 'Công thức'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.method === 'formula' ? (p.baseName ?? '—') : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{dateRange}</TableCell>
                <TableCell>
                  <PriceListStatusBadge priceList={p} />
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
