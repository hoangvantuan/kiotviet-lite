import { BarChart3, Package } from 'lucide-react'

import type { CustomerStatsMonthlySale } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'

import { useCustomerStats } from '../hooks/use-customer-detail'

interface CustomerStatsTabProps {
  customerId: string
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  if (!year || !month) return monthKey
  return `${month}/${year.slice(2)}`
}

function MonthlySalesChart({ data }: { data: CustomerStatsMonthlySale[] }) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1)
  return (
    <div className="rounded-md border p-4">
      <div className="flex h-48 items-end gap-2">
        {data.map((item) => {
          const heightPct = (item.total / maxTotal) * 100
          return (
            <div key={item.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
                  style={{ height: `${heightPct}%` }}
                  title={`${formatMonth(item.month)}: ${formatVnd(item.total)} ₫`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{formatMonth(item.month)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CustomerStatsTab({ customerId }: CustomerStatsTabProps) {
  const statsQuery = useCustomerStats(customerId)

  if (statsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải thống kê…</p>
  }
  if (statsQuery.isError || !statsQuery.data) {
    return <p className="text-sm text-destructive">Không tải được dữ liệu thống kê.</p>
  }

  const { topProducts, monthlySales } = statsQuery.data
  const hasAnyData = topProducts.length > 0 || monthlySales.length > 0

  if (!hasAnyData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Chưa có dữ liệu mua hàng"
        description="Thống kê sẽ hiển thị khi khách hàng có đơn hàng đầu tiên."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Top 10 sản phẩm mua nhiều nhất</h3>
        {topProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Chưa có dữ liệu sản phẩm"
            description="Sẽ hiển thị khi khách hàng có đơn hàng."
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p, idx) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">{formatVnd(p.total)} ₫</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Doanh số 12 tháng gần nhất</h3>
        {monthlySales.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Chưa có dữ liệu doanh số"
            description="Sẽ hiển thị khi khách hàng có đơn hàng."
          />
        ) : (
          <MonthlySalesChart data={monthlySales} />
        )}
      </div>
    </div>
  )
}
