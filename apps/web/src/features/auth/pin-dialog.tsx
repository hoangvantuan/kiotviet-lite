import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'

import {
  type ApprovalPermissionInput,
  hasPermission,
  PERMISSIONS,
  type UserRole,
} from '@kiotviet-lite/shared'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVerifyPin } from '@/features/users/use-verify-pin'
import { apiClient, ApiClientError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'
import { useOfflineStore } from '@/stores/use-offline-store'

interface PinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** approverId chỉ có ở chế độ duyệt: người đã nhập PIN (có thể khác người đang bán) */
  onVerified: (pin?: string, approverId?: string) => void
  title?: string
  description?: string
  /**
   * POS-01, POS-04: chế độ duyệt. Người bán chọn người giữ đủ các quyền này rồi người đó nhập
   * PIN của mình. Mặc định chọn chính người đang đăng nhập nếu họ đủ quyền.
   */
  approvalPermissions?: ApprovalPermissionInput[]
}

interface ApproverOption {
  id: string
  name: string
  role: UserRole
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Chủ cửa hàng',
  manager: 'Quản lý',
  staff: 'Nhân viên',
}

/** Quyền ít vai trò nhất: dùng để lọc danh sách người duyệt ở máy chủ */
function narrowestPermission(perms: ApprovalPermissionInput[]): ApprovalPermissionInput {
  return perms.reduce((a, b) => (PERMISSIONS[b].length < PERMISSIONS[a].length ? b : a))
}

function useApprovers(perms: ApprovalPermissionInput[] | undefined, enabled: boolean) {
  const key = perms ? [...perms].sort().join(',') : ''
  return useQuery({
    queryKey: ['pos-approvers', key],
    enabled: enabled && !!perms && perms.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const perm = narrowestPermission(perms!)
      const res = await apiClient.get<{ data: ApproverOption[] }>(
        `/api/v1/pos/approvers?permission=${encodeURIComponent(perm)}`,
      )
      return res.data.filter((u) => perms!.every((p) => hasPermission(u.role, p)))
    },
  })
}

function useIsOffline(): boolean {
  const status = useOfflineStore((s) => s.status)
  return status === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)
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
  approvalPermissions,
}: PinDialogProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinErrorState | null>(null)
  const [approverId, setApproverId] = useState<string | null>(null)
  const verify = useVerifyPin()
  const isOffline = useIsOffline()
  const currentUser = useAuthStore((s) => s.user)
  const approvalMode = !!approvalPermissions && approvalPermissions.length > 0
  const approvers = useApprovers(approvalPermissions, open && approvalMode && !isOffline)
  const approverList = useMemo(() => approvers.data ?? [], [approvers.data])

  const verifyReset = verify.reset
  useEffect(() => {
    if (!open) {
      setPin('')
      setError(null)
      setApproverId(null)
      verifyReset()
    }
  }, [open, verifyReset])

  // Mặc định: chính người đang bán nếu đủ quyền (không cần chờ danh sách), không thì người đầu
  // danh sách. Máy chủ vẫn kiểm lại quyền và PIN.
  const selfCanApprove =
    approvalMode &&
    !!currentUser &&
    approvalPermissions!.every((p) => hasPermission(currentUser.role, p))
  useEffect(() => {
    if (!open || !approvalMode || approverId) return
    if (selfCanApprove && currentUser) {
      setApproverId(currentUser.id)
      return
    }
    if (approverList.length > 0) setApproverId(approverList[0]!.id)
  }, [open, approvalMode, approverId, approverList, selfCanApprove, currentUser])

  const isLocked = error?.lockedUntil !== null && error?.lockedUntil !== undefined
  const countdown = useCountdown(error?.lockedUntil ?? null)

  useEffect(() => {
    if (isLocked && countdown === '00:00') {
      setError(null)
    }
  }, [isLocked, countdown])

  const submit = async (value: string) => {
    if (value.length !== 6 || isLocked || isOffline) return
    if (approvalMode && !approverId) return
    try {
      if (approvalMode) {
        await verify.mutateAsync({
          pin: value,
          userId: approverId!,
          permissions: approvalPermissions,
        })
        onVerified(value, approverId!)
      } else {
        await verify.mutateAsync({ pin: value })
        onVerified(value)
      }
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'BUSINESS_RULE_VIOLATION' || err.code === 'LOCKED') {
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
      // OFF-12: mất mạng giữa chừng thì báo rõ, không treo
      setError({
        message: isOffline
          ? 'Mất kết nối mạng, không xác thực được PIN'
          : 'Không xác thực được PIN. Kiểm tra kết nối mạng rồi thử lại',
        lockedUntil: null,
      })
      setPin('')
    }
  }

  const noApprover = approvalMode && !approvers.isLoading && approverList.length === 0
  const inputDisabled = isLocked || verify.isPending || isOffline || (approvalMode && !approverId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {isOffline && (
            <div
              role="alert"
              className="flex w-full items-start gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Cần kết nối mạng để xác thực PIN. Đơn bán ngoại tuyến vẫn được lưu và sẽ được gắn cờ
                chờ chủ cửa hàng xem lại khi đồng bộ.
              </span>
            </div>
          )}

          {approvalMode && !isOffline && (
            <div className="w-full space-y-1.5">
              <Label htmlFor="pin-approver">Người duyệt</Label>
              <Select
                value={approverId ?? undefined}
                onValueChange={(v) => {
                  setApproverId(v)
                  setPin('')
                  setError(null)
                }}
                disabled={approvers.isLoading || verify.isPending}
              >
                <SelectTrigger id="pin-approver">
                  <SelectValue
                    placeholder={approvers.isLoading ? 'Đang tải...' : 'Chọn người duyệt'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {approverList.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noApprover && (
                <p className="text-xs text-destructive">
                  Chưa có ai đủ quyền duyệt và đã đặt mã PIN trong cửa hàng.
                </p>
              )}
              {approvers.isError && (
                <p className="text-xs text-destructive">Không tải được danh sách người duyệt.</p>
              )}
            </div>
          )}

          <InputOTP
            maxLength={6}
            value={pin}
            disabled={inputDisabled}
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
