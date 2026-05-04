import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Download, FileSpreadsheet } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useStoreQuery } from '@/features/settings/use-store-settings'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatVnd } from '@/lib/currency'
import { showError } from '@/lib/toast'

import { useDebtAgingReport } from '../hooks/use-reports'
import { downloadCsv, type ReportDateQuery } from '../reports-api'

interface DebtAgingReportProps {
  query: ReportDateQuery
}

export function DebtAgingReport({ query }: DebtAgingReportProps) {
  const reportQuery = useDebtAgingReport(query)
  const storeQuery = useStoreQuery()
  const warningPercent = storeQuery.data?.debtWarningPercent ?? 80
  const navigate = useNavigate()
  const [downloading, setDownloading] = useState(false)

  async function handleExportCsv() {
    setDownloading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await downloadCsv('/api/v1/reports/debt-aging/csv', query, `bao-cao-tuoi-no-${today}.csv`)
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
    return <p className="text-sm text-destructive">Không tải được báo cáo tuổi nợ.</p>
  }

  const { rows, totals, bucketLabels } = reportQuery.data

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Không có khoản nợ chưa tất toán"
        description="Khi có khách hàng còn nợ, báo cáo tuổi nợ sẽ hiển thị tại đây."
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead className="text-right">Hạn mức</TableHead>
              <TableHead className="text-right">Tổng nợ</TableHead>
              {bucketLabels.map((label) => (
                <TableHead key={label} className="text-right">
                  {label}
                </TableHead>
              ))}
              <TableHead className="text-right">% hạn mức</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const usagePercent =
                row.debtLimit && row.debtLimit > 0
                  ? Math.round((row.totalDebt / row.debtLimit) * 100)
                  : null
              return (
                <TableRow key={row.customerId}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left text-sm font-medium text-primary hover:underline"
                      onClick={() =>
                        navigate({ to: '/customers/$customerId', params: { customerId: row.customerId } })
                      }
                    >
                      {row.customerName}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.customerPhone ?? ''}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.debtLimit !== null ? `${formatVnd(row.debtLimit)} ₫` : 'Không giới hạn'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-red-700">
                    {formatVnd(row.totalDebt)} ₫
                  </TableCell>
                  {row.buckets.map((amount, i) => (
                    <TableCell key={bucketLabels[i]} className="text-right text-sm">
                      {amount > 0 ? `${formatVnd(amount)} ₫` : '-'}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {usagePercent !== null ? (
                      <Badge
                        variant="outline"
                        className={
                          usagePercent >= 100
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : usagePercent >= warningPercent
                              ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                              : 'border-green-200 bg-green-50 text-green-700'
                        }
                      >
                        {usagePercent >= 100 && <AlertTriangle className="mr-1 size-3" />}
                        {usagePercent}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-semibold">
                Tổng cộng
              </TableCell>
              <TableCell className="text-right font-semibold text-red-700">
                {formatVnd(totals.totalDebt)} ₫
              </TableCell>
              {totals.buckets.map((amount, i) => (
                <TableCell key={bucketLabels[i]} className="text-right font-semibold">
                  {amount > 0 ? `${formatVnd(amount)} ₫` : '-'}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
