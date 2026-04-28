import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeft } from 'lucide-react'

import {
  applyFormula,
  applyRounding,
  type CreatePriceListInput,
  createPriceListSchema,
  type FormulaType,
  type PriceListListItem,
  type RoundingRule,
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
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useProductsQuery } from '../../products/use-products'
import {
  useCreatePriceListMutation,
  useDirectPriceListsQuery,
  usePriceListItemsQuery,
} from '../use-price-lists'

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

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

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreatePriceListDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<'method' | 'form'>('method')
  const [method, setMethod] = useState<'direct' | 'formula'>('direct')

  useEffect(() => {
    if (open) {
      setStep('method')
      setMethod('direct')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Thêm bảng giá</DialogTitle>
          <DialogDescription>
            {step === 'method'
              ? 'Chọn phương thức xác định giá cho bảng giá mới.'
              : method === 'direct'
                ? 'Nhập giá trực tiếp cho từng sản phẩm.'
                : 'Tạo bảng giá theo công thức từ bảng giá nền.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'method' ? (
          <MethodStep
            value={method}
            onChange={setMethod}
            onCancel={() => onOpenChange(false)}
            onNext={() => setStep('form')}
          />
        ) : method === 'direct' ? (
          <DirectForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        ) : (
          <FormulaForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface MethodStepProps {
  value: 'direct' | 'formula'
  onChange: (v: 'direct' | 'formula') => void
  onCancel: () => void
  onNext: () => void
}

function MethodStep({ value, onChange, onCancel, onNext }: MethodStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('direct')}
          className={`rounded-md border p-4 text-left transition-colors ${
            value === 'direct'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <p className="font-semibold text-foreground">Trực tiếp</p>
          <p className="mt-1 text-sm text-muted-foreground">Nhập giá thủ công cho từng sản phẩm.</p>
        </button>
        <button
          type="button"
          onClick={() => onChange('formula')}
          className={`rounded-md border p-4 text-left transition-colors ${
            value === 'formula'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <p className="font-semibold text-foreground">Theo công thức</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo từ bảng giá nền với công thức tăng/giảm.
          </p>
        </button>
      </div>
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Bảng giá theo nhóm khách hàng/khu vực sẽ có ở Story 4.3b.
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="button" onClick={onNext}>
          Tiếp tục
        </Button>
      </DialogFooter>
    </div>
  )
}

interface DirectFormShape {
  method: 'direct'
  name: string
  description: string
  roundingRule: RoundingRule
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

interface DirectFormProps {
  onBack: () => void
  onClose: () => void
}

function DirectForm({ onBack, onClose }: DirectFormProps) {
  const mutation = useCreatePriceListMutation()
  const productsQuery = useProductsQuery({ status: 'active', pageSize: 100, page: 1 })
  const products = productsQuery.data?.data ?? []

  const form = useForm<DirectFormShape>({
    mode: 'onTouched',
    defaultValues: {
      method: 'direct',
      name: '',
      description: '',
      roundingRule: 'none',
      effectiveFrom: '',
      effectiveTo: '',
      isActive: true,
    },
  })

  const [itemPrices, setItemPrices] = useState<Record<string, number>>({})

  const submit = form.handleSubmit(async (values) => {
    const items: { productId: string; price: number }[] = []
    for (const p of products) {
      const price = itemPrices[p.id]
      if (typeof price === 'number' && price >= 0) {
        items.push({ productId: p.id, price })
      }
    }

    const payload: CreatePriceListInput = {
      method: 'direct',
      name: values.name,
      description: values.description.trim() || null,
      roundingRule: values.roundingRule,
      effectiveFrom: values.effectiveFrom || null,
      effectiveTo: values.effectiveTo || null,
      isActive: values.isActive,
      items,
    }

    const parsed = createPriceListSchema.safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') as keyof DirectFormShape
        if (path && path !== 'method') {
          form.setError(path, { message: issue.message })
        }
      }
      return
    }

    try {
      await mutation.mutateAsync(parsed.data)
      showSuccess('Đã tạo bảng giá')
      onClose()
    } catch (err) {
      handleSubmitError(err, form)
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <CommonFields form={form} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Sản phẩm</h3>
        <p className="text-xs text-muted-foreground">
          Để trống để bỏ qua. Giá sẽ được làm tròn theo quy tắc đã chọn khi lưu.
        </p>
        {productsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải sản phẩm…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có sản phẩm nào.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-md border">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    SKU {p.sku} • Gốc {VND_FORMATTER.format(p.sellingPrice)}đ
                  </p>
                </div>
                <div className="w-40">
                  <CurrencyInput
                    value={itemPrices[p.id] ?? null}
                    onChange={(v) => {
                      setItemPrices((prev) => {
                        const next = { ...prev }
                        if (v === null) delete next[p.id]
                        else next[p.id] = v
                        return next
                      })
                    }}
                    placeholder="Giá"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface FormulaFormShape {
  method: 'formula'
  name: string
  description: string
  baseListId: string
  formulaType: FormulaType
  formulaValue: number
  roundingRule: RoundingRule
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

interface FormulaFormProps {
  onBack: () => void
  onClose: () => void
}

function FormulaForm({ onBack, onClose }: FormulaFormProps) {
  const mutation = useCreatePriceListMutation()
  const directQuery = useDirectPriceListsQuery({ enabled: true })
  const directLists = directQuery.data?.data ?? []

  const form = useForm<FormulaFormShape>({
    mode: 'onTouched',
    defaultValues: {
      method: 'formula',
      name: '',
      description: '',
      baseListId: '',
      formulaType: 'percent_decrease',
      formulaValue: 0,
      roundingRule: 'none',
      effectiveFrom: '',
      effectiveTo: '',
      isActive: true,
    },
  })

  const baseListId = form.watch('baseListId')
  const formulaType = form.watch('formulaType')
  const formulaValue = form.watch('formulaValue') ?? 0
  const roundingRule = form.watch('roundingRule')

  const baseItemsQuery = usePriceListItemsQuery(baseListId || undefined, { page: 1, pageSize: 200 })

  const previewItems = useMemo(
    () => (baseItemsQuery.data?.data ?? []).slice(0, 5),
    [baseItemsQuery.data],
  )

  const submit = form.handleSubmit(async (values) => {
    const payload: CreatePriceListInput = {
      method: 'formula',
      name: values.name,
      description: values.description.trim() || null,
      baseListId: values.baseListId,
      formulaType: values.formulaType,
      formulaValue: normalizeFormulaValue(values.formulaType, values.formulaValue),
      roundingRule: values.roundingRule,
      effectiveFrom: values.effectiveFrom || null,
      effectiveTo: values.effectiveTo || null,
      isActive: values.isActive,
      overrides: [],
    }

    const parsed = createPriceListSchema.safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') as keyof FormulaFormShape
        if (path && path !== 'method') {
          form.setError(path, { message: issue.message })
        }
      }
      return
    }

    try {
      await mutation.mutateAsync(parsed.data)
      showSuccess('Đã tạo bảng giá')
      onClose()
    } catch (err) {
      handleSubmitError(err, form)
    }
  })

  const isPercent = formulaType === 'percent_increase' || formulaType === 'percent_decrease'

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <CommonFields form={form} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Công thức</h3>

        <div className="space-y-1">
          <Label>
            Bảng giá nền <span className="text-destructive">*</span>
          </Label>
          <Select
            value={baseListId || ''}
            onValueChange={(v) => form.setValue('baseListId', v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn bảng giá nền (Trực tiếp)" />
            </SelectTrigger>
            <SelectContent>
              {directLists.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Chưa có bảng giá Trực tiếp nào.
                </div>
              ) : (
                directLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {form.formState.errors.baseListId && (
            <p className="text-sm text-destructive">{form.formState.errors.baseListId.message}</p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Loại công thức</Label>
            <Select
              value={formulaType}
              onValueChange={(v) =>
                form.setValue('formulaType', v as FormulaType, { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent_decrease">Giảm theo %</SelectItem>
                <SelectItem value="percent_increase">Tăng theo %</SelectItem>
                <SelectItem value="amount_decrease">Giảm theo số tiền</SelectItem>
                <SelectItem value="amount_increase">Tăng theo số tiền</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>
              Giá trị {isPercent ? '(%)' : '(VND)'} <span className="text-destructive">*</span>
            </Label>
            {isPercent ? (
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={formulaValue === 0 ? '' : String(formulaValue / 100)}
                onChange={(e) => {
                  const num = Number(e.target.value)
                  form.setValue('formulaValue', Number.isFinite(num) ? Math.round(num * 100) : 0, {
                    shouldValidate: true,
                  })
                }}
                placeholder="VD: 10"
              />
            ) : (
              <CurrencyInput
                value={formulaValue}
                onChange={(v) => form.setValue('formulaValue', v ?? 0, { shouldValidate: true })}
              />
            )}
            {form.formState.errors.formulaValue && (
              <p className="text-sm text-destructive">
                {form.formState.errors.formulaValue.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {baseListId && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Xem trước (5 sản phẩm đầu)</h3>
          {baseItemsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : previewItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bảng giá nền chưa có sản phẩm.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs">
                  <tr>
                    <th className="p-2 text-left">Sản phẩm</th>
                    <th className="p-2 text-right">Giá nền</th>
                    <th className="p-2 text-right">Sau công thức</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((it) => {
                    const computed = applyFormula(it.price, formulaType, formulaValue)
                    const rounded = Math.max(0, applyRounding(computed, roundingRule))
                    const belowCost = it.productCostPrice !== null && rounded < it.productCostPrice
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2">{it.productName}</td>
                        <td className="p-2 text-right tabular-nums">
                          {VND_FORMATTER.format(it.price)}đ
                        </td>
                        <td
                          className={`p-2 text-right tabular-nums font-medium ${
                            belowCost ? 'text-destructive' : ''
                          }`}
                        >
                          {VND_FORMATTER.format(rounded)}đ
                          {belowCost && (
                            <span className="ml-2 text-xs font-normal">(Dưới vốn)</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function normalizeFormulaValue(_type: FormulaType, value: number): number {
  return Math.max(0, Math.round(value))
}

type AnyForm = ReturnType<typeof useForm>

function CommonFields<T extends DirectFormShape | FormulaFormShape>({
  form: typedForm,
}: {
  form: ReturnType<typeof useForm<T>>
}) {
  const form = typedForm as unknown as AnyForm
  const isActive = form.watch('isActive') as boolean
  const roundingRule = form.watch('roundingRule') as RoundingRule
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="pl-name">
          Tên bảng giá <span className="text-destructive">*</span>
        </Label>
        <Input
          id="pl-name"
          autoFocus
          maxLength={100}
          placeholder="VD: Bảng giá VIP"
          {...form.register('name')}
        />
        {errors.name?.message && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="pl-desc">Mô tả</Label>
        <Textarea
          id="pl-desc"
          maxLength={255}
          rows={2}
          placeholder="Mô tả bảng giá (tuỳ chọn)"
          {...form.register('description')}
        />
        {errors.description?.message && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
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
          <Label htmlFor="pl-from">Hiệu lực từ</Label>
          <Input id="pl-from" type="date" {...form.register('effectiveFrom')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pl-to">Đến</Label>
          <Input id="pl-to" type="date" {...form.register('effectiveTo')} />
          {errors.effectiveTo?.message && (
            <p className="text-sm text-destructive">{errors.effectiveTo.message}</p>
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
    </div>
  )
}

interface FormHandle {
  setError: (name: string, error: { message: string }) => void
}

function asFormHandle(form: { setError: (...args: never[]) => void }): FormHandle {
  return {
    setError: (name, error) => {
      ;(form.setError as unknown as (n: string, e: { message: string }) => void)(name, error)
    },
  }
}

const KNOWN_FIELDS = [
  'name',
  'description',
  'baseListId',
  'formulaType',
  'formulaValue',
  'effectiveFrom',
  'effectiveTo',
  'roundingRule',
]

function handleSubmitError(err: unknown, form: { setError: (...args: never[]) => void }) {
  const handle = asFormHandle(form)
  if (err instanceof ApiClientError) {
    if (err.code === 'CONFLICT') {
      const detail = err.details as { field?: string } | undefined
      if (detail?.field === 'name') {
        handle.setError('name', { message: err.message })
      }
      showError(err.message)
      return
    }
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (KNOWN_FIELDS.includes(issue.path)) {
          handle.setError(issue.path, { message: issue.message })
        }
      }
    }
    if (err.code === 'BUSINESS_RULE_VIOLATION') {
      showError(err.message)
      return
    }
    showError(err.message)
    return
  }
  showError('Đã xảy ra lỗi không xác định')
}

// Suppress unused warning when needed
export type { PriceListListItem }
