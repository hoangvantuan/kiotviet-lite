import { useEffect, useState } from 'react'

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
import { useGuardedOpenChange } from '@/hooks/use-document-mutation'
import { ApiClientError } from '@/lib/api-client'
import { handleApiError } from '@/lib/api-error'
import { showSuccess } from '@/lib/toast'

import { useOpenShiftMutation } from './use-shifts'

interface OpenShiftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** POS-06: mở ca với tiền quỹ đầu ca (tiền lẻ để sẵn trong ngăn kéo). */
export function OpenShiftDialog({ open, onOpenChange }: OpenShiftDialogProps) {
  const mutation = useOpenShiftMutation()
  const handleOpenChange = useGuardedOpenChange(onOpenChange, mutation)
  const [openingCash, setOpeningCash] = useState<number | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setOpeningCash(null)
      setNote('')
    }
  }, [open])

  const submit = async () => {
    if (openingCash === null) return
    try {
      await mutation.mutateAsync({ openingCash, note: note.trim() || null })
      showSuccess('Đã mở ca bán hàng')
      onOpenChange(false)
    } catch (err) {
      // Đã có ca mở (mở ở máy khác): tải lại trạng thái ca là đủ, không cần mở thêm
      if (
        err instanceof ApiClientError &&
        (err.details as { reason?: string } | undefined)?.reason === 'shift_already_open'
      ) {
        onOpenChange(false)
      }
      handleApiError(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="open-shift-dialog">
        <DialogHeader>
          <DialogTitle>Mở ca bán hàng</DialogTitle>
          <DialogDescription>
            Cửa hàng dùng ca bán hàng. Đếm tiền lẻ có sẵn trong ngăn kéo và nhập làm tiền quỹ đầu ca
            trước khi bán.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-opening-cash">
              Tiền quỹ đầu ca <span className="text-destructive">*</span>
            </Label>
            <CurrencyInput
              id="shift-opening-cash"
              value={openingCash}
              onChange={setOpeningCash}
              placeholder="0"
              className="h-11"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift-open-note">Ghi chú</Label>
            <Textarea
              id="shift-open-note"
              rows={2}
              maxLength={500}
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
            Để sau
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={openingCash === null || mutation.isPending}
          >
            {mutation.isPending ? 'Đang mở ca...' : 'Mở ca'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
