import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiClientError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/date'
import { showError, showSuccess } from '@/lib/toast'

import { getProductApi } from '../products/products-api'
import { StockCheckStatusBadge } from './stock-check-status-badge'
import { formatDiff } from './stock-check-utils'
import {
  useConfirmStockCheckMutation,
  useDeleteStockCheckMutation,
  useStockCheckQuery,
} from './use-stock-checks'

interface StockCheckDetailViewProps {
  stockCheckId: string
}

export function StockCheckDetailView({ stockCheckId }: StockCheckDetailViewProps) {
  const navigate = useNavigate()
  const query = useStockCheckQuery(stockCheckId)
  const confirmMutation = useConfirmStockCheckMutation()
  const deleteMutation = useDeleteStockCheckMutation()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const items = query.data?.items ?? []
  const uniqueProductIds = Array.from(new Set(items.map((it) => it.productId)))
  const productQueries = useQueries({
    queries: query.data
      ? uniqueProductIds.map((pid) => ({
          queryKey: ['products', 'detail', pid],
          queryFn: async () => (await getProductApi(pid)).data,
          staleTime: 30_000,
        }))
      : [],
  })
  const productMinStock = new Map<string, number>()
  for (let i = 0; i < uniqueProductIds.length; i++) {
    const pid = uniqueProductIds[i]
    const q = productQueries[i]
    if (pid && q?.data) {
      productMinStock.set(pid, q.data.minStock)
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-8 w-1/3 rounded-md bg-muted animate-pulse" />
        <div className="h-32 rounded-md bg-muted animate-pulse" />
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-destructive">Không tải được phiếu kiểm kho.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/inventory/stock-checks">
            <ChevronLeft className="size-4 mr-1" /> Về danh sách
          </Link>
        </Button>
      </div>
    )
  }

  const data = query.data
  const isDraft = data.status === 'draft'

  const onConfirm = async () => {
    setConfirmOpen(false)
    try {
      const r = await confirmMutation.mutateAsync(stockCheckId)
      showSuccess(`Đã xác nhận phiếu kiểm ${r.data.code}. Tồn kho đã cập nhật.`)
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'BUSINESS_RULE_VIOLATION') {
          const details = err.details as
            | { code?: string; items?: { productName: string; wouldBe: number }[] }
            | undefined
          if (details?.code === 'NEGATIVE_STOCK' && Array.isArray(details.items)) {
            const list = details.items
              .map((d) => `• ${d.productName} (sẽ còn ${d.wouldBe})`)
              .join('\n')
            showError(`Tồn sẽ âm sau khi xác nhận:\n${list}`)
            return
          }
        }
        showError(err.message)
      } else {
        showError('Không xác nhận được phiếu kiểm')
      }
    }
  }

  const onDelete = async () => {
    setDeleteOpen(false)
    try {
      await deleteMutation.mutateAsync(stockCheckId)
      showSuccess('Đã xoá phiếu kiểm nháp')
      navigate({ to: '/inventory/stock-checks' })
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Không xoá được phiếu kiểm'
      showError(msg)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory/stock-checks">
            <ChevronLeft className="size-4 mr-1" /> Kiểm kho
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold font-mono">{data.code}</h1>
            <StockCheckStatusBadge status={data.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tạo lúc {formatDateTime(data.createdAt)}
            {data.createdByName ? ` bởi ${data.createdByName}` : ''}
          </p>
          {data.status === 'confirmed' && (
            <p className="text-sm text-muted-foreground">
              Xác nhận lúc {formatDateTime(data.confirmedAt)}
              {data.confirmedByName ? ` bởi ${data.confirmedByName}` : ''}
            </p>
          )}
        </div>
        {isDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                navigate({ to: '/inventory/stock-checks/$id/edit', params: { id: data.id } })
              }
            >
              Sửa
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Xoá nháp
            </Button>
            <Button onClick={() => setConfirmOpen(true)}>Xác nhận</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Phiếu đã xác nhận, không thể chỉnh sửa.
          </p>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Tổng SP</h2>
          <p className="text-xl font-semibold mt-1">{data.totalItems}</p>
        </div>
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Tổng tăng</h2>
          <p className="text-xl font-semibold mt-1 text-green-600">+{data.totalDiffPositive}</p>
        </div>
        <div className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground">Tổng giảm</h2>
          <p className="text-xl font-semibold mt-1 text-red-600">-{data.totalDiffNegative}</p>
        </div>
      </section>

      {data.note && (
        <section className="rounded-md border p-3">
          <h2 className="text-sm font-medium text-muted-foreground mb-1">Ghi chú</h2>
          <p className="text-sm whitespace-pre-wrap">{data.note}</p>
        </section>
      )}

      <section className="rounded-md border">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Tồn HT</TableHead>
                <TableHead className="text-right">Thực tế</TableHead>
                <TableHead className="text-right">Chênh lệch</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((it) => {
                const fmt = formatDiff(it.diff)
                const minStock = productMinStock.get(it.productId)
                const isLowStock =
                  typeof minStock === 'number' && minStock > 0 && it.actualQty < minStock
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">{it.productNameSnapshot}</div>
                      {it.variantLabelSnapshot && (
                        <div className="text-xs text-muted-foreground">
                          {it.variantLabelSnapshot}
                        </div>
                      )}
                      {isLowStock && (
                        <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                          <AlertTriangle className="size-3" />
                          Dưới định mức (min: {minStock})
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{it.productSkuSnapshot}</TableCell>
                    <TableCell className="text-right font-mono">{it.systemQty}</TableCell>
                    <TableCell className="text-right font-mono">{it.actualQty}</TableCell>
                    <TableCell className={`text-right font-mono ${fmt.className}`}>
                      {fmt.text}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.note ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden divide-y">
          {data.items.map((it) => {
            const fmt = formatDiff(it.diff)
            const minStock = productMinStock.get(it.productId)
            const isLowStock =
              typeof minStock === 'number' && minStock > 0 && it.actualQty < minStock
            return (
              <div key={it.id} className="p-3 space-y-1">
                <div className="font-medium">{it.productNameSnapshot}</div>
                {it.variantLabelSnapshot && (
                  <div className="text-xs text-muted-foreground">{it.variantLabelSnapshot}</div>
                )}
                <div className="text-xs font-mono text-muted-foreground">
                  {it.productSkuSnapshot}
                </div>
                {isLowStock && (
                  <div className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="size-3" />
                    Dưới định mức (min: {minStock})
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Tồn HT</div>
                    <div className="font-mono">{it.systemQty}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Thực tế</div>
                    <div className="font-mono">{it.actualQty}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Chênh lệch</div>
                    <div className={`font-mono ${fmt.className}`}>{fmt.text}</div>
                  </div>
                </div>
                {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
              </div>
            )
          })}
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận phiếu kiểm</DialogTitle>
            <DialogDescription>
              Tồn kho sẽ được cập nhật theo chênh lệch. Hành động không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={onConfirm} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá phiếu kiểm nháp</DialogTitle>
            <DialogDescription>
              Phiếu nháp sẽ bị xoá vĩnh viễn cùng các dòng kiểm. Bạn không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Đang xoá...' : 'Xoá nháp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
