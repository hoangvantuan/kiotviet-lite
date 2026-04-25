import { toast } from 'sonner'

export function showSuccess(message: string) {
  toast.success(message, { duration: 3000 })
}

export function showError(message: string) {
  toast.error(message, { duration: 5000 })
}

export function showWarning(message: string) {
  toast.warning(message, { duration: 5000 })
}

export function showInfo(message: string) {
  toast.info(message, { duration: 3000 })
}
