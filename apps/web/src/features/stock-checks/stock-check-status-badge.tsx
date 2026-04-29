import type { StockCheckStatus } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'

const LABELS: Record<StockCheckStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
}

export function StockCheckStatusBadge({ status }: { status: StockCheckStatus }) {
  if (status === 'confirmed') {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">
        {LABELS[status]}
      </Badge>
    )
  }
  return (
    <Badge className="bg-gray-100 text-gray-700 border-gray-200" variant="outline">
      {LABELS[status]}
    </Badge>
  )
}
