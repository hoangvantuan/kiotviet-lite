import type { CompareRow } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface Props {
  rows: CompareRow[]
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function formatPriceCell(value: number | null): string {
  if (value === null) return '—'
  return `${formatVnd(value)}đ`
}

function diffPercentClass(row: CompareRow): string {
  if (row.diffPercent === null) return 'text-muted-foreground'
  const abs = Math.abs(row.diffPercent)
  if (abs > 10) return 'text-amber-700 dark:text-amber-400 font-semibold'
  if (row.diffPercent > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (row.diffPercent < 0) return 'text-rose-700 dark:text-rose-400'
  return 'text-muted-foreground'
}

export function ComparePriceListsTable({ rows }: Props) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-12">Ảnh</TableHead>
            <TableHead>Sản phẩm</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Giá A</TableHead>
            <TableHead className="text-right">Margin A</TableHead>
            <TableHead className="text-right">Giá B</TableHead>
            <TableHead className="text-right">Margin B</TableHead>
            <TableHead className="text-right">Δ tiền</TableHead>
            <TableHead className="text-right">Δ %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isHighlight = row.diffPercent !== null && Math.abs(row.diffPercent) > 10
            const onlyInLabel = row.isMissingA ? 'Chỉ có ở B' : row.isMissingB ? 'Chỉ có ở A' : null
            return (
              <TableRow
                key={row.productId}
                className={cn(isHighlight && 'bg-amber-50 dark:bg-amber-950/30')}
              >
                <TableCell>
                  {row.productImageUrl ? (
                    <img
                      src={row.productImageUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.productName}</div>
                  <div className="text-xs text-muted-foreground">{row.productSku}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.productCostPrice === null ? '—' : `${formatVnd(row.productCostPrice)}đ`}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    row.isMissingA && 'text-muted-foreground',
                    row.isBelowCostA && 'text-destructive font-semibold',
                  )}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {row.isBelowCostA && (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        Dưới vốn
                      </Badge>
                    )}
                    <span>{formatPriceCell(row.priceA)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.marginA === null ? '—' : `${row.marginA.toFixed(2)}%`}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    row.isMissingB && 'text-muted-foreground',
                    row.isBelowCostB && 'text-destructive font-semibold',
                  )}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {row.isBelowCostB && <Badge variant="destructive">Dưới vốn</Badge>}
                    <span>{formatPriceCell(row.priceB)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.marginB === null ? '—' : `${row.marginB.toFixed(2)}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.diffAmount === null ? '—' : `${formatVnd(row.diffAmount)}đ`}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums', diffPercentClass(row))}>
                  {onlyInLabel ?? formatPercent(row.diffPercent)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
