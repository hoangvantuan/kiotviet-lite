import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { encode } from 'uqr'

import { formatVndWithSuffix } from '@/lib/currency'
import { type BankConfig, buildVietQrPayload, isBankConfigured } from '@/lib/vietqr'

import { bankShortName } from '../bank-bins'

interface VietQrPanelProps {
  bank: BankConfig | null
  amount: number
  /** Nội dung chuyển khoản, đã chuẩn hóa */
  note: string
}

/** Ma trận QR vẽ bằng một path SVG, chừa viền trắng 4 ô theo chuẩn để máy quét nhận nhanh. */
function QrSvg({ payload }: { payload: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(payload, { ecc: 'M', border: 0 })
    const quiet = 4
    const parts: string[] = []
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      })
    })
    return { path: parts.join(''), size: qr.size + quiet * 2 }
  }, [payload])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-52 w-52 rounded bg-white"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Mã VietQR"
      data-testid="vietqr-code"
      data-payload={payload}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

/**
 * POS-07: mã VietQR cho khách quét, sinh ngay trên máy nên dùng được khi mất mạng. Cửa hàng chưa
 * khai báo tài khoản nhận tiền thì chỉ hướng dẫn cấu hình, không sinh mã sai.
 */
export function VietQrPanel({ bank, amount, note }: VietQrPanelProps) {
  const payload = useMemo(() => {
    if (!isBankConfigured(bank) || amount <= 0) return null
    try {
      return buildVietQrPayload({
        bankBin: bank.bankBin,
        accountNumber: bank.bankAccountNumber,
        amount,
        note,
      })
    } catch {
      return null
    }
  }, [bank, amount, note])

  if (!isBankConfigured(bank)) {
    return (
      <div
        className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
        data-testid="vietqr-not-configured"
      >
        Chưa có tài khoản nhận chuyển khoản để tạo mã VietQR. Chủ cửa hàng vào{' '}
        <Link to="/settings/store" className="font-medium underline">
          Cài đặt cửa hàng
        </Link>{' '}
        nhập mã ngân hàng (BIN), số tài khoản và tên chủ tài khoản.
      </div>
    )
  }

  if (!payload) return null

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/50 p-3">
      <QrSvg payload={payload} />
      <div className="space-y-0.5 text-center text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{bankShortName(bank.bankBin)}</span>
          {' · '}
          <span className="font-mono">{bank.bankAccountNumber}</span>
        </p>
        {bank.bankAccountName && <p className="uppercase">{bank.bankAccountName}</p>}
        <p>
          Số tiền:{' '}
          <span className="font-semibold text-foreground">{formatVndWithSuffix(amount)}</span>
        </p>
        <p>
          Nội dung: <span className="font-mono font-semibold text-foreground">{note}</span>
        </p>
      </div>
    </div>
  )
}
