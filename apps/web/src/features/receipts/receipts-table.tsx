import { Eye } from 'lucide-react'

import type { ReceiptListItem } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

interface ReceiptsTableProps {
  items: ReceiptListItem[]
  onView: (id: string) => void
}

function truncateNote(note: string | null): { display: string; full: string | null } {
  if (!note) return { display: '—', full: null }
  if (note.length <= 50) return { display: note, full: null }
  return { display: `${note.slice(0, 50)}...`, full: note }
}

export function ReceiptsTable({ items, onView }: ReceiptsTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày tạo</TableHead>
            <TableHead>Khách hàng</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead className="text-center">Số khoản</TableHead>
            <TableHead>Ghi chú</TableHead>
            <TableHead>Người tạo</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const note = truncateNote(p.note)
            return (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{formatDateTime(p.createdAt)}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.customerName ?? '(đã xoá)'}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {p.customerPhone ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatVndWithSuffix(p.amount)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{p.allocationCount}</Badge>
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
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onView(p.id)}>
                    <Eye className="size-4 mr-1" /> Xem
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
