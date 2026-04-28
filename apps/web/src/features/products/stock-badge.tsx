export interface StockBadgeProps {
  trackInventory: boolean
  currentStock: number
  minStock: number
}

export function StockBadge({ trackInventory, currentStock, minStock }: StockBadgeProps) {
  if (!trackInventory) {
    return <span className="text-sm text-muted-foreground">∞</span>
  }
  if (currentStock === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Hết hàng
      </span>
    )
  }
  if (currentStock <= minStock && minStock > 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Sắp hết · {currentStock}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      {currentStock}
    </span>
  )
}
