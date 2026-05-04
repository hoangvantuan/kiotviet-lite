import type { ReceiptDetail } from '@kiotviet-lite/shared'

import { formatVnd } from '@/lib/currency'

interface StoreInfo {
  name?: string | null
  address?: string | null
  phone?: string | null
}

interface ReceiptPrintTemplateProps {
  receipt: ReceiptDetail
  store?: StoreInfo
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ReceiptPrintTemplate({ receipt, store }: ReceiptPrintTemplateProps) {
  const code = receipt.id.slice(-8).toUpperCase()
  return (
    <div className="hidden print:block print:p-4 print:font-sans print:text-black">
      <header className="text-center">
        {store?.name && <h1 className="text-lg font-bold">{store.name}</h1>}
        {store?.address && <p className="text-xs">{store.address}</p>}
        {store?.phone && <p className="text-xs">SĐT: {store.phone}</p>}
      </header>
      <h2 className="my-4 text-center text-xl font-bold">PHIẾU THU</h2>
      <div className="text-sm space-y-1">
        <p>Mã phiếu: {code}</p>
        <p>Ngày: {formatDateTime(receipt.createdAt)}</p>
        <p>Khách hàng: {receipt.customerName ?? '—'}</p>
        <p>SĐT: {receipt.customerPhone ?? '—'}</p>
      </div>
      <table className="my-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-1 text-left">Mã đơn</th>
            <th className="border p-1 text-right">Nợ trước</th>
            <th className="border p-1 text-right">Phân bổ</th>
            <th className="border p-1 text-right">Nợ sau</th>
          </tr>
        </thead>
        <tbody>
          {receipt.allocations.map((a) => {
            const after = a.debtRemainingAfter ?? 0
            const before = a.amount + after
            return (
              <tr key={a.id}>
                <td className="border p-1">{a.orderCode}</td>
                <td className="border p-1 text-right">{formatVnd(before)}</td>
                <td className="border p-1 text-right">{formatVnd(a.amount)}</td>
                <td className="border p-1 text-right">{formatVnd(after)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-right text-base font-bold">Tổng thu: {formatVnd(receipt.amount)}đ</p>
      {receipt.debtAfter !== null && (
        <p className="text-right text-sm">Nợ còn lại: {formatVnd(receipt.debtAfter)}đ</p>
      )}
      {receipt.note && <p className="mt-2 text-sm">Ghi chú: {receipt.note}</p>}
      <p className="mt-2 text-sm">Người thu: {receipt.createdByName ?? '—'}</p>
      <div className="mt-8 flex justify-around text-sm">
        <div className="text-center">
          <p>Khách hàng</p>
          <p className="mt-12 italic">(ký, họ tên)</p>
        </div>
        <div className="text-center">
          <p>Người thu</p>
          <p className="mt-12 italic">(ký, họ tên)</p>
        </div>
      </div>
    </div>
  )
}
