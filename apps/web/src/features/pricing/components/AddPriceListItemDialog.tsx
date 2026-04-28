import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import {
  applyRounding,
  type CreatePriceListItemInput,
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
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useProductsQuery } from '../../products/use-products'
import { useCreatePriceListItemMutation } from '../use-price-lists'

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

interface FormShape {
  productId: string
  price: number | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceList: PriceListDetail
  excludeProductIds: string[]
}

export function AddPriceListItemDialog({
  open,
  onOpenChange,
  priceList,
  excludeProductIds,
}: Props) {
  const mutation = useCreatePriceListItemMutation()
  const productsQuery = useProductsQuery({ status: 'active', pageSize: 100, page: 1 })

  const [search, setSearch] = useState('')

  const form = useForm<FormShape>({
    mode: 'onTouched',
    defaultValues: { productId: '', price: null },
  })

  useEffect(() => {
    if (open) {
      form.reset({ productId: '', price: null })
      setSearch('')
    }
  }, [open, form])

  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data])

  const filtered = useMemo(() => {
    const excluded = new Set(excludeProductIds)
    const term = search.trim().toLowerCase()
    return products
      .filter((p) => !excluded.has(p.id))
      .filter((p) => {
        if (!term) return true
        return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
      })
      .slice(0, 50)
  }, [products, excludeProductIds, search])

  const productId = form.watch('productId')
  const price = form.watch('price') ?? 0
  const selectedProduct = products.find((p) => p.id === productId) ?? null

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
              placeholder="Tên hoặc SKU"
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
                    <p className="text-xs text-muted-foreground">SKU {p.sku}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {VND_FORMATTER.format(p.sellingPrice)}đ
                  </p>
                </button>
              ))
            )}
          </div>

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
                Sản phẩm: {selectedProduct.name}. Sau làm tròn:{' '}
                {VND_FORMATTER.format(previewRounded)}đ
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
              disabled={mutation.isPending || !productId || form.watch('price') === null}
            >
              {mutation.isPending ? 'Đang lưu…' : 'Thêm'}
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
      if (detail?.field === 'productId') {
        showError('Sản phẩm đã có trong bảng giá')
        return
      }
      showError(err.message)
      return
    }
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
