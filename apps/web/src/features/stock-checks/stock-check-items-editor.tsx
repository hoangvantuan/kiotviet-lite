import { Trash2 } from 'lucide-react'

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

import { computeStockCheckTotals, formatDiff } from './stock-check-utils'

export interface EditableStockCheckItem {
  tempId: string
  productId: string
  variantId: string | null
  productName: string
  productSku: string
  variantLabel: string | null
  systemQty: number
  actualQty: number
  note: string
}

interface Props {
  items: EditableStockCheckItem[]
  onUpdateItem: (tempId: string, patch: Partial<EditableStockCheckItem>) => void
  onRemoveItem: (tempId: string) => void
  disabled?: boolean
}

export function StockCheckItemsEditor({ items, onUpdateItem, onRemoveItem, disabled }: Props) {
  const summary = computeStockCheckTotals(items)

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">STT</TableHead>
              <TableHead>Sản phẩm</TableHead>
              <TableHead className="hidden lg:table-cell">SKU</TableHead>
              <TableHead className="text-right w-28">Tồn HT</TableHead>
              <TableHead className="w-28">Thực tế</TableHead>
              <TableHead className="text-right w-24">Chênh lệch</TableHead>
              <TableHead>Ghi chú</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => {
              const diff = it.actualQty - it.systemQty
              const fmt = formatDiff(diff)
              return (
                <TableRow key={it.tempId}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{it.productName}</div>
                    {it.variantLabel && (
                      <div className="text-xs text-muted-foreground">{it.variantLabel}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs">
                    {it.productSku}
                  </TableCell>
                  <TableCell className="text-right font-mono">{it.systemQty}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={it.actualQty}
                      disabled={disabled}
                      onChange={(e) =>
                        onUpdateItem(it.tempId, {
                          actualQty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                      aria-label={`Số lượng thực tế của ${it.productName}`}
                    />
                  </TableCell>
                  <TableCell className={`text-right font-mono ${fmt.className}`}>
                    {fmt.text}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={it.note}
                      maxLength={255}
                      disabled={disabled}
                      onChange={(e) => onUpdateItem(it.tempId, { note: e.target.value })}
                      placeholder="Ghi chú dòng (tuỳ chọn)"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Xoá dòng"
                      disabled={disabled}
                      onClick={() => onRemoveItem(it.tempId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {items.map((it) => {
          const diff = it.actualQty - it.systemQty
          const fmt = formatDiff(diff)
          return (
            <div key={it.tempId} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.productName}</div>
                  {it.variantLabel && (
                    <div className="text-xs text-muted-foreground">{it.variantLabel}</div>
                  )}
                  <div className="text-xs font-mono text-muted-foreground">{it.productSku}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Xoá dòng"
                  disabled={disabled}
                  onClick={() => onRemoveItem(it.tempId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <div className="text-xs text-muted-foreground">Tồn HT</div>
                  <div className="font-mono font-medium">{it.systemQty}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Thực tế</div>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={it.actualQty}
                    disabled={disabled}
                    onChange={(e) =>
                      onUpdateItem(it.tempId, {
                        actualQty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Chênh lệch</div>
                  <div className={`font-mono ${fmt.className}`}>{fmt.text}</div>
                </div>
              </div>
              <Input
                value={it.note}
                maxLength={255}
                disabled={disabled}
                onChange={(e) => onUpdateItem(it.tempId, { note: e.target.value })}
                placeholder="Ghi chú dòng (tuỳ chọn)"
              />
            </div>
          )
        })}
      </div>

      <div className="sticky bottom-0 z-10 rounded-md border bg-background/95 backdrop-blur p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Tổng SP: <strong>{items.length}</strong>
        </span>
        <span className="text-green-600">
          Tăng: <strong>+{summary.totalDiffPositive}</strong>
        </span>
        <span className="text-red-600">
          Giảm: <strong>-{summary.totalDiffNegative}</strong>
        </span>
        <span className="text-gray-500">
          Không đổi: <strong>{summary.unchangedCount}</strong>
        </span>
      </div>
    </div>
  )
}
