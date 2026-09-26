import { moneyMethodLabel, type SupplierPaymentListItem } from '@kiotviet-lite/shared'

import { CancelledBadge } from '@/components/shared/cancel-document-dialog'
import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'

import { SupplierPaymentCancelButton } from './supplier-payment-cancel-button'

interface SupplierPaymentsCardListProps {
  items: SupplierPaymentListItem[]
  canCancel?: boolean
}

function truncate(text: string | null, max = 50): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

export function SupplierPaymentsCardList({
  items,
  canCancel = false,
}: SupplierPaymentsCardListProps) {
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
              <p
                className={`font-semibold ${p.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}
              >
                {formatVndWithSuffix(p.amount)}
              </p>
              {p.status === 'cancelled' && <CancelledBadge />}
              <p className="text-xs text-muted-foreground">{moneyMethodLabel(p.paymentMethod)}</p>
              {p.note && (
                <p className="text-xs text-muted-foreground max-w-[10rem] truncate">
                  {truncate(p.note)}
                </p>
              )}
            </div>
          </div>
          {p.purchaseOrderCode && (
            <p className="text-xs text-muted-foreground mt-1">
              Phiếu nhập: <span className="font-mono">{p.purchaseOrderCode}</span>
            </p>
          )}
          <div className="mt-1 flex items-center justify-between">
            {p.createdByName ? (
              <p className="text-xs text-muted-foreground">Người tạo: {p.createdByName}</p>
            ) : (
              <span />
            )}
            {canCancel && <SupplierPaymentCancelButton payment={p} />}
          </div>
        </div>
      ))}
    </div>
  )
}
