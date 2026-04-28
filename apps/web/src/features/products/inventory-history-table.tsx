import { useState } from 'react'

import type { InventoryTransactionItem } from '@kiotviet-lite/shared'

import { Pagination } from '@/components/shared/pagination'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'

import { useInventoryTransactionsQuery } from './use-products'

export interface InventoryHistoryTableProps {
  productId: string
}

const TYPE_LABELS: Record<InventoryTransactionItem['type'], string> = {
  initial_stock: 'Khởi tạo',
  purchase: 'Nhập',
  sale: 'Bán',
  manual_adjustment: 'Điều chỉnh',
  return: 'Trả hàng',
}

const TYPE_VARIANTS: Record<
  InventoryTransactionItem['type'],
  'default' | 'destructive' | 'secondary' | 'outline'
> = {
  initial_stock: 'secondary',
  purchase: 'default',
  sale: 'outline',
  manual_adjustment: 'secondary',
  return: 'outline',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function InventoryHistoryTable({ productId }: InventoryHistoryTableProps) {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const { data, isLoading } = useInventoryTransactionsQuery(productId, page, pageSize)
  const items = data?.data ?? []
  const meta = data?.meta

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Lịch sử biến động tồn kho</h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">Chưa có biến động tồn kho.</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Giá nhập</TableHead>
                  <TableHead className="text-right">WAC sau</TableHead>
                  <TableHead className="text-right">Tồn sau</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs">{formatDateTime(tx.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANTS[tx.type]}>{TYPE_LABELS[tx.type]}</Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${tx.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}
                    >
                      {tx.quantity > 0 ? '+' : ''}
                      {tx.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.unitCost === null ? '-' : formatVnd(tx.unitCost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.costAfter === null ? '-' : formatVnd(tx.costAfter)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.stockAfter === null ? '-' : tx.stockAfter}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {tx.note ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((tx) => (
              <li key={tx.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant={TYPE_VARIANTS[tx.type]}>{TYPE_LABELS[tx.type]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(tx.createdAt)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <span>
                    SL:{' '}
                    <span className={tx.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {tx.quantity > 0 ? '+' : ''}
                      {tx.quantity}
                    </span>
                  </span>
                  <span>Tồn sau: {tx.stockAfter ?? '-'}</span>
                  {tx.unitCost !== null && <span>Giá nhập: {formatVnd(tx.unitCost)}</span>}
                  {tx.costAfter !== null && <span>WAC sau: {formatVnd(tx.costAfter)}</span>}
                </div>
                {tx.note && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{tx.note}</p>
                )}
              </li>
            ))}
          </ul>

          {meta && (
            <Pagination
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              unitLabel="giao dịch"
            />
          )}
        </>
      )}
    </section>
  )
}
