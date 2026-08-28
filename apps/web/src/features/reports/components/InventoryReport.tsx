import { useState } from 'react'

import type {
  ExportFormat,
  InventoryCurrentResponse,
  InventoryCurrentRow,
  InventoryReorderRow,
  InventoryReportTab,
  InventorySlowRow,
} from '@kiotviet-lite/shared'

import { Pagination } from '@/components/shared/pagination'
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

import { useInventoryReport } from '../hooks/use-reports'
import { downloadReportExport } from '../reports-api'
import { ReportExportButton } from './ReportExportButton'

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n)
}

export function InventoryReport() {
  const [tab, setTab] = useState<InventoryReportTab>('current')
  const [page, setPage] = useState<number>(1)

  const { data, isLoading } = useInventoryReport(tab, page, 20)

  const handleExport = (format: ExportFormat) => {
    downloadReportExport('inventory', format, { tab })
  }

  const handleTabChange = (v: string) => {
    setTab(v as InventoryReportTab)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Báo cáo tồn kho</h1>
        <ReportExportButton onExport={handleExport} />
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="current">Tồn hiện tại</TabsTrigger>
          <TabsTrigger value="reorder">Cần nhập</TabsTrigger>
          <TabsTrigger value="slow">Hàng chậm bán</TabsTrigger>
        </TabsList>
      </Tabs>

      {data && 'summary' in data && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Tổng SP</p>
              <p className="text-2xl font-bold font-mono">
                {(data as InventoryCurrentResponse).summary.totalProducts}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Tổng giá trị tồn</p>
              <p className="text-2xl font-bold font-mono">
                {formatVND((data as InventoryCurrentResponse).summary.totalStockValue)}
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
          ) : tab === 'current' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Giá trị tồn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as InventoryCurrentResponse).rows.map((r: InventoryCurrentRow) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.currentStock}</TableCell>
                    <TableCell className="text-right font-mono">{formatVND(r.costPrice)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatVND(r.stockValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === 'reorder' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tồn hiện tại</TableHead>
                  <TableHead className="text-right">Định mức</TableHead>
                  <TableHead className="text-right">Cần nhập</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as InventoryReorderRow[]).map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.currentStock}</TableCell>
                    <TableCell className="text-right font-mono">{r.minStock}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-orange-600">
                      {r.reorderQuantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead>Ngày bán cuối</TableHead>
                  <TableHead className="text-right">Số ngày</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rows as InventorySlowRow[]).map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono">{r.currentStock}</TableCell>
                    <TableCell>{r.lastSoldDate ?? 'Chưa bán'}</TableCell>
                    <TableCell className="text-right font-mono">{r.daysSinceLastSold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data && 'pagination' in data && data.pagination && (
            <div className="p-4">
              <Pagination
                page={data.pagination.page}
                pageSize={data.pagination.pageSize}
                total={data.pagination.total}
                totalPages={data.pagination.totalPages}
                onPageChange={setPage}
                unitLabel="sản phẩm"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
