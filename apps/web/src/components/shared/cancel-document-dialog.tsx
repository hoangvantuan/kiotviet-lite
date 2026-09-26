import { type ReactNode, useEffect, useState } from 'react'

import { type CancelDocumentInput, hasPermission } from '@kiotviet-lite/shared'

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
import { PinDialog } from '@/features/auth/pin-dialog'
import { useAuthStore } from '@/stores/use-auth-store'

interface CancelDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ví dụ "Hủy phiếu thu PT-..." */
  title: string
  /** Hệ quả của việc hủy, nói rõ bút toán nào được đảo */
  description: ReactNode
  isPending: boolean
  /** Gửi yêu cầu hủy. Trả về khi xong; lỗi để nơi gọi báo (toast) */
  onConfirm: (input: CancelDocumentInput) => Promise<unknown>
  /**
   * TIEN-107: người không có quyền `documents.cancel` phải nhờ chủ hoặc quản lý nhập PIN. Đặt
   * false cho chứng từ mà máy chủ tự chặn theo vai trò (ví dụ phiếu chi chỉ chủ cửa hàng).
   */
  allowApproval?: boolean
  /** Ô nhập thêm dưới lý do (BC-06: phương thức hoàn tiền, ô chọn ca khi có nhiều ca mở) */
  children?: ReactNode
  /** Chặn nút xác nhận khi ô nhập thêm chưa đủ (ví dụ đang chờ chọn ca) */
  confirmDisabled?: boolean
}

/**
 * TIEN-107, KHO-11: hộp thoại hủy chứng từ dùng chung. Lý do bắt buộc; hủy không xóa chứng từ mà
 * đảo đúng các bút toán đã ghi.
 */
export function CancelDocumentDialog({
  open,
  onOpenChange,
  title,
  description,
  isPending,
  onConfirm,
  allowApproval = true,
  children,
  confirmDisabled = false,
}: CancelDocumentDialogProps) {
  const role = useAuthStore((s) => s.user?.role)
  const [reason, setReason] = useState('')
  const [pinOpen, setPinOpen] = useState(false)
  const needsApproval = allowApproval && !!role && !hasPermission(role, 'documents.cancel')
  const trimmed = reason.trim()

  useEffect(() => {
    if (!open) {
      setReason('')
      setPinOpen(false)
    }
  }, [open])

  const submit = async (approval?: { approverId: string; approverPin: string }) => {
    try {
      await onConfirm({ reason: trimmed, ...approval })
      onOpenChange(false)
    } catch {
      // Nơi gọi đã báo lỗi, giữ hộp thoại để sửa lý do hoặc thử lại
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isPending) return
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm text-muted-foreground">{description}</div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-document-reason">Lý do hủy</Label>
            <Textarea
              id="cancel-document-reason"
              value={reason}
              maxLength={500}
              rows={3}
              placeholder="Ví dụ: nhập nhầm khách, thu trùng"
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
            />
            {needsApproval && (
              <p className="text-xs text-muted-foreground">
                Bạn cần chủ cửa hàng hoặc quản lý nhập mã PIN để hủy.
              </p>
            )}
          </div>
          {children}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              disabled={trimmed.length === 0 || isPending || confirmDisabled}
              onClick={() => (needsApproval ? setPinOpen(true) : void submit())}
            >
              {isPending ? 'Đang hủy...' : 'Xác nhận hủy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {needsApproval && open && (
        <PinDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          title="Duyệt hủy chứng từ"
          description="Chủ cửa hàng hoặc quản lý nhập mã PIN của mình để duyệt."
          approvalPermissions={['documents.cancel']}
          onVerified={(pin, approverId) => {
            if (pin && approverId) void submit({ approverId, approverPin: pin })
          }}
        />
      )}
    </>
  )
}

/** Nhãn "Đã hủy" dùng chung cho danh sách chứng từ */
export function CancelledBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border border-destructive/40 px-2 py-0.5 text-xs font-semibold text-destructive ${className ?? ''}`}
    >
      Đã hủy
    </span>
  )
}
