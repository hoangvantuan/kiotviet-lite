import { useState } from 'react'
import { Ban, Printer } from 'lucide-react'

import { debtSourceLabel } from '@kiotviet-lite/shared'

import { CancelDocumentDialog, CancelledBadge } from '@/components/shared/cancel-document-dialog'
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
import { handleApiError } from '@/lib/api-error'
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import { ReceiptPrintTemplate } from './receipt-print-template'
import { useCancelReceiptMutation, useReceiptQuery } from './use-receipts'

interface ReceiptDetailDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  receiptId: string | null
}

export function ReceiptDetailDialog({ open, onOpenChange, receiptId }: ReceiptDetailDialogProps) {
  const { data: receipt, isLoading } = useReceiptQuery(open ? (receiptId ?? undefined) : undefined)
  const [cancelOpen, setCancelOpen] = useState(false)
  const cancelMutation = useCancelReceiptMutation()
  const cancelled = receipt?.status === 'cancelled'

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Chi tiết phiếu thu {cancelled && <CancelledBadge />}
            </DialogTitle>
            <DialogDescription>
              Thông tin phiếu thu và các khoản nợ đã được phân bổ.
            </DialogDescription>
          </DialogHeader>

          {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}

          {receipt && (
            <div className="space-y-4 text-sm">
              {cancelled && (
                <div
                  role="status"
                  className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive"
                >
                  <p className="font-medium">
                    Phiếu đã hủy lúc{' '}
                    {receipt.cancelledAt ? formatDateTime(receipt.cancelledAt) : ''}
                    {receipt.cancelledByName ? ` bởi ${receipt.cancelledByName}` : ''}
                  </p>
                  {receipt.cancelReason && <p className="mt-1">Lý do: {receipt.cancelReason}</p>}
                  <p className="mt-1 text-xs">
                    Số tiền đã được cộng lại vào công nợ khách, không còn tính vào báo cáo.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-y-2">
                <span className="text-muted-foreground">Mã phiếu:</span>
                <span className="font-mono">{receipt.id.slice(-8).toUpperCase()}</span>

                <span className="text-muted-foreground">Ngày tạo:</span>
                <span>{formatDateTime(receipt.createdAt)}</span>

                <span className="text-muted-foreground">Khách hàng:</span>
                <span className="font-medium">{receipt.customerName ?? '(đã xoá)'}</span>
                <span className="text-muted-foreground">Mã khách hàng:</span>
                <span className="font-mono">{receipt.customerCode ?? '—'}</span>

                <span className="text-muted-foreground">Số điện thoại:</span>
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
                          <td className="p-2 font-mono text-xs">{debtSourceLabel(a)}</td>
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
            {receipt && !cancelled && (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4 mr-1" /> Hủy phiếu thu
              </Button>
            )}
            {receipt && (
              <Button onClick={handlePrint}>
                <Printer className="size-4 mr-1" /> In phiếu thu
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {open && receipt && <ReceiptPrintTemplate receipt={receipt} />}
      {receipt && (
        <CancelDocumentDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title="Hủy phiếu thu"
          description={
            <p>
              Phiếu thu {formatVndWithSuffix(receipt.amount)} của{' '}
              {receipt.customerName ?? 'khách hàng'} sẽ được đánh dấu đã hủy. Số tiền này cộng lại
              vào công nợ khách theo đúng các khoản đã phân bổ.
            </p>
          }
          isPending={cancelMutation.isPending}
          onConfirm={async (input) => {
            try {
              await cancelMutation.mutateAsync({ id: receipt.id, input })
            } catch (err) {
              handleApiError(err)
              throw err
            }
          }}
        />
      )}
    </>
  )
}
