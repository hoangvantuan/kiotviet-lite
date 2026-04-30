import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { CategoryDiscountListItem, UpdateCategoryDiscountInput } from '@kiotviet-lite/shared'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useUpdateCategoryDiscountMutation } from '../use-category-discounts'

interface FormShape {
  discountType: 'percent' | 'amount'
  discountValue: number | null
  minQty: number
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
  note: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryDiscount: CategoryDiscountListItem | null
}

export function EditCategoryDiscountDialog({ open, onOpenChange, categoryDiscount }: Props) {
  const mutation = useUpdateCategoryDiscountMutation()

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: {
      discountType: 'percent',
      discountValue: null,
      minQty: 1,
      effectiveFrom: '',
      effectiveTo: '',
      isActive: true,
      note: '',
    },
  })

  useEffect(() => {
    if (open && categoryDiscount) {
      form.reset({
        discountType: categoryDiscount.discountType,
        discountValue: categoryDiscount.discountValue,
        minQty: categoryDiscount.minQty,
        effectiveFrom: categoryDiscount.effectiveFrom ?? '',
        effectiveTo: categoryDiscount.effectiveTo ?? '',
        isActive: categoryDiscount.isActive,
        note: categoryDiscount.note ?? '',
      })
    }
  }, [open, categoryDiscount, form])

  const discountType = form.watch('discountType')
  const isActive = form.watch('isActive')

  const submit = form.handleSubmit(async (values) => {
    if (!categoryDiscount) return
    if (values.discountValue === null || values.discountValue < 0) {
      form.setError('discountValue', { message: 'Vui lòng nhập mức giảm hợp lệ' })
      return
    }
    if (values.discountType === 'percent' && values.discountValue > 100) {
      form.setError('discountValue', { message: 'Phần trăm giảm phải ≤ 100' })
      return
    }
    if (values.minQty < 1) {
      form.setError('minQty', { message: 'Số lượng tối thiểu ≥ 1' })
      return
    }
    if (values.effectiveFrom && values.effectiveTo && values.effectiveTo < values.effectiveFrom) {
      form.setError('effectiveTo', { message: 'Ngày kết thúc phải ≥ ngày bắt đầu' })
      return
    }

    const payload: UpdateCategoryDiscountInput = {}
    if (values.discountType !== categoryDiscount.discountType) {
      payload.discountType = values.discountType
    }
    if (values.discountValue !== categoryDiscount.discountValue) {
      payload.discountValue = values.discountValue
    }
    if (values.minQty !== categoryDiscount.minQty) {
      payload.minQty = values.minQty
    }
    const newFrom = values.effectiveFrom || null
    if (newFrom !== categoryDiscount.effectiveFrom) {
      payload.effectiveFrom = newFrom
    }
    const newTo = values.effectiveTo || null
    if (newTo !== categoryDiscount.effectiveTo) {
      payload.effectiveTo = newTo
    }
    if (values.isActive !== categoryDiscount.isActive) {
      payload.isActive = values.isActive
    }
    const newNote = values.note.trim() ? values.note.trim() : null
    if (newNote !== categoryDiscount.note) {
      payload.note = newNote
    }

    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await mutation.mutateAsync({ id: categoryDiscount.id, input: payload })
      showSuccess('Đã cập nhật chiết khấu danh mục')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  })

  if (!categoryDiscount) return null

  const targetLabel = categoryDiscount.customerName
    ? `${categoryDiscount.customerName} • ${categoryDiscount.customerPhone ?? ''}`
    : (categoryDiscount.customerGroupName ?? '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sửa chiết khấu danh mục</DialogTitle>
          <DialogDescription>
            Danh mục và đối tượng không thể thay đổi. Muốn đổi: xoá rule + tạo mới.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="rounded-md border bg-muted/30 p-2 text-sm">
            <div>
              <span className="text-muted-foreground">Danh mục:</span>{' '}
              <span className="font-medium">{categoryDiscount.categoryName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Đối tượng:</span>{' '}
              <span className="font-medium">{targetLabel}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Loại giảm</Label>
              <Select
                value={discountType}
                onValueChange={(v) =>
                  form.setValue('discountType', v as 'percent' | 'amount', {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Phần trăm (%)</SelectItem>
                  <SelectItem value="amount">Số tiền cố định (đ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-edit-value">Mức giảm</Label>
              {discountType === 'percent' ? (
                <Input
                  id="cd-edit-value"
                  type="number"
                  min={0}
                  max={100}
                  value={form.watch('discountValue') ?? ''}
                  onChange={(e) =>
                    form.setValue(
                      'discountValue',
                      e.target.value === '' ? null : Number(e.target.value),
                      { shouldValidate: true },
                    )
                  }
                />
              ) : (
                <CurrencyInput
                  id="cd-edit-value"
                  value={form.watch('discountValue')}
                  onChange={(v) => form.setValue('discountValue', v, { shouldValidate: true })}
                />
              )}
              {form.formState.errors.discountValue && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.discountValue.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cd-edit-minqty">Số lượng tối thiểu</Label>
              <Input
                id="cd-edit-minqty"
                type="number"
                min={1}
                value={form.watch('minQty')}
                onChange={(e) =>
                  form.setValue('minQty', Number(e.target.value) || 1, { shouldValidate: true })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-edit-from">Từ ngày</Label>
              <Input id="cd-edit-from" type="date" {...form.register('effectiveFrom')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-edit-to">Đến ngày</Label>
              <Input id="cd-edit-to" type="date" {...form.register('effectiveTo')} />
              {form.formState.errors.effectiveTo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.effectiveTo.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="cd-edit-active"
              checked={isActive}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            />
            <Label htmlFor="cd-edit-active">Kích hoạt</Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cd-edit-note">Ghi chú</Label>
            <Textarea id="cd-edit-note" maxLength={255} rows={2} {...form.register('note')} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
