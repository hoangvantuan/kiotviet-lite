import type { PriceListListItem } from '@kiotviet-lite/shared'

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

import { useDeletePriceListMutation } from '../use-price-lists'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  priceList: PriceListListItem | null
}

export function DeletePriceListDialog({ open, onOpenChange, priceList }: Props) {
  const mutation = useDeletePriceListMutation()

  if (!priceList) return null

  const onConfirm = async () => {
    try {
      await mutation.mutateAsync(priceList.id)
      showSuccess('Đã xoá bảng giá')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'CONFLICT') {
          const detail = err.details as
            | { dependentLists?: { id: string; name: string }[]; dependentTotal?: number }
            | undefined
          const list = detail?.dependentLists ?? []
          const total = detail?.dependentTotal ?? list.length
          const names = list.map((l) => l.name).join(', ')
          const remaining = total > list.length ? ` (và ${total - list.length} khác)` : ''
          showError(names ? `${err.message} (${names})${remaining}` : err.message)
          return
        }
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
          <AlertDialogTitle>Xoá bảng giá {priceList.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Bảng giá sẽ chuyển vào thùng rác và có thể khôi phục.
          </AlertDialogDescription>
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
