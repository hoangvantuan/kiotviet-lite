import { useEffect, useMemo, useState } from 'react'
import {
  type Control,
  Controller,
  type FieldErrors,
  type FieldValues,
  type Path,
  useForm,
  type UseFormRegister,
  type UseFormReturn,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  type CategoryItem,
  type CreateProductInput,
  createProductSchema,
  type ProductDetail,
  type UnitConversionInput,
  type UpdateProductInput,
  updateProductSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { buildCategoryTree } from '../categories/utils'
import { InventoryHistoryTable } from './inventory-history-table'
import { generateRandomSku } from './sku'
import { UnitConversionEditor } from './unit-conversion-editor'
import { useCreateProductMutation, useUpdateProductMutation } from './use-products'
import { VariantBulkActions } from './variant-bulk-actions'
import { VariantConfirmDialog } from './variant-confirm-dialog'
import { VariantEditor } from './variant-editor'
import { VariantTable } from './variant-table'
import {
  countAdditions,
  countDeletions,
  fromResponse,
  toPayload,
  type VariantsForm,
} from './variants-utils'

const NO_CATEGORY = '__NONE__'

const emptyVariantsForm: VariantsForm = {
  attribute1: null,
  attribute2: null,
  variants: [],
}

type Mode = 'create' | 'edit'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  product?: ProductDetail
  categories: CategoryItem[]
}

export function ProductFormDialog(props: ProductFormDialogProps) {
  if (props.mode === 'create') {
    return <CreateDialog {...props} />
  }
  if (!props.product) return null
  return <EditDialog {...props} product={props.product} />
}

interface BasicFormShape {
  name: string
  sku: string
  barcode: string
  categoryId: string | null
  sellingPrice: number
  costPrice: number | null
  unit: string
  imageUrl: string
  status: 'active' | 'inactive'
  trackInventory: boolean
  minStock: number
  initialStock?: number
}

type CreateFormShape = BasicFormShape & { initialStock: number }

const createDefaults: CreateFormShape = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: null,
  sellingPrice: 0,
  costPrice: null,
  unit: 'Cái',
  imageUrl: '',
  status: 'active',
  trackInventory: false,
  minStock: 0,
  initialStock: 0,
}

function CreateDialog({ open, onOpenChange, categories }: ProductFormDialogProps) {
  const mutation = useCreateProductMutation()
  const form = useForm<CreateFormShape>({
    resolver: zodResolver(createProductSchema) as never,
    mode: 'onTouched',
    defaultValues: createDefaults,
  })
  const [hasVariants, setHasVariants] = useState(false)
  const [variantsForm, setVariantsForm] = useState<VariantsForm>(emptyVariantsForm)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<CreateProductInput | null>(null)
  const [unitConversions, setUnitConversions] = useState<UnitConversionInput[]>([])

  useEffect(() => {
    if (open) {
      form.reset(createDefaults)
      setHasVariants(false)
      setVariantsForm(emptyVariantsForm)
      setSelected(new Set())
      setUnitConversions([])
    }
  }, [open, form])

  const trackInventory = form.watch('trackInventory')
  const skuValue = form.watch('sku')
  const sellingPrice = form.watch('sellingPrice')
  const costPrice = form.watch('costPrice')

  function applyBulkPrice(value: number) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, sellingPrice: value } : v)),
    }))
  }
  function applyBulkCost(value: number | null) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, costPrice: value } : v)),
    }))
  }
  function applyBulkStock(value: number) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, stockQuantity: value } : v)),
    }))
  }

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateProductInput = {
      name: values.name,
      sellingPrice: hasVariants ? 0 : values.sellingPrice,
      unit: values.unit || 'Cái',
      status: values.status,
      trackInventory: values.trackInventory,
      minStock: values.trackInventory ? values.minStock : 0,
      initialStock: hasVariants ? 0 : values.trackInventory ? values.initialStock : 0,
    }
    const skuTrim = values.sku.trim()
    if (skuTrim) payload.sku = skuTrim
    if (!hasVariants) {
      const barcodeTrim = values.barcode.trim()
      if (barcodeTrim) payload.barcode = barcodeTrim
      if (values.costPrice !== null && values.costPrice !== undefined) {
        payload.costPrice = values.costPrice
      }
    }
    if (values.categoryId) payload.categoryId = values.categoryId
    const imgTrim = values.imageUrl.trim()
    if (imgTrim) payload.imageUrl = imgTrim

    if (unitConversions.length > 0) {
      payload.unitConversions = unitConversions
    }

    if (hasVariants) {
      const variantsPayload = toPayload(variantsForm)
      if (!variantsPayload || variantsPayload.variants.length === 0) {
        showError('Vui lòng thêm ít nhất 1 biến thể')
        return
      }
      payload.variantsConfig = variantsPayload as never
      setPendingPayload(payload)
      setConfirmOpen(true)
      return
    }

    await sendCreate(payload)
  })

  async function sendCreate(payload: CreateProductInput) {
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo sản phẩm')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Thêm sản phẩm</DialogTitle>
          <DialogDescription>Tạo sản phẩm mới cho cửa hàng.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6" noValidate>
          <BasicSection<CreateFormShape>
            form={form}
            categories={categories}
            hideBarcode={hasVariants}
          />
          {!hasVariants && <PriceSection<CreateFormShape> form={form} />}
          <ImageSection<CreateFormShape> form={form} />
          <StatusSection<CreateFormShape> form={form} />
          <InventorySection<CreateFormShape>
            form={form}
            mode="create"
            trackInventory={trackInventory}
            hideInitialStock={hasVariants}
            hasVariants={hasVariants}
          />

          <UnitConversionEditor
            mode="create"
            value={unitConversions}
            onChange={setUnitConversions}
            parentUnit={form.watch('unit') || 'Cái'}
            parentSellingPrice={sellingPrice}
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Sản phẩm có biến thể</h3>
              <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
            </div>
            <p className="text-xs text-muted-foreground">
              Bật khi sản phẩm có nhiều phiên bản (màu sắc, kích cỡ...). Khi bật, giá và barcode sẽ
              được nhập riêng cho từng biến thể.
            </p>
          </section>

          {hasVariants && (
            <>
              <VariantEditor
                value={variantsForm}
                onChange={setVariantsForm}
                parentSku={skuValue || 'SP'}
                defaultSellingPrice={sellingPrice}
                defaultCostPrice={costPrice}
              />
              <VariantBulkActions
                selectedCount={selected.size}
                onApplyPrice={applyBulkPrice}
                onApplyCost={applyBulkCost}
                onApplyStock={applyBulkStock}
                onClear={() => setSelected(new Set())}
              />
              <VariantTable
                variants={variantsForm.variants}
                onChange={(next) => setVariantsForm((p) => ({ ...p, variants: next }))}
                attribute1Name={variantsForm.attribute1?.name ?? ''}
                attribute2Name={variantsForm.attribute2?.name ?? null}
                trackInventory={trackInventory}
                selected={selected}
                onSelectionChange={setSelected}
              />
            </>
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>

        <VariantConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          additions={countAdditions(variantsForm.variants)}
          hardDeletions={0}
          softDeletions={0}
          onConfirm={async () => {
            if (pendingPayload) await sendCreate(pendingPayload)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

type EditFormShape = BasicFormShape

function EditDialog({
  open,
  onOpenChange,
  product,
  categories,
}: ProductFormDialogProps & { product: ProductDetail }) {
  const mutation = useUpdateProductMutation()
  const initial: EditFormShape = useMemo(
    () => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? '',
      categoryId: product.categoryId,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      unit: product.unit,
      imageUrl: product.imageUrl ?? '',
      status: product.status,
      trackInventory: product.trackInventory,
      minStock: product.minStock,
    }),
    [product],
  )
  const form = useForm<EditFormShape>({
    resolver: zodResolver(updateProductSchema) as never,
    mode: 'onTouched',
    defaultValues: initial,
  })
  const [hasVariants, setHasVariants] = useState(product.hasVariants)
  const [variantsForm, setVariantsForm] = useState<VariantsForm>(() =>
    product.variantsConfig ? fromResponse(product.variantsConfig) : emptyVariantsForm,
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<{
    id: string
    input: UpdateProductInput
  } | null>(null)

  useEffect(() => {
    if (open) {
      form.reset(initial)
      setHasVariants(product.hasVariants)
      setVariantsForm(
        product.variantsConfig ? fromResponse(product.variantsConfig) : emptyVariantsForm,
      )
      setSelected(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product])

  const trackInventory = form.watch('trackInventory')
  const skuValue = form.watch('sku')
  const sellingPriceValue = form.watch('sellingPrice')
  const costPriceValue = form.watch('costPrice')

  function applyBulkPrice(value: number) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, sellingPrice: value } : v)),
    }))
  }
  function applyBulkCost(value: number | null) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, costPrice: value } : v)),
    }))
  }
  function applyBulkStock(value: number) {
    setVariantsForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (selected.has(i) ? { ...v, stockQuantity: value } : v)),
    }))
  }

  const submit = form.handleSubmit(async (values) => {
    const payload: UpdateProductInput = {}
    if (values.name !== product.name) payload.name = values.name
    const skuTrim = values.sku.trim()
    if (skuTrim && skuTrim !== product.sku) payload.sku = skuTrim
    if (!hasVariants) {
      const barcodeTrim = values.barcode.trim()
      const newBarcode = barcodeTrim || null
      if (newBarcode !== product.barcode) payload.barcode = newBarcode
      if (values.sellingPrice !== product.sellingPrice) payload.sellingPrice = values.sellingPrice
      if (values.costPrice !== product.costPrice) payload.costPrice = values.costPrice
    }
    if (values.categoryId !== product.categoryId) payload.categoryId = values.categoryId
    if (values.unit !== product.unit) payload.unit = values.unit
    const newImg = values.imageUrl.trim() || null
    if (newImg !== product.imageUrl) payload.imageUrl = newImg
    if (values.status !== product.status) payload.status = values.status
    if (values.trackInventory !== product.trackInventory) {
      payload.trackInventory = values.trackInventory
    }
    if (values.minStock !== product.minStock) payload.minStock = values.minStock

    // Determine variantsConfig change
    const wasHasVariants = product.hasVariants
    let needsConfirm = false
    let additions = 0
    let hardDeletions = 0
    let softDeletions = 0

    if (hasVariants && !wasHasVariants) {
      // Turning ON
      const variantsPayload = toPayload(variantsForm)
      if (!variantsPayload || variantsPayload.variants.length === 0) {
        showError('Vui lòng thêm ít nhất 1 biến thể')
        return
      }
      payload.variantsConfig = variantsPayload as never
      additions = variantsPayload.variants.length
      needsConfirm = true
    } else if (!hasVariants && wasHasVariants) {
      // Turning OFF
      payload.variantsConfig = null as never
      hardDeletions = product.variantsConfig?.variants.length ?? 0
      needsConfirm = true
    } else if (hasVariants && wasHasVariants) {
      // Modifying variants
      const variantsPayload = toPayload(variantsForm)
      if (!variantsPayload || variantsPayload.variants.length === 0) {
        showError('Vui lòng thêm ít nhất 1 biến thể')
        return
      }
      payload.variantsConfig = variantsPayload as never
      additions = countAdditions(variantsForm.variants)
      const counts = countDeletions(variantsForm.variants)
      hardDeletions = counts.hardDelete
      softDeletions = counts.softDelete
      needsConfirm = additions + hardDeletions + softDeletions > 0
    }

    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    if (needsConfirm) {
      setPendingPayload({ id: product.id, input: payload })
      setConfirmOpen(true)
      // Save these counts via closure indirectly through state below
      setConfirmCounts({ additions, hardDeletions, softDeletions })
      return
    }

    await sendUpdate(product.id, payload)
  })

  const [confirmCounts, setConfirmCounts] = useState({
    additions: 0,
    hardDeletions: 0,
    softDeletions: 0,
  })

  async function sendUpdate(id: string, input: UpdateProductInput) {
    try {
      await mutation.mutateAsync({ id, input })
      showSuccess('Đã cập nhật sản phẩm')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, asFormSetError(form))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Sửa sản phẩm</DialogTitle>
          <DialogDescription>Cập nhật thông tin sản phẩm.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6" noValidate>
          <BasicSection<EditFormShape>
            form={form}
            categories={categories}
            hideBarcode={hasVariants}
          />
          {!hasVariants && <PriceSection<EditFormShape> form={form} />}
          <ImageSection<EditFormShape> form={form} />
          <StatusSection<EditFormShape> form={form} />
          <InventorySection<EditFormShape>
            form={form}
            mode="edit"
            trackInventory={trackInventory}
            currentStock={product.currentStock}
            hideInitialStock={hasVariants}
            hasVariants={hasVariants}
          />

          <UnitConversionEditor
            mode="edit"
            productId={product.id}
            parentUnit={form.watch('unit') || product.unit}
            parentSellingPrice={sellingPriceValue}
          />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Sản phẩm có biến thể</h3>
              <Switch
                checked={hasVariants}
                onCheckedChange={(v) => {
                  if (!v && product.hasVariants) {
                    // Mark all variants as pendingDelete preview
                  }
                  setHasVariants(v)
                }}
              />
            </div>
            {!hasVariants && product.hasVariants && (
              <p className="text-xs text-amber-700">
                Tắt biến thể sẽ xoá tất cả biến thể. Yêu cầu mọi biến thể có tồn kho = 0 và chưa có
                giao dịch.
              </p>
            )}
            {hasVariants && !product.hasVariants && product.currentStock > 0 && (
              <p className="text-xs text-amber-700">
                Tồn kho hiện tại {product.currentStock} &gt; 0. Vui lòng kiểm kho về 0 trước khi bật
                biến thể.
              </p>
            )}
          </section>

          {hasVariants && (
            <>
              <VariantEditor
                value={variantsForm}
                onChange={setVariantsForm}
                parentSku={skuValue || product.sku}
                defaultSellingPrice={sellingPriceValue}
                defaultCostPrice={costPriceValue}
              />
              <VariantBulkActions
                selectedCount={selected.size}
                onApplyPrice={applyBulkPrice}
                onApplyCost={applyBulkCost}
                onApplyStock={applyBulkStock}
                onClear={() => setSelected(new Set())}
              />
              <VariantTable
                variants={variantsForm.variants}
                onChange={(next) => setVariantsForm((p) => ({ ...p, variants: next }))}
                attribute1Name={variantsForm.attribute1?.name ?? ''}
                attribute2Name={variantsForm.attribute2?.name ?? null}
                trackInventory={trackInventory}
                selected={selected}
                onSelectionChange={setSelected}
              />
            </>
          )}

          {trackInventory && <InventoryHistoryTable productId={product.id} />}

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

        <VariantConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          additions={confirmCounts.additions}
          hardDeletions={confirmCounts.hardDeletions}
          softDeletions={confirmCounts.softDeletions}
          onConfirm={async () => {
            if (pendingPayload) await sendUpdate(pendingPayload.id, pendingPayload.input)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

// Generic helper types
interface ProductFormFields extends FieldValues {
  name: string
  sku: string
  barcode: string
  categoryId: string | null
  sellingPrice: number
  costPrice: number | null
  unit: string
  imageUrl: string
  status: 'active' | 'inactive'
  trackInventory: boolean
  minStock: number
  initialStock?: number
}

function getError<T extends FieldValues>(
  errors: FieldErrors<T>,
  key: keyof ProductFormFields,
): string | undefined {
  const node = (errors as Record<string, { message?: string } | undefined>)[key as string]
  return node?.message
}

function BasicSection<T extends FieldValues & ProductFormFields>({
  form,
  categories,
  hideBarcode,
}: {
  form: UseFormReturn<T>
  categories: CategoryItem[]
  hideBarcode?: boolean
}) {
  const tree = buildCategoryTree(categories)
  const register = form.register as unknown as UseFormRegister<ProductFormFields>
  const setValue = form.setValue as unknown as (
    name: keyof ProductFormFields,
    value: unknown,
    opts?: unknown,
  ) => void
  const watch = form.watch as unknown as (name: keyof ProductFormFields) => unknown
  const categoryValue = (watch('categoryId') as string | null) ?? null

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Thông tin cơ bản</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="p-name">
            Tên sản phẩm <span className="text-destructive">*</span>
          </Label>
          <Input
            id="p-name"
            autoFocus
            maxLength={255}
            placeholder="VD: Cà phê đen đá"
            {...register('name' as Path<ProductFormFields>)}
          />
          {getError(form.formState.errors, 'name') && (
            <p className="text-sm text-destructive">{getError(form.formState.errors, 'name')}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-sku">SKU</Label>
          <div className="flex gap-2">
            <Input
              id="p-sku"
              placeholder="Để trống để tự sinh"
              maxLength={64}
              {...register('sku' as Path<ProductFormFields>)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setValue('sku', generateRandomSku(), {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            >
              Sinh SKU
            </Button>
          </div>
          {getError(form.formState.errors, 'sku') && (
            <p className="text-sm text-destructive">{getError(form.formState.errors, 'sku')}</p>
          )}
        </div>
        {!hideBarcode && (
          <div className="space-y-1">
            <Label htmlFor="p-barcode">Barcode</Label>
            <Input
              id="p-barcode"
              placeholder="VD: 8934567890123"
              maxLength={64}
              {...register('barcode' as Path<ProductFormFields>)}
            />
            {getError(form.formState.errors, 'barcode') && (
              <p className="text-sm text-destructive">
                {getError(form.formState.errors, 'barcode')}
              </p>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="p-category">Danh mục</Label>
          <Select
            value={categoryValue ?? NO_CATEGORY}
            onValueChange={(v) =>
              setValue('categoryId', v === NO_CATEGORY ? null : v, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="p-category">
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Không phân loại</SelectItem>
              {tree.map((parent) => (
                <div key={parent.id}>
                  <SelectItem value={parent.id}>{parent.name}</SelectItem>
                  {parent.children.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {`    ${child.name}`}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-unit">Đơn vị tính</Label>
          <Input
            id="p-unit"
            placeholder="VD: Cái, Ly, Hộp"
            maxLength={32}
            {...register('unit' as Path<ProductFormFields>)}
          />
        </div>
      </div>
    </section>
  )
}

function PriceSection<T extends FieldValues & ProductFormFields>({
  form,
}: {
  form: UseFormReturn<T>
}) {
  const control = form.control as unknown as Control<ProductFormFields>
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Giá</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="p-price">
            Giá bán <span className="text-destructive">*</span>
          </Label>
          <Controller
            name="sellingPrice"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                id="p-price"
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
              />
            )}
          />
          {getError(form.formState.errors, 'sellingPrice') && (
            <p className="text-sm text-destructive">
              {getError(form.formState.errors, 'sellingPrice')}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-cost">Giá vốn</Label>
          <Controller
            name="costPrice"
            control={control}
            render={({ field }) => (
              <CurrencyInput id="p-cost" value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </div>
    </section>
  )
}

function ImageSection<T extends FieldValues & ProductFormFields>({
  form,
}: {
  form: UseFormReturn<T>
}) {
  const register = form.register as unknown as UseFormRegister<ProductFormFields>
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Hình ảnh</h3>
      <div className="space-y-1">
        <Label htmlFor="p-image">URL ảnh</Label>
        <Input
          id="p-image"
          placeholder="https://..."
          {...register('imageUrl' as Path<ProductFormFields>)}
        />
        <p className="text-xs text-muted-foreground">
          Tối đa 1 ảnh, ≤5MB, jpg/png/webp. Story 2.2 chỉ hỗ trợ dán URL ảnh, upload thực sẽ làm ở
          story tương lai.
        </p>
        {getError(form.formState.errors, 'imageUrl') && (
          <p className="text-sm text-destructive">{getError(form.formState.errors, 'imageUrl')}</p>
        )}
      </div>
    </section>
  )
}

function StatusSection<T extends FieldValues & ProductFormFields>({
  form,
}: {
  form: UseFormReturn<T>
}) {
  const setValue = form.setValue as unknown as (
    name: keyof ProductFormFields,
    value: unknown,
    opts?: unknown,
  ) => void
  const watch = form.watch as unknown as (name: keyof ProductFormFields) => unknown
  const status = (watch('status') as 'active' | 'inactive') ?? 'active'
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Trạng thái</h3>
      <Select
        value={status}
        onValueChange={(v) =>
          setValue('status', v, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
      >
        <SelectTrigger className="md:w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Đang bán</SelectItem>
          <SelectItem value="inactive">Ngừng bán</SelectItem>
        </SelectContent>
      </Select>
    </section>
  )
}

function InventorySection<T extends FieldValues & ProductFormFields>({
  form,
  mode,
  trackInventory,
  currentStock,
  hideInitialStock,
  hasVariants,
}: {
  form: UseFormReturn<T>
  mode: Mode
  trackInventory: boolean
  currentStock?: number
  hideInitialStock?: boolean
  hasVariants?: boolean
}) {
  const setValue = form.setValue as unknown as (
    name: keyof ProductFormFields,
    value: unknown,
    opts?: unknown,
  ) => void
  const register = form.register as unknown as UseFormRegister<ProductFormFields>
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Theo dõi tồn kho</h3>
        <Switch
          checked={trackInventory}
          onCheckedChange={(v) =>
            setValue('trackInventory', v, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
      </div>
      {!trackInventory && (
        <p className="text-xs text-muted-foreground">
          Sản phẩm sẽ luôn còn hàng (không trừ kho khi bán). Tồn kho hiện ∞ trên danh sách.
        </p>
      )}
      {trackInventory && hasVariants && (
        <p className="text-xs text-muted-foreground">
          Tồn kho được quản lý ở từng biến thể. Cảnh báo sắp hết áp dụng cho từng biến thể.
        </p>
      )}
      {trackInventory && (
        <div className="grid gap-3 md:grid-cols-2">
          {mode === 'create' && !hideInitialStock && (
            <div className="space-y-1">
              <Label htmlFor="p-initial">Tồn kho ban đầu</Label>
              <Input
                id="p-initial"
                type="number"
                min={0}
                inputMode="numeric"
                {...register('initialStock' as Path<ProductFormFields>, {
                  valueAsNumber: true,
                })}
              />
              {getError(form.formState.errors, 'initialStock') && (
                <p className="text-sm text-destructive">
                  {getError(form.formState.errors, 'initialStock')}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="p-min">Định mức tồn tối thiểu (báo sắp hết khi tồn ≤ định mức)</Label>
            <Input
              id="p-min"
              type="number"
              min={0}
              inputMode="numeric"
              {...register('minStock' as Path<ProductFormFields>, { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">Để 0 nếu không cần cảnh báo.</p>
            {getError(form.formState.errors, 'minStock') && (
              <p className="text-sm text-destructive">
                {getError(form.formState.errors, 'minStock')}
              </p>
            )}
          </div>
          {mode === 'edit' && !hideInitialStock && (
            <div className="space-y-1">
              <Label>Tồn kho hiện tại</Label>
              <Input value={currentStock ?? 0} readOnly disabled />
              <p className="text-xs text-muted-foreground">Cập nhật qua phiếu nhập kho/kiểm kho.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

interface FormSetError {
  setError: (name: string, error: { message: string }) => void
}

function asFormSetError(form: { setError: (...args: never[]) => void }): FormSetError {
  return {
    setError: (name, error) => {
      ;(form.setError as unknown as (n: string, e: { message: string }) => void)(name, error)
    },
  }
}

const KNOWN_FIELDS = [
  'name',
  'sku',
  'barcode',
  'categoryId',
  'sellingPrice',
  'costPrice',
  'unit',
  'imageUrl',
]

function handleApiError(err: unknown, form: FormSetError) {
  if (err instanceof ApiClientError) {
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string; variantIndex?: number } | undefined
      if (detail?.field === 'sku' && detail.variantIndex === undefined) {
        form.setError('sku', { message: err.message })
        showError(err.message)
        return
      }
      if (detail?.field === 'barcode' && detail.variantIndex === undefined) {
        form.setError('barcode', { message: err.message })
        showError(err.message)
        return
      }
      // Variant-level conflict: just toast (highlight UI extension future)
      showError(err.message)
      return
    }
    if (err.code === 'BUSINESS_RULE_VIOLATION') {
      showError(err.message)
      return
    }
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (KNOWN_FIELDS.includes(issue.path)) {
          form.setError(issue.path, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}
