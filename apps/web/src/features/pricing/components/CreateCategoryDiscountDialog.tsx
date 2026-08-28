import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import type { CreateCategoryDiscountInput } from '@kiotviet-lite/shared'

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
import { useCategoriesQuery } from '@/features/categories/use-categories'
import { useCustomerGroupsQuery, useCustomersQuery } from '@/features/customers/use-customers'
import { handleApiError } from '@/lib/api-error'
import { showSuccess } from '@/lib/toast'

import { useCreateCategoryDiscountMutation } from '../use-category-discounts'

const categoryDiscountSchema = z
  .object({
    categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
    targetType: z.enum(['customer', 'group']),
    customerId: z.string(),
    customerGroupId: z.string(),
    discountType: z.enum(['percent', 'amount']),
    discountValue: z
      .number({ invalid_type_error: 'Vui lòng nhập mức giảm hợp lệ' })
      .min(0, 'Vui lòng nhập mức giảm hợp lệ')
      .nullable()
      .refine((v) => v !== null, { message: 'Vui lòng nhập mức giảm hợp lệ' }),
    minQty: z.number().int().min(1, 'Số lượng tối thiểu ≥ 1'),
    effectiveFrom: z.string(),
    effectiveTo: z.string(),
    isActive: z.boolean(),
    note: z.string(),
  })
  .refine(
    (d) => {
      if (d.targetType === 'customer' && !d.customerId) return false
      return true
    },
    { message: 'Vui lòng chọn khách hàng', path: ['customerId'] },
  )
  .refine(
    (d) => {
      if (d.targetType === 'group' && !d.customerGroupId) return false
      return true
    },
    { message: 'Vui lòng chọn nhóm khách hàng', path: ['customerGroupId'] },
  )
  .refine(
    (d) => {
      if (d.discountType === 'percent' && d.discountValue > 100) return false
      return true
    },
    { message: 'Phần trăm giảm phải ≤ 100', path: ['discountValue'] },
  )
  .refine(
    (d) => {
      if (d.effectiveFrom && d.effectiveTo && d.effectiveTo < d.effectiveFrom) return false
      return true
    },
    { message: 'Ngày kết thúc phải ≥ ngày bắt đầu', path: ['effectiveTo'] },
  )

type FormShape = z.input<typeof categoryDiscountSchema>

const DEFAULT_VALUES: FormShape = {
  categoryId: '',
  targetType: 'group',
  customerId: '',
  customerGroupId: '',
  discountType: 'percent',
  discountValue: null,
  minQty: 1,
  effectiveFrom: '',
  effectiveTo: '',
  isActive: true,
  note: '',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function CreateCategoryDiscountDialog({ open, onOpenChange }: Props) {
  const mutation = useCreateCategoryDiscountMutation()
  const categoriesQuery = useCategoriesQuery({ enabled: open })
  const customersQuery = useCustomersQuery({ pageSize: 200, page: 1 })
  const groupsQuery = useCustomerGroupsQuery({ enabled: open })
  const categories = categoriesQuery.data ?? []
  const customers = customersQuery.data?.data ?? []
  const groups = groupsQuery.data ?? []

  const form = useForm<FormShape>({
    mode: 'onTouched',
    resolver: zodResolver(categoryDiscountSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES)
    }
  }, [open, form])

  const targetType = form.watch('targetType')
  const discountType = form.watch('discountType')
  const isActive = form.watch('isActive')

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateCategoryDiscountInput = {
      categoryId: values.categoryId,
      customerId: values.targetType === 'customer' ? values.customerId : null,
      customerGroupId: values.targetType === 'group' ? values.customerGroupId : null,
      discountType: values.discountType,
      discountValue: values.discountValue!,
      minQty: values.minQty,
      effectiveFrom: values.effectiveFrom || null,
      effectiveTo: values.effectiveTo || null,
      isActive: values.isActive,
      note: values.note.trim() ? values.note.trim() : null,
    }
    try {
      await mutation.mutateAsync(payload)
      showSuccess('Đã tạo chiết khấu danh mục')
      onOpenChange(false)
    } catch (err) {
      handleApiError(err, form)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm chiết khấu danh mục</DialogTitle>
          <DialogDescription>
            Tạo quy tắc giảm giá cho khách hàng cụ thể hoặc cả nhóm KH.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Label>
              Danh mục <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.watch('categoryId')}
              onValueChange={(v) => form.setValue('categoryId', v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn danh mục" />
              </SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Chưa có danh mục.</div>
                ) : (
                  categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.categoryId && (
              <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Đối tượng áp dụng</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={targetType === 'customer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => form.setValue('targetType', 'customer')}
              >
                Cho 1 khách hàng
              </Button>
              <Button
                type="button"
                variant={targetType === 'group' ? 'default' : 'outline'}
                size="sm"
                onClick={() => form.setValue('targetType', 'group')}
              >
                Cho 1 nhóm khách hàng
              </Button>
            </div>
          </div>

          {targetType === 'customer' ? (
            <div className="space-y-1">
              <Label>
                Khách hàng <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch('customerId')}
                onValueChange={(v) => form.setValue('customerId', v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khách hàng" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      Chưa có khách hàng.
                    </div>
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
                <p className="text-sm text-destructive">
                  {form.formState.errors.customerId.message}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label>
                Nhóm khách hàng <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch('customerGroupId')}
                onValueChange={(v) => form.setValue('customerGroupId', v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm KH" />
                </SelectTrigger>
                <SelectContent>
                  {groups.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">Chưa có nhóm KH.</div>
                  ) : (
                    groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.customerGroupId && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.customerGroupId.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Loại giảm</Label>
              <Select
                value={discountType}
                onValueChange={(v) =>
                  form.setValue('discountType', v as 'percent' | 'amount', {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Phần trăm (%)</SelectItem>
                  <SelectItem value="amount">Số tiền cố định (đ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-value">
                Mức giảm <span className="text-destructive">*</span>
              </Label>
              {discountType === 'percent' ? (
                <Input
                  id="cd-value"
                  type="number"
                  min={0}
                  max={100}
                  value={form.watch('discountValue') ?? ''}
                  onChange={(e) =>
                    form.setValue(
                      'discountValue',
                      e.target.value === '' ? null : Number(e.target.value),
                      { shouldValidate: true },
                    )
                  }
                />
              ) : (
                <CurrencyInput
                  id="cd-value"
                  value={form.watch('discountValue')}
                  onChange={(v) => form.setValue('discountValue', v, { shouldValidate: true })}
                />
              )}
              {form.formState.errors.discountValue && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.discountValue.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cd-minqty">Số lượng tối thiểu</Label>
              <Input
                id="cd-minqty"
                type="number"
                min={1}
                value={form.watch('minQty')}
                onChange={(e) =>
                  form.setValue('minQty', Number(e.target.value) || 1, { shouldValidate: true })
                }
              />
              {form.formState.errors.minQty && (
                <p className="text-sm text-destructive">{form.formState.errors.minQty.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-from">Từ ngày</Label>
              <Input id="cd-from" type="date" {...form.register('effectiveFrom')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cd-to">Đến ngày</Label>
              <Input id="cd-to" type="date" {...form.register('effectiveTo')} />
              {form.formState.errors.effectiveTo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.effectiveTo.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="cd-active"
              checked={isActive}
              onCheckedChange={(v) => form.setValue('isActive', v)}
            />
            <Label htmlFor="cd-active">Kích hoạt</Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cd-note">Ghi chú</Label>
            <Textarea
              id="cd-note"
              maxLength={255}
              rows={2}
              placeholder="VD: Khuyến mãi mùa hè"
              {...form.register('note')}
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
