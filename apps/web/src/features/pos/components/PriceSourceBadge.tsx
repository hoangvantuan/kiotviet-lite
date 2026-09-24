import { PRICE_SOURCE_LABELS, type PriceSource } from '@kiotviet-lite/shared'

import { cn } from '@/lib/utils'

const SOURCE_COLORS: Record<PriceSource, string> = {
  customer_price: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  category_discount: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  manual_override: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  volume_price: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  price_list: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  retail_price: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export interface PriceSourceBadgeProps {
  source: PriceSource
  sourceDetail: string | null
  isFallback?: boolean
}

export function PriceSourceBadge({ source, sourceDetail, isFallback }: PriceSourceBadgeProps) {
  const fallbackActive =
    Boolean(isFallback) ||
    (sourceDetail !== null &&
      (sourceDetail.startsWith('Giá dự phòng') || sourceDetail.includes('dự phòng')))

  return (
    <span
      data-testid="price-source-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        fallbackActive
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
          : SOURCE_COLORS[source],
      )}
      title={sourceDetail ?? undefined}
    >
      {fallbackActive
        ? `Giá dự phòng: ${PRICE_SOURCE_LABELS[source]}`
        : PRICE_SOURCE_LABELS[source]}
    </span>
  )
}
