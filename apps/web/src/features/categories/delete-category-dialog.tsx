import type { CategoryItem } from '@kiotviet-lite/shared'

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

import { useDeleteCategoryMutation } from './use-categories'

interface DeleteCategoryDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  category: CategoryItem | null
}

export function DeleteCategoryDialog({ open, onOpenChange, category }: DeleteCategoryDialogProps) {
  const mutation = useDeleteCategoryMutation()

  if (!category) return null

  const onConfirm = async () => {
    try {
      await mutation.mutateAsync(category.id)
      showSuccess('Đã xoá danh mục')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá danh mục {category.name}?</AlertDialogTitle>
          <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? 'Đang xoá…' : 'Xoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
