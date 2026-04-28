import type { PriceListListItem } from '@kiotviet-lite/shared'

import { Badge } from '@/components/ui/badge'

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

interface Props {
  priceList: PriceListListItem
}

export function PriceListStatusBadge({ priceList }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  if (!priceList.isActive) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        Đã tắt
      </Badge>
    )
  }
  if (priceList.effectiveFrom && today < priceList.effectiveFrom) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-50 text-amber-700"
        title={`Có hiệu lực từ ${formatDate(priceList.effectiveFrom)}`}
      >
        Chưa hiệu lực
      </Badge>
    )
  }
  if (priceList.effectiveTo && today > priceList.effectiveTo) {
    return (
      <Badge
        variant="outline"
        className="bg-muted text-muted-foreground"
        title={`Đã hết hạn từ ${formatDate(priceList.effectiveTo)}`}
      >
        Hết hiệu lực
      </Badge>
    )
  }
  if (priceList.effectiveActive) {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-50 text-emerald-700">
        Đang áp dụng
      </Badge>
    )
  }
  return <Badge variant="outline">Không xác định</Badge>
}
