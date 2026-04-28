import { Lock, RotateCcw, Sparkles, Trash2 } from 'lucide-react'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { buildVariantName, type VariantFormItem } from './variants-utils'

interface VariantTableProps {
  variants: VariantFormItem[]
  onChange: (next: VariantFormItem[]) => void
  attribute1Name: string
  attribute2Name: string | null
  trackInventory: boolean
  selected: Set<number>
  onSelectionChange: (next: Set<number>) => void
}

export function VariantTable({
  variants,
  onChange,
  trackInventory,
  selected,
  onSelectionChange,
}: VariantTableProps) {
  function update(index: number, patch: Partial<VariantFormItem>) {
    const next = variants.map((v, i) => (i === index ? { ...v, ...patch } : v))
    onChange(next)
  }

  function toggleDelete(index: number) {
    const v = variants[index]
    if (!v) return
    update(index, { _pendingDelete: !v._pendingDelete })
  }

  function toggleSelected(index: number) {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    onSelectionChange(next)
  }

  function toggleSelectAll() {
    const eligibleIdx = variants.map((v, i) => (v._pendingDelete ? -1 : i)).filter((i) => i !== -1)
    if (selected.size === eligibleIdx.length) onSelectionChange(new Set())
    else onSelectionChange(new Set(eligibleIdx))
  }

  if (variants.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Chưa có biến thể nào. Thêm thuộc tính và giá trị để tạo biến thể.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="hidden md:block">
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      selected.size > 0 &&
                      selected.size === variants.filter((v) => !v._pendingDelete).length
                    }
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả biến thể"
                  />
                </TableHead>
                <TableHead>Tên biến thể</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Giá bán</TableHead>
                <TableHead className="text-right">Giá vốn</TableHead>
                {trackInventory && <TableHead className="text-right">Tồn kho ban đầu</TableHead>}
                <TableHead className="w-20 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((v, i) => (
                <TableRow
                  key={`${v.id ?? 'new'}-${i}`}
                  className={cn(
                    v._pendingDelete && 'bg-destructive/5 line-through opacity-70',
                    v._isNew && !v._pendingDelete && 'bg-emerald-50/40',
                  )}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      disabled={v._pendingDelete}
                      checked={selected.has(i)}
                      onChange={() => toggleSelected(i)}
                      aria-label={`Chọn biến thể ${i + 1}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      {v._isNew && !v._pendingDelete && (
                        <Sparkles className="h-3 w-3 text-emerald-600" aria-label="Mới" />
                      )}
                      {v._hasTransactions && (
                        <Lock className="h-3 w-3 text-amber-600" aria-label="Đã có giao dịch" />
                      )}
                      <span>{buildVariantName(v.attribute1Value, v.attribute2Value)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={v.sku}
                      onChange={(e) => update(i, { sku: e.target.value })}
                      maxLength={64}
                      disabled={v._pendingDelete}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={v.barcode}
                      onChange={(e) => update(i, { barcode: e.target.value })}
                      maxLength={64}
                      disabled={v._pendingDelete}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <CurrencyInput
                      value={v.sellingPrice}
                      onChange={(val) => update(i, { sellingPrice: val ?? 0 })}
                      disabled={v._pendingDelete}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <CurrencyInput
                      value={v.costPrice}
                      onChange={(val) => update(i, { costPrice: val })}
                      disabled={v._pendingDelete}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  {trackInventory && (
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={v.stockQuantity}
                        onChange={(e) => update(i, { stockQuantity: Number(e.target.value) || 0 })}
                        disabled={v._pendingDelete || !v._isNew}
                        className="h-8 w-24 text-right text-xs"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDelete(i)}
                      aria-label={v._pendingDelete ? 'Hoàn tác xoá' : 'Xoá biến thể'}
                    >
                      {v._pendingDelete ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {variants.map((v, i) => (
          <div
            key={`${v.id ?? 'new'}-${i}`}
            className={cn(
              'rounded-md border border-border p-3 space-y-2',
              v._pendingDelete && 'bg-destructive/5 opacity-70',
              v._isNew && !v._pendingDelete && 'bg-emerald-50/40',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  disabled={v._pendingDelete}
                  checked={selected.has(i)}
                  onChange={() => toggleSelected(i)}
                />
                <span>{buildVariantName(v.attribute1Value, v.attribute2Value)}</span>
                {v._isNew && !v._pendingDelete && <Sparkles className="h-3 w-3 text-emerald-600" />}
                {v._hasTransactions && <Lock className="h-3 w-3 text-amber-600" />}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleDelete(i)}
                aria-label={v._pendingDelete ? 'Hoàn tác xoá' : 'Xoá biến thể'}
              >
                {v._pendingDelete ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="grid gap-2">
              <div>
                <span className="text-xs text-muted-foreground">SKU</span>
                <Input
                  value={v.sku}
                  onChange={(e) => update(i, { sku: e.target.value })}
                  disabled={v._pendingDelete}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Barcode</span>
                <Input
                  value={v.barcode}
                  onChange={(e) => update(i, { barcode: e.target.value })}
                  disabled={v._pendingDelete}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">Giá bán</span>
                  <CurrencyInput
                    value={v.sellingPrice}
                    onChange={(val) => update(i, { sellingPrice: val ?? 0 })}
                    disabled={v._pendingDelete}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Giá vốn</span>
                  <CurrencyInput
                    value={v.costPrice}
                    onChange={(val) => update(i, { costPrice: val })}
                    disabled={v._pendingDelete}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              {trackInventory && (
                <div>
                  <span className="text-xs text-muted-foreground">Tồn kho ban đầu</span>
                  <Input
                    type="number"
                    min={0}
                    value={v.stockQuantity}
                    onChange={(e) => update(i, { stockQuantity: Number(e.target.value) || 0 })}
                    disabled={v._pendingDelete || !v._isNew}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
            {!v._isNew && (
              <p className="text-xs text-muted-foreground">
                Tồn kho hiện tại: {v.stockQuantity} (Cập nhật qua Story 2.4)
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
