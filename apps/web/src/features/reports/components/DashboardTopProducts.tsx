import { ShoppingBag } from 'lucide-react'

import type { TopProduct } from '@kiotviet-lite/shared'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatVnd } from '@/lib/currency'

function TopProductsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-4 w-6 animate-pulse rounded bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardTopProductsProps {
  data: TopProduct[] | undefined
  isLoading?: boolean
  isError?: boolean
}

export function DashboardTopProducts({ data, isLoading, isError }: DashboardTopProductsProps) {
  if (isLoading) return <TopProductsSkeleton />

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top sản phẩm bán chạy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Lỗi tải dữ liệu</p>
        </CardContent>
      </Card>
    )
  }

  const products = data ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top sản phẩm bán chạy</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <ShoppingBag className="mb-2 h-10 w-10" />
            <p className="text-sm">Chưa có đơn hàng trong kỳ này</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">#</th>
                    <th className="pb-2 pr-2 font-medium">Sản phẩm</th>
                    <th className="pb-2 pr-2 text-right font-medium">SL bán</th>
                    <th className="pb-2 pr-2 text-right font-medium">Doanh thu</th>
                    <th className="pb-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.productId} className="border-b last:border-0">
                      <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-2 truncate max-w-[140px]">{p.name}</td>
                      <td className="py-2 pr-2 text-right font-mono">{p.quantity}</td>
                      <td className="py-2 pr-2 text-right font-mono">{formatVnd(p.revenue)} đ</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {p.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="space-y-2 md:hidden">
              {products.map((p, i) => (
                <div
                  key={p.productId}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                    <span className="text-sm truncate">{p.name}</span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-mono font-medium">{formatVnd(p.revenue)} đ</p>
                    <p className="text-xs text-muted-foreground">{p.quantity} SP</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
