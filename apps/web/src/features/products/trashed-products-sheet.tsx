import { Package, RotateCcw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useRestoreProductMutation, useTrashedProductsQuery } from './use-products'

interface TrashedProductsSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function TrashedProductsTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <SheetTrigger asChild>
      <Button variant="outline" size="sm" onClick={onOpen}>
        <Trash2 className="h-4 w-4" />
        <span>Sản phẩm đã xoá</span>
      </Button>
    </SheetTrigger>
  )
}

export function TrashedProductsSheet({ open, onOpenChange }: TrashedProductsSheetProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const trashedQuery = useTrashedProductsQuery({ page: 1, pageSize: 100 }, open)
  const restoreMutation = useRestoreProductMutation()

  const items = trashedQuery.data?.data ?? []

  const onRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id)
      showSuccess('Đã khôi phục sản phẩm')
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
          <SheetTitle>Sản phẩm đã xoá</SheetTitle>
          <SheetDescription>Khôi phục sản phẩm đã xoá về danh sách chính.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-3">
          {trashedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có sản phẩm nào bị xoá.</p>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{p.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(p.id)}
                  disabled={restoreMutation.isPending}
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
