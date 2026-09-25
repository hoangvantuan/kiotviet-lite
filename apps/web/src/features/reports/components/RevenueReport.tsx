import { useState } from 'react'

import type {
  ExportFormat,
  RevenueByCustomerRow,
  RevenueByDimensionRow,
  RevenueByEmployeeRow,
  RevenueByProductRow,
  RevenueByTimeRow,
  RevenueGroupBy,
  RevenueReportTab,
} from '@kiotviet-lite/shared'
import { formatPhone, formatVndWithSuffix } from '@kiotviet-lite/shared'

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
import { formatDate } from '@/lib/date'

import { useRevenueReport } from '../hooks/use-reports'
import { downloadReportExport } from '../reports-api'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { ReportExportButton } from './ReportExportButton'

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
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="time">Theo thời gian</TabsTrigger>
          <TabsTrigger value="product">Theo sản phẩm</TabsTrigger>
          <TabsTrigger value="customer">Theo khách hàng</TabsTrigger>
          <TabsTrigger value="employee">Theo nhân viên</TabsTrigger>
          <TabsTrigger value="thuong-hieu">Theo thương hiệu</TabsTrigger>
          <TabsTrigger value="danh-muc">Theo danh mục</TabsTrigger>
        </TabsList>
      </Tabs>

      {data && 'summary' in data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {'totalOrders' in data.summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Tổng đơn</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{data.summary.totalOrders}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Tổng doanh thu</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold font-mono">
                {formatVndWithSuffix(data.summary.totalRevenue)}
              </p>
            </CardContent>
          </Card>
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
                {(data.rows as RevenueByTimeRow[]).map((r) => (
                  <TableRow key={r.date}>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'product' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Mã hàng</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as RevenueByProductRow[]).map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
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
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead className="text-right">Số đơn</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Nợ hiện tại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as RevenueByCustomerRow[]).map((r, i) => (
                  <TableRow key={r.customerId ?? i}>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.phone ? formatPhone(r.phone) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'thuong-hieu' || tab === 'danh-muc' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tab === 'thuong-hieu' ? 'Thương hiệu' : 'Danh mục'}</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as RevenueByDimensionRow[]).map((r) => (
                  <TableRow key={r.dimensionId ?? 'unclassified'}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
                    <TableCell className="text-right">{r.percentage}%</TableCell>
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
                {(data.rows as RevenueByEmployeeRow[]).map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>{r.userName}</TableCell>
                    <TableCell className="text-right font-mono">{r.orderCount}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
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
