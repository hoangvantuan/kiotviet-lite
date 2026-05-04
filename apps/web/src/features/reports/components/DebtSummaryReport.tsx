import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Download, FileSpreadsheet, Wallet } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatVnd } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { showError } from '@/lib/toast'

import { useDebtSummaryReport } from '../hooks/use-reports'
import { downloadCsv, type ReportDateQuery } from '../reports-api'

interface DebtSummaryReportProps {
  query: ReportDateQuery
}

function StatRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium', className)}>{value}</span>
    </div>
  )
}

export function DebtSummaryReport({ query }: DebtSummaryReportProps) {
  const reportQuery = useDebtSummaryReport(query)
  const [downloading, setDownloading] = useState(false)

  async function handleExportCsv() {
    setDownloading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await downloadCsv(
        '/api/v1/reports/debt-summary/csv',
        query,
        `bao-cao-tong-hop-cong-no-${today}.csv`,
      )
    } catch {
      showError('Không thể tải file CSV')
    } finally {
      setDownloading(false)
    }
  }

  if (reportQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải báo cáo...</p>
  }

  if (reportQuery.isError || !reportQuery.data) {
    return <p className="text-sm text-destructive">Không tải được báo cáo tổng hợp.</p>
  }

  const { receivable, payable, cashFlow } = reportQuery.data

  const hasData =
    receivable.totalDebt > 0 ||
    payable.totalDebt > 0 ||
    cashFlow.totalIn > 0 ||
    cashFlow.totalOut > 0

  if (!hasData) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Chưa có dữ liệu công nợ"
        description="Chưa có dữ liệu công nợ trong khoảng thời gian này."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={downloading}>
          <Download className="mr-1 size-4" />
          {downloading ? 'Đang tải...' : 'Xuất CSV'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Phải thu</CardTitle>
            <ArrowDownLeft className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold text-blue-700">{formatVnd(receivable.totalDebt)} ₫</p>
            <StatRow label="Số KH còn nợ" value={String(receivable.customerCount)} />
            <StatRow
              label="Tổng đã thu (trong kỳ)"
              value={`${formatVnd(receivable.totalCollected)} ₫`}
              className="text-green-700"
            />
            <StatRow label="Số phiếu thu" value={String(receivable.receiptCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Phải trả</CardTitle>
            <ArrowUpRight className="size-4 text-orange-500" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold text-orange-700">{formatVnd(payable.totalDebt)} ₫</p>
            <StatRow label="Số NCC còn nợ" value={String(payable.supplierCount)} />
            <StatRow
              label="Tổng đã trả (trong kỳ)"
              value={`${formatVnd(payable.totalPaid)} ₫`}
              className="text-red-700"
            />
            <StatRow label="Số phiếu chi" value={String(payable.paymentCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sổ quỹ (trong kỳ)</CardTitle>
            <Wallet className="size-4 text-green-500" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p
              className={cn(
                'text-2xl font-bold',
                cashFlow.net >= 0 ? 'text-green-700' : 'text-red-700',
              )}
            >
              {cashFlow.net >= 0 ? '+' : ''}
              {formatVnd(cashFlow.net)} ₫
            </p>
            <StatRow
              label="Tổng thu"
              value={`${formatVnd(cashFlow.totalIn)} ₫`}
              className="text-green-700"
            />
            <StatRow
              label="Tổng chi"
              value={`${formatVnd(cashFlow.totalOut)} ₫`}
              className="text-red-700"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
