import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import type {
  CreateStockCheckInput,
  ProductDetail,
  StockCheckDetail,
  VariantItem,
} from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { getProductApi } from '../products/products-api'
import { VariantPickerDialog } from '../purchase-orders/variant-picker-dialog'
import { type EditableStockCheckItem, StockCheckItemsEditor } from './stock-check-items-editor'
import {
  type StockCheckPickerSelection,
  StockCheckProductPicker,
} from './stock-check-product-picker'
import { computeStockCheckTotals, formatDiff } from './stock-check-utils'
import {
  useConfirmStockCheckMutation,
  useCreateStockCheckMutation,
  useUpdateStockCheckMutation,
} from './use-stock-checks'

let TEMP_ID_COUNTER = 0
const nextTempId = () => `t-${++TEMP_ID_COUNTER}-${Date.now()}`

export interface StockCheckFormProps {
  mode: 'create' | 'edit'
  initial?: StockCheckDetail
}

export function StockCheckForm({ mode, initial }: StockCheckFormProps) {
  const navigate = useNavigate()
  const createMutation = useCreateStockCheckMutation()
  const updateMutation = useUpdateStockCheckMutation(initial?.id)
  const confirmMutation = useConfirmStockCheckMutation()

  const [items, setItems] = useState<EditableStockCheckItem[]>(() => {
    if (initial) {
      return initial.items.map((it) => ({
        tempId: nextTempId(),
        productId: it.productId,
        variantId: it.variantId,
        productName: it.productNameSnapshot,
        productSku: it.productSkuSnapshot,
        variantLabel: it.variantLabelSnapshot,
        systemQty: it.systemQty,
        actualQty: it.actualQty,
        note: it.note ?? '',
      }))
    }
    return []
  })
  const [note, setNote] = useState<string>(initial?.note ?? '')

  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductDetail | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const summary = useMemo(() => computeStockCheckTotals(items), [items])

  const updateItem = (tempId: string, patch: Partial<EditableStockCheckItem>) => {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)))
  }
  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId))
  }

  const onPickerConfirm = async (selections: StockCheckPickerSelection[]) => {
    let added = 0
    let skipped = 0
    let pendingVariantProduct: ProductDetail | null = null
    for (const sel of selections) {
      try {
        const detail = (await getProductApi(sel.productId)).data
        if (!detail.trackInventory) {
          skipped++
          continue
        }
        if (detail.hasVariants) {
          if (!pendingVariantProduct) {
            pendingVariantProduct = detail
          }
          continue
        }
        const exists = items.some((it) => it.productId === detail.id && it.variantId === null)
        if (exists) {
          skipped++
          continue
        }
        setItems((prev) => [
          ...prev,
          {
            tempId: nextTempId(),
            productId: detail.id,
            variantId: null,
            productName: detail.name,
            productSku: detail.sku,
            variantLabel: null,
            systemQty: detail.currentStock,
            actualQty: detail.currentStock,
            note: '',
          },
        ])
        added++
      } catch {
        skipped++
      }
    }
    if (added > 0) {
      showSuccess(`Đã thêm ${added} sản phẩm vào phiếu.`)
    }
    if (skipped > 0) {
      showError(`Đã bỏ qua ${skipped} sản phẩm (trùng hoặc không hợp lệ).`)
    }
    if (pendingVariantProduct) {
      setVariantPickerProduct(pendingVariantProduct)
    }
  }

  const onVariantsConfirmed = (variants: VariantItem[]) => {
    const product = variantPickerProduct
    if (!product) return
    setItems((prev) => {
      const existingIds = new Set(
        prev.filter((it) => it.productId === product.id).map((it) => it.variantId),
      )
      const additions: EditableStockCheckItem[] = []
      let skipped = 0
      for (const v of variants) {
        if (existingIds.has(v.id)) {
          skipped++
          continue
        }
        const variantLabel = v.attribute2Value
          ? `${v.attribute1Value} - ${v.attribute2Value}`
          : v.attribute1Value
        additions.push({
          tempId: nextTempId(),
          productId: product.id,
          variantId: v.id,
          productName: product.name,
          productSku: v.sku,
          variantLabel,
          systemQty: v.stockQuantity,
          actualQty: v.stockQuantity,
          note: '',
        })
      }
      if (skipped > 0) {
        showError(`${skipped} biến thể đã có sẵn trong phiếu, đã bỏ qua.`)
      }
      return [...prev, ...additions]
    })
    setVariantPickerProduct(null)
  }

  const excludedVariantIds = useMemo(() => {
    if (!variantPickerProduct) return [] as string[]
    return items
      .filter((it) => it.productId === variantPickerProduct.id && it.variantId)
      .map((it) => it.variantId as string)
  }, [items, variantPickerProduct])

  const isPending =
    createMutation.isPending || updateMutation.isPending || confirmMutation.isPending

  const allValid = items.every((it) => Number.isInteger(it.actualQty) && it.actualQty >= 0)
  const submitDisabled = items.length === 0 || !allValid || isPending

  const buildPayload = (): CreateStockCheckInput => ({
    note: note.trim() || null,
    items: items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      actualQty: it.actualQty,
      note: it.note.trim() || null,
    })),
  })

  const onSaveDraft = async () => {
    if (submitDisabled) return
    const payload = buildPayload()
    try {
      if (mode === 'edit' && initial) {
        await updateMutation.mutateAsync(payload)
        showSuccess(`Đã lưu phiếu kiểm ${initial.code}`)
        navigate({ to: '/inventory/stock-checks/$id', params: { id: initial.id } })
      } else {
        const result = await createMutation.mutateAsync(payload)
        showSuccess(`Đã tạo phiếu kiểm ${result.data.code}`)
        navigate({ to: '/inventory/stock-checks/$id', params: { id: result.data.id } })
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Không lưu được phiếu kiểm'
      showError(msg)
    }
  }

  const onSaveAndConfirm = async () => {
    if (submitDisabled) return
    const payload = buildPayload()
    try {
      let stockCheckId: string
      if (mode === 'edit' && initial) {
        const updated = await updateMutation.mutateAsync(payload)
        stockCheckId = updated.data.id
      } else {
        const created = await createMutation.mutateAsync(payload)
        stockCheckId = created.data.id
      }
      const confirmed = await confirmMutation.mutateAsync(stockCheckId)
      showSuccess(`Đã xác nhận phiếu kiểm ${confirmed.data.code}. Tồn kho đã cập nhật.`)
      navigate({ to: '/inventory/stock-checks/$id', params: { id: stockCheckId } })
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'BUSINESS_RULE_VIOLATION') {
          const details = err.details as
            | { code?: string; items?: { productName: string; wouldBe: number }[] }
            | undefined
          if (details?.code === 'NEGATIVE_STOCK' && Array.isArray(details.items)) {
            const list = details.items
              .map((d) => `• ${d.productName} (sẽ còn ${d.wouldBe})`)
              .join('\n')
            showError(`Tồn sẽ âm sau khi xác nhận:\n${list}`)
            return
          }
        }
        showError(err.message)
      } else {
        showError('Không xác nhận được phiếu kiểm')
      }
    }
  }

  const changedItems = useMemo(() => items.filter((it) => it.actualQty !== it.systemQty), [items])

  return (
    <div className="space-y-6 p-4 md:p-6 pb-32">
      <header>
        <h1 className="text-2xl font-semibold">
          {mode === 'edit' && initial ? `Sửa phiếu kiểm ${initial.code}` : 'Tạo phiếu kiểm kho'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'create'
            ? 'Mã phiếu KK-YYYYMMDD-XXXX sẽ tự sinh khi lưu.'
            : 'Tồn hệ thống sẽ tải lại khi lưu để phản ánh giao dịch mới nhất.'}
        </p>
      </header>

      <section className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Sản phẩm cần kiểm</h2>
          <span className="text-xs text-muted-foreground">{items.length} dòng</span>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickerOpen(true)}
          disabled={isPending}
        >
          <Plus className="size-4 mr-1" />
          Thêm sản phẩm
        </Button>

        {items.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="Chưa có sản phẩm trong phiếu"
            description='Bấm "Thêm sản phẩm" để chọn theo Kiểm tất cả, Theo danh mục hoặc Tìm SP.'
          />
        ) : (
          <StockCheckItemsEditor
            items={items}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
            disabled={isPending}
          />
        )}
      </section>

      <section className="rounded-md border p-4 space-y-3">
        <Label htmlFor="sc-note">Ghi chú phiếu</Label>
        <Textarea
          id="sc-note"
          rows={2}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: Kiểm kho tháng 4 - tủ kệ A"
          disabled={isPending}
        />
      </section>

      <div className="flex flex-wrap justify-end gap-2 sticky bottom-4 bg-background py-2">
        <Button
          variant="outline"
          onClick={() => navigate({ to: '/inventory/stock-checks' })}
          disabled={isPending}
        >
          Huỷ
        </Button>
        <Button variant="secondary" onClick={onSaveDraft} disabled={submitDisabled}>
          {isPending ? 'Đang lưu...' : 'Lưu nháp'}
        </Button>
        <Button onClick={() => setConfirmDialogOpen(true)} disabled={submitDisabled}>
          Lưu & Xác nhận
        </Button>
      </div>

      <StockCheckProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeProductIds={items.filter((it) => it.variantId === null).map((it) => it.productId)}
        onConfirm={onPickerConfirm}
      />

      <VariantPickerDialog
        open={!!variantPickerProduct}
        onOpenChange={(v) => {
          if (!v) setVariantPickerProduct(null)
        }}
        product={variantPickerProduct}
        excludedVariantIds={excludedVariantIds}
        onConfirm={onVariantsConfirmed}
      />

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Xác nhận kiểm kho</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ cập nhật tồn kho theo chênh lệch của các sản phẩm sau. Hành động này không
              thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border divide-y text-sm">
            {changedItems.length === 0 && (
              <div className="p-3 text-muted-foreground">
                Không có chênh lệch. Phiếu sẽ được lưu xác nhận nhưng không cập nhật tồn kho.
              </div>
            )}
            {changedItems.slice(0, 10).map((it) => {
              const diff = it.actualQty - it.systemQty
              const fmt = formatDiff(diff)
              return (
                <div key={it.tempId} className="p-2 flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium">{it.productName}</span>
                    {it.variantLabel && (
                      <span className="text-xs text-muted-foreground"> · {it.variantLabel}</span>
                    )}
                  </span>
                  <span className={`font-mono ${fmt.className} whitespace-nowrap`}>{fmt.text}</span>
                </div>
              )
            })}
            {changedItems.length > 10 && (
              <div className="p-2 text-xs text-muted-foreground">
                và {changedItems.length - 10} sản phẩm khác...
              </div>
            )}
          </div>
          <div className="text-sm flex flex-wrap gap-x-4">
            <span className="text-green-600">Tăng: +{summary.totalDiffPositive}</span>
            <span className="text-red-600">Giảm: -{summary.totalDiffNegative}</span>
            <span className="text-gray-500">Không đổi: {summary.unchangedCount}</span>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isPending}
            >
              Huỷ
            </Button>
            <Button
              onClick={async () => {
                setConfirmDialogOpen(false)
                await onSaveAndConfirm()
              }}
              disabled={isPending}
            >
              {isPending ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
