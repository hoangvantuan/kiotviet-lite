import type { MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PackageOpen } from 'lucide-react'

import { StockBadge } from './stock-badge'
import { useLowStockListQuery } from './use-products'

export interface LowStockPanelProps {
  enabled: boolean
  onItemClick?: () => void
}

export function LowStockPanel({ enabled, onItemClick }: LowStockPanelProps) {
  const { data, isLoading } = useLowStockListQuery(enabled)
  const navigate = useNavigate()
  const items = data?.data ?? []

  function handleNavigate(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    onItemClick?.()
    navigate({ to: '/products', search: { stockFilter: 'below_min' } as never })
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải…</p>
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <PackageOpen className="size-10 text-muted-foreground/40" />
        <p>Tất cả sản phẩm còn đủ hàng.</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id}>
          <a
            href="/products?stockFilter=below_min"
            className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted/50"
            onClick={handleNavigate}
          >
            <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  {p.unit?.[0] ?? '?'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
              <p className="text-xs text-muted-foreground">
                Tồn: {p.currentStock} / Định mức: {p.minStock}
              </p>
            </div>
            <StockBadge
              trackInventory={p.trackInventory}
              currentStock={p.currentStock}
              minStock={p.minStock}
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
