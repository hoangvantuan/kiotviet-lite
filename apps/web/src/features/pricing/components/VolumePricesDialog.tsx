import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'

import type { ReplaceVolumePricesInput } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleApiError } from '@/lib/api-error'
import { formatVnd } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import {
  useReplaceVolumePricesMutation,
  useVolumePricesForProductQuery,
} from '../use-volume-prices'

const MAX_TIERS = 5

interface FormTier {
  minQty: number | null
  price: number | null
}

interface FormShape {
  tiers: FormTier[]
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  productId: string | null
  productName?: string
  productSku?: string
  productSellingPrice?: number
  productCostPrice?: number | null
}

export function VolumePricesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  productSku,
  productSellingPrice,
  productCostPrice,
}: Props) {
  const detailQuery = useVolumePricesForProductQuery(productId ?? undefined, {
    enabled: open && Boolean(productId),
  })
  const mutation = useReplaceVolumePricesMutation()

  const detail = detailQuery.data ?? null
  const displayName = detail?.productName ?? productName ?? ''
  const displaySku = detail?.productSku ?? productSku ?? ''
  const displaySellingPrice = detail?.productSellingPrice ?? productSellingPrice ?? 0
  const displayCostPrice = detail?.productCostPrice ?? productCostPrice ?? null

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: { tiers: [] },
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'tiers',
  })

  useEffect(() => {
    if (!open) return
    if (detail) {
      const sortedTiers = [...detail.tiers].sort((a, b) => a.minQty - b.minQty)
      if (sortedTiers.length === 0) {
        form.reset({
          tiers: [{ minQty: 1, price: detail.productSellingPrice }],
        })
      } else {
        form.reset({
          tiers: sortedTiers.map((t) => ({ minQty: t.minQty, price: t.price })),
        })
      }
    } else if (!detailQuery.isLoading && productId) {
      const seedPrice = productSellingPrice ?? 0
      form.reset({ tiers: [{ minQty: 1, price: seedPrice }] })
    }
  }, [open, detail, detailQuery.isLoading, productId, productSellingPrice, form])

  const watchedTiers = form.watch('tiers')

  const validationIssues = useMemo(() => validateTiers(watchedTiers), [watchedTiers])

  const sortedPreview = useMemo(() => {
    return [...watchedTiers]
      .map((t, idx) => ({ ...t, idx }))
      .filter(
        (t): t is { idx: number; minQty: number; price: number } =>
          t.minQty !== null && t.minQty > 0 && t.price !== null && t.price >= 0,
      )
      .sort((a, b) => a.minQty - b.minQty)
  }, [watchedTiers])

  const submit = form.handleSubmit(async (values) => {
    if (!productId) return
    if (validationIssues.length > 0) {
      showError(validationIssues[0]!)
      return
    }
    const cleaned: ReplaceVolumePricesInput = {
      tiers: values.tiers
        .filter(
          (t): t is { minQty: number; price: number } => t.minQty !== null && t.price !== null,
        )
        .map((t) => ({ minQty: t.minQty, price: t.price })),
    }
    try {
      await mutation.mutateAsync({ productId, input: cleaned })
      showSuccess('Đã lưu giá theo số lượng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err)
    }
  })

  const canAddTier = fields.length < MAX_TIERS
  const isLoading = detailQuery.isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Giá theo số lượng</DialogTitle>
          <DialogDescription>
            Thiết lập tối đa {MAX_TIERS} mức giá theo số lượng. Số lượng càng cao thì giá càng giảm.
          </DialogDescription>
        </DialogHeader>

        {productId && displayName && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground">
              SKU {displaySku} • Giá lẻ chuẩn: {formatVnd(displaySellingPrice)}đ
              {displayCostPrice !== null ? ` • Giá vốn: ${formatVnd(displayCostPrice)}đ` : ''}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải dữ liệu…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              {fields.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Chưa có mức giá nào. Bấm "Thêm mức giá" để bắt đầu.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                    <div>Số lượng tối thiểu</div>
                    <div>Giá / SP</div>
                    <div className="w-9" />
                  </div>
                  {fields.map((field, index) => {
                    const minQtyError = form.formState.errors.tiers?.[index]?.minQty?.message
                    const priceError = form.formState.errors.tiers?.[index]?.price?.message
                    const tierValue = watchedTiers[index]
                    const tierWarning =
                      displayCostPrice !== null &&
                      tierValue?.price !== null &&
                      tierValue?.price !== undefined &&
                      tierValue.price < displayCostPrice
                    return (
                      <div key={field.id} className="space-y-1">
                        <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            placeholder="VD: 10"
                            value={tierValue?.minQty ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const parsed = v === '' ? null : Number.parseInt(v, 10)
                              form.setValue(
                                `tiers.${index}.minQty`,
                                Number.isNaN(parsed as number) ? null : parsed,
                                { shouldValidate: true, shouldDirty: true },
                              )
                            }}
                          />
                          <CurrencyInput
                            value={tierValue?.price ?? null}
                            onChange={(v) =>
                              form.setValue(`tiers.${index}.price`, v, {
                                shouldValidate: true,
                                shouldDirty: true,
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            aria-label="Xoá mức giá"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {(minQtyError || priceError) && (
                          <p className="text-xs text-destructive">{minQtyError ?? priceError}</p>
                        )}
                        {tierWarning && (
                          <p className="text-xs text-destructive">
                            ⚠ Giá thấp hơn giá vốn ({formatVnd(displayCostPrice!)}đ).
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ minQty: null, price: null })}
                disabled={!canAddTier}
              >
                <Plus className="h-4 w-4" />
                <span>
                  Thêm mức giá {fields.length > 0 ? `(${fields.length}/${MAX_TIERS})` : ''}
                </span>
              </Button>
            </div>

            {validationIssues.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
                <ul className="list-disc space-y-0.5 pl-4">
                  {validationIssues.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {sortedPreview.length > 0 && validationIssues.length === 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Xem trước (sắp xếp tăng dần):
                </Label>
                <div className="rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Số lượng từ</th>
                        <th className="px-3 py-2 text-right">Giá / SP</th>
                        <th className="px-3 py-2 text-right">Chênh giá lẻ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPreview.map((t) => {
                        const diff = displaySellingPrice
                          ? Math.round(
                              ((t.price - displaySellingPrice) / displaySellingPrice) * 100,
                            )
                          : 0
                        return (
                          <tr key={t.idx} className="border-t">
                            <td className="px-3 py-2">{t.minQty.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatVnd(t.price)}đ
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                              {diff === 0 ? '0%' : diff > 0 ? `+${diff}%` : `${diff}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={mutation.isPending || validationIssues.length > 0}>
                {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function validateTiers(tiers: FormTier[]): string[] {
  const issues: string[] = []
  if (tiers.length === 0) return issues
  if (tiers.length > MAX_TIERS) {
    issues.push(`Tối đa ${MAX_TIERS} mức giá theo số lượng cho mỗi sản phẩm`)
  }

  const filled = tiers.every(
    (t) =>
      t.minQty !== null &&
      t.minQty !== undefined &&
      Number.isFinite(t.minQty) &&
      t.minQty >= 1 &&
      t.price !== null &&
      t.price !== undefined &&
      Number.isFinite(t.price) &&
      t.price >= 0,
  )
  if (!filled) {
    issues.push('Vui lòng điền đầy đủ số lượng và giá cho mọi mức (số lượng ≥ 1, giá ≥ 0)')
    return issues
  }

  const seenQty = new Set<number>()
  for (const t of tiers) {
    if (seenQty.has(t.minQty as number)) {
      issues.push('Số lượng tối thiểu không được trùng nhau')
      break
    }
    seenQty.add(t.minQty as number)
  }

  const sorted = [...tiers].sort((a, b) => (a.minQty as number) - (b.minQty as number))
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (prev.minQty === cur.minQty) continue
    if ((cur.price as number) >= (prev.price as number)) {
      issues.push('Giá phải giảm dần khi số lượng tăng')
      break
    }
  }
  return issues
}
