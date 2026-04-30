import { useState } from 'react'
import { Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVnd } from '@/lib/currency'

import { useStockInfoQuery } from '../hooks/use-checkout'

interface StockInfoPopoverProps {
  productId: string
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock <= 0) {
    return <Badge variant="destructive">Hết hàng</Badge>
  }
  if (stock <= minStock) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
        Sắp hết
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-green-100 text-green-700">
      Còn hàng
    </Badge>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function StockInfoPopover({ productId }: StockInfoPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const { data: stockInfo, isLoading } = useStockInfoQuery(popoverOpen ? productId : null)

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Xem ton kho"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        {isLoading ? (
          <SkeletonLines />
        ) : stockInfo ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{stockInfo.productName}</p>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Ton kho</span>
              <span className="font-mono text-sm font-medium">
                {formatVnd(stockInfo.currentStock)} {stockInfo.unit}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Dinh muc toi thieu</span>
              <span className="font-mono text-sm">
                {formatVnd(stockInfo.minStock)} {stockInfo.unit}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Trang thai</span>
              <StockBadge stock={stockInfo.currentStock} minStock={stockInfo.minStock} />
            </div>

            {stockInfo.variants.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Bien the</p>
                <div className="space-y-1">
                  {stockInfo.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground">{v.name}</span>
                      <span className="ml-2 font-mono">{formatVnd(v.stockQuantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!stockInfo.trackInventory && (
              <p className="text-xs italic text-muted-foreground">
                San pham nay khong theo doi ton kho
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Khong tim thay thong tin</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
