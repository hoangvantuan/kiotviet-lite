import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { type CreateSupplierPaymentInput, createSupplierPaymentSchema } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { MoneyMethodPicker } from '@/components/shared/money-method-picker'
import { SupplierCombobox } from '@/components/shared/supplier-combobox'
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
import { useSupplierQuery, useSuppliersQuery } from '@/features/suppliers/use-suppliers'
import { useGuardedOpenChange } from '@/hooks/use-document-mutation'
import { asFormSetError, handleApiError } from '@/lib/api-error'
import { formatVndWithSuffix } from '@/lib/currency'
import { showSuccess } from '@/lib/toast'

import { useCreateSupplierPaymentMutation } from './use-supplier-payments'

const KNOWN_FIELDS = ['supplierId', 'amount', 'paymentMethod', 'note', 'purchaseOrderId']

/** TIEN-104: mở từ phiếu nhập hoặc bảng nợ NCC thì điền sẵn NCC, có thể gắn một phiếu nhập */
export interface SupplierPaymentPreset {
  supplierId: string
  purchaseOrderId?: string
  purchaseOrderCode?: string
  /** Số còn phải trả của phiếu nhập, là mức tối đa khi gắn phiếu */
  purchaseOrderOutstanding?: number
}

interface CreateSupplierPaymentDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: () => void
  preset?: SupplierPaymentPreset
}

function emptyValues(preset?: SupplierPaymentPreset): CreateSupplierPaymentInput {
  return {
    supplierId: preset?.supplierId ?? '',
    amount: 0,
    paymentMethod: 'cash',
    note: null,
    purchaseOrderId: preset?.purchaseOrderId ?? null,
  }
}

export function CreateSupplierPaymentDialog({
  open,
  onOpenChange,
  onCreated,
  preset,
}: CreateSupplierPaymentDialogProps) {
  const mutation = useCreateSupplierPaymentMutation()
  const handleOpenChange = useGuardedOpenChange(onOpenChange, mutation)

  const form = useForm<CreateSupplierPaymentInput>({
    resolver: zodResolver(createSupplierPaymentSchema),
    mode: 'onTouched',
    defaultValues: emptyValues(preset),
  })

  useEffect(() => {
    if (open) {
      form.reset(emptyValues(preset))
    }
    // preset là object mới mỗi lần render ở nơi gọi, chỉ reset khi mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form])

  const supplierId = useWatch({ control: form.control, name: 'supplierId' })
  const checkDebtQuery = useSuppliersQuery({ pageSize: 1, hasDebt: 'yes' })
  const noSuppliersWithDebt = !checkDebtQuery.isLoading && checkDebtQuery.data?.data.length === 0
  const { data: supplierDetail } = useSupplierQuery(supplierId || undefined)
  const selectedSupplier = supplierDetail
  const supplierDebt = selectedSupplier?.currentDebt ?? 0
  const linkedPo = preset?.purchaseOrderId ? preset : undefined
  // Gắn phiếu nhập: tối đa là số còn phải trả của phiếu, không vượt nợ NCC
  const currentDebt =
    linkedPo?.purchaseOrderOutstanding !== undefined
      ? Math.min(linkedPo.purchaseOrderOutstanding, supplierDebt)
      : supplierDebt

  const noteValue = useWatch({ control: form.control, name: 'note' }) ?? ''
  const paymentMethod = useWatch({ control: form.control, name: 'paymentMethod' })

  const submit = form.handleSubmit(async (values) => {
    if (selectedSupplier && values.amount > currentDebt) {
      form.setError('amount', {
        message: linkedPo
          ? `Số tiền chi vượt quá số còn phải trả của phiếu ${linkedPo.purchaseOrderCode ?? ''} (${formatVndWithSuffix(currentDebt)})`
          : `Số tiền chi vượt quá nợ phải trả nhà cung cấp (${formatVndWithSuffix(currentDebt)})`,
      })
      return
    }
    const payload: CreateSupplierPaymentInput = {
      supplierId: values.supplierId,
      amount: values.amount,
      paymentMethod: values.paymentMethod,
      note: values.note?.toString().trim() ? values.note.toString().trim() : null,
      ...(linkedPo ? { purchaseOrderId: linkedPo.purchaseOrderId } : {}),
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chi</DialogTitle>
          <DialogDescription>
            Phiếu chi sẽ giảm trực tiếp số nợ phải trả nhà cung cấp. Không thể sửa hoặc xoá sau khi
            tạo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="payment-supplier">
              Nhà cung cấp <span className="text-destructive">*</span>
            </Label>
            <SupplierCombobox
              disabled={noSuppliersWithDebt || !!preset}
              value={supplierId || undefined}
              onChange={(v) => form.setValue('supplierId', v ?? '', { shouldValidate: true })}
              hasDebt="yes"
              showDebt={true}
            />
            {noSuppliersWithDebt && (
              <p className="text-xs text-muted-foreground">
                Hiện không có nhà cung cấp nào còn nợ phải trả
              </p>
            )}

            {errors.supplierId?.message && (
              <p className="text-xs text-destructive">{errors.supplierId.message}</p>
            )}
          </div>

          {linkedPo && (
            <p className="rounded-md bg-muted/50 p-2 text-sm">
              Thanh toán cho phiếu nhập{' '}
              <span className="font-mono font-medium">{linkedPo.purchaseOrderCode}</span>
            </p>
          )}

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
                Nợ hiện tại: {formatVndWithSuffix(supplierDebt)}. Tối đa:{' '}
                {formatVndWithSuffix(currentDebt)}
              </p>
            )}
            {errors.amount?.message && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>
              Phương thức chi <span className="text-destructive">*</span>
            </Label>
            <MoneyMethodPicker
              value={paymentMethod}
              onChange={(v) => form.setValue('paymentMethod', v, { shouldValidate: true })}
              disabled={isPending}
              ariaLabel="Phương thức chi"
              idPrefix="supplier-payment-method"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payment-note">Ghi chú</Label>
            <Textarea
              id="payment-note"
              rows={3}
              maxLength={500}
              placeholder="VD: Chi trả nợ tháng 4 cho nhà cung cấp ABC"
              {...form.register('note')}
            />
            <p className="text-xs text-muted-foreground text-right">{noteValue.length}/500</p>
            {errors.note?.message && (
              <p className="text-xs text-destructive">{errors.note.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
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
