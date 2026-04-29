import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useCartStore } from '@/stores/use-cart-store'

import { MAX_CART_TABS } from '../constants'

export function CartTabBar() {
  const activeTab = useCartStore((s) => s.activeTab)
  const setActiveTab = useCartStore((s) => s.setActiveTab)
  const tabs = useCartStore((s) => s.tabs)

  const tabNumbers = Array.from({ length: MAX_CART_TABS }, (_, i) => i + 1)

  return (
    <div
      role="tablist"
      aria-label="Danh sách đơn hàng"
      className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1"
    >
      {tabNumbers.map((tabNum) => {
        const isActive = tabNum === activeTab
        const count = tabs[tabNum]?.items.length ?? 0
        const isEmpty = count === 0

        return (
          <button
            key={tabNum}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Đơn ${tabNum}${count > 0 ? `, ${count} sản phẩm` : ', trống'}`}
            onClick={() => setActiveTab(tabNum)}
            className={cn(
              'flex h-9 min-w-[44px] flex-1 items-center justify-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span>Đơn {tabNum}</span>
            {isEmpty ? (
              <Plus
                aria-hidden="true"
                className={cn(
                  'h-3 w-3 opacity-50',
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              />
            ) : (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-primary/20 text-primary',
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
