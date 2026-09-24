import { useCallback } from 'react'
import { Tag } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCartStore } from '@/stores/use-cart-store'
import { useOfflineStore } from '@/stores/use-offline-store'

import { repriceTabAction } from '../hooks/use-auto-reprice'
import { usePosPriceLists } from '../pos-pricing-api'

const CUSTOMER_DEFAULT_VALUE = '__customer_default__'

interface PriceListSelectProps {
  className?: string
}

export function PriceListSelect({ className }: PriceListSelectProps) {
  const activeTab = useCartStore((s) => s.activeTab)
  const priceListId = useCartStore((s) => s.tabs[s.activeTab]?.priceListId ?? null)
  const setPriceList = useCartStore((s) => s.setPriceList)

  const offlineStatus = useOfflineStore((s) => s.status)
  const isOffline =
    offlineStatus === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)

  const { data: priceLists = [], isLoading } = usePosPriceLists()

  const handleValueChange = useCallback(
    (value: string) => {
      if (value === CUSTOMER_DEFAULT_VALUE) {
        setPriceList(null)
      } else {
        const found = priceLists.find((pl) => pl.id === value)
        if (found) {
          setPriceList({ id: found.id, name: found.name })
        }
      }
      // Trigger instant reprice on active tab
      repriceTabAction(activeTab)
    },
    [activeTab, priceLists, setPriceList],
  )

  const currentValue = priceListId ?? CUSTOMER_DEFAULT_VALUE

  return (
    <div className={className} data-testid="pos-price-list-select-container">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Tag className="h-3.5 w-3.5" />
        <span>Bảng giá</span>
        {isOffline && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            (Ngoại tuyến: khoá chọn)
          </span>
        )}
      </div>
      <Select
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={isOffline || isLoading}
      >
        <SelectTrigger
          data-testid="pos-price-list-select"
          className="h-9 w-full text-xs font-medium"
          title={isOffline ? 'Đang ngoại tuyến, không thể thay đổi bảng giá' : 'Chọn bảng giá'}
        >
          <SelectValue placeholder="Theo khách hàng" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUSTOMER_DEFAULT_VALUE}>Theo khách hàng</SelectItem>
          {priceLists.map((pl) => (
            <SelectItem key={pl.id} value={pl.id}>
              {pl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
