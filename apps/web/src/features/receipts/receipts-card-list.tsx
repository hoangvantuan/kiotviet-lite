import { Eye } from 'lucide-react'

import type { ReceiptListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

interface ReceiptsCardListProps {
  items: ReceiptListItem[]
  onView: (id: string) => void
}

function truncate(text: string | null, max = 50): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

export function ReceiptsCardList({ items, onView }: ReceiptsCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
              <p className="truncate font-medium">{p.customerName ?? '(đã xoá)'}</p>
              <p className="text-xs text-muted-foreground font-mono">{p.customerPhone ?? '—'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold">{formatVndWithSuffix(p.amount)}</p>
              <p className="text-xs text-muted-foreground">{p.allocationCount} khoản</p>
            </div>
          </div>
          {p.note && <p className="text-xs text-muted-foreground mt-2">{truncate(p.note)}</p>}
          <div className="mt-2 flex items-center justify-between">
            {p.createdByName ? (
              <p className="text-xs text-muted-foreground">Người tạo: {p.createdByName}</p>
            ) : (
              <span />
            )}
            <Button variant="ghost" size="sm" onClick={() => onView(p.id)}>
              <Eye className="size-4 mr-1" /> Xem
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
