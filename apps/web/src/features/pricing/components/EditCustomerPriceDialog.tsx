import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { CustomerPriceListItem, UpdateCustomerPriceInput } from '@kiotviet-lite/shared'

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
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { formatVnd } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import { useUpdateCustomerPriceMutation } from '../use-customer-prices'

interface FormShape {
  price: number | null
  note: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerPrice: CustomerPriceListItem | null
}

export function EditCustomerPriceDialog({ open, onOpenChange, customerPrice }: Props) {
  const mutation = useUpdateCustomerPriceMutation()

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: { price: null, note: '' },
  })

  useEffect(() => {
    if (open && customerPrice) {
      form.reset({
        price: customerPrice.price,
        note: customerPrice.note ?? '',
      })
    }
  }, [open, customerPrice, form])

  if (!customerPrice) return null

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateCustomerPriceInput = {}
    if (values.price !== null && values.price !== customerPrice.price) {
      payload.price = values.price
    }
    const newNote = values.note.trim() ? values.note.trim() : null
    if (newNote !== customerPrice.note) {
      payload.note = newNote
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await mutation.mutateAsync({ id: customerPrice.id, input: payload })
      showSuccess('Đã cập nhật giá riêng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  const price = form.watch('price')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa giá riêng</DialogTitle>
          <DialogDescription>
            {customerPrice.customerName} • {customerPrice.productName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div>
              Giá lẻ chuẩn:{' '}
              <span className="font-medium">{formatVnd(customerPrice.productSellingPrice)}đ</span>
            </div>
            {customerPrice.productCostPrice !== null && (
              <div>
                Giá vốn:{' '}
                <span className="font-medium">{formatVnd(customerPrice.productCostPrice)}đ</span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec-price">Giá riêng</Label>
            <CurrencyInput
              id="ec-price"
              value={price}
              onChange={(v) => form.setValue('price', v, { shouldValidate: true })}
            />
            {form.formState.errors.price && (
              <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
            )}
            {customerPrice.productCostPrice !== null &&
              price !== null &&
              price < customerPrice.productCostPrice && (
                <p className="text-xs text-destructive">
                  ⚠ Giá thấp hơn giá vốn ({formatVnd(customerPrice.productCostPrice)}đ).
                </p>
              )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ec-note">Ghi chú</Label>
            <Textarea id="ec-note" maxLength={255} rows={2} {...form.register('note')} />
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
            <Button type="submit" disabled={mutation.isPending || !form.formState.isValid}>
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
        if (issue.path === 'price' || issue.path === 'note') {
          form.setError(issue.path as keyof FormShape, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
