import { useState } from 'react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VariantBulkActionsProps {
  selectedCount: number
  onApplyPrice: (value: number) => void
  onApplyCost: (value: number | null) => void
  onApplyStock: (value: number) => void
  onClear: () => void
}

type ActionType = 'price' | 'cost' | 'stock'

export function VariantBulkActions({
  selectedCount,
  onApplyPrice,
  onApplyCost,
  onApplyStock,
  onClear,
}: VariantBulkActionsProps) {
  const [activeAction, setActiveAction] = useState<ActionType | null>(null)
  const [priceValue, setPriceValue] = useState<number | null>(null)
  const [costValue, setCostValue] = useState<number | null>(null)
  const [stockValue, setStockValue] = useState<number>(0)

  if (selectedCount === 0) return null

  function handleApply() {
    if (activeAction === 'price' && priceValue !== null) {
      onApplyPrice(priceValue)
    } else if (activeAction === 'cost') {
      onApplyCost(costValue)
    } else if (activeAction === 'stock') {
      onApplyStock(stockValue)
    }
    setActiveAction(null)
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 p-2">
        <span className="text-sm font-medium">Đã chọn {selectedCount} biến thể</span>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setActiveAction('price')}
          >
            Đặt giá bán
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setActiveAction('cost')}>
            Đặt giá vốn
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setActiveAction('stock')}
          >
            Đặt tồn kho
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Bỏ chọn
          </Button>
        </div>
      </div>

      <Dialog open={activeAction !== null} onOpenChange={(o) => !o && setActiveAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {activeAction === 'price' && 'Đặt giá bán hàng loạt'}
              {activeAction === 'cost' && 'Đặt giá vốn hàng loạt'}
              {activeAction === 'stock' && 'Đặt tồn kho hàng loạt'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {activeAction === 'price' && (
              <>
                <Label>Giá bán</Label>
                <CurrencyInput value={priceValue} onChange={(v) => setPriceValue(v)} autoFocus />
              </>
            )}
            {activeAction === 'cost' && (
              <>
                <Label>Giá vốn</Label>
                <CurrencyInput value={costValue} onChange={(v) => setCostValue(v)} autoFocus />
              </>
            )}
            {activeAction === 'stock' && (
              <>
                <Label>Tồn kho</Label>
                <Input
                  type="number"
                  min={0}
                  value={stockValue}
                  onChange={(e) => setStockValue(Number(e.target.value) || 0)}
                  autoFocus
                />
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Áp dụng cho {selectedCount} biến thể đã chọn.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveAction(null)}>
              Hủy
            </Button>
            <Button type="button" onClick={handleApply}>
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
