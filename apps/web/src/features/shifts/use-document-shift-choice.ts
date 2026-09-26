import { useCallback, useState } from 'react'

import type { OpenShiftChoice } from '@kiotviet-lite/shared'

import { ApiClientError } from '@/lib/api-client'

type ShiftErrorDetails = { reason?: string; shifts?: OpenShiftChoice[] } | undefined

/**
 * POS-06: chứng từ tiền mặt do quản lý lập thay (phiếu trả, phiếu thu, phiếu chi) gắn vào ca của
 * thu ngân. Máy chủ tự chọn ca khi rõ ràng; cửa hàng có nhiều ca mở thì trả `shift_choice_required`
 * kèm danh sách ca, hộp thoại hiện ô chọn ca và gửi lại kèm `shiftId`.
 */
export function useDocumentShiftChoice() {
  const [choices, setChoices] = useState<OpenShiftChoice[] | null>(null)
  const [shiftId, setShiftId] = useState<string | null>(null)

  /** Trả true nếu lỗi là yêu cầu chọn ca (đã hiện ô chọn, không cần báo lỗi thêm). */
  const capture = useCallback((err: unknown): boolean => {
    if (!(err instanceof ApiClientError)) return false
    const details = err.details as ShiftErrorDetails
    if (details?.reason === 'shift_choice_required' && details.shifts?.length) {
      setChoices(details.shifts)
      setShiftId(null)
      return true
    }
    // Ca vừa chọn đã đóng: bỏ lựa chọn, lần gửi sau máy chủ phân giải lại
    if (details?.reason === 'shift_not_open') {
      setChoices(null)
      setShiftId(null)
    }
    return false
  }, [])

  const reset = useCallback(() => {
    setChoices(null)
    setShiftId(null)
  }, [])

  return {
    choices,
    shiftId,
    setShiftId,
    capture,
    reset,
    /** Đang chờ người dùng chọn ca: chưa cho gửi lại */
    pending: choices !== null && shiftId === null,
  }
}
