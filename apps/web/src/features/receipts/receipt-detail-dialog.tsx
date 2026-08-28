import { Printer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import { ReceiptPrintTemplate } from './receipt-print-template'
import { useReceiptQuery } from './use-receipts'

interface ReceiptDetailDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  receiptId: string | null
}

export function ReceiptDetailDialog({ open, onOpenChange, receiptId }: ReceiptDetailDialogProps) {
  const { data: receipt, isLoading } = useReceiptQuery(open ? (receiptId ?? undefined) : undefined)

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu thu</DialogTitle>
            <DialogDescription>
              Thông tin phiếu thu và các khoản nợ đã được phân bổ.
            </DialogDescription>
          </DialogHeader>

          {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}

          {receipt && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-muted-foreground">Mã phiếu:</span>
                <span className="font-mono">{receipt.id.slice(-8).toUpperCase()}</span>

                <span className="text-muted-foreground">Ngày tạo:</span>
                <span>{formatDateTime(receipt.createdAt)}</span>

                <span className="text-muted-foreground">Khách hàng:</span>
                <span className="font-medium">{receipt.customerName ?? '(đã xoá)'}</span>

                <span className="text-muted-foreground">SĐT:</span>
                <span className="font-mono">{receipt.customerPhone ?? '—'}</span>

                <span className="text-muted-foreground">Người thu:</span>
                <span>{receipt.createdByName ?? '—'}</span>

                <span className="text-muted-foreground">Tổng thu:</span>
                <span className="font-bold">{formatVndWithSuffix(receipt.amount)}</span>
              </div>

              {receipt.note && (
                <div>
                  <p className="text-muted-foreground">Ghi chú:</p>
                  <p className="mt-1 whitespace-pre-wrap">{receipt.note}</p>
                </div>
              )}

              <div>
                <p className="font-medium mb-2">Phân bổ ({receipt.allocations.length} khoản nợ)</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">Mã đơn</th>
                        <th className="p-2 text-right">Số tiền</th>
                        <th className="p-2 text-right">Nợ sau</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.allocations.map((a) => (
                        <tr key={a.id} className="border-t">
                          <td className="p-2 font-mono text-xs">{a.orderCode}</td>
                          <td className="p-2 text-right">{formatVnd(a.amount)}</td>
                          <td className="p-2 text-right">
                            {a.debtRemainingAfter === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <>
                                {formatVnd(a.debtRemainingAfter)}
                                {a.debtRemainingAfter === 0 && (
                                  <Badge variant="secondary" className="ml-1">
                                    Tất toán
                                  </Badge>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            {receipt && (
              <Button onClick={handlePrint}>
                <Printer className="size-4 mr-1" /> In phiếu thu
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && receipt && <ReceiptPrintTemplate receipt={receipt} />}
    </>
  )
}
