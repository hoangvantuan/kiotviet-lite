import { Printer } from 'lucide-react'

import type { ReceiptDetail } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVndWithSuffix } from '@/lib/currency'

import { ReceiptPrintTemplate } from './receipt-print-template'

interface ReceiptSuccessDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  receipt: ReceiptDetail | null
}

export function ReceiptSuccessDialog({ open, onOpenChange, receipt }: ReceiptSuccessDialogProps) {
  if (!receipt) return null

  const debtBefore = receipt.debtAfter !== null ? receipt.debtAfter + receipt.amount : null

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đã tạo phiếu thu thành công</DialogTitle>
            <DialogDescription>
              Phiếu thu đã được lưu và công nợ KH đã được cập nhật.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Khách hàng:</span>
              <span className="font-medium">
                {receipt.customerName ?? '—'}{' '}
                {receipt.customerPhone ? `(${receipt.customerPhone})` : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số tiền:</span>
              <span className="text-lg font-bold">{formatVndWithSuffix(receipt.amount)}</span>
            </div>
            {debtBefore !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nợ trước:</span>
                <span>{formatVndWithSuffix(debtBefore)}</span>
              </div>
            )}
            {receipt.debtAfter !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nợ sau:</span>
                <span className="font-semibold">{formatVndWithSuffix(receipt.debtAfter)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Số khoản phân bổ:</span>
              <span>{receipt.allocations.length}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="size-4 mr-1" /> In phiếu thu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && <ReceiptPrintTemplate receipt={receipt} />}
    </>
  )
}
