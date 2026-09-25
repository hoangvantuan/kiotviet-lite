import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_TOAST_ID = 'pwa-update'
// Máy bán hàng thường mở app cả ngày, không tải lại trang, nên phải tự hỏi bản mới định kỳ
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Báo có phiên bản mới và để người dùng chọn lúc tải lại (OFF-18), thay cho việc service
 * worker mới tự chiếm quyền giữa lúc đang bán. Giỏ POS được lưu bền nên tải lại không mất đơn.
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

  useEffect(() => {
    if (!needRefresh) return
    toast.info('Đã có phiên bản mới', {
      id: UPDATE_TOAST_ID,
      description: 'Tải lại khi thuận tiện, các đơn đang mở vẫn được giữ.',
      duration: Infinity,
      action: { label: 'Tải lại', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
