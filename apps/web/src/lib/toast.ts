import { toast } from 'sonner'

export function showSuccess(message: string) {
  toast.success(message, { duration: 3000 })
}

export function showError(message: string) {
  toast.error(message, { duration: 5000 })
}

/** Lỗi kèm một thao tác (ví dụ mở chứng từ để kiểm tra), để lâu hơn cho người dùng kịp bấm */
export function showErrorWithAction(
  message: string,
  action: { label: string; onClick: () => void },
) {
  toast.error(message, { duration: 15000, action })
}

export function showWarning(message: string) {
  toast.warning(message, { duration: 5000 })
}

export function showInfo(message: string) {
  toast.info(message, { duration: 3000 })
}
