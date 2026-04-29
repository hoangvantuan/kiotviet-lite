import { useEffect, useMemo, useState } from 'react'

import type { ProductListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProductsQuery } from '@/features/products/use-products'
import { useDebounced } from '@/hooks/use-debounced'
import { formatVnd } from '@/lib/currency'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPick: (product: ProductListItem) => void
}

export function SelectProductForVolumePricesDialog({ open, onOpenChange, onPick }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const trimmed = debouncedSearch.trim()
  const productsQuery = useProductsQuery({
    status: 'active',
    pageSize: 50,
    page: 1,
    ...(trimmed.length > 0 ? { search: trimmed } : {}),
  })
  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn sản phẩm</DialogTitle>
          <DialogDescription>Chọn sản phẩm để thiết lập giá theo số lượng.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Tìm theo tên hoặc SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
            {productsQuery.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
            ) : products.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Không tìm thấy sản phẩm.</p>
            ) : (
              <ul className="divide-y">
                {products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                      onClick={() => {
                        onPick(p)
                        onOpenChange(false)
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">SKU {p.sku}</div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        {formatVnd(p.sellingPrice)}đ
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
