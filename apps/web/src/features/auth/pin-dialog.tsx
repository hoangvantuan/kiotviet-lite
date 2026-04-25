import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useVerifyPin } from '@/features/users/use-verify-pin'
import { ApiClientError } from '@/lib/api-client'

interface PinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void
  title?: string
  description?: string
}

interface PinErrorState {
  message: string
  lockedUntil: Date | null
}

export function PinDialog({
  open,
  onOpenChange,
  onVerified,
  title = 'Xác thực PIN',
  description = 'Nhập mã PIN 6 chữ số để tiếp tục.',
}: PinDialogProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinErrorState | null>(null)
  const verify = useVerifyPin()

  const verifyReset = verify.reset
  useEffect(() => {
    if (!open) {
      setPin('')
      setError(null)
      verifyReset()
    }
  }, [open, verifyReset])

  const isLocked = error?.lockedUntil !== null && error?.lockedUntil !== undefined
  const countdown = useCountdown(error?.lockedUntil ?? null)

  useEffect(() => {
    if (isLocked && countdown === '00:00') {
      setError(null)
    }
  }, [isLocked, countdown])

  const submit = async (value: string) => {
    if (value.length !== 6 || isLocked) return
    try {
      await verify.mutateAsync({ pin: value })
      onVerified()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'BUSINESS_RULE_VIOLATION') {
          const detail = err.details as { lockedUntil?: string } | undefined
          const lockedUntil = detail?.lockedUntil ? new Date(detail.lockedUntil) : null
          setError({
            message: err.message,
            lockedUntil: lockedUntil ?? new Date(Date.now() + 15 * 60 * 1000),
          })
        } else {
          setError({ message: err.message, lockedUntil: null })
        }
        setPin('')
        return
      }
      setError({ message: 'Đã xảy ra lỗi không xác định', lockedUntil: null })
      setPin('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <InputOTP
            maxLength={6}
            value={pin}
            disabled={isLocked || verify.isPending}
            autoFocus
            onChange={(value) => {
              setPin(value)
              setError(null)
              if (value.length === 6) {
                void submit(value)
              }
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          {error && !isLocked && <p className="text-sm text-destructive">{error.message}</p>}
          {isLocked && (
            <div className="space-y-1 text-center">
              <p className="text-sm text-destructive">{error?.message}</p>
              <p className="text-xs text-muted-foreground">Mở khoá sau {countdown}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={verify.isPending}
          >
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function useCountdown(target: Date | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  return useMemo(() => {
    if (!target) return '00:00'
    const diff = Math.max(0, target.getTime() - now)
    const mm = Math.floor(diff / 60000)
    const ss = Math.floor((diff % 60000) / 1000)
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }, [target, now])
}
