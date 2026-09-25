import { type SyntheticEvent, useState } from 'react'

import { formatVndWithSuffix } from '@kiotviet-lite/shared'
import { createOpeningDebtSchema } from '@kiotviet-lite/shared'

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
import { useCreateSupplierOpeningDebtMutation } from '@/features/suppliers/use-suppliers'
import { ApiClientError } from '@/lib/api-client'
import { showSuccess } from '@/lib/toast'

import { useCreateOpeningDebtMutation } from '../hooks/use-customer-detail'

interface OpeningDebtDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: { kind: 'customer' | 'supplier'; id: string; name: string }
}

export function OpeningDebtDialog({ open, onOpenChange, target }: OpeningDebtDialogProps) {
  const [amount, setAmount] = useState<number | null>(null)
  const [incurredAt, setIncurredAt] = useState('')
  const [error, setError] = useState('')
  const customerMutation = useCreateOpeningDebtMutation(target.id)
  const supplierMutation = useCreateSupplierOpeningDebtMutation(target.id)
  const mutation = target.kind === 'customer' ? customerMutation : supplierMutation

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setAmount(null)
      setIncurredAt('')
      setError('')
    }
    onOpenChange(next)
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = createOpeningDebtSchema.safeParse({ amount, incurredAt })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Thông tin không hợp lệ')
      return
    }
    if (new Date(`${parsed.data.incurredAt}T00:00:00`) > new Date()) {
      setError('Ngày phát sinh không được ở tương lai')
      return
    }
    try {
      await mutation.mutateAsync(parsed.data)
      showSuccess(`Đã nạp nợ đầu kỳ ${formatVndWithSuffix(parsed.data.amount)} cho ${target.name}`)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Không nạp được nợ đầu kỳ')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nạp nợ đầu kỳ</DialogTitle>
          <DialogDescription>
            Nhập số tiền và ngày nợ thực sự phát sinh cho {target.name}. Chỉ nạp khi công nợ hiện
            tại bằng 0.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="opening-amount">Số tiền nợ đầu kỳ</Label>
            <CurrencyInput
              id="opening-amount"
              value={amount}
              onChange={(value) => {
                setAmount(value)
                setError('')
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opening-date">Ngày phát sinh</Label>
            <Input
              id="opening-date"
              type="date"
              required
              value={incurredAt}
              onChange={(event) => {
                setIncurredAt(event.target.value)
                setError('')
              }}
            />
            {target.kind === 'customer' && (
              <p className="text-xs text-muted-foreground">
                Ngày này quyết định thứ tự trừ nợ và tuổi nợ.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang lưu...' : 'Xác nhận nạp nợ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
