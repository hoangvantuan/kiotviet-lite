import { useState } from 'react'

import type {
  ExportFormat,
  RevenueByCustomerRow,
  RevenueByEmployeeRow,
  RevenueByProductRow,
  RevenueByTimeRow,
  RevenueGroupBy,
  RevenueReportTab,
} from '@kiotviet-lite/shared'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { useRevenueReport } from '../hooks/use-reports'
import { downloadReportExport } from '../reports-api'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { ReportExportButton } from './ReportExportButton'

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function RevenueReport() {
  const [tab, setTab] = useState<RevenueReportTab>('time')
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()
  const [groupBy] = useState<RevenueGroupBy>('day')

  const { data, isLoading } = useRevenueReport({ tab, from, to, groupBy })

  const handleExport = (format: ExportFormat) => {
    downloadReportExport('revenue', format, { tab, from, to, groupBy })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Báo cáo doanh thu</h1>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as RevenueReportTab)}>
        <TabsList>
          <TabsTrigger value="time">Theo thời gian</TabsTrigger>
          <TabsTrigger value="product">Theo SP</TabsTrigger>
          <TabsTrigger value="customer">Theo KH</TabsTrigger>
          <TabsTrigger value="employee">Theo NV</TabsTrigger>
        </TabsList>
      </Tabs>

      {data && 'summary' in data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {'totalOrders' in data.summary && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Tổng đơn</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono">{data.summary.totalOrders}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Tổng doanh thu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono">
                    {formatVND(data.summary.totalRevenue)}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Đang tải...</div>
          ) : !data || !('rows' in data) || data.rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Không có dữ liệu</div>
          ) : tab === 'time' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-right">Số đơn</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r: RevenueByTimeRow) => (
                  <TableRow key={r.date}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'product' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r: RevenueByProductRow) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.revenue)}</TableCell>
                    <TableCell className="text-right">{r.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'customer' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead className="text-right">Số đơn</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Nợ hiện tại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r: RevenueByCustomerRow, i: number) => (
                  <TableRow key={r.customerId ?? i}>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.phone ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVND(r.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead className="text-right">Số đơn</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r: RevenueByEmployeeRow) => (
                  <TableRow key={r.userId}>
                    <TableCell>{r.userName}</TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.revenue)}</TableCell>
                    <TableCell className="text-right">{r.percentage}%</TableCell>
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
