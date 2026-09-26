import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useStoreQuery } from '@/features/settings/use-store-settings'

import { ShiftReport, ShiftReportPrint } from './shift-report'
import { useShiftQuery } from './use-shifts'

interface ShiftDetailDialogProps {
  shiftId: string | null
  onOpenChange: (open: boolean) => void
}

/** POS-06: xem và in lại biên bản của một ca. */
export function ShiftDetailDialog({ shiftId, onOpenChange }: ShiftDetailDialogProps) {
  const shiftQuery = useShiftQuery(shiftId)
  const storeQuery = useStoreQuery()
  const shift = shiftQuery.data
  const open = shiftId !== null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {shift?.status === 'open' ? 'Ca đang mở' : 'Biên bản đóng ca'}
            </DialogTitle>
            <DialogDescription>Số liệu tiền mặt và các kênh thanh toán của ca.</DialogDescription>
          </DialogHeader>
          {shiftQuery.isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
          {shiftQuery.isError && (
            <p className="text-sm text-destructive">Không tải được thông tin ca.</p>
          )}
          {shift && <ShiftReport shift={shift} />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            {shift?.status === 'closed' && (
              <Button onClick={() => window.print()}>
                <Printer className="mr-1 size-4" /> In biên bản
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && shift && <ShiftReportPrint shift={shift} storeName={storeQuery.data?.name} />}
    </>
  )
}
