import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'

import type { ShiftDetail } from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStoreQuery } from '@/features/settings/use-store-settings'
import { useGuardedOpenChange } from '@/hooks/use-document-mutation'
import { handleApiError } from '@/lib/api-error'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'
import { showSuccess } from '@/lib/toast'

import { differenceLabel } from './shift-format'
import { ShiftCashLines, ShiftReport, ShiftReportPrint } from './shift-report'
import { useCloseShiftMutation } from './use-shifts'

interface CloseShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: ShiftDetail
}

/**
 * POS-06: đóng ca. Người bán đếm tiền mặt trong ngăn kéo và nhập; máy chủ tính lại tiền mặt phải
 * có từ chứng từ của ca lúc đóng (không dùng số đang hiện trên máy), trả chênh lệch và biên bản.
 */
export function CloseShiftDialog({ open, onOpenChange, shift }: CloseShiftDialogProps) {
  const mutation = useCloseShiftMutation()
  const handleOpenChange = useGuardedOpenChange(onOpenChange, mutation)
  const storeQuery = useStoreQuery()
  const [countedCash, setCountedCash] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [closed, setClosed] = useState<ShiftDetail | null>(null)

  useEffect(() => {
    if (open) {
      setCountedCash(null)
      setNote('')
      setClosed(null)
    }
  }, [open])

  const previewDifference = countedCash === null ? null : countedCash - shift.summary.expectedCash

  const submit = async () => {
    if (countedCash === null) return
    try {
      const result = await mutation.mutateAsync({
        shiftId: shift.id,
        input: { countedCash, note: note.trim() || null },
      })
      setClosed(result.data)
      showSuccess('Đã đóng ca')
    } catch (err) {
      handleApiError(err)
    }
  }

  if (closed) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Biên bản đóng ca</DialogTitle>
              <DialogDescription>
                Ca đã đóng lúc {formatDateTime(closed.closedAt)}. Mở ca mới khi bắt đầu bán tiếp.
              </DialogDescription>
            </DialogHeader>
            <ShiftReport shift={closed} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="mr-1 size-4" /> In biên bản
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {open && <ShiftReportPrint shift={closed} storeName={storeQuery.data?.name} />}
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        data-testid="close-shift-dialog"
      >
        <DialogHeader>
          <DialogTitle>Đóng ca bán hàng</DialogTitle>
          <DialogDescription>
            Ca mở lúc {formatDateTime(shift.openedAt)}. Đếm tiền mặt trong ngăn kéo rồi nhập số thực
            đếm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ShiftCashLines summary={shift.summary} />
          <div className="space-y-2">
            <Label htmlFor="shift-counted-cash">
              Tiền mặt thực đếm <span className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="shift-counted-cash"
              value={countedCash}
              onChange={setCountedCash}
              placeholder="0"
              className="h-11"
              autoFocus
            />
            {previewDifference !== null && (
              <p className="text-sm" data-testid="shift-difference-preview">
                Chênh lệch dự kiến:{' '}
                <span className="font-semibold">{differenceLabel(previewDifference)}</span>
                {previewDifference !== 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    (phải có {formatVndWithSuffix(shift.summary.expectedCash)})
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift-close-note">Ghi chú</Label>
            <Textarea
              id="shift-close-note"
              rows={2}
              maxLength={500}
              placeholder="VD: lý do chênh lệch"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={countedCash === null || mutation.isPending}
          >
            {mutation.isPending ? 'Đang đóng ca...' : 'Đóng ca'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
