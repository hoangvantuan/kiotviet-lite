import { BarChart as BarChartIcon } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RevenueChartItem } from '@kiotviet-lite/shared'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatVnd } from '@/lib/currency'

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: RevenueChartItem }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0]!.payload
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">
        {data.label} ({data.date})
      </p>
      <p className="text-muted-foreground">Doanh thu: {formatVnd(data.revenue)} đ</p>
      <p className="text-muted-foreground">Số đơn: {data.orderCount}</p>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="flex h-[300px] items-end gap-2">
          {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t bg-muted"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardBarChartProps {
  data: RevenueChartItem[] | undefined
  isLoading?: boolean
  isError?: boolean
}

export function DashboardBarChart({ data, isLoading, isError }: DashboardBarChartProps) {
  if (isLoading) return <ChartSkeleton />

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Doanh thu 7 ngày</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Lỗi tải dữ liệu</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data ?? []
  const hasData = chartData.some((item) => item.revenue > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Doanh thu 7 ngày</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[300px] flex-col items-center justify-center text-muted-foreground">
            <BarChartIcon className="mb-2 h-12 w-12" />
            <p className="text-sm">Chưa có dữ liệu doanh thu trong kỳ này</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisValue}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
              <Bar
                dataKey="revenue"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
