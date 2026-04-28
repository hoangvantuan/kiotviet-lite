import { useState } from 'react'
import { Bell } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { LowStockPanel } from './low-stock-panel'
import { useLowStockCountQuery } from './use-products'

export function LowStockBell() {
  const [open, setOpen] = useState(false)
  const { data: count = 0 } = useLowStockCountQuery()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={count > 0 ? `${count} sản phẩm sắp hết hàng` : 'Sản phẩm sắp hết hàng'}
        onClick={() => setOpen(true)}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sản phẩm sắp hết ({count})</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <LowStockPanel enabled={open} onItemClick={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
