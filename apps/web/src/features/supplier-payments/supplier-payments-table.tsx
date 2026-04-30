import type { SupplierPaymentListItem } from '@kiotviet-lite/shared'

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

interface SupplierPaymentsTableProps {
  items: SupplierPaymentListItem[]
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function truncateNote(note: string | null): { display: string; full: string | null } {
  if (!note) return { display: '—', full: null }
  if (note.length <= 50) return { display: note, full: null }
  return { display: `${note.slice(0, 50)}...`, full: note }
}

export function SupplierPaymentsTable({ items }: SupplierPaymentsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày tạo</TableHead>
            <TableHead>NCC</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Người tạo</TableHead>
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
                  {formatVndWithSuffix(p.amount)}
                </TableCell>
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
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
