import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  applyRounding,
  type PriceListDetail,
  type PriceListItemListItem,
} from '@kiotviet-lite/shared'

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
import { Label } from '@/components/ui/label'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useUpdatePriceListItemMutation } from '../use-price-lists'

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

interface FormShape {
  price: number | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceList: PriceListDetail
  item: PriceListItemListItem | null
}

export function EditPriceListItemDialog({ open, onOpenChange, priceList, item }: Props) {
  const mutation = useUpdatePriceListItemMutation()
  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: { price: null },
  })

  useEffect(() => {
    if (open && item) {
      form.reset({ price: item.price })
    }
  }, [open, item, form])

  if (!item) return null

  const price = form.watch('price') ?? 0
  const previewRounded = applyRounding(price, priceList.roundingRule)

  const submit = form.handleSubmit(async (values) => {
    if (values.price === null || values.price < 0) {
      form.setError('price', { message: 'Vui lòng nhập giá hợp lệ' })
      return
    }
    if (values.price === item.price) {
      onOpenChange(false)
      return
    }
    try {
      await mutation.mutateAsync({
        priceListId: priceList.id,
        itemId: item.id,
        input: { price: values.price },
      })
      showSuccess(
        priceList.method === 'formula' ? 'Đã ghi đè giá dòng (override)' : 'Đã cập nhật giá',
      )
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa giá</DialogTitle>
          <DialogDescription>
            {priceList.method === 'formula'
              ? 'Bảng giá theo công thức. Sửa sẽ đánh dấu dòng này là Override.'
              : 'Cập nhật giá cho dòng bảng giá.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{item.productName}</p>
            <p className="text-xs text-muted-foreground">SKU {item.productSku}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="epi-price">
              Giá <span className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="epi-price"
              value={form.watch('price')}
              onChange={(v) => form.setValue('price', v, { shouldValidate: true })}
            />
            <p className="text-xs text-muted-foreground">
              Sau làm tròn: {VND_FORMATTER.format(previewRounded)}đ
            </p>
            {form.formState.errors.price && (
              <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
            )}
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
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (issue.path === 'price') {
          form.setError('price', { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
