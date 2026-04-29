import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounced } from '@/hooks/use-debounced'

import { useCategoriesQuery } from '../categories/use-categories'
import { useProductsQuery } from '../products/use-products'

export interface StockCheckPickerSelection {
  productId: string
  productName: string
  sku: string
  hasVariants: boolean
}

export interface StockCheckProductPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeProductIds: string[]
  onConfirm: (selections: StockCheckPickerSelection[]) => void
}

const MAX_BULK_SIZE = 1000

export function StockCheckProductPicker({
  open,
  onOpenChange,
  excludeProductIds,
  onConfirm,
}: StockCheckProductPickerProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'category' | 'search'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'none' | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)

  const allQuery = useProductsQuery({
    page: 1,
    pageSize: MAX_BULK_SIZE,
    status: 'active',
  })
  const categoryQuery = useProductsQuery({
    page: 1,
    pageSize: MAX_BULK_SIZE,
    status: 'active',
    categoryId: selectedCategoryId ?? undefined,
  })
  const searchQuery = useProductsQuery({
    page: 1,
    pageSize: 50,
    status: 'active',
    search: debouncedSearch.trim() || undefined,
  })
  const categoriesQuery = useCategoriesQuery({ enabled: open })

  const excludeSet = useMemo(() => new Set(excludeProductIds), [excludeProductIds])

  const filterTrackable = (items: ProductListItem[] | undefined): ProductListItem[] =>
    (items ?? []).filter((p) => p.trackInventory && !excludeSet.has(p.id))

  const allItems = filterTrackable(allQuery.data?.data)
  const categoryItems = filterTrackable(categoryQuery.data?.data)
  const searchItems = filterTrackable(searchQuery.data?.data)

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const reset = () => {
    setSelectedIds(new Set())
    setSearch('')
    setSelectedCategoryId(null)
    setActiveTab('all')
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = () => {
    if (selectedIds.size === 0) return
    const pool = new Map<string, ProductListItem>()
    for (const p of [...allItems, ...categoryItems, ...searchItems]) {
      pool.set(p.id, p)
    }
    const selections: StockCheckPickerSelection[] = []
    for (const id of selectedIds) {
      const p = pool.get(id)
      if (!p) continue
      selections.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        hasVariants: p.hasVariants,
      })
    }
    onConfirm(selections)
    reset()
    onOpenChange(false)
  }

  const renderList = (items: ProductListItem[], loading: boolean, emptyMsg: string) => {
    if (loading) {
      return (
        <div className="space-y-2 p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      )
    }
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground p-3">{emptyMsg}</p>
    }
    return (
      <div className="divide-y">
        {items.map((p) => {
          const checked = selectedIds.has(p.id)
          return (
            <label
              key={p.id}
              className="flex items-center gap-3 p-2 hover:bg-accent cursor-pointer"
            >
              <input
                type="checkbox"
                className="size-4"
                checked={checked}
                onChange={() => toggle(p.id)}
              />
              <span className="flex-1 truncate">
                <span className="font-medium">{p.name}</span>{' '}
                <span className="text-xs font-mono text-muted-foreground">{p.sku}</span>
                {p.hasVariants && (
                  <span className="ml-2 text-xs text-muted-foreground">(có biến thể)</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground font-mono">Tồn: {p.currentStock}</span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn sản phẩm để kiểm kho</DialogTitle>
          <DialogDescription>
            Tích chọn sản phẩm cần kiểm. Sản phẩm có biến thể sẽ yêu cầu chọn biến thể ở bước sau.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">Kiểm tất cả</TabsTrigger>
            <TabsTrigger value="category">Theo danh mục</TabsTrigger>
            <TabsTrigger value="search">Tìm SP</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            <div className="rounded-md border max-h-80 overflow-y-auto">
              {renderList(allItems, allQuery.isLoading, 'Không có sản phẩm theo dõi tồn kho.')}
            </div>
            {allItems.length >= MAX_BULK_SIZE && (
              <p className="text-xs text-amber-600 mt-2">
                Đã đạt giới hạn {MAX_BULK_SIZE} SP. Hãy dùng tab "Theo danh mục" hoặc "Tìm SP" để
                chọn chính xác hơn.
              </p>
            )}
          </TabsContent>

          <TabsContent value="category" className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('none')}
                className={`px-3 py-1 rounded-md border text-sm ${
                  selectedCategoryId === 'none' ? 'bg-primary text-primary-foreground' : ''
                }`}
              >
                Chưa phân loại
              </button>
              {(categoriesQuery.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`px-3 py-1 rounded-md border text-sm ${
                    selectedCategoryId === c.id ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="rounded-md border max-h-72 overflow-y-auto">
              {selectedCategoryId === null ? (
                <p className="text-sm text-muted-foreground p-3">Chọn danh mục để xem sản phẩm.</p>
              ) : (
                renderList(
                  categoryItems,
                  categoryQuery.isLoading,
                  'Danh mục này chưa có sản phẩm theo dõi tồn kho.',
                )
              )}
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên hoặc SKU"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="rounded-md border max-h-72 overflow-y-auto">
              {search.trim() ? (
                renderList(searchItems, searchQuery.isLoading, 'Không có kết quả phù hợp.')
              ) : (
                <p className="text-sm text-muted-foreground p-3">
                  Nhập tên hoặc SKU để bắt đầu tìm.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <span className="text-sm text-muted-foreground mr-auto">
            Đã chọn {selectedIds.size} sản phẩm
          </span>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={selectedIds.size === 0}>
            Thêm vào phiếu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
