import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Pagination } from '@/components/shared/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDiff } from '@/features/stock-checks/stock-check-utils'

import { useProductStockCheckHistoryQuery } from './use-product-history'

const PAGE_SIZE = 20

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ProductStockCheckHistory({ productId }: { productId: string }) {
  const [page, setPage] = useState(1)
  const query = useProductStockCheckHistoryQuery(productId, { page, pageSize: PAGE_SIZE })

  const items = query.data?.data ?? []
  const meta = query.data?.meta
  const isLoading = query.isLoading

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Chưa có lịch sử kiểm kho"
        description="Sản phẩm này chưa xuất hiện trong phiếu kiểm nào."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày kiểm</TableHead>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Người kiểm</TableHead>
              <TableHead>Biến thể</TableHead>
              <TableHead className="text-right">Tồn HT</TableHead>
              <TableHead className="text-right">Thực tế</TableHead>
              <TableHead className="text-right">Chênh lệch</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const fmt = formatDiff(it.diff)
              return (
                <TableRow key={it.stockCheckLogId}>
                  <TableCell>{formatDateTime(it.adjustedAt)}</TableCell>
                  <TableCell className="font-mono">
                    <Link
                      to="/inventory/stock-checks/$id"
                      params={{ id: it.stockCheckId }}
                      className="hover:underline text-primary"
                    >
                      {it.stockCheckCode}
                    </Link>
                  </TableCell>
                  <TableCell>{it.adjustedByName ?? '—'}</TableCell>
                  <TableCell className="text-xs">{it.variantLabelSnapshot ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{it.systemQty}</TableCell>
                  <TableCell className="text-right font-mono">{it.actualQty}</TableCell>
                  <TableCell className={`text-right font-mono ${fmt.className}`}>
                    {fmt.text}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{it.note ?? '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {items.map((it) => {
          const fmt = formatDiff(it.diff)
          return (
            <Link
              key={it.stockCheckLogId}
              to="/inventory/stock-checks/$id"
              params={{ id: it.stockCheckId }}
              className="block rounded-md border p-3 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{it.stockCheckCode}</span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(it.adjustedAt)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>
                  HT {it.systemQty} → TT {it.actualQty}
                </span>
                <span className={`font-mono ${fmt.className}`}>{fmt.text}</span>
              </div>
            </Link>
          )
        })}
      </div>

      {meta && meta.totalPages > 1 && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
