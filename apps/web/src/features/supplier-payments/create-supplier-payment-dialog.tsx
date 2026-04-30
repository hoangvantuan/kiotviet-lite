import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { type CreateSupplierPaymentInput, createSupplierPaymentSchema } from '@kiotviet-lite/shared'

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
import { useSuppliersQuery } from '@/features/suppliers/use-suppliers'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'

import { useCreateSupplierPaymentMutation } from './use-supplier-payments'

const KNOWN_FIELDS = ['supplierId', 'amount', 'note']

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

function handleApiError(err: unknown, form: FormSetError, knownFields: string[]) {
  if (err instanceof ApiClientError) {
    if (err.code === 'VALIDATION_ERROR' && err.details && Array.isArray(err.details)) {
      for (const issue of err.details as Array<{ path: string; message: string }>) {
        if (knownFields.includes(issue.path)) {
          form.setError(issue.path, { message: issue.message })
        }
      }
    }
    showError(err.message)
    return
  }
  showError('Đã có lỗi xảy ra, vui lòng thử lại')
}

interface CreateSupplierPaymentDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: () => void
}

function emptyValues(): CreateSupplierPaymentInput {
  return {
    supplierId: '',
    amount: 0,
    note: null,
  }
}

export function CreateSupplierPaymentDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSupplierPaymentDialogProps) {
  const mutation = useCreateSupplierPaymentMutation()
  const suppliersQuery = useSuppliersQuery({ pageSize: 200, hasDebt: 'yes' })

  useEffect(() => {
    if (open) {
      suppliersQuery.refetch()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const suppliers = useMemo(() => suppliersQuery.data?.data ?? [], [suppliersQuery.data])

  const form = useForm<CreateSupplierPaymentInput>({
    resolver: zodResolver(createSupplierPaymentSchema),
    mode: 'onTouched',
    defaultValues: emptyValues(),
  })

  useEffect(() => {
    if (open) {
      form.reset(emptyValues())
    }
  }, [open, form])

  const supplierId = useWatch({ control: form.control, name: 'supplierId' })
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId],
  )
  const currentDebt = selectedSupplier?.currentDebt ?? 0

  const noteValue = useWatch({ control: form.control, name: 'note' }) ?? ''

  const submit = form.handleSubmit(async (values) => {
    if (selectedSupplier && values.amount > selectedSupplier.currentDebt) {
      form.setError('amount', {
        message: `Số tiền chi vượt quá nợ phải trả NCC (${formatVndWithSuffix(
          selectedSupplier.currentDebt,
        )})`,
      })
      return
    }
    const payload: CreateSupplierPaymentInput = {
      supplierId: values.supplierId,
      amount: values.amount,
      note: values.note?.toString().trim() ? values.note.toString().trim() : null,
    }
    try {
      const result = await mutation.mutateAsync(payload)
      const debtAfter = result.data.debtAfter ?? 0
      const supplierName = result.data.supplierName ?? ''
      showSuccess(
        `Đã tạo phiếu chi ${formatVndWithSuffix(result.data.amount)} cho ${supplierName}. Nợ còn lại: ${formatVndWithSuffix(
          debtAfter,
        )}`,
      )
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      handleApiError(err, asFormSetError(form), KNOWN_FIELDS)
    }
  })

  const isPending = mutation.isPending
  const errors = form.formState.errors
  const disabled = !form.formState.isValid || isPending
  const noSuppliersWithDebt = !suppliersQuery.isLoading && suppliers.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chi trả nợ NCC</DialogTitle>
          <DialogDescription>
            Phiếu chi sẽ giảm trực tiếp số nợ phải trả NCC. Không thể sửa hoặc xoá sau khi tạo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="payment-supplier">
              Nhà cung cấp <span className="text-destructive">*</span>
            </Label>
            <Select
              value={supplierId || undefined}
              onValueChange={(v) => form.setValue('supplierId', v, { shouldValidate: true })}
              disabled={noSuppliersWithDebt}
            >
              <SelectTrigger id="payment-supplier">
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="truncate">
                      {s.name}
                      {s.phone ? ` - ${s.phone}` : ''} - Nợ: {formatVndWithSuffix(s.currentDebt)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {noSuppliersWithDebt && (
              <p className="text-xs text-muted-foreground">Hiện không có NCC nào còn nợ phải trả</p>
            )}
            {errors.supplierId?.message && (
              <p className="text-xs text-destructive">{errors.supplierId.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-amount">
              Số tiền <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <CurrencyInput
                key={supplierId || 'empty'}
                id="payment-amount"
                value={form.watch('amount') || null}
                onChange={(v) => form.setValue('amount', v ?? 0, { shouldValidate: true })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!selectedSupplier || currentDebt <= 0}
                onClick={() =>
                  form.setValue('amount', currentDebt, { shouldValidate: true, shouldTouch: true })
                }
              >
                Trả hết
              </Button>
            </div>
            {selectedSupplier && (
              <p className="text-xs text-muted-foreground">
                Nợ hiện tại: {formatVndWithSuffix(currentDebt)}. Tối đa:{' '}
                {formatVndWithSuffix(currentDebt)}
              </p>
            )}
            {errors.amount?.message && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-note">Ghi chú</Label>
            <Textarea
              id="payment-note"
              rows={3}
              maxLength={500}
              placeholder="VD: Chi trả nợ tháng 4 cho NCC ABC, tiền mặt"
              {...form.register('note')}
            />
            <p className="text-xs text-muted-foreground text-right">{noteValue.length}/500</p>
            {errors.note?.message && (
              <p className="text-xs text-destructive">{errors.note.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={disabled}>
              {isPending ? 'Đang lưu...' : 'Lưu phiếu chi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
