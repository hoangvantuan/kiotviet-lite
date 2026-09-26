import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { updateBlocker } from './update-gate'

const UPDATE_TOAST_ID = 'pwa-update'
// Máy bán hàng thường mở app cả ngày, không tải lại trang, nên phải tự hỏi bản mới định kỳ
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Báo có phiên bản mới và để người dùng chọn lúc tải lại (OFF-18), thay cho việc service
 * worker mới tự chiếm quyền giữa lúc đang bán. Nút tải lại chỉ hiện khi không còn giỏ đang mở.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
  const tabs = useCartStore((s) => s.tabs)
  const syncStatus = useOfflineStore((s) => s.status)
  const blocker = updateBlocker(tabs, syncStatus)

  useEffect(() => {
    if (!needRefresh) return
    toast.info('Đã có phiên bản mới', {
      id: UPDATE_TOAST_ID,
      description: blocker ?? 'Không có đơn đang mở, có thể tải lại ngay.',
      duration: Infinity,
      // sonner gộp dữ liệu khi cập nhật cùng id, nên phải gán undefined để gỡ nút khi bị chặn
      action: blocker
        ? undefined
        : {
            label: 'Tải lại',
            onClick: () => {
              // Kiểm lại lúc bấm: giỏ có thể vừa có hàng ở tab khác của trang
              const now = updateBlocker(
                useCartStore.getState().tabs,
                useOfflineStore.getState().status,
              )
              if (now) {
                toast.warning(now)
                return
              }
              void updateServiceWorker(true)
            },
          },
    })
  }, [needRefresh, blocker, updateServiceWorker])

  return null
}
