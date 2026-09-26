import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  applyRounding,
  type CreatePriceListItemInput,
  formatVndWithSuffix,
  MAX_PAGE_SIZE,
  type PriceListDetail,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleApiError } from '@/lib/api-error'
import { showError, showSuccess } from '@/lib/toast'

import { useProductQuery, useProductsQuery } from '../../products/use-products'
import { buildVariantName } from '../../products/variants-utils'
import { useCreatePriceListItemMutation } from '../use-price-lists'
import { VariantSelect } from './VariantSelect'

interface FormShape {
  productId: string
  variantId: string | null
  price: number | null
}

export interface ExistingPriceListItemKey {
  productId: string
  variantId: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceList: PriceListDetail
  existingItems: ExistingPriceListItemKey[]
}

export function AddPriceListItemDialog({ open, onOpenChange, priceList, existingItems }: Props) {
  const mutation = useCreatePriceListItemMutation()
  const productsQuery = useProductsQuery({ status: 'active', pageSize: MAX_PAGE_SIZE, page: 1 })

  const [search, setSearch] = useState('')

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: { productId: '', variantId: null, price: null },
  })

  useEffect(() => {
    if (open) {
      form.reset({ productId: '', variantId: null, price: null })
      setSearch('')
    }
  }, [open, form])

  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data])

  const existingByProduct = useMemo(() => {
    const map = new Map<string, Set<string | null>>()
    for (const it of existingItems) {
      const set = map.get(it.productId) ?? new Set<string | null>()
      set.add(it.variantId)
      map.set(it.productId, set)
    }
    return map
  }, [existingItems])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products
      .filter((p) => {
        // Sản phẩm không biến thể, đã có dòng giá thì ẩn hẳn. Sản phẩm có biến
        // thể vẫn hiện để chọn biến thể khác chưa có giá riêng.
        if (!p.hasVariants) return !existingByProduct.get(p.id)?.has(null)
        return true
      })
      .filter((p) => {
        if (!term) return true
        return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
      })
      .slice(0, 50)
  }, [products, existingByProduct, search])

  const productId = form.watch('productId')
  const variantId = form.watch('variantId')
  const price = form.watch('price') ?? 0
  const selectedProduct = products.find((p) => p.id === productId) ?? null

  const productDetailQuery = useProductQuery(selectedProduct?.hasVariants ? productId : undefined)
  const variants = productDetailQuery.data?.variantsConfig?.variants ?? []
  const selectedVariant = variants.find((v) => v.id === variantId) ?? null

  const existingForProduct = existingByProduct.get(productId)
  const disabledVariantIds = useMemo(
    () => new Set(Array.from(existingForProduct ?? []).filter((v): v is string => v !== null)),
    [existingForProduct],
  )
  const disableAllVariantsOption = existingForProduct?.has(null) ?? false
  const isDuplicateCombo =
    variantId === null ? disableAllVariantsOption : disabledVariantIds.has(variantId)

  useEffect(() => {
    form.setValue('variantId', null)
  }, [productId, form])

  const previewRounded = useMemo(
    () => applyRounding(price, priceList.roundingRule),
    [price, priceList.roundingRule],
  )

  const submit = form.handleSubmit(async (values) => {
    if (!values.productId) {
      showError('Vui lòng chọn sản phẩm')
      return
    }
    if (values.price === null || values.price < 0) {
      form.setError('price', { message: 'Vui lòng nhập giá hợp lệ' })
      return
    }
    const payload: CreatePriceListItemInput = {
      productId: values.productId,
      variantId: values.variantId,
      price: values.price,
    }
    try {
      await mutation.mutateAsync({ priceListId: priceList.id, input: payload })
      showSuccess('Đã thêm sản phẩm vào bảng giá')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm sản phẩm vào bảng giá</DialogTitle>
          <DialogDescription>
            Chọn sản phẩm và nhập giá. Giá sẽ được làm tròn theo quy tắc của bảng giá.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Label htmlFor="apl-search">Tìm sản phẩm</Label>
            <Input
              id="apl-search"
              placeholder="Tên hoặc mã hàng"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-md border">
            {productsQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Đang tải…</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Không tìm thấy sản phẩm phù hợp.</p>
            ) : (
              filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => form.setValue('productId', p.id, { shouldValidate: true })}
                  className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 ${
                    productId === p.id ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Mã hàng {p.sku}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatVndWithSuffix(p.sellingPrice)}
                  </p>
                </button>
              ))
            )}
          </div>

          {selectedProduct && variants.length > 0 && (
            <div className="space-y-1">
              <Label>Biến thể</Label>
              <VariantSelect
                variants={variants}
                value={variantId}
                onChange={(v) => form.setValue('variantId', v, { shouldValidate: true })}
                disabledVariantIds={disabledVariantIds}
                disableAllVariantsOption={disableAllVariantsOption}
              />
              {isDuplicateCombo && (
                <p className="text-xs text-destructive">
                  Dòng giá cho lựa chọn này đã tồn tại, vui lòng chọn biến thể khác.
                </p>
              )}
            </div>
          )}

          {selectedProduct && (
            <div className="space-y-1">
              <Label htmlFor="apl-price">
                Giá <span className="text-destructive">*</span>
              </Label>
              <CurrencyInput
                id="apl-price"
                value={form.watch('price')}
                onChange={(v) => form.setValue('price', v, { shouldValidate: true })}
              />
              <p className="text-xs text-muted-foreground">
                Sản phẩm: {selectedProduct.name}
                {selectedVariant
                  ? ` (${buildVariantName(selectedVariant.attribute1Value, selectedVariant.attribute2Value)})`
                  : ''}
                . Sau làm tròn: {formatVndWithSuffix(previewRounded)}
              </p>
              {form.formState.errors.price && (
                <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>
              )}
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
            <Button
              type="submit"
              disabled={
                mutation.isPending || !productId || form.watch('price') === null || isDuplicateCombo
              }
            >
              {mutation.isPending ? 'Đang lưu…' : 'Thêm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
