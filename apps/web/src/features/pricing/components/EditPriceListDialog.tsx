import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { PriceListDetail, RoundingRule, UpdatePriceListInput } from '@kiotviet-lite/shared'

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

import { useUpdatePriceListMutation } from '../use-price-lists'

const ROUNDING_OPTIONS: { value: RoundingRule; label: string }[] = [
  { value: 'none', label: 'Không làm tròn' },
  { value: 'nearest_hundred', label: 'Làm tròn 100đ' },
  { value: 'nearest_five_hundred', label: 'Làm tròn 500đ' },
  { value: 'nearest_thousand', label: 'Làm tròn 1.000đ' },
  { value: 'ceil_hundred', label: 'Làm tròn lên 100đ' },
  { value: 'ceil_five_hundred', label: 'Làm tròn lên 500đ' },
  { value: 'ceil_thousand', label: 'Làm tròn lên 1.000đ' },
  { value: 'floor_hundred', label: 'Làm tròn xuống 100đ' },
  { value: 'floor_five_hundred', label: 'Làm tròn xuống 500đ' },
  { value: 'floor_thousand', label: 'Làm tròn xuống 1.000đ' },
]

interface FormShape {
  name: string
  description: string
  roundingRule: RoundingRule
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceList: PriceListDetail | null
}

export function EditPriceListDialog({ open, onOpenChange, priceList }: Props) {
  const mutation = useUpdatePriceListMutation()

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: {
      name: '',
      description: '',
      roundingRule: 'none',
      effectiveFrom: '',
      effectiveTo: '',
      isActive: true,
    },
  })

  useEffect(() => {
    if (open && priceList) {
      form.reset({
        name: priceList.name,
        description: priceList.description ?? '',
        roundingRule: priceList.roundingRule,
        effectiveFrom: priceList.effectiveFrom ?? '',
        effectiveTo: priceList.effectiveTo ?? '',
        isActive: priceList.isActive,
      })
    }
  }, [open, priceList, form])

  if (!priceList) return null

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdatePriceListInput = {}
    if (values.name !== priceList.name) payload.name = values.name
    const newDesc = values.description.trim() || null
    if (newDesc !== priceList.description) payload.description = newDesc
    if (values.roundingRule !== priceList.roundingRule) payload.roundingRule = values.roundingRule
    const newFrom = values.effectiveFrom || null
    if (newFrom !== priceList.effectiveFrom) payload.effectiveFrom = newFrom
    const newTo = values.effectiveTo || null
    if (newTo !== priceList.effectiveTo) payload.effectiveTo = newTo
    if (values.isActive !== priceList.isActive) payload.isActive = values.isActive

    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await mutation.mutateAsync({ id: priceList.id, input: payload })
      showSuccess('Đã cập nhật bảng giá')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  const isActive = form.watch('isActive')
  const roundingRule = form.watch('roundingRule')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sửa bảng giá</DialogTitle>
          <DialogDescription>
            Cập nhật metadata bảng giá. Để chỉnh giá từng dòng, mở chi tiết bảng giá.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Label htmlFor="ep-name">
              Tên bảng giá <span className="text-destructive">*</span>
            </Label>
            <Input id="ep-name" autoFocus maxLength={100} {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ep-desc">Mô tả</Label>
            <Textarea id="ep-desc" maxLength={255} rows={2} {...form.register('description')} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Quy tắc làm tròn</Label>
              <Select
                value={roundingRule}
                onValueChange={(v) =>
                  form.setValue('roundingRule', v as RoundingRule, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUNDING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-from">Hiệu lực từ</Label>
              <Input id="ep-from" type="date" {...form.register('effectiveFrom')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-to">Đến</Label>
              <Input id="ep-to" type="date" {...form.register('effectiveTo')} />
              {form.formState.errors.effectiveTo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.effectiveTo.message}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Đang bật</p>
              <p className="text-xs text-muted-foreground">Tắt để tạm dừng áp dụng bảng giá.</p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={(v) => form.setValue('isActive', v, { shouldValidate: true })}
            />
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

function handleApiError(err: unknown, form: ReturnType<typeof useForm<FormShape>>) {
  if (err instanceof ApiClientError) {
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string } | undefined
      if (detail?.field === 'name') {
        form.setError('name', { message: err.message })
      }
      showError(err.message)
      return
    }
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (
          issue.path === 'name' ||
          issue.path === 'description' ||
          issue.path === 'effectiveFrom' ||
          issue.path === 'effectiveTo' ||
          issue.path === 'roundingRule'
        ) {
          form.setError(issue.path as keyof FormShape, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
