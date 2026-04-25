import type { UserListItem } from '@kiotviet-lite/shared'

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

import { useLockUserMutation, useUnlockUserMutation } from './use-users'

interface LockConfirmDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  user: UserListItem | null
}

export function LockConfirmDialog({ open, onOpenChange, user }: LockConfirmDialogProps) {
  const lockMutation = useLockUserMutation()
  const unlockMutation = useUnlockUserMutation()
  const isPending = lockMutation.isPending || unlockMutation.isPending

  if (!user) return null
  const isLocking = user.isActive

  const onConfirm = async () => {
    try {
      if (isLocking) {
        await lockMutation.mutateAsync(user.id)
        showSuccess(`Đã khoá ${user.name}`)
      } else {
        await unlockMutation.mutateAsync(user.id)
        showSuccess(`Đã mở khoá ${user.name}`)
      }
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
          <AlertDialogTitle>
            {isLocking ? 'Khoá nhân viên?' : 'Mở khoá nhân viên?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLocking
              ? `Sau khi khoá, ${user.name} sẽ bị đăng xuất khỏi tất cả thiết bị và không thể đăng nhập lại.`
              : `Sau khi mở khoá, ${user.name} có thể đăng nhập lại bình thường.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Đang xử lý…' : isLocking ? 'Khoá' : 'Mở khoá'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
