import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import type { CreateCustomerPriceInput } from '@kiotviet-lite/shared'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCustomersQuery } from '@/features/customers/use-customers'
import { useProductsQuery } from '@/features/products/use-products'
import { handleApiError } from '@/lib/api-error'
import { formatVnd } from '@/lib/currency'
import { showSuccess } from '@/lib/toast'

import { useCreateCustomerPriceMutation } from '../use-customer-prices'

interface FormShape {
  customerId: string
  productId: string
  price: number | null
  note: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultCustomerId?: string
  defaultProductId?: string
}

export function CreateCustomerPriceDialog({
  open,
  onOpenChange,
  defaultCustomerId,
  defaultProductId,
}: Props) {
  const mutation = useCreateCustomerPriceMutation()
  const customersQuery = useCustomersQuery({ pageSize: 200, page: 1 })
  const productsQuery = useProductsQuery({ status: 'active', pageSize: 200, page: 1 })
  const customers = customersQuery.data?.data ?? []
  const products = productsQuery.data?.data ?? []

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: {
      customerId: defaultCustomerId ?? '',
      productId: defaultProductId ?? '',
      price: null,
      note: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        customerId: defaultCustomerId ?? '',
        productId: defaultProductId ?? '',
        price: null,
        note: '',
      })
    }
  }, [open, defaultCustomerId, defaultProductId, form])

  const customerId = form.watch('customerId')
  const productId = form.watch('productId')
  const price = form.watch('price')

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  )

  const submit = form.handleSubmit(async (values) => {
    if (!values.customerId) {
      form.setError('customerId', { message: 'Vui lòng chọn khách hàng' })
      return
    }
    if (!values.productId) {
      form.setError('productId', { message: 'Vui lòng chọn sản phẩm' })
      return
    }
    if (values.price === null || values.price < 0) {
      form.setError('price', { message: 'Vui lòng nhập giá hợp lệ' })
      return
    }
    const payload: CreateCustomerPriceInput = {
      customerId: values.customerId,
      productId: values.productId,
      price: values.price,
      note: values.note.trim() ? values.note.trim() : null,
    }
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo giá riêng khách hàng')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm giá riêng khách hàng</DialogTitle>
          <DialogDescription>
            Cấu hình giá đặc biệt cho cặp khách hàng × sản phẩm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Label>
              Khách hàng <span className="text-destructive">*</span>
            </Label>
            <Select
              value={customerId}
              onValueChange={(v) => form.setValue('customerId', v, { shouldValidate: true })}
              disabled={Boolean(defaultCustomerId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customers.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Chưa có khách hàng.</div>
                ) : (
                  customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} • {c.phone}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.customerId && (
              <p className="text-sm text-destructive">{form.formState.errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>
              Sản phẩm <span className="text-destructive">*</span>
            </Label>
            <Select
              value={productId}
              onValueChange={(v) => form.setValue('productId', v, { shouldValidate: true })}
              disabled={Boolean(defaultProductId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn sản phẩm" />
              </SelectTrigger>
              <SelectContent>
                {products.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Chưa có sản phẩm.</div>
                ) : (
                  products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} • SKU {p.sku}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.productId && (
              <p className="text-sm text-destructive">{form.formState.errors.productId.message}</p>
            )}
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Giá lẻ chuẩn: {formatVnd(selectedProduct.sellingPrice)}đ
                {selectedProduct.costPrice !== null
                  ? ` • Giá vốn: ${formatVnd(selectedProduct.costPrice)}đ`
                  : ''}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cp-price">
              Giá riêng <span className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="cp-price"
              value={price}
              onChange={(v) => form.setValue('price', v, { shouldValidate: true })}
            />
            {form.formState.errors.price && (
              <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
            )}
          </div>

          {selectedProduct && price !== null && (
            <PriceWarning
              price={price}
              sellingPrice={selectedProduct.sellingPrice}
              costPrice={selectedProduct.costPrice}
            />
          )}

          <div className="space-y-1">
            <Label htmlFor="cp-note">Ghi chú</Label>
            <Textarea
              id="cp-note"
              maxLength={255}
              rows={2}
              placeholder="VD: Khách VIP, hợp đồng dài hạn"
              {...form.register('note')}
            />
            {form.formState.errors.note && (
              <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>
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
            <Button type="submit" disabled={mutation.isPending || !form.formState.isValid}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface PriceWarningProps {
  price: number
  sellingPrice: number
  costPrice: number | null
}

function PriceWarning({ price, sellingPrice, costPrice }: PriceWarningProps) {
  if (costPrice !== null && price < costPrice) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
        ⚠ Giá thấp hơn giá vốn ({formatVnd(costPrice)}đ). Bạn có chắc muốn đặt giá dưới vốn?
      </div>
    )
  }
  if (price > sellingPrice) {
    const diff = price - sellingPrice
    return (
      <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
        ℹ Giá cao hơn giá lẻ chuẩn ({formatVnd(diff)}đ tăng).
      </div>
    )
  }
  if (price < sellingPrice && price > 0) {
    const pct = Math.round(((sellingPrice - price) / sellingPrice) * 100)
    return (
      <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
        Giảm {pct}% so với giá lẻ chuẩn ({formatVnd(sellingPrice)}đ).
      </div>
    )
  }
  return null
}
