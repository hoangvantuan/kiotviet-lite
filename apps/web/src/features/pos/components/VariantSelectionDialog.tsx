import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useCartStore } from '@/stores/use-cart-store'

import type { PosProductItem, PosProductVariant, PosUnitConversion } from '../types'

interface VariantSelectionDialogProps {
  product: PosProductItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VariantSelectionDialog({
  product,
  open,
  onOpenChange,
}: VariantSelectionDialogProps) {
  const addItem = useCartStore((s) => s.addItem)
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)

  const attributeGroups = useMemo(() => {
    if (!product?.hasVariants) return []
    const groups: Record<string, Set<string>> = {}
    for (const variant of product.variants) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        if (!groups[key]) groups[key] = new Set()
        groups[key].add(value)
      }
    }
    return Object.entries(groups).map(([key, values]) => ({
      key,
      values: Array.from(values),
    }))
  }, [product])

  const selectedVariant = useMemo<PosProductVariant | null>(() => {
    if (!product?.hasVariants) return null
    const attrKeys = attributeGroups.map((g) => g.key)
    if (attrKeys.length === 0 || !attrKeys.every((key) => selectedAttributes[key])) return null
    return (
      product.variants.find((v) =>
        attrKeys.every((key) => v.attributes[key] === selectedAttributes[key]),
      ) ?? null
    )
  }, [product, attributeGroups, selectedAttributes])

  const selectedUnit = useMemo<PosUnitConversion | null>(() => {
    if (!product || !selectedUnitId) return null
    return product.unitConversions.find((u) => u.id === selectedUnitId) ?? null
  }, [product, selectedUnitId])

  const displayPrice = useMemo(() => {
    if (!product) return 0
    const rawPrice =
      product.hasVariants && selectedVariant ? selectedVariant.price : product.basePrice
    if (!selectedUnit) return rawPrice
    return selectedUnit.sellingPrice ?? Math.round(rawPrice * selectedUnit.conversionFactor)
  }, [product, selectedVariant, selectedUnit])

  const rawStock = useMemo(() => {
    if (!product?.trackInventory) return Infinity
    if (product.hasVariants) return selectedVariant ? selectedVariant.stockQuantity : 0
    return product.stockQuantity
  }, [product, selectedVariant])

  const maxStock = useMemo(() => {
    if (rawStock === Infinity) return Infinity
    if (!selectedUnit) return rawStock
    return Math.floor(rawStock / selectedUnit.conversionFactor)
  }, [rawStock, selectedUnit])

  useEffect(() => {
    if (maxStock !== Infinity && quantity > maxStock) {
      setQuantity(Math.max(1, maxStock))
    }
  }, [maxStock, quantity])

  function isValueAvailable(attrKey: string, attrValue: string): boolean {
    if (!product) return false
    const otherSelections = { ...selectedAttributes }
    delete otherSelections[attrKey]
    return product.variants.some((v) => {
      if (v.attributes[attrKey] !== attrValue) return false
      return Object.entries(otherSelections).every(([k, val]) => v.attributes[k] === val)
    })
  }

  function handleSelectAttribute(key: string, value: string) {
    setSelectedAttributes((prev) => {
      if (prev[key] === value) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  function handleSelectUnit(unitId: string | null) {
    setSelectedUnitId(unitId)
    setQuantity(1)
  }

  function resetState() {
    setSelectedAttributes({})
    setQuantity(1)
    setNotes('')
    setSelectedUnitId(null)
  }

  function handleAdd() {
    if (!product) return

    addItem(
      {
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        productName: product.name,
        variantName: selectedVariant?.name ?? null,
        sku: selectedVariant?.sku ?? product.sku,
        unitPrice: displayPrice,
        imageUrl: product.imageUrl,
        notes: notes.trim() || null,
        unitName: selectedUnit?.unit ?? null,
        unitConversionId: selectedUnitId,
      },
      quantity,
    )

    onOpenChange(false)
    resetState()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  if (!product) return null

  const isVariantReady = product.hasVariants ? selectedVariant !== null : true
  const isOutOfStock = product.trackInventory && maxStock <= 0
  const canAdd =
    isVariantReady &&
    !isOutOfStock &&
    quantity > 0 &&
    (maxStock === Infinity || quantity <= maxStock)
  const hasUnitOptions = product.unitConversions.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Chọn biến thể và số lượng sản phẩm
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {product.imageUrl && (
            <div className="mx-auto h-32 w-32 overflow-hidden rounded-lg bg-muted">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {product.hasVariants &&
            attributeGroups.map((group) => (
              <div key={group.key}>
                <p className="mb-1.5 text-sm font-medium text-foreground">{group.key}</p>
                <div className="flex flex-wrap gap-2">
                  {group.values.map((value) => {
                    const isSelected = selectedAttributes[group.key] === value
                    const available = isValueAvailable(group.key, value)

                    const testAttrs = { ...selectedAttributes, [group.key]: value }
                    const matchingVariants = product.variants.filter((v) =>
                      Object.entries(testAttrs).every(([k, val]) => v.attributes[k] === val),
                    )
                    const allOutOfStock =
                      product.trackInventory &&
                      matchingVariants.length > 0 &&
                      matchingVariants.every((v) => v.stockQuantity <= 0)

                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        onClick={() => handleSelectAttribute(group.key, value)}
                        className={cn(
                          'inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : available && !allOutOfStock
                              ? 'border-input bg-background text-foreground hover:bg-accent'
                              : 'cursor-not-allowed border-input bg-muted text-muted-foreground opacity-50',
                        )}
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

          {hasUnitOptions && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Đơn vị tính</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectUnit(null)}
                  className={cn(
                    'inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    selectedUnitId === null
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {product.unit}
                </button>
                {product.unitConversions.map((uc) => (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => handleSelectUnit(uc.id)}
                    className={cn(
                      'inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selectedUnitId === uc.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-foreground hover:bg-accent',
                    )}
                  >
                    {uc.unit}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isVariantReady && (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Giá</span>
                <span className="font-mono text-lg font-semibold text-foreground">
                  {formatVndWithSuffix(displayPrice)}
                </span>
              </div>
              {product.trackInventory && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tồn kho</span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      maxStock <= 0
                        ? 'text-destructive'
                        : maxStock <= 10
                          ? 'text-yellow-600'
                          : 'text-foreground',
                    )}
                  >
                    {maxStock}
                    {selectedUnit && ` ${selectedUnit.unit}`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Số lượng</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={maxStock === Infinity ? undefined : maxStock}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (Number.isNaN(val) || val <= 0) return
                  setQuantity(maxStock === Infinity ? val : Math.min(val, maxStock))
                }}
                className="h-10 w-16 rounded-md border border-input bg-background text-center font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <button
                type="button"
                onClick={() =>
                  setQuantity((q) => (maxStock === Infinity ? q + 1 : Math.min(q + 1, maxStock)))
                }
                disabled={maxStock !== Infinity && quantity >= maxStock}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-input text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Ghi chú</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nhập ghi chú cho sản phẩm..."
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={!canAdd}
            className="h-11 w-full text-sm font-semibold"
          >
            {isOutOfStock ? 'Hết hàng' : 'Thêm vào giỏ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
