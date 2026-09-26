import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import type { CreateCustomerPriceInput } from '@kiotviet-lite/shared'
import { formatVndWithSuffix } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { CustomerCombobox } from '@/components/shared/customer-combobox'
import { ProductCombobox } from '@/components/shared/product-combobox'
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
import { useProductQuery } from '@/features/products/use-products'
import { handleApiError } from '@/lib/api-error'
import { showSuccess } from '@/lib/toast'

import { useCreateCustomerPriceMutation } from '../use-customer-prices'
import { VariantSelect } from './VariantSelect'

interface FormShape {
  customerId: string
  productId: string
  variantId: string | null
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

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: {
      customerId: defaultCustomerId ?? '',
      productId: defaultProductId ?? '',
      variantId: null,
      price: null,
      note: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        customerId: defaultCustomerId ?? '',
        productId: defaultProductId ?? '',
        variantId: null,
        price: null,
        note: '',
      })
    }
  }, [open, defaultCustomerId, defaultProductId, form])

  const customerId = form.watch('customerId')
  const productId = form.watch('productId')
  const variantId = form.watch('variantId')
  const price = form.watch('price')

  const { data: productDetail } = useProductQuery(productId || undefined)
  const selectedProduct = productDetail
  const variants = selectedProduct?.variantsConfig?.variants ?? []
  const selectedVariant = variants.find((v) => v.id === variantId) ?? null
  const referenceSellingPrice = selectedVariant?.sellingPrice ?? selectedProduct?.sellingPrice ?? 0
  const referenceCostPrice = selectedVariant
    ? selectedVariant.costPrice
    : (selectedProduct?.costPrice ?? null)

  useEffect(() => {
    form.setValue('variantId', null)
  }, [productId, form])

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
      variantId: values.variantId,
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
            <CustomerCombobox
              value={customerId}
              onChange={(v) => form.setValue('customerId', v ?? '', { shouldValidate: true })}
              disabled={Boolean(defaultCustomerId)}
            />
            {form.formState.errors.customerId && (
              <p className="text-sm text-destructive">{form.formState.errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>
              Sản phẩm <span className="text-destructive">*</span>
            </Label>
            <ProductCombobox
              value={productId}
              onChange={(v) => form.setValue('productId', v ?? '', { shouldValidate: true })}
              status="active"
              disabled={Boolean(defaultProductId)}
            />
            {form.formState.errors.productId && (
              <p className="text-sm text-destructive">{form.formState.errors.productId.message}</p>
            )}
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Giá lẻ chuẩn: {formatVndWithSuffix(referenceSellingPrice)}
                {referenceCostPrice !== null
                  ? ` • Giá vốn: ${formatVndWithSuffix(referenceCostPrice)}`
                  : ''}
              </p>
            )}
          </div>

          {variants.length > 0 && (
            <div className="space-y-1">
              <Label>Biến thể</Label>
              <VariantSelect
                variants={variants}
                value={variantId}
                onChange={(v) => form.setValue('variantId', v, { shouldValidate: true })}
              />
            </div>
          )}

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
              sellingPrice={referenceSellingPrice}
              costPrice={referenceCostPrice}
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
        ⚠ Giá thấp hơn giá vốn ({formatVndWithSuffix(costPrice)}). Bạn có chắc muốn đặt giá dưới
        vốn?
      </div>
    )
  }
  if (price > sellingPrice) {
    const diff = price - sellingPrice
    return (
      <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
        ℹ Giá cao hơn giá lẻ chuẩn ({formatVndWithSuffix(diff)} tăng).
      </div>
    )
  }
  if (price < sellingPrice && price > 0) {
    const pct = Math.round(((sellingPrice - price) / sellingPrice) * 100)
    return (
      <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
        Giảm {pct}% so với giá lẻ chuẩn ({formatVndWithSuffix(sellingPrice)}).
      </div>
    )
  }
  return null
}
