import { useState } from 'react'

import {
  type CashFlowReport as CashFlowReportData,
  formatVndWithSuffix,
  moneyMethodLabel,
} from '@kiotviet-lite/shared'

import { CurrencyInput } from '@/components/shared/currency-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ShiftDetailDialog } from '@/features/shifts/shift-detail-dialog'
import { differenceLabel } from '@/features/shifts/shift-format'
import { formatDateTime } from '@/lib/date'
import { cn } from '@/lib/utils'

import { reconcileCash, todayLocal } from './cash-reconciliation'
import { useCashFlowReportQuery } from './use-cash-flow'

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-xl font-bold">{formatVndWithSuffix(value)}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function DifferenceText({ value, testId }: { value: number; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'font-mono font-semibold',
        value === 0 ? 'text-green-700' : value < 0 ? 'text-destructive' : 'text-amber-700',
      )}
    >
      {differenceLabel(value)}
    </span>
  )
}

function MethodsTable({ report }: { report: CashFlowReportData }) {
  const total = report.methods.reduce(
    (acc, row) => ({
      salesIn: acc.salesIn + row.salesIn,
      receiptsIn: acc.receiptsIn + row.receiptsIn,
      refundsOut: acc.refundsOut + row.refundsOut,
      supplierPaymentsOut: acc.supplierPaymentsOut + row.supplierPaymentsOut,
      net: acc.net + row.net,
    }),
    { salesIn: 0, receiptsIn: 0, refundsOut: 0, supplierPaymentsOut: 0, net: 0 },
  )
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phương thức</TableHead>
            <TableHead className="text-right">Bán hàng</TableHead>
            <TableHead className="text-right">Thu nợ</TableHead>
            <TableHead className="text-right">Hoàn tiền trả hàng</TableHead>
            <TableHead className="text-right">Chi nhà cung cấp</TableHead>
            <TableHead className="text-right">Thực thu ròng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.methods.map((row) => (
            <TableRow
              key={row.method ?? 'unknown'}
              data-testid={`cash-flow-row-${row.method ?? 'unknown'}`}
            >
              <TableCell>{moneyMethodLabel(row.method)}</TableCell>
              <TableCell className="text-right font-mono">
                {formatVndWithSuffix(row.salesIn)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatVndWithSuffix(row.receiptsIn)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatVndWithSuffix(row.refundsOut)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatVndWithSuffix(row.supplierPaymentsOut)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatVndWithSuffix(row.net)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Tổng</TableCell>
            <TableCell className="text-right font-mono">
              {formatVndWithSuffix(total.salesIn)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatVndWithSuffix(total.receiptsIn)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatVndWithSuffix(total.refundsOut)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatVndWithSuffix(total.supplierPaymentsOut)}
            </TableCell>
            <TableCell className="text-right font-mono font-semibold">
              {formatVndWithSuffix(total.net)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

/** Đối soát khi không dùng ca: người dùng nhập tiền đầu ngày và tiền đếm, tính ngay trên máy. */
function DailyReconciliation({ report }: { report: CashFlowReportData }) {
  const [openingCash, setOpeningCash] = useState<number | null>(null)
  const [countedCash, setCountedCash] = useState<number | null>(null)
  const { expectedCash, difference } = reconcileCash({
    openingCash: openingCash ?? report.cash.openingCash,
    netCash: report.cash.netCash,
    countedCash,
  })
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Đối soát tiền mặt</h2>
      <p className="text-sm text-muted-foreground">
        Nhập tiền mặt có trong ngăn kéo đầu kỳ và số đếm được cuối kỳ. Số này chỉ tính trên máy,
        không lưu.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="recon-opening">Tiền mặt đầu kỳ</Label>
          <CurrencyInput
            id="recon-opening"
            value={openingCash}
            onChange={setOpeningCash}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recon-counted">Tiền mặt đếm được</Label>
          <CurrencyInput
            id="recon-counted"
            value={countedCash}
            onChange={setCountedCash}
            placeholder="0"
          />
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">+ Tiền mặt thu trong kỳ</span>
          <span className="font-mono">{formatVndWithSuffix(report.cash.cashIn)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">- Tiền mặt chi trong kỳ</span>
          <span className="font-mono">{formatVndWithSuffix(report.cash.cashOut)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>= Tiền mặt phải có</span>
          <span className="font-mono" data-testid="recon-expected">
            {formatVndWithSuffix(expectedCash)}
          </span>
        </div>
        {difference !== null && (
          <div className="flex justify-between font-semibold">
            <span>Chênh lệch</span>
            <DifferenceText value={difference} testId="recon-difference" />
          </div>
        )}
      </div>
    </section>
  )
}

function ShiftsSection({
  report,
  onView,
}: {
  report: CashFlowReportData
  onView: (id: string) => void
}) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Ca bán hàng trong kỳ</h2>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người bán</TableHead>
              <TableHead>Mở ca</TableHead>
              <TableHead>Đóng ca</TableHead>
              <TableHead className="text-right">Phải có</TableHead>
              <TableHead className="text-right">Thực đếm</TableHead>
              <TableHead className="text-right">Chênh lệch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.shifts.map((shift) => (
              <TableRow
                key={shift.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onView(shift.id)}
              >
                <TableCell>{shift.userName ?? '—'}</TableCell>
                <TableCell className="text-sm">{formatDateTime(shift.openedAt)}</TableCell>
                <TableCell className="text-sm">
                  {shift.closedAt ? formatDateTime(shift.closedAt) : 'Đang mở'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {shift.expectedCash === null ? '—' : formatVndWithSuffix(shift.expectedCash)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {shift.countedCash === null ? '—' : formatVndWithSuffix(shift.countedCash)}
                </TableCell>
                <TableCell className="text-right">
                  {shift.difference === null ? '—' : <DifferenceText value={shift.difference} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(report.unassigned.orderCount > 0 ||
        report.unassigned.cashIn > 0 ||
        report.unassigned.cashOut > 0) && (
        <p
          className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          data-testid="cash-flow-unassigned"
        >
          Có chứng từ tiền mặt không thuộc ca nào (đơn ngoại tuyến không khớp giờ ca, hoặc lập khi
          chưa mở ca): {report.unassigned.orderCount} đơn, thu{' '}
          {formatVndWithSuffix(report.unassigned.cashIn)}, chi{' '}
          {formatVndWithSuffix(report.unassigned.cashOut)}. Cần đối soát tay.
        </p>
      )}
    </section>
  )
}

/**
 * BC-06: dòng tiền theo phương thức, doanh thu gộp và thuần, đối soát tiền mặt. Tiền ghi nợ không
 * tính là tiền thu cho tới khi có phiếu thu.
 */
export function CashFlowReport() {
  const [from, setFrom] = useState(() => todayLocal())
  const [to, setTo] = useState(() => todayLocal())
  const [viewShiftId, setViewShiftId] = useState<string | null>(null)
  const { data, isLoading, isError } = useCashFlowReportQuery({ from, to })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo dòng tiền</h1>
          <p className="text-sm text-muted-foreground">
            Tiền thực thu, thực chi theo phương thức và đối soát tiền mặt cuối ngày.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cash-flow-from">Từ ngày</Label>
            <Input
              id="cash-flow-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-flow-to">Đến ngày</Label>
            <Input
              id="cash-flow-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {isError && <p className="text-sm text-destructive">Không tải được báo cáo dòng tiền.</p>}

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Doanh thu</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Metric
                label="Doanh thu gộp"
                value={data.revenue.gross}
                hint={`${data.revenue.orderCount} đơn, trước chiết khấu`}
              />
              <Metric label="Chiết khấu dòng hàng" value={data.revenue.lineDiscount} />
              <Metric label="Chiết khấu đơn" value={data.revenue.orderDiscount} />
              <Metric
                label="Hàng trả lại"
                value={data.revenue.returns}
                hint={`${data.revenue.returnCount} phiếu trả`}
              />
              <Metric label="Doanh thu thuần" value={data.revenue.net} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Theo phương thức</h2>
            <MethodsTable report={data} />
            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <p>
                Bán ghi nợ (chưa thu):{' '}
                <span className="font-mono text-foreground">
                  {formatVndWithSuffix(data.debt.debtSales)}
                </span>
              </p>
              <p>
                Trả hàng cấn nợ:{' '}
                <span className="font-mono text-foreground">
                  {formatVndWithSuffix(data.debt.returnDebtReduction)}
                </span>
              </p>
              <p>
                Trả hàng hoàn vào tiền trả trước:{' '}
                <span className="font-mono text-foreground">
                  {formatVndWithSuffix(data.debt.returnPrepaymentRefund)}
                </span>
              </p>
            </div>
          </section>

          {data.shifts.length > 0 && <ShiftsSection report={data} onView={setViewShiftId} />}
          <DailyReconciliation key={`${from}:${to}`} report={data} />
        </>
      )}

      <ShiftDetailDialog
        shiftId={viewShiftId}
        onOpenChange={(open) => {
          if (!open) setViewShiftId(null)
        }}
      />
    </div>
  )
}
