import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, RefreshCw } from 'lucide-react'

import {
  formatFormulaLabel,
  formatRoundingLabel,
  type PriceListItemListItem,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/hooks/use-debounced'
import { ApiClientError } from '@/lib/api-client'
import { showError, showSuccess } from '@/lib/toast'

import {
  useDeletePriceListItemMutation,
  usePriceListItemsQuery,
  usePriceListQuery,
  useRecalculatePriceListMutation,
} from '../use-price-lists'
import { AddPriceListItemDialog } from './AddPriceListItemDialog'
import { EditPriceListDialog } from './EditPriceListDialog'
import { EditPriceListItemDialog } from './EditPriceListItemDialog'
import { PriceListItemsTable } from './PriceListItemsTable'
import { PriceListStatusBadge } from './PriceListStatusBadge'

const PAGE_SIZE = 50
const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

interface Props {
  priceListId: string
}

export function PriceListDetail({ priceListId }: Props) {
  const navigate = useNavigate()
  const detailQuery = usePriceListQuery(priceListId)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [editMetaOpen, setEditMetaOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [editItem, setEditItem] = useState<PriceListItemListItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<PriceListItemListItem | null>(null)
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false)

  const itemsQuery = usePriceListItemsQuery(priceListId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
  })

  const deleteItemMutation = useDeletePriceListItemMutation()
  const recalcMutation = useRecalculatePriceListMutation()

  const items = itemsQuery.data?.data ?? []
  const meta = itemsQuery.data?.meta

  const itemProductIds = useMemo(
    () => (itemsQuery.data?.data ?? []).map((i) => i.productId),
    [itemsQuery.data],
  )

  if (detailQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải bảng giá…</p>
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: '/pricing' })}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Button>
        <p className="text-sm text-destructive">Không tải được bảng giá.</p>
      </div>
    )
  }

  const priceList = detailQuery.data

  const onConfirmDeleteItem = async () => {
    if (!deleteItem) return
    try {
      await deleteItemMutation.mutateAsync({
        priceListId: priceList.id,
        itemId: deleteItem.id,
      })
      showSuccess('Đã xoá dòng bảng giá')
      setDeleteItem(null)
    } catch (err) {
      if (err instanceof ApiClientError) showError(err.message)
      else showError('Đã xảy ra lỗi không xác định')
    }
  }

  const onConfirmRecalculate = async () => {
    try {
      const res = await recalcMutation.mutateAsync(priceList.id)
      showSuccess(
        `Đã tính lại: ${res.data.updatedCount} cập nhật, ${res.data.addedCount} thêm, ${res.data.removedCount} xoá, ${res.data.preservedOverrideCount} giữ override`,
      )
      setRecalcConfirmOpen(false)
    } catch (err) {
      if (err instanceof ApiClientError) showError(err.message)
      else showError('Đã xảy ra lỗi không xác định')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/pricing' })}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{priceList.name}</h2>
            <Badge variant="outline">
              {priceList.method === 'direct' ? 'Trực tiếp' : 'Công thức'}
            </Badge>
            <PriceListStatusBadge priceList={priceList} />
          </div>
          {priceList.description && (
            <p className="text-sm text-muted-foreground">{priceList.description}</p>
          )}
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Làm tròn:</span>{' '}
              {formatRoundingLabel(priceList.roundingRule)}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Hiệu lực:</span>{' '}
              {priceList.effectiveFrom || '∞'} → {priceList.effectiveTo || '∞'}
            </p>
            {priceList.method === 'formula' &&
              priceList.formulaType &&
              priceList.formulaValue !== null && (
                <>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Bảng giá nền:</span>{' '}
                    {priceList.baseName ?? '—'}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Công thức:</span>{' '}
                    {formatFormulaLabel(priceList.formulaType, priceList.formulaValue)}
                  </p>
                </>
              )}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Tổng dòng:</span>{' '}
              {VND_FORMATTER.format(priceList.itemCount)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditMetaOpen(true)}>
            <Pencil className="h-4 w-4" />
            Sửa thông tin
          </Button>
          {priceList.method === 'formula' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecalcConfirmOpen(true)}
              disabled={recalcMutation.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              Tính lại
            </Button>
          )}
          <Button size="sm" onClick={() => setAddItemOpen(true)}>
            <Plus className="h-4 w-4" />
            Thêm sản phẩm
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Tìm sản phẩm trong bảng giá"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="max-w-sm"
        />
      </div>

      {itemsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải dòng bảng giá…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Chưa có sản phẩm nào trong bảng giá"
          description="Thêm sản phẩm để bắt đầu áp dụng giá."
          actionLabel="Thêm sản phẩm"
          onAction={() => setAddItemOpen(true)}
        />
      ) : (
        <PriceListItemsTable
          priceList={priceList}
          items={items}
          onEdit={setEditItem}
          onDelete={setDeleteItem}
        />
      )}

      {meta && meta.total > 0 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          unitLabel="dòng"
        />
      )}

      <EditPriceListDialog
        open={editMetaOpen}
        onOpenChange={setEditMetaOpen}
        priceList={priceList}
      />
      <AddPriceListItemDialog
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        priceList={priceList}
        excludeProductIds={itemProductIds}
      />
      <EditPriceListItemDialog
        open={editItem !== null}
        onOpenChange={(v) => {
          if (!v) setEditItem(null)
        }}
        priceList={priceList}
        item={editItem}
      />

      <AlertDialog
        open={deleteItem !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteItem(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá dòng {deleteItem?.productName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {priceList.method === 'formula' && deleteItem && !deleteItem.isOverridden
                ? 'Dòng này đến từ công thức và không có override. Hãy gỡ sản phẩm khỏi bảng giá nền hoặc tạo override trước.'
                : 'Dòng này sẽ bị xoá khỏi bảng giá. Hành động này không thể khôi phục.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteItem}
              disabled={deleteItemMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItemMutation.isPending ? 'Đang xoá…' : 'Xoá'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tính lại bảng giá?</AlertDialogTitle>
            <AlertDialogDescription>
              Hệ thống sẽ áp lại công thức từ bảng giá nền. Các dòng có Override sẽ được giữ nguyên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalcMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRecalculate} disabled={recalcMutation.isPending}>
              {recalcMutation.isPending ? 'Đang tính lại…' : 'Tính lại'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
