import { type SyntheticEvent, useState } from 'react'

import {
  adjustmentReasonSchema,
  applyDebtAdjustment,
  type DebtAdjustmentDirection,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api-client'
import { formatVndWithSuffix } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface DebtAdjustmentChange {
  direction: DebtAdjustmentDirection
  amount: number
  /** Số nợ người dùng đang thấy; máy chủ trả 409 nếu số thật đã khác (TIEN-102). */
  expectedCurrentDebt: number
  reason: string
}

interface DebtAdjustmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  currentDebt: number
  onSubmit: (change: DebtAdjustmentChange) => Promise<void>
  /** Gọi khi máy chủ báo công nợ đã đổi, để nạp lại số nợ mới nhất. */
  onConflict: () => void
}

const DIRECTIONS: Array<{ value: DebtAdjustmentDirection; label: string }> = [
  { value: 'increase', label: 'Tăng nợ' },
  { value: 'decrease', label: 'Giảm nợ' },
]

/**
 * TIEN-110: điều chỉnh theo số chênh lệch thay vì gõ số nợ mới. Số tiền để trống, bắt buộc lý
 * do, và phải qua bước xác nhận hiện rõ nợ trước và nợ sau, nên không thể lỡ tay xoá sạch nợ.
 */
export function DebtAdjustmentFormDialog({
  open,
  onOpenChange,
  title,
  description,
  ...formProps
}: DebtAdjustmentFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* Form nằm trong DialogContent nên bị gỡ khi đóng: mỗi lần mở là một form mới, trống,
            ở bước nhập, bất kể đóng do lưu xong, Huỷ hay do nơi gọi đổi `open` */}
        <DebtAdjustmentForm {...formProps} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function DebtAdjustmentForm({
  currentDebt,
  onSubmit,
  onConflict,
  onClose,
}: Pick<DebtAdjustmentFormDialogProps, 'currentDebt' | 'onSubmit' | 'onConflict'> & {
  onClose: () => void
}) {
  const [direction, setDirection] = useState<DebtAdjustmentDirection | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  const validate = (): string | null => {
    if (!direction) return 'Vui lòng chọn tăng nợ hoặc giảm nợ'
    if (amount === null || amount <= 0) return 'Số tiền điều chỉnh phải lớn hơn 0'
    if (direction === 'decrease' && amount > currentDebt) {
      return `Số tiền giảm không được lớn hơn số nợ hiện tại (${formatVndWithSuffix(currentDebt)})`
    }
    const reasonCheck = adjustmentReasonSchema.safeParse(reason)
    if (!reasonCheck.success) return reasonCheck.error.issues[0]?.message ?? 'Vui lòng nhập lý do'
    return null
  }

  const newDebt =
    direction && amount !== null && amount > 0
      ? applyDebtAdjustment(currentDebt, direction, amount)
      : null

  const goConfirm = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setError('')
    setConfirming(true)
  }

  const confirm = async () => {
    if (!direction || amount === null) return
    setPending(true)
    try {
      await onSubmit({
        direction,
        amount,
        expectedCurrentDebt: currentDebt,
        reason: reason.trim(),
      })
      onClose()
    } catch (cause) {
      setConfirming(false)
      if (cause instanceof ApiClientError) {
        setError(cause.message)
        if (cause.status === 409) onConflict()
        return
      }
      setError('Không điều chỉnh được công nợ, vui lòng thử lại')
    } finally {
      setPending(false)
    }
  }

  return confirming && newDebt !== null ? (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/50 p-4 text-sm">
        <p className="font-medium">
          {direction === 'increase' ? 'Tăng nợ' : 'Giảm nợ'} {formatVndWithSuffix(amount ?? 0)}
        </p>
        <p className="mt-2">
          Nợ trước: <span className="font-medium">{formatVndWithSuffix(currentDebt)}</span>
        </p>
        <p>
          Nợ sau:{' '}
          <span
            className={cn(
              'font-semibold',
              direction === 'increase' ? 'text-red-700' : 'text-green-700',
            )}
          >
            {formatVndWithSuffix(newDebt)}
          </span>
        </p>
        <p className="mt-2 text-muted-foreground">Lý do: {reason.trim()}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Điều chỉnh không thể sửa hoặc xoá sau khi lưu.
      </p>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Quay lại
        </Button>
        <Button type="button" disabled={pending} onClick={confirm}>
          {pending ? 'Đang lưu...' : 'Xác nhận điều chỉnh'}
        </Button>
      </DialogFooter>
    </div>
  ) : (
    <form onSubmit={goConfirm} className="space-y-4">
      <div className="grid gap-1">
        <Label className="text-muted-foreground">Nợ hiện tại</Label>
        <p className="text-base font-medium">{formatVndWithSuffix(currentDebt)}</p>
      </div>

      <div className="grid gap-2">
        <Label>
          Loại điều chỉnh <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2" role="group" aria-label="Loại điều chỉnh">
          {DIRECTIONS.map((d) => (
            <Button
              key={d.value}
              type="button"
              variant={direction === d.value ? 'default' : 'outline'}
              aria-pressed={direction === d.value}
              onClick={() => {
                setDirection(d.value)
                setError('')
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="debt-adjustment-amount">
          Số tiền điều chỉnh <span className="text-destructive">*</span>
        </Label>
        <CurrencyInput
          id="debt-adjustment-amount"
          value={amount}
          placeholder="Nhập số tiền tăng hoặc giảm"
          onChange={(value) => {
            setAmount(value)
            setError('')
          }}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="debt-adjustment-reason">
          Lý do <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="debt-adjustment-reason"
          rows={3}
          maxLength={500}
          value={reason}
          placeholder="VD: Chiết khấu cuối kỳ, phí vận chuyển tính thêm"
          onChange={(event) => {
            setReason(event.target.value)
            setError('')
          }}
        />
        <p className="text-right text-xs text-muted-foreground">{reason.length}/500</p>
      </div>

      {newDebt !== null && (
        <p className="rounded-md border bg-muted/50 p-3 text-sm">
          Nợ trước {formatVndWithSuffix(currentDebt)}, nợ sau {formatVndWithSuffix(newDebt)}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit">Tiếp tục</Button>
      </DialogFooter>
    </form>
  )
}
