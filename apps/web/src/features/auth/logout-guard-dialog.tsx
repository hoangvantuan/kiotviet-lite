import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { requestSync } from '@/lib/offline-sync-runtime'
import { useOfflineStore } from '@/stores/use-offline-store'

interface LogoutGuardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmLogout: () => void
}

/**
 * OFF-05: còn đơn bán ngoại tuyến chưa lên máy chủ thì không đăng xuất ngay. Người dùng chọn
 * đồng bộ trước, hay đăng xuất và để đơn nằm chờ trên máy (đơn giữ người bán và cửa hàng, chỉ
 * đồng bộ khi người của cửa hàng này đăng nhập lại).
 */
export function LogoutGuardDialog({ open, onOpenChange, onConfirmLogout }: LogoutGuardDialogProps) {
  const pending = useOfflineStore((s) => s.pendingOrderCount)
  const failed = useOfflineStore((s) => s.errorOrderCount)
  const connectivity = useOfflineStore((s) => s.connectivity)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const syncThenLogout = async () => {
    setSyncing(true)
    setNote(null)
    try {
      await requestSync('manual')
    } finally {
      setSyncing(false)
    }
    const after = useOfflineStore.getState()
    if (after.pendingOrderCount === 0 && after.errorOrderCount === 0) {
      onConfirmLogout()
      return
    }
    setNote(
      after.connectivity === 'online'
        ? 'Vẫn còn đơn chưa đồng bộ được. Xem chi tiết ở biểu tượng đồng bộ trên thanh tiêu đề.'
        : 'Chưa kết nối được máy chủ nên chưa đồng bộ được. Thử lại khi có mạng.',
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Còn đơn chưa đồng bộ</AlertDialogTitle>
          <AlertDialogDescription>
            Máy này còn {pending > 0 ? `${pending} đơn ngoại tuyến chưa đồng bộ` : ''}
            {pending > 0 && failed > 0 ? ' và ' : ''}
            {failed > 0 ? `${failed} đơn đồng bộ lỗi` : ''} của cửa hàng. Nên đồng bộ trước khi đăng
            xuất. Nếu vẫn đăng xuất, đơn nằm lại trên máy và chỉ được đồng bộ khi một người của cửa
            hàng này đăng nhập lại.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {note && (
          <p role="status" className="text-sm text-destructive">
            {note}
          </p>
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={syncing}>Ở lại</AlertDialogCancel>
          <Button variant="outline" disabled={syncing} onClick={onConfirmLogout}>
            Vẫn đăng xuất
          </Button>
          <Button disabled={syncing || connectivity === 'offline'} onClick={syncThenLogout}>
            {syncing && <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />}
            Đồng bộ rồi đăng xuất
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
