import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { type CreateDebtAdjustmentInput, createDebtAdjustmentSchema } from '@kiotviet-lite/shared'

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
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { showError, showSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'

import { useCreateDebtAdjustmentMutation } from '../hooks/use-customer-detail'

interface DebtAdjustmentDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerId: string
  customerName: string
  currentDebt: number
}

export function DebtAdjustmentDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  currentDebt,
}: DebtAdjustmentDialogProps) {
  const [generation, setGeneration] = useState(0)
  const mutation = useCreateDebtAdjustmentMutation()

  const form = useForm<CreateDebtAdjustmentInput>({
    resolver: zodResolver(createDebtAdjustmentSchema),
    mode: 'onTouched',
    defaultValues: {
      customerId,
      newAmount: 0,
      reason: '',
    },
  })

  const newAmountValue = useWatch({ control: form.control, name: 'newAmount' })
  const reasonValue = useWatch({ control: form.control, name: 'reason' }) ?? ''
  const diff = newAmountValue - currentDebt
  const showPreview = newAmountValue !== undefined && newAmountValue !== currentDebt

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setGeneration((g) => g + 1)
      form.reset({ customerId, newAmount: 0, reason: '' })
    }
    onOpenChange(v)
  }

  const submit = form.handleSubmit(async (values) => {
    if (values.newAmount === currentDebt) {
      form.setError('newAmount', {
        message: `Số nợ mới phải khác số nợ hiện tại (${formatVndWithSuffix(currentDebt)})`,
      })
      return
    }
    try {
      const result = await mutation.mutateAsync(values)
      showSuccess(
        `Đã điều chỉnh nợ ${customerName}: ${formatVndWithSuffix(result.data.oldAmount)} → ${formatVndWithSuffix(result.data.newAmount)}`,
      )
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
        return
      }
      showError('Đã có lỗi xảy ra, vui lòng thử lại')
    }
  })

  const errors = form.formState.errors
  const isPending = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent key={generation} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Điều chỉnh nợ khách hàng</DialogTitle>
          <DialogDescription>
            Thay đổi số nợ hiện tại. Không thể sửa hoặc xoá sau khi lưu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Nợ hiện tại - readonly */}
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Nợ hiện tại</Label>
            <p className="text-base font-medium text-muted-foreground">
              {formatVnd(currentDebt)} ₫
            </p>
          </div>

          {/* Số nợ mới */}
          <div className="grid gap-2">
            <Label htmlFor="adj-new-amount">
              Số nợ mới <span className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="adj-new-amount"
              value={form.watch('newAmount') ?? null}
              onChange={(v) => form.setValue('newAmount', v ?? 0, { shouldValidate: true })}
            />
            <p className="text-xs text-muted-foreground">Nhập 0 để xoá toàn bộ nợ</p>
            {errors.newAmount?.message && (
              <p className="text-xs text-destructive">{errors.newAmount.message}</p>
            )}
          </div>

          {/* Lý do */}
          <div className="grid gap-2">
            <Label htmlFor="adj-reason">
              Lý do <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="adj-reason"
              rows={3}
              maxLength={500}
              placeholder="VD: Xoá nợ xấu, KH đã thanh toán bên ngoài"
              {...form.register('reason')}
            />
            <div className="flex justify-between">
              {errors.reason?.message ? (
                <p className="text-xs text-destructive">{errors.reason.message}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground">{reasonValue.length}/500</p>
            </div>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              <p>
                Nợ cũ: {formatVndWithSuffix(currentDebt)} → Nợ mới:{' '}
                {formatVndWithSuffix(newAmountValue)}
              </p>
              <p
                className={cn(
                  'mt-1 font-medium',
                  diff > 0 ? 'text-red-700' : 'text-green-700',
                )}
              >
                Chênh lệch: {diff > 0 ? '+' : ''}
                {formatVndWithSuffix(diff)}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isValid || isPending}
            >
              {isPending ? 'Đang lưu...' : 'Xác nhận điều chỉnh'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
