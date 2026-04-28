import { useEffect, useMemo, useState } from 'react'

import type { ProductDetail, VariantItem } from '@kiotviet-lite/shared'

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

interface VariantPickerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: ProductDetail | null
  excludedVariantIds?: string[]
  onConfirm: (variants: VariantItem[]) => void
}

export function VariantPickerDialog({
  open,
  onOpenChange,
  product,
  excludedVariantIds = [],
  onConfirm,
}: VariantPickerDialogProps) {
  const variants = useMemo(() => product?.variantsConfig?.variants ?? [], [product])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (open) setSelected(new Set())
  }, [open, product?.id])

  const excluded = useMemo(() => new Set(excludedVariantIds), [excludedVariantIds])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSubmit = () => {
    const picked = variants.filter((v) => selected.has(v.id))
    if (picked.length === 0) return
    onConfirm(picked)
    onOpenChange(false)
  }

  const buildLabel = (v: VariantItem): string => {
    if (v.attribute2Value) return `${v.attribute1Value} - ${v.attribute2Value}`
    return v.attribute1Value
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chọn biến thể</DialogTitle>
          <DialogDescription>
            {product
              ? `Chọn một hoặc nhiều biến thể của "${product.name}" để thêm vào phiếu nhập.`
              : 'Chọn biến thể để thêm vào phiếu nhập.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded-md border">
          {variants.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Sản phẩm này chưa có biến thể.</p>
          )}
          <ul className="divide-y">
            {variants.map((v) => {
              const isExcluded = excluded.has(v.id)
              const isChecked = selected.has(v.id)
              const inputId = `variant-pick-${v.id}`
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    isExcluded ? 'opacity-50' : 'hover:bg-accent'
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                    checked={isChecked}
                    disabled={isExcluded}
                    onChange={() => toggle(v.id)}
                  />
                  <label
                    htmlFor={inputId}
                    className={`flex-1 min-w-0 text-sm ${
                      isExcluded ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{buildLabel(v)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Tồn: {v.stockQuantity}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
                      {v.costPrice !== null && (
                        <span className="text-xs text-muted-foreground">
                          Giá vốn: {formatVndWithSuffix(v.costPrice)}
                        </span>
                      )}
                    </div>
                    {isExcluded && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">
                        Đã có trong phiếu
                      </p>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" onClick={onSubmit} disabled={selected.size === 0}>
            Thêm {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
