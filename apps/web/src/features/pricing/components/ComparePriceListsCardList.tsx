import type { CompareRow } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface Props {
  rows: CompareRow[]
}

function formatPriceCell(value: number | null): string {
  if (value === null) return '—'
  return `${formatVnd(value)}đ`
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

function diffChipClass(row: CompareRow): string {
  if (row.diffPercent === null) return 'border-muted text-muted-foreground'
  const abs = Math.abs(row.diffPercent)
  if (abs > 10) return 'border-amber-300 bg-amber-50 text-amber-700'
  if (row.diffPercent > 0) return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  if (row.diffPercent < 0) return 'border-rose-300 bg-rose-50 text-rose-700'
  return 'border-muted text-muted-foreground'
}

export function ComparePriceListsCardList({ rows }: Props) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const onlyInLabel = row.isMissingA ? 'Chỉ có ở B' : row.isMissingB ? 'Chỉ có ở A' : null
        return (
          <div
            key={row.productId}
            className={cn(
              'rounded-lg border border-border bg-card p-3 space-y-2',
              row.diffPercent !== null &&
                Math.abs(row.diffPercent) > 10 &&
                'bg-amber-50 dark:bg-amber-950/30',
            )}
          >
            <div className="flex items-start gap-3">
              {row.productImageUrl ? (
                <img src={row.productImageUrl} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight">{row.productName}</div>
                <div className="text-xs text-muted-foreground">{row.productSku}</div>
                {row.productCostPrice !== null && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Giá vốn: {formatVnd(row.productCostPrice)}đ
                  </div>
                )}
              </div>
              <Badge variant="outline" className={cn('shrink-0', diffChipClass(row))}>
                {onlyInLabel ?? formatPercent(row.diffPercent)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">Bảng A</div>
                <div
                  className={cn('font-medium tabular-nums', row.isBelowCostA && 'text-destructive')}
                >
                  {formatPriceCell(row.priceA)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Margin: {row.marginA === null ? '—' : `${row.marginA.toFixed(2)}%`}
                </div>
                {row.isBelowCostA && (
                  <Badge variant="outline" className="mt-1 border-destructive text-destructive">
                    Dưới vốn
                  </Badge>
                )}
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">Bảng B</div>
                <div
                  className={cn('font-medium tabular-nums', row.isBelowCostB && 'text-destructive')}
                >
                  {formatPriceCell(row.priceB)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Margin: {row.marginB === null ? '—' : `${row.marginB.toFixed(2)}%`}
                </div>
                {row.isBelowCostB && (
                  <Badge variant="destructive" className="mt-1">
                    Dưới vốn
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
