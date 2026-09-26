import type { ShiftDetail, ShiftSummary } from '@kiotviet-lite/shared'

import { formatVndWithSuffix } from '@/lib/currency'
import { formatDateTime } from '@/lib/date'
import { cn } from '@/lib/utils'

import { differenceLabel } from './shift-format'

function Row({
  label,
  value,
  strong,
  testId,
}: {
  label: string
  value: string
  strong?: boolean
  testId?: string
}) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'font-semibold')}>
      <span className={strong ? undefined : 'text-muted-foreground print:text-black'}>{label}</span>
      <span className="font-mono" data-testid={testId}>
        {value}
      </span>
    </div>
  )
}

/** Các dòng tiền mặt của ca, theo đúng công thức máy chủ tính `expectedCash`. */
export function ShiftCashLines({ summary }: { summary: ShiftSummary }) {
  return (
    <div className="space-y-1 text-sm">
      <Row label="Tiền quỹ đầu ca" value={formatVndWithSuffix(summary.openingCash)} />
      <Row label="+ Bán hàng tiền mặt" value={formatVndWithSuffix(summary.cashSales)} />
      <Row label="+ Thu nợ tiền mặt" value={formatVndWithSuffix(summary.cashReceipts)} />
      <Row
        label="+ Nhà cung cấp hoàn tiền mặt"
        value={formatVndWithSuffix(summary.cashSupplierRefunds)}
        testId="shift-cash-supplier-refunds"
      />
      <Row
        label="- Hoàn tiền mặt (trả hàng, hủy đơn)"
        value={formatVndWithSuffix(summary.cashRefunds)}
      />
      <Row
        label="- Chi tiền mặt cho nhà cung cấp"
        value={formatVndWithSuffix(summary.cashSupplierPayments)}
      />
      <Row
        label="= Tiền mặt phải có"
        value={formatVndWithSuffix(summary.expectedCash)}
        strong
        testId="shift-expected-cash"
      />
    </div>
  )
}

function OtherChannels({ summary }: { summary: ShiftSummary }) {
  return (
    <div className="space-y-1 text-sm">
      <Row label="Nhận chuyển khoản" value={formatVndWithSuffix(summary.transferIn)} />
      <Row label="Nhận QR" value={formatVndWithSuffix(summary.qrIn)} />
      <Row
        label="Hoàn hoặc chi chuyển khoản, QR"
        value={formatVndWithSuffix(summary.transferOut)}
      />
      <Row label="Bán ghi nợ" value={formatVndWithSuffix(summary.debtSales)} />
      <Row
        label="Số chứng từ"
        value={`${summary.orderCount} đơn · ${summary.receiptCount} phiếu thu · ${summary.returnCount} phiếu trả · ${summary.supplierPaymentCount} phiếu chi`}
      />
    </div>
  )
}

/**
 * POS-06: biên bản đóng ca. Ca đã đóng dùng số chụp lúc đóng (`closeSummary`), vì chứng từ đồng bộ
 * ngoại tuyến có thể gắn vào ca sau đó; khi hai bản khác nhau thì báo để người quản lý kiểm tra.
 */
export function ShiftReport({ shift }: { shift: ShiftDetail }) {
  const summary = shift.closeSummary ?? shift.summary
  const changedAfterClose =
    shift.closeSummary !== null && shift.closeSummary.expectedCash !== shift.summary.expectedCash

  return (
    <div className="space-y-4" data-testid="shift-report">
      <div className="space-y-1 text-sm">
        <Row label="Người bán" value={shift.userName ?? '—'} />
        <Row label="Mở ca" value={formatDateTime(shift.openedAt)} />
        {shift.closedAt && <Row label="Đóng ca" value={formatDateTime(shift.closedAt)} />}
        {shift.closedByName && shift.closedBy !== shift.userId && (
          <Row label="Người đóng ca" value={shift.closedByName} />
        )}
      </div>

      <ShiftCashLines summary={summary} />

      {shift.status === 'closed' && shift.countedCash !== null && shift.difference !== null && (
        <div className="space-y-1 rounded-md border p-3 text-sm">
          <Row label="Tiền mặt thực đếm" value={formatVndWithSuffix(shift.countedCash)} strong />
          <div className="flex justify-between gap-4 font-semibold">
            <span>Chênh lệch</span>
            <span
              data-testid="shift-difference"
              className={cn(
                'font-mono',
                shift.difference === 0
                  ? 'text-green-700'
                  : shift.difference < 0
                    ? 'text-destructive'
                    : 'text-amber-700',
              )}
            >
              {differenceLabel(shift.difference)}
            </span>
          </div>
        </div>
      )}

      <OtherChannels summary={summary} />

      {(shift.openNote || shift.closeNote) && (
        <div className="space-y-1 text-sm">
          {shift.openNote && <p>Ghi chú mở ca: {shift.openNote}</p>}
          {shift.closeNote && <p>Ghi chú đóng ca: {shift.closeNote}</p>}
        </div>
      )}

      {changedAfterClose && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          Có chứng từ gắn vào ca sau khi đóng (đơn ngoại tuyến đồng bộ muộn). Tiền mặt phải có tính
          lại hiện là {formatVndWithSuffix(shift.summary.expectedCash)}.
        </p>
      )}
    </div>
  )
}

/** Bản in biên bản đóng ca, chỉ hiện khi in. */
export function ShiftReportPrint({ shift, storeName }: { shift: ShiftDetail; storeName?: string }) {
  return (
    <div className="print-template-container hidden print:block print:p-4 print:font-sans print:text-black">
      {storeName && <h1 className="text-center text-lg font-bold">{storeName}</h1>}
      <h2 className="my-4 text-center text-xl font-bold">BIÊN BẢN ĐÓNG CA</h2>
      <ShiftReport shift={shift} />
      <div className="mt-10 grid grid-cols-2 text-center text-sm">
        <div>
          <p className="font-semibold">Người bán</p>
          <p className="text-xs">(Ký, ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="font-semibold">Người nhận bàn giao</p>
          <p className="text-xs">(Ký, ghi rõ họ tên)</p>
        </div>
      </div>
    </div>
  )
}
