import { useState } from 'react'
import { Clock } from 'lucide-react'

import type { CurrentShiftResponse, ShiftDetail } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/date'

import { CloseShiftDialog } from './close-shift-dialog'

interface ShiftControlProps {
  current: CurrentShiftResponse | undefined
  onOpenShift: () => void
  /** Lấy số ca mới nhất trước khi mở hộp đóng ca */
  onRefresh: () => Promise<{ data?: CurrentShiftResponse }>
}

/** POS-06: nút ca trên thanh đầu POS: mở ca khi chưa có, đóng ca khi đang mở. */
export function ShiftControl({ current, onOpenShift, onRefresh }: ShiftControlProps) {
  // Giữ ca đang đóng riêng: đóng xong thì ca hiện tại về null nhưng biên bản vẫn phải hiện
  const [closing, setClosing] = useState<ShiftDetail | null>(null)
  const [closeOpen, setCloseOpen] = useState(false)

  const closeDialog = closing && (
    <CloseShiftDialog
      open={closeOpen}
      onOpenChange={(next) => {
        setCloseOpen(next)
        if (!next) setClosing(null)
      }}
      shift={closing}
    />
  )

  if (!current) return closeDialog || null
  const { shift, shiftsEnabled } = current

  if (!shift) {
    if (!shiftsEnabled) return closeDialog || null
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={onOpenShift}
        >
          <Clock className="h-3.5 w-3.5" /> Mở ca
        </Button>
        {closeDialog}
      </>
    )
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        title={`Ca mở lúc ${formatDateTime(shift.openedAt)}`}
        data-testid="shift-control"
        onClick={async () => {
          const fresh = await onRefresh()
          setClosing(fresh.data?.shift ?? shift)
          setCloseOpen(true)
        }}
      >
        <Clock className="h-3.5 w-3.5" /> Đóng ca
      </Button>
      {closeDialog}
    </>
  )
}
