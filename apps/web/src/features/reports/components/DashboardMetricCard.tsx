import { TrendingDown, TrendingUp } from 'lucide-react'

import type { DashboardMetric } from '@kiotviet-lite/shared'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SparklineProps {
  data: number[]
  color: string
}

function Sparkline({ data, color }: SparklineProps) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80
  const h = 24
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}

interface DashboardMetricCardProps {
  label: string
  metric: DashboardMetric | undefined
  formatValue: (value: number) => string
  isLoading?: boolean
  isError?: boolean
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 flex items-center justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardMetricCard({
  label,
  metric,
  formatValue,
  isLoading,
  isError,
}: DashboardMetricCardProps) {
  if (isLoading) return <MetricCardSkeleton />

  if (isError) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm text-destructive">Lỗi tải dữ liệu</p>
        </CardContent>
      </Card>
    )
  }

  const value = metric?.value ?? 0
  const trend = metric?.trend ?? null
  const sparkline = metric?.sparkline ?? [0, 0, 0, 0, 0, 0, 0]

  const trendColor =
    trend === null ? 'text-muted-foreground' : trend >= 0 ? 'text-green-600' : 'text-red-600'
  const sparklineColor = trend === null ? '#94a3b8' : trend >= 0 ? '#16a34a' : '#dc2626'

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold font-mono">{formatValue(value)}</p>
        <div className="mt-2 flex items-center justify-between">
          <div className={cn('flex items-center gap-1 text-sm', trendColor)}>
            {trend !== null && (
              <>
                {trend >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(trend).toFixed(1)}%</span>
              </>
            )}
            {trend === null && <span>-</span>}
          </div>
          <Sparkline data={sparkline} color={sparklineColor} />
        </div>
      </CardContent>
    </Card>
  )
}
