import type { SupplierPaymentListItem } from '@kiotviet-lite/shared'

import { formatVndWithSuffix } from '@/lib/currency'

interface SupplierPaymentsCardListProps {
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

function truncate(text: string | null, max = 50): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

export function SupplierPaymentsCardList({ items }: SupplierPaymentsCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <div key={p.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
              <p className="truncate font-medium">{p.supplierName ?? '(đã xoá)'}</p>
              <p className="text-xs text-muted-foreground font-mono">{p.supplierPhone ?? '—'}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold">{formatVndWithSuffix(p.amount)}</p>
              {p.note && (
                <p className="text-xs text-muted-foreground max-w-[10rem] truncate">
                  {truncate(p.note)}
                </p>
              )}
            </div>
          </div>
          {p.createdByName && (
            <p className="text-xs text-muted-foreground mt-1">Người tạo: {p.createdByName}</p>
          )}
        </div>
      ))}
    </div>
  )
}
