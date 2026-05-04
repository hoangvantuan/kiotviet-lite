import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import type { DashboardPeriod } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { formatVndWithSuffix } from '@/lib/currency'

import { useDashboard, useInvalidateDashboard } from '../hooks/use-reports'
import { LowStockAlertCard, OverdueDebtCard } from './DashboardAlertCard'
import { DashboardBarChart } from './DashboardBarChart'
import { DashboardMetricCard } from './DashboardMetricCard'
import { DashboardPeriodSelector } from './DashboardPeriodSelector'
import { DashboardTopProducts } from './DashboardTopProducts'

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const { data, isLoading, isError, isFetching } = useDashboard(period)
  const invalidate = useInvalidateDashboard()

  const handleRefresh = useCallback(() => {
    invalidate()
  }, [invalidate])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case '1':
          setPeriod('today')
          break
        case '2':
          setPeriod('week')
          break
        case '3':
          setPeriod('month')
          break
        case '4':
          setPeriod('year')
          break
        case 'r':
        case 'R':
          handleRefresh()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleRefresh])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Tổng quan tình hình kinh doanh cửa hàng.</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardPeriodSelector value={period} onChange={setPeriod} />
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Refresh (R)"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Row 1: 4 MetricCards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardMetricCard
          label="Doanh thu"
          metric={data?.metrics.revenue}
          formatValue={formatVndWithSuffix}
          isLoading={isLoading}
          isError={isError}
        />
        <DashboardMetricCard
          label="Lợi nhuận"
          metric={data?.metrics.profit}
          formatValue={formatVndWithSuffix}
          isLoading={isLoading}
          isError={isError}
        />
        <DashboardMetricCard
          label="Số đơn hàng"
          metric={data?.metrics.orderCount}
          formatValue={formatNumber}
          isLoading={isLoading}
          isError={isError}
        />
        <DashboardMetricCard
          label="Trung bình/đơn"
          metric={data?.metrics.avgOrderValue}
          formatValue={formatVndWithSuffix}
          isLoading={isLoading}
          isError={isError}
        />
      </div>

      {/* Row 2: Chart (2/3) + Top Products (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashboardBarChart data={data?.revenueChart} isLoading={isLoading} isError={isError} />
        </div>
        <div className="lg:col-span-1">
          <DashboardTopProducts data={data?.topProducts} isLoading={isLoading} isError={isError} />
        </div>
      </div>

      {/* Row 3: Low Stock (1/2) + Overdue Debt (1/2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LowStockAlertCard data={data?.lowStockAlerts} isLoading={isLoading} isError={isError} />
        <OverdueDebtCard data={data?.overdueDebts} isLoading={isLoading} isError={isError} />
      </div>
    </div>
  )
}
