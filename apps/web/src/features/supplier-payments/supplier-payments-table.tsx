import { moneyMethodLabel, type SupplierPaymentListItem } from '@kiotviet-lite/shared'

import { CancelledBadge } from '@/components/shared/cancel-document-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import { SupplierPaymentCancelButton } from './supplier-payment-cancel-button'

interface SupplierPaymentsTableProps {
  items: SupplierPaymentListItem[]
  canCancel?: boolean
}

function truncateNote(note: string | null): { display: string; full: string | null } {
  if (!note) return { display: '—', full: null }
  if (note.length <= 50) return { display: note, full: null }
  return { display: `${note.slice(0, 50)}...`, full: note }
}

export function SupplierPaymentsTable({ items, canCancel = false }: SupplierPaymentsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày tạo</TableHead>
            <TableHead>Nhà cung cấp</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead>Phiếu nhập</TableHead>
            <TableHead>Phương thức</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Người tạo</TableHead>
            {canCancel && <TableHead className="text-right">Thao tác</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const note = truncateNote(p.note)
            return (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{formatDateTime(p.createdAt)}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.supplierName ?? '(đã xoá)'}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {p.supplierPhone ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  <span
                    className={p.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}
                  >
                    {formatVndWithSuffix(p.amount)}
                  </span>
                  {p.status === 'cancelled' && <CancelledBadge className="ml-2" />}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.purchaseOrderCode ?? '—'}</TableCell>
                <TableCell className="text-sm">{moneyMethodLabel(p.paymentMethod)}</TableCell>
                <TableCell className="max-w-xs">
                  {note.full ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground cursor-help">
                            {note.display}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md whitespace-pre-wrap">
                          {note.full}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-sm text-muted-foreground">{note.display}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{p.createdByName ?? '—'}</TableCell>
                {canCancel && (
                  <TableCell className="text-right">
                    <SupplierPaymentCancelButton payment={p} />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
