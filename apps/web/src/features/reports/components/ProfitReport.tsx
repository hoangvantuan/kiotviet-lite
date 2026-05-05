import { useState } from 'react'

import type { ExportFormat } from '@kiotviet-lite/shared'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useProfitReport } from '../hooks/use-reports'
import { downloadReportExport } from '../reports-api'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { ReportExportButton } from './ReportExportButton'

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function ProfitReport() {
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()

  const { data, isLoading } = useProfitReport({ from, to })

  const handleExport = (format: ExportFormat) => {
    downloadReportExport('profit', format, { from, to })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Báo cáo lợi nhuận</h1>
        <ReportExportButton onExport={handleExport} />
      </div>

      <ReportDateRangePicker
        from={from}
        to={to}
        onChange={(f, t) => {
          setFrom(f)
          setTo(t)
        }}
      />

      {data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Doanh thu</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{formatVND(data.summary.totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Giá vốn</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{formatVND(data.summary.totalCogs)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Lợi nhuận gộp</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{formatVND(data.summary.grossProfit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">{data.summary.marginPercent}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Đang tải...</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Không có dữ liệu</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.productId} className={r.isLoss ? 'bg-red-50 text-red-700' : ''}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.cogs)}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.profit)}</TableCell>
                    <TableCell className="text-right">{r.marginPercent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
