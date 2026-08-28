import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'

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
import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { formatDate } from '@/lib/date'

import { useProductPurchaseHistoryQuery } from './use-product-history'

const PAGE_SIZE = 20

export function ProductPurchaseHistory({ productId }: { productId: string }) {
  const [page, setPage] = useState(1)
  const query = useProductPurchaseHistoryQuery(productId, { page, pageSize: PAGE_SIZE })

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
        icon={History}
        title="Chưa có lịch sử nhập hàng"
        description="Sản phẩm này chưa xuất hiện trong phiếu nhập nào."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày nhập</TableHead>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>NCC</TableHead>
              <TableHead>Biến thể</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">Đơn giá</TableHead>
              <TableHead className="text-right">CK</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
              <TableHead className="text-right">Giá vốn BQ</TableHead>
              <TableHead className="text-right">Tồn sau</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.purchaseOrderItemId}>
                <TableCell>{formatDate(it.purchaseDate)}</TableCell>
                <TableCell className="font-mono">
                  <Link
                    to="/inventory/purchase-orders/$orderId"
                    params={{ orderId: it.purchaseOrderId }}
                    className="hover:underline text-primary"
                  >
                    {it.purchaseOrderCode}
                  </Link>
                </TableCell>
                <TableCell>{it.supplierName}</TableCell>
                <TableCell className="text-xs">{it.variantLabelSnapshot ?? '—'}</TableCell>
                <TableCell className="text-right font-mono">{it.quantity}</TableCell>
                <TableCell className="text-right">{formatVnd(it.unitPrice)}</TableCell>
                <TableCell className="text-right">
                  {it.discountAmount > 0 ? `-${formatVnd(it.discountAmount)}` : '—'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatVndWithSuffix(it.lineTotal)}
                </TableCell>
                <TableCell className="text-right">
                  {it.costAfter !== null ? formatVnd(it.costAfter) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono">{it.stockAfter ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <Link
            key={it.purchaseOrderItemId}
            to="/inventory/purchase-orders/$orderId"
            params={{ orderId: it.purchaseOrderId }}
            className="block rounded-md border p-3 hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{it.purchaseOrderCode}</span>
              <span className="text-sm text-muted-foreground">{formatDate(it.purchaseDate)}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{it.supplierName}</div>
            <div className="flex justify-between text-sm mt-1">
              <span>
                SL: {it.quantity} × {formatVnd(it.unitPrice)}
              </span>
              <span className="font-medium">{formatVndWithSuffix(it.lineTotal)}</span>
            </div>
          </Link>
        ))}
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
