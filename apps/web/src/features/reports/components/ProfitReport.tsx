import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import type { ExportFormat, ProfitRow } from '@kiotviet-lite/shared'
import { formatQuantity, formatVndWithSuffix } from '@kiotviet-lite/shared'

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
import { nextSort, sortRows, type SortState } from '../sort-rows'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { ReportExportButton } from './ReportExportButton'

type ProfitSortKey =
  | 'productName'
  | 'sku'
  | 'quantity'
  | 'revenue'
  | 'cogs'
  | 'profit'
  | 'marginPercent'

const PROFIT_COLUMNS: Array<{ key: ProfitSortKey; label: string; numeric: boolean }> = [
  { key: 'productName', label: 'Sản phẩm', numeric: false },
  { key: 'sku', label: 'Mã hàng', numeric: false },
  { key: 'quantity', label: 'Số lượng', numeric: true },
  { key: 'revenue', label: 'Doanh thu', numeric: true },
  { key: 'cogs', label: 'Giá vốn', numeric: true },
  { key: 'profit', label: 'Lợi nhuận', numeric: true },
  { key: 'marginPercent', label: 'Tỷ suất lợi nhuận', numeric: true },
]

export function ProfitReport() {
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()
  const [sort, setSort] = useState<SortState<ProfitSortKey>>({ key: 'profit', direction: 'desc' })

  const { data, isLoading } = useProfitReport({ from, to })
  const rows = useMemo<ProfitRow[]>(() => (data ? sortRows(data.rows, sort) : []), [data, sort])

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
              <p className="text-xl font-bold font-mono">
                {formatVndWithSuffix(data.summary.totalRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Giá vốn</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">
                {formatVndWithSuffix(data.summary.totalCogs)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Lợi nhuận gộp</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">
                {formatVndWithSuffix(data.summary.grossProfit)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Tỷ suất lợi nhuận</CardTitle>
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
                  {PROFIT_COLUMNS.map((col) => {
                    const active = sort.key === col.key
                    const Icon = !active
                      ? ArrowUpDown
                      : sort.direction === 'asc'
                        ? ArrowUp
                        : ArrowDown
                    return (
                      <TableHead
                        key={col.key}
                        className={col.numeric ? 'text-right' : undefined}
                        aria-sort={
                          active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => setSort((s) => nextSort(s, col.key))}
                        >
                          {col.label}
                          <Icon className="h-3 w-3" />
                        </button>
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.productId} className={r.isLoss ? 'bg-red-50 text-red-700' : ''}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatQuantity(r.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.cogs)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVndWithSuffix(r.profit)}
                    </TableCell>
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
