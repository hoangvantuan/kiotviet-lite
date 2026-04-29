import { useMemo, useState } from 'react'
import { Layers, Plus, SearchX } from 'lucide-react'

import type {
  ListVolumePricesQuery,
  ProductListItem,
  VolumePricesListItem,
} from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/hooks/use-debounced'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import { useReplaceVolumePricesMutation, useVolumePricesQuery } from '../use-volume-prices'
import { SelectProductForVolumePricesDialog } from './SelectProductForVolumePricesDialog'
import { VolumePricesCardList } from './VolumePricesCardList'
import { VolumePricesDialog } from './VolumePricesDialog'
import { VolumePricesTable } from './VolumePricesTable'

const PAGE_SIZE = 20

interface ActiveTarget {
  productId: string
  productName: string
  productSku: string
  productSellingPrice: number
  productCostPrice: number | null
}

export function VolumePricesManager() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [active, setActive] = useState<ActiveTarget | null>(null)
  const [clearTarget, setClearTarget] = useState<VolumePricesListItem | null>(null)
  const clearMutation = useReplaceVolumePricesMutation()
  const debouncedSearch = useDebounced(search, 300)

  const apiQuery: Partial<ListVolumePricesQuery> = useMemo(() => {
    const q: Partial<ListVolumePricesQuery> = { page, pageSize: PAGE_SIZE }
    const trimmed = debouncedSearch.trim()
    if (trimmed.length > 0) q.search = trimmed
    return q
  }, [page, debouncedSearch])

  const listQuery = useVolumePricesQuery(apiQuery)
  const items = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const isFiltered = debouncedSearch.trim().length > 0

  const handleEdit = (item: VolumePricesListItem) => {
    setActive({
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      productSellingPrice: item.productSellingPrice,
      productCostPrice: item.productCostPrice,
    })
  }

  const handleClear = (item: VolumePricesListItem) => {
    setClearTarget(item)
  }

  const confirmClear = async () => {
    if (!clearTarget) return
    try {
      await clearMutation.mutateAsync({
        productId: clearTarget.productId,
        input: { tiers: [] },
      })
      showSuccess('Đã xoá toàn bộ mức giá theo số lượng')
      setClearTarget(null)
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError(err.message)
      } else {
        showError('Đã xảy ra lỗi không xác định')
      }
    }
  }

  const handlePickProduct = (p: ProductListItem) => {
    setActive({
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      productSellingPrice: p.sellingPrice,
      productCostPrice: p.costPrice,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Giá theo số lượng</h2>
          <p className="text-sm text-muted-foreground">
            Cấu hình tối đa 5 mức giá theo số lượng cho từng sản phẩm.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Thêm cấu hình</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Input
          placeholder="Tìm theo tên SP, SKU…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách giá theo số lượng.</p>
      ) : items.length === 0 && !isFiltered ? (
        <EmptyState
          icon={Layers}
          title="Chưa có cấu hình giá theo số lượng"
          description="Thêm cấu hình đầu tiên để khuyến khích khách mua số lượng lớn."
          actionLabel="Thêm cấu hình"
          onAction={() => setPickerOpen(true)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Không tìm thấy sản phẩm"
          description="Thử bỏ bớt từ khóa tìm kiếm."
        />
      ) : isDesktop ? (
        <VolumePricesTable items={items} onEdit={handleEdit} onClear={handleClear} />
      ) : (
        <VolumePricesCardList items={items} onEdit={handleEdit} onClear={handleClear} />
      )}

      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="sản phẩm"
        />
      )}

      <SelectProductForVolumePricesDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickProduct}
      />

      <VolumePricesDialog
        open={active !== null}
        onOpenChange={(v) => {
          if (!v) setActive(null)
        }}
        productId={active?.productId ?? null}
        productName={active?.productName}
        productSku={active?.productSku}
        productSellingPrice={active?.productSellingPrice}
        productCostPrice={active?.productCostPrice ?? null}
      />

      <AlertDialog
        open={clearTarget !== null}
        onOpenChange={(v) => {
          if (!v && !clearMutation.isPending) setClearTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá toàn bộ mức giá của {clearTarget?.productName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tất cả {clearTarget?.tierCount ?? 0} mức giá theo số lượng cho sản phẩm này sẽ bị xoá.
              Hành động không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClear}
              disabled={clearMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearMutation.isPending ? 'Đang xoá…' : 'Xoá'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
