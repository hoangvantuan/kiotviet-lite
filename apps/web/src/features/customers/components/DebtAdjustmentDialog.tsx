import { useQueryClient } from '@tanstack/react-query'

import { DebtAdjustmentFormDialog } from '@/components/shared/debt-adjustment-form-dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { showSuccess } from '@/lib/toast'

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
  const queryClient = useQueryClient()
  const mutation = useCreateDebtAdjustmentMutation()

  return (
    <DebtAdjustmentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Điều chỉnh nợ khách hàng"
      description={`Tăng hoặc giảm công nợ của ${customerName || 'khách hàng'}. Không thể sửa hoặc xoá sau khi lưu.`}
      currentDebt={currentDebt}
      onSubmit={async (change) => {
        const result = await mutation.mutateAsync({ customerId, ...change })
        showSuccess(
          `Đã điều chỉnh nợ ${customerName}: ${formatVndWithSuffix(result.data.oldAmount)} → ${formatVndWithSuffix(result.data.newAmount)}`,
        )
      }}
      onConflict={() => {
        queryClient.invalidateQueries({ queryKey: ['customers'] })
      }}
    />
  )
}
