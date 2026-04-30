import type { CategoryDiscountListItem } from '@kiotviet-lite/shared'

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

import { useDeleteCategoryDiscountMutation } from '../use-category-discounts'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryDiscount: CategoryDiscountListItem | null
}

export function DeleteCategoryDiscountDialog({ open, onOpenChange, categoryDiscount }: Props) {
  const mutation = useDeleteCategoryDiscountMutation()

  const handleConfirm = async () => {
    if (!categoryDiscount) return
    try {
      await mutation.mutateAsync(categoryDiscount.id)
      showSuccess('Đã xoá chiết khấu danh mục')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
        return
      }
      showError('Đã xảy ra lỗi không xác định')
    }
  }

  const targetName = categoryDiscount
    ? (categoryDiscount.customerName ?? categoryDiscount.customerGroupName ?? '—')
    : ''

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá chiết khấu danh mục?</AlertDialogTitle>
          <AlertDialogDescription>
            {categoryDiscount
              ? `Xoá chiết khấu danh mục "${categoryDiscount.categoryName}" cho ${targetName}? Mọi đơn hàng tương lai sẽ KHÔNG còn áp giảm giá này.`
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
