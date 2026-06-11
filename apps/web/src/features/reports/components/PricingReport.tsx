import { useState } from 'react'

import type {
  ExportFormat,
  PriceComparisonResponse,
  PriceComparisonRow,
  PriceHistoryRow,
  PriceOverrideRow,
  PricingReportTab,
} from '@kiotviet-lite/shared'

import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { usePricingReport } from '../hooks/use-reports'
import { downloadReportExport } from '../reports-api'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { ReportExportButton } from './ReportExportButton'

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function PricingReport() {
  const [tab, setTab] = useState<PricingReportTab>('overrides')
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()

  const { data, isLoading } = usePricingReport({ tab, from, to })

  const handleExport = (format: ExportFormat) => {
    downloadReportExport('pricing', format, { tab, from, to })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Báo cáo giá</h1>
        <ReportExportButton onExport={handleExport} />
      </div>

      {tab !== 'comparison' && (
        <ReportDateRangePicker
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f)
            setTo(t)
          }}
        />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as PricingReportTab)}>
        <TabsList>
          <TabsTrigger value="overrides">Đơn sửa giá</TabsTrigger>
          <TabsTrigger value="comparison">So sánh bảng giá</TabsTrigger>
          <TabsTrigger value="history">L���ch sử giá nhập</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Đang tải...</div>
          ) : !data || !('rows' in data) || data.rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Không có dữ liệu</div>
          ) : tab === 'overrides' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>S���n phẩm</TableHead>
                  <TableHead className="text-right">Giá gốc</TableHead>
                  <TableHead className="text-right">Giá sửa</TableHead>
                  <TableHead className="text-right">Chênh lệch</TableHead>
                  <TableHead>NV</TableHead>
                  <TableHead>Lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as PriceOverrideRow[]).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.orderNumber}</TableCell>
                    <TableCell>{r.orderDate?.slice(0, 10)}</TableCell>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVND(r.originalPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVND(r.overridePrice)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${r.difference < 0 ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {r.difference > 0 ? '+' : ''}
                      {formatVND(r.difference)}
                    </TableCell>
                    <TableCell>{r.userName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'comparison' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  {(data as PriceComparisonResponse).priceLists?.map((pl: string) => (
                    <TableHead key={pl} className="text-right">
                      {pl}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as PriceComparisonResponse).rows.map((r: PriceComparisonRow) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.costPrice)}</TableCell>
                    {r.prices.map((price: number | null, i: number) => {
                      const margin = r.margins[i] ?? null
                      return (
                        <TableCell
                          key={i}
                          className={`text-right font-mono ${margin !== null && margin < 0 ? 'text-red-600 font-bold' : ''}`}
                        >
                          {price !== null ? formatVND(price) : '-'}
                          {margin !== null && (
                            <span className="ml-1 text-xs text-muted-foreground">({margin}%)</span>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Ngày nhập</TableHead>
                  <TableHead>NCC</TableHead>
                  <TableHead className="text-right">Gi�� nhập</TableHead>
                  <TableHead className="text-right">Giá vốn sau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as PriceHistoryRow[]).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.purchaseDate}</TableCell>
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.unitPrice)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.costAfter !== null ? formatVND(r.costAfter) : '-'}
                    </TableCell>
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
