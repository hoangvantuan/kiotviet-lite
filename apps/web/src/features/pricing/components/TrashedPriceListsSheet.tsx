import { RotateCcw, Tags } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useRestorePriceListMutation, useTrashedPriceListsQuery } from '../use-price-lists'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function TrashedPriceListsSheet({ open, onOpenChange }: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const trashedQuery = useTrashedPriceListsQuery(1, 100)
  const restore = useRestorePriceListMutation()

  const items = open ? (trashedQuery.data?.data ?? []) : []

  const onRestore = async (id: string) => {
    try {
      await restore.mutateAsync(id)
      showSuccess('Đã khôi phục bảng giá')
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isDesktop ? 'right' : 'bottom'} className="overflow-y-auto md:max-w-lg">
        <SheetHeader>
          <SheetTitle>Bảng giá đã xoá</SheetTitle>
          <SheetDescription>Khôi phục bảng giá đã xoá về danh sách chính.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-3">
          {trashedQuery.isLoading && open ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có bảng giá nào bị xoá.</p>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Tags className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.method === 'direct' ? 'Trực tiếp' : 'Công thức'} • {p.itemCount} sản phẩm
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(p.id)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Khôi phục</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
