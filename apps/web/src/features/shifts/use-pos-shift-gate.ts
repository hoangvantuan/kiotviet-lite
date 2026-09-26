import { useCallback, useEffect, useRef, useState } from 'react'

import { useCurrentShiftQuery } from './use-shifts'

/**
 * POS-06: cửa hàng dùng ca thì người bán phải mở ca trước khi bán. Mất mạng thì không chặn: đơn
 * ngoại tuyến gắn ca theo giờ bán và người bán khi đồng bộ, không khớp ca nào thì hiện trong đối
 * soát. Máy chủ vẫn là nơi quyết định (từ chối đơn với lý do `shift_required`), hook này chỉ để
 * người bán mở ca trước thay vì bấm thanh toán mới biết.
 */
export function usePosShiftGate(isOffline: boolean) {
  const currentShift = useCurrentShiftQuery()
  const { refetch } = currentShift
  const [openShiftOpen, setOpenShiftOpen] = useState(false)
  const shiftRequired =
    !isOffline && currentShift.data?.shiftsEnabled === true && !currentShift.data.shift

  // Nhắc một lần khi vào POS; sau đó (ví dụ vừa đóng ca) nhắc lại lúc bấm thanh toán
  const prompted = useRef(false)
  useEffect(() => {
    if (shiftRequired && !prompted.current) {
      prompted.current = true
      setOpenShiftOpen(true)
    }
  }, [shiftRequired])

  /** Được bán thì trả true; chưa mở ca thì mở hộp mở ca và trả false. */
  const ensureShift = useCallback(() => {
    if (!shiftRequired) return true
    setOpenShiftOpen(true)
    return false
  }, [shiftRequired])

  /** Máy chủ từ chối đơn vì chưa có ca (ca vừa đóng ở máy khác, cửa hàng vừa bật ca). */
  const handleShiftRequired = useCallback(() => {
    void refetch()
    setOpenShiftOpen(true)
  }, [refetch])

  return {
    currentShift,
    shiftRequired,
    openShiftOpen,
    setOpenShiftOpen,
    ensureShift,
    handleShiftRequired,
  }
}
