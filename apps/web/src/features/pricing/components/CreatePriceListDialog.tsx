import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeft } from 'lucide-react'

import {
  applyFormula,
  applyRounding,
  type ClonePriceListInput,
  clonePriceListSchema,
  type CreatePriceListInput,
  createPriceListSchema,
  type FormulaType,
  type ImportPriceListInput,
  importPriceListSchema,
  type ImportPriceListSummary,
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
  useAllPriceListsQuery,
  useChainBaseListsQuery,
  useClonePriceListMutation,
  useCreatePriceListMutation,
  useDirectPriceListsQuery,
  useImportPriceListMutation,
  usePriceListItemsQuery,
  usePriceListsQuery,
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

type CreateMethod = 'direct' | 'formula' | 'chain' | 'clone' | 'import'

const METHOD_DESCRIPTIONS: Record<CreateMethod, string> = {
  direct: 'Nhập giá trực tiếp cho từng sản phẩm.',
  formula: 'Tạo bảng giá theo công thức từ bảng giá nền.',
  chain: 'Tạo bảng giá nối chuỗi từ bảng Trực tiếp hoặc Theo công thức.',
  clone: 'Sao chép toàn bộ giá từ một bảng giá hiện có thành bảng độc lập.',
  import: 'Nhập danh sách giá từ file CSV vào bảng Trực tiếp.',
}

export function CreatePriceListDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<'method' | 'form'>('method')
  const [method, setMethod] = useState<CreateMethod>('direct')

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
              : METHOD_DESCRIPTIONS[method]}
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
        ) : method === 'formula' ? (
          <FormulaForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        ) : method === 'chain' ? (
          <ChainForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        ) : method === 'clone' ? (
          <CloneForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        ) : (
          <ImportForm onBack={() => setStep('method')} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface MethodStepProps {
  value: CreateMethod
  onChange: (v: CreateMethod) => void
  onCancel: () => void
  onNext: () => void
}

const METHOD_CARDS: { value: CreateMethod; title: string; description: string }[] = [
  { value: 'direct', title: 'Trực tiếp', description: 'Nhập giá thủ công cho từng sản phẩm.' },
  {
    value: 'formula',
    title: 'Theo công thức',
    description: 'Tạo từ bảng giá Trực tiếp với công thức tăng/giảm.',
  },
  {
    value: 'chain',
    title: 'Nối chuỗi',
    description: 'Tạo từ bảng Trực tiếp hoặc Theo công thức (chuỗi tối đa 10 cấp).',
  },
  {
    value: 'clone',
    title: 'Sao chép',
    description: 'Nhân bản bảng giá hiện có thành bảng Trực tiếp độc lập.',
  },
  {
    value: 'import',
    title: 'Nhập CSV',
    description: 'Nhập danh sách giá từ file CSV vào bảng Trực tiếp.',
  },
]

function MethodStep({ value, onChange, onCancel, onNext }: MethodStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {METHOD_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            onClick={() => onChange(card.value)}
            className={`rounded-md border p-4 text-left transition-colors ${
              value === card.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <p className="font-semibold text-foreground">{card.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
          </button>
        ))}
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

interface ChainFormShape {
  method: 'chain'
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

interface ChainFormProps {
  onBack: () => void
  onClose: () => void
}

function ChainForm({ onBack, onClose }: ChainFormProps) {
  const mutation = useCreatePriceListMutation()
  const baseQuery = useChainBaseListsQuery({ enabled: true })
  const baseLists = baseQuery.data?.data ?? []

  const form = useForm<ChainFormShape>({
    mode: 'onTouched',
    defaultValues: {
      method: 'chain',
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
      method: 'chain',
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
        const path = issue.path.join('.') as keyof ChainFormShape
        if (path && path !== 'method') {
          form.setError(path, { message: issue.message })
        }
      }
      return
    }

    try {
      await mutation.mutateAsync(parsed.data)
      showSuccess('Đã tạo bảng giá nối chuỗi')
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
        <h3 className="text-sm font-semibold text-foreground">Công thức nối chuỗi</h3>

        <div className="space-y-1">
          <Label>
            Bảng giá nền (Trực tiếp hoặc Theo công thức) <span className="text-destructive">*</span>
          </Label>
          <Select
            value={baseListId || ''}
            onValueChange={(v) => form.setValue('baseListId', v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn bảng giá nền" />
            </SelectTrigger>
            <SelectContent>
              {baseLists.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Chưa có bảng giá Trực tiếp/Theo công thức nào.
                </div>
              ) : (
                baseLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} ({l.method === 'direct' ? 'Trực tiếp' : 'Theo công thức'})
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
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2">{it.productName}</td>
                        <td className="p-2 text-right tabular-nums">
                          {VND_FORMATTER.format(it.price)}đ
                        </td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {VND_FORMATTER.format(rounded)}đ
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

interface CloneFormShape {
  sourceId: string
  name: string
  description: string
  isActive: boolean
}

interface CloneFormProps {
  onBack: () => void
  onClose: () => void
}

function CloneForm({ onBack, onClose }: CloneFormProps) {
  const mutation = useClonePriceListMutation()
  const sourcesQuery = useAllPriceListsQuery({ enabled: true })
  const sources = sourcesQuery.data?.data ?? []

  const form = useForm<CloneFormShape>({
    mode: 'onTouched',
    defaultValues: { sourceId: '', name: '', description: '', isActive: false },
  })

  const sourceId = form.watch('sourceId')
  const isActive = form.watch('isActive')

  const submit = form.handleSubmit(async (values) => {
    if (!values.sourceId) {
      form.setError('sourceId', { message: 'Vui lòng chọn bảng giá nguồn' })
      return
    }
    const payload: ClonePriceListInput = {
      name: values.name,
      isActive: values.isActive,
      description: values.description.trim() || null,
    }
    const parsed = clonePriceListSchema.safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') as keyof CloneFormShape
        if (path) form.setError(path, { message: issue.message })
      }
      return
    }
    try {
      await mutation.mutateAsync({ id: values.sourceId, input: parsed.data })
      showSuccess('Đã sao chép bảng giá')
      onClose()
    } catch (err) {
      handleSubmitError(err, form)
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <Label>
          Bảng giá nguồn <span className="text-destructive">*</span>
        </Label>
        <Select
          value={sourceId || ''}
          onValueChange={(v) => form.setValue('sourceId', v, { shouldValidate: true })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Chọn bảng giá nguồn" />
          </SelectTrigger>
          <SelectContent>
            {sources.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">Chưa có bảng giá nào.</div>
            ) : (
              sources.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {form.formState.errors.sourceId && (
          <p className="text-sm text-destructive">{form.formState.errors.sourceId.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="clone-name">
          Tên bảng giá mới <span className="text-destructive">*</span>
        </Label>
        <Input
          id="clone-name"
          autoFocus
          maxLength={100}
          placeholder="VD: Bản sao bảng giá VIP"
          {...form.register('name')}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="clone-desc">Mô tả</Label>
        <Textarea
          id="clone-desc"
          maxLength={255}
          rows={2}
          placeholder="Mô tả (tuỳ chọn)"
          {...form.register('description')}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Bật ngay sau khi sao chép</p>
          <p className="text-xs text-muted-foreground">
            Mặc định tắt để bạn kiểm tra giá trước khi áp dụng.
          </p>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={(v) => form.setValue('isActive', v, { shouldValidate: true })}
        />
      </div>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang sao chép…' : 'Sao chép'}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface ImportFormShape {
  targetId: string
  csvText: string
  mode: 'upsert' | 'replace'
}

interface ImportFormProps {
  onBack: () => void
  onClose: () => void
}

function ImportForm({ onBack, onClose }: ImportFormProps) {
  const mutation = useImportPriceListMutation()
  const directQuery = usePriceListsQuery({
    method: 'direct',
    pageSize: 100,
    status: 'all',
    page: 1,
  })
  const directLists = directQuery.data?.data ?? []
  const [summary, setSummary] = useState<ImportPriceListSummary | null>(null)

  const form = useForm<ImportFormShape>({
    mode: 'onTouched',
    defaultValues: { targetId: '', csvText: '', mode: 'upsert' },
  })

  const targetId = form.watch('targetId')
  const csvText = form.watch('csvText')
  const mode = form.watch('mode')

  const previewRows = useMemo(() => {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
    return lines.slice(0, 6)
  }, [csvText])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      showError('File CSV quá lớn (tối đa 500KB)')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      form.setValue('csvText', text, { shouldValidate: true })
    }
    reader.readAsText(file)
  }

  const submit = form.handleSubmit(async (values) => {
    if (!values.targetId) {
      form.setError('targetId', { message: 'Vui lòng chọn bảng giá đích' })
      return
    }
    const payload: ImportPriceListInput = { csvText: values.csvText, mode: values.mode }
    const parsed = importPriceListSchema.safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') as keyof ImportFormShape
        if (path) form.setError(path, { message: issue.message })
      }
      return
    }
    try {
      const result = await mutation.mutateAsync({ id: values.targetId, input: parsed.data })
      setSummary(result.data.summary)
      showSuccess(`Đã nhập ${result.data.summary.imported}/${result.data.summary.totalRows} dòng`)
    } catch (err) {
      handleSubmitError(err, form)
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <Label>
          Bảng giá đích (Trực tiếp) <span className="text-destructive">*</span>
        </Label>
        <Select
          value={targetId || ''}
          onValueChange={(v) => form.setValue('targetId', v, { shouldValidate: true })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Chọn bảng giá đích" />
          </SelectTrigger>
          <SelectContent>
            {directLists.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Chưa có bảng giá Trực tiếp.
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
        {form.formState.errors.targetId && (
          <p className="text-sm text-destructive">{form.formState.errors.targetId.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Chế độ ghi</Label>
        <Select
          value={mode}
          onValueChange={(v) =>
            form.setValue('mode', v as 'upsert' | 'replace', { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upsert">Cập nhật / thêm (giữ giá cũ không có trong CSV)</SelectItem>
            <SelectItem value="replace">Thay thế toàn bộ (xoá giá cũ trước khi nhập)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>File CSV</Label>
        <Input type="file" accept=".csv,text/csv" onChange={onFileChange} />
        <p className="text-xs text-muted-foreground">
          Định dạng: header <code>product_code,price</code>. Tối đa 5000 dòng.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="csv-text">Hoặc dán CSV</Label>
        <Textarea
          id="csv-text"
          rows={6}
          placeholder={'product_code,price\nSP001,100000\nSP002,150000'}
          {...form.register('csvText')}
        />
        {form.formState.errors.csvText && (
          <p className="text-sm text-destructive">{form.formState.errors.csvText.message}</p>
        )}
      </div>

      {previewRows.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Xem trước (5 dòng đầu)</h3>
          <pre className="overflow-x-auto rounded-md border bg-muted/30 p-2 text-xs">
            {previewRows.join('\n')}
          </pre>
        </section>
      )}

      {summary && (
        <section className="space-y-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold text-foreground">Kết quả nhập</h3>
          <p className="text-sm">
            Tổng: <strong>{summary.totalRows}</strong> · Thành công:{' '}
            <strong className="text-green-600">{summary.imported}</strong> · Bỏ qua:{' '}
            <strong className="text-amber-600">{summary.skipped}</strong>
          </p>
          {summary.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-1 text-left">Dòng</th>
                    <th className="p-1 text-left">Mã SP</th>
                    <th className="p-1 text-left">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.errors.slice(0, 20).map((e, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1 tabular-nums">{e.row}</td>
                      <td className="p-1">{e.code}</td>
                      <td className="p-1 text-destructive">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.errors.length > 20 && (
                <p className="border-t p-2 text-xs text-muted-foreground">
                  ... còn {summary.errors.length - 20} lỗi khác
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        {summary ? (
          <Button type="button" onClick={onClose}>
            Đóng
          </Button>
        ) : (
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang nhập…' : 'Nhập CSV'}
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}

type AnyForm = ReturnType<typeof useForm>

function CommonFields<T extends DirectFormShape | FormulaFormShape | ChainFormShape>({
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
  'sourceId',
  'targetId',
  'csvText',
  'mode',
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
