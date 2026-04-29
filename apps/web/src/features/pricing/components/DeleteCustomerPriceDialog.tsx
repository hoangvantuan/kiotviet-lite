import type { CustomerPriceListItem } from '@kiotviet-lite/shared'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useDeleteCustomerPriceMutation } from '../use-customer-prices'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  customerPrice: CustomerPriceListItem | null
}

export function DeleteCustomerPriceDialog({ open, onOpenChange, customerPrice }: Props) {
  const mutation = useDeleteCustomerPriceMutation()

  const handleConfirm = async () => {
    if (!customerPrice) return
    try {
      await mutation.mutateAsync(customerPrice.id)
      showSuccess('Đã xoá giá riêng')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
        return
      }
      showError('Đã xảy ra lỗi không xác định')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá giá riêng?</AlertDialogTitle>
          <AlertDialogDescription>
            {customerPrice
              ? `Xoá giá riêng cho khách hàng "${customerPrice.customerName}" và sản phẩm "${customerPrice.productName}"? Thao tác không thể hoàn tác.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang xoá…' : 'Xoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
