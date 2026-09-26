import { useState } from 'react'
import { Ban } from 'lucide-react'

import type { SupplierPaymentListItem } from '@kiotviet-lite/shared'

import { CancelDocumentDialog } from '@/components/shared/cancel-document-dialog'
import { Button } from '@/components/ui/button'
import { handleApiError } from '@/lib/api-error'
import { formatVndWithSuffix } from '@/lib/currency'
import { showSuccess } from '@/lib/toast'

import { useCancelSupplierPaymentMutation } from './use-supplier-payments'

/**
 * TIEN-107: hủy phiếu chi, chủ và quản lý. Nhân viên không vào được màn phiếu chi nên không có
 * duyệt bằng PIN.
 */
export function SupplierPaymentCancelButton({ payment }: { payment: SupplierPaymentListItem }) {
  const [open, setOpen] = useState(false)
  const mutation = useCancelSupplierPaymentMutation()
  if (payment.status !== 'active') return null

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Ban className="size-4 mr-1" /> Hủy
      </Button>
      <CancelDocumentDialog
        open={open}
        onOpenChange={setOpen}
        allowApproval={false}
        title="Hủy phiếu chi"
        description={
          <p>
            Phiếu chi {formatVndWithSuffix(payment.amount)} cho{' '}
            {payment.supplierName ?? 'nhà cung cấp'} sẽ được đánh dấu đã hủy. Số tiền này cộng lại
            vào nợ phải trả nhà cung cấp
            {payment.purchaseOrderCode ? ` và phiếu nhập ${payment.purchaseOrderCode}` : ''}.
          </p>
        }
        isPending={mutation.isPending}
        onConfirm={async (input) => {
          try {
            await mutation.mutateAsync({ id: payment.id, input })
            showSuccess('Đã hủy phiếu chi')
          } catch (err) {
            handleApiError(err)
            throw err
          }
        }}
      />
    </>
  )
}
