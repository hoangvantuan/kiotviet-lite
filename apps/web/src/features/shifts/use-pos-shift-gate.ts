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

  // Chỉ xét nhắc ở lần đầu có số liệu ca khi vào POS. Vào lúc đang có ca rồi đóng ca thì không
  // tự bật hộp mở ca (đè lên biên bản đóng ca); bán tiếp mới nhắc, lúc bấm thanh toán.
  const hasData = !isOffline && currentShift.data !== undefined
  const checkedOnEntry = useRef(false)
  useEffect(() => {
    if (!hasData || checkedOnEntry.current) return
    checkedOnEntry.current = true
    if (shiftRequired) setOpenShiftOpen(true)
  }, [hasData, shiftRequired])

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
