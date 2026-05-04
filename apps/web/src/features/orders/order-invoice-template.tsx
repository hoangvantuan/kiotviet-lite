import { formatVnd, formatVndWithSuffix } from '@/lib/currency'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { numberToVietnameseWords } from '@/lib/number-to-words'
import { usePrintStore } from '@/stores/use-print-store'

import type { OrderDetailItem, OrderDetailResponse } from './orders-api'
import type { PrintFormat } from './use-print-order'

// ---- Shared types ----

export interface InvoiceStoreInfo {
  name?: string | null
  address?: string | null
  phone?: string | null
  slogan?: string | null
}

interface InvoiceProps {
  order: OrderDetailResponse
  store?: InvoiceStoreInfo
  isReprint?: boolean
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

// ================================================================
// THERMAL TEMPLATE (CSS fallback for browser print)
// ================================================================

/** Kiểm tra format hiện tại có phải thermal không */
function isThermalFormat(f: PrintFormat | null): boolean {
  return f === 'thermal-58' || f === 'thermal-80'
}

export function OrderInvoiceThermal({ order, store, isReprint }: InvoiceProps) {
  const activePrintFormat = usePrintStore((s) => s.activePrintFormat)

  // C1: Chỉ hiện template khi format đang in là thermal
  if (!isThermalFormat(activePrintFormat)) return null

  // M5: Infer paper width từ active format thay vì hardcode 80mm
  const is58mm = activePrintFormat === 'thermal-58'
  const width = is58mm ? '54mm' : '76mm'
  const pageSize = is58mm ? '58mm auto' : '80mm auto'

  return (
    <div
      id="print-invoice-thermal"
      className="print-template-container hidden print:block print:p-2 print:font-sans print:text-black print:text-xs"
    >
      <style>{`
        @media print {
          @page { size: ${pageSize}; margin: 2mm; }
          #print-invoice-thermal { width: ${width}; }
        }
      `}</style>

      {/* Store header */}
      <header className="text-center">
        {store?.name && (
          <h1 className="text-sm font-bold">{store.name}</h1>
        )}
        {store?.slogan && (
          <p className="text-[10px]">{store.slogan}</p>
        )}
        {store?.address && (
          <p className="text-[10px]">{store.address}</p>
        )}
        {store?.phone && (
          <p className="text-[10px]">SĐT: {store.phone}</p>
        )}
      </header>

      {isReprint && (
        <p className="text-center font-bold text-xs mt-1">*** BẢN IN LẠI ***</p>
      )}

      <ThermalSeparator />

      {/* Order info */}
      <div className="flex justify-between">
        <span>HĐ: {order.orderNumber}</span>
        <span>{formatDateTime(order.createdAt)}</span>
      </div>
      {order.customerName && <p>KH: {order.customerName}</p>}
      {order.customerPhone && <p>SĐT: {order.customerPhone}</p>}

      <ThermalSeparator />

      {/* Items */}
      <div className="space-y-1">
        {order.items.map((item) => (
          <ThermalItemRow key={item.id} item={item} />
        ))}
      </div>

      <ThermalSeparator />

      {/* Totals */}
      <div className="space-y-0.5">
        <ThermalRow label="Tạm tính" value={formatVnd(order.subtotal)} />
        {order.discountAmount > 0 && (
          <ThermalRow label="Chiết khấu" value={`-${formatVnd(order.discountAmount)}`} />
        )}
        <ThermalRow label="TỔNG" value={formatVnd(order.total)} bold />
        <ThermalRow
          label="Thanh toán"
          value={PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
        />
        {order.cashAmount != null && order.cashAmount > 0 && (
          <ThermalRow label="Tiền mặt" value={formatVnd(order.cashAmount)} />
        )}
        {order.transferAmount != null && order.transferAmount > 0 && (
          <ThermalRow label="Chuyển khoản" value={formatVnd(order.transferAmount)} />
        )}
        {order.change > 0 && (
          <ThermalRow label="Tiền thừa" value={formatVnd(order.change)} />
        )}
        {order.debtAmount > 0 && (
          <ThermalRow label="Còn nợ" value={formatVnd(order.debtAmount)} />
        )}
      </div>

      <ThermalSeparator />

      <p className="text-center mt-1">Cảm ơn quý khách!</p>
    </div>
  )
}

function ThermalSeparator() {
  return <div className="border-t border-dashed border-black my-1" />
}

function ThermalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function ThermalItemRow({ item }: { item: OrderDetailItem }) {
  const name = item.variantName
    ? `${item.productName} (${item.variantName})`
    : item.productName

  return (
    <div>
      <p className="truncate">{name}</p>
      <div className="flex justify-between pl-2">
        <span>
          {item.quantity} x {formatVnd(item.unitPrice)}
        </span>
        <span>{formatVnd(item.lineTotal)}</span>
      </div>
    </div>
  )
}

// ================================================================
// A4 TEMPLATE
// ================================================================

export function OrderInvoiceA4({ order, store, isReprint }: InvoiceProps) {
  const activePrintFormat = usePrintStore((s) => s.activePrintFormat)

  // C1: Chỉ hiện template khi format đang in là a4
  if (activePrintFormat !== 'a4') return null

  return (
    <div
      id="print-invoice-a4"
      className="print-template-container hidden print:block print:p-0 print:font-sans print:text-black print:text-sm"
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          #print-invoice-a4 table { border-collapse: collapse; }
          #print-invoice-a4 th, #print-invoice-a4 td {
            border: 1px solid #333;
            padding: 4px 8px;
          }
          #print-invoice-a4 tr { break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <header className="flex justify-between items-start mb-4">
        <div className="flex-1">
          {store?.name && (
            <h2 className="text-base font-bold">{store.name}</h2>
          )}
          {store?.address && (
            <p className="text-xs">{store.address}</p>
          )}
          {store?.phone && (
            <p className="text-xs">SĐT: {store.phone}</p>
          )}
        </div>
        {isReprint && (
          <span className="text-xs font-bold border border-black px-2 py-0.5">
            BẢN IN LẠI
          </span>
        )}
      </header>

      {/* Title */}
      <h1 className="text-center text-lg font-bold mb-4">HÓA ĐƠN BÁN HÀNG</h1>

      {/* Order meta */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
        <p>Mã HĐ: <span className="font-mono font-medium">{order.orderNumber}</span></p>
        <p>Ngày: {formatDateTime(order.createdAt)}</p>
        <p>Khách hàng: <span className="font-medium">{order.customerName ?? 'Khách lẻ'}</span></p>
        {order.customerPhone && <p>SĐT: {order.customerPhone}</p>}
        {order.customerGroupName && <p>Nhóm KH: {order.customerGroupName}</p>}
      </div>

      {/* Items table */}
      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-center w-10">STT</th>
            <th className="text-left">Tên sản phẩm</th>
            <th className="text-center">ĐVT</th>
            <th className="text-right">SL</th>
            <th className="text-right">Đơn giá</th>
            <th className="text-right">CK</th>
            <th className="text-right">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={item.id}>
              <td className="text-center">{idx + 1}</td>
              <td>
                {item.productName}
                {item.variantName && (
                  <span className="text-xs text-gray-500"> ({item.variantName})</span>
                )}
              </td>
              <td className="text-center">{item.unit ?? ''}</td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right">{formatVnd(item.unitPrice)}</td>
              <td className="text-right">
                {item.discountAmount > 0 ? formatVnd(item.discountAmount) : ''}
              </td>
              <td className="text-right font-medium">{formatVnd(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <A4Totals order={order} />

      {/* Amount in words */}
      <p className="text-sm italic mt-2 mb-4">
        Bằng chữ: {numberToVietnameseWords(order.total)}
      </p>

      {/* Payment info */}
      <div className="text-sm space-y-1 mb-6">
        <p>
          Thanh toán: {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
        </p>
        <p>Đã trả: {formatVndWithSuffix(order.paidAmount)}</p>
        {order.debtAmount > 0 && (
          <p className="font-medium">Còn nợ: {formatVndWithSuffix(order.debtAmount)}</p>
        )}
      </div>

      {/* Note */}
      {order.note && (
        <p className="text-sm mb-4">Ghi chú: {order.note}</p>
      )}

      {/* Signatures */}
      <div className="flex justify-around mt-8 text-sm text-center">
        <div>
          <p className="font-medium">Người mua hàng</p>
          <p className="text-xs text-gray-500 italic">(ký, họ tên)</p>
          <div className="h-20" />
        </div>
        <div>
          <p className="font-medium">Người bán hàng</p>
          <p className="text-xs text-gray-500 italic">(ký, họ tên)</p>
          <div className="h-20" />
        </div>
      </div>
    </div>
  )
}

function A4Totals({ order }: { order: OrderDetailResponse }) {
  return (
    <div className="flex justify-end">
      <div className="w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Tạm tính:</span>
          <span>{formatVnd(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>
              Chiết khấu
              {order.discountType === 'percent' && order.discountValue
                ? ` (${order.discountValue}%)`
                : ''}
              :
            </span>
            <span>-{formatVnd(order.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-black pt-1">
          <span>Tổng thanh toán:</span>
          <span>{formatVnd(order.total)}</span>
        </div>
      </div>
    </div>
  )
}

// ================================================================
// A5 TEMPLATE (compact version of A4)
// ================================================================

export function OrderInvoiceA5({ order, store, isReprint }: InvoiceProps) {
  const activePrintFormat = usePrintStore((s) => s.activePrintFormat)

  // C1: Chỉ hiện template khi format đang in là a5
  if (activePrintFormat !== 'a5') return null

  return (
    <div
      id="print-invoice-a5"
      className="print-template-container hidden print:block print:p-0 print:font-sans print:text-black print:text-xs"
    >
      <style>{`
        @media print {
          @page { size: A5; margin: 10mm; }
          #print-invoice-a5 table { border-collapse: collapse; }
          #print-invoice-a5 th, #print-invoice-a5 td {
            border: 1px solid #333;
            padding: 2px 4px;
            font-size: 11px;
          }
          #print-invoice-a5 tr { break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <header className="flex justify-between items-start mb-2">
        <div className="flex-1">
          {store?.name && (
            <h2 className="text-sm font-bold">{store.name}</h2>
          )}
          {store?.address && (
            <p className="text-[10px]">{store.address}</p>
          )}
          {store?.phone && (
            <p className="text-[10px]">SĐT: {store.phone}</p>
          )}
        </div>
        {isReprint && (
          <span className="text-[10px] font-bold border border-black px-1 py-0.5">
            BẢN IN LẠI
          </span>
        )}
      </header>

      {/* Title */}
      <h1 className="text-center text-sm font-bold mb-2">HÓA ĐƠN BÁN HÀNG</h1>

      {/* Order meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-2">
        <p>Mã HĐ: <span className="font-mono">{order.orderNumber}</span></p>
        <p>Ngày: {formatDateTime(order.createdAt)}</p>
        <p>KH: {order.customerName ?? 'Khách lẻ'}</p>
        {order.customerPhone && <p>SĐT: {order.customerPhone}</p>}
      </div>

      {/* Items table */}
      <table className="w-full mb-2">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-center w-6">STT</th>
            <th className="text-left">Sản phẩm</th>
            <th className="text-right">SL</th>
            <th className="text-right">Đơn giá</th>
            <th className="text-right">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={item.id}>
              <td className="text-center">{idx + 1}</td>
              <td>
                {item.productName}
                {item.variantName && (
                  <span className="text-[10px] text-gray-500"> ({item.variantName})</span>
                )}
              </td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right">{formatVnd(item.unitPrice)}</td>
              <td className="text-right">{formatVnd(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-1">
        <div className="w-48 space-y-0.5 text-[11px]">
          <div className="flex justify-between">
            <span>Tạm tính:</span>
            <span>{formatVnd(order.subtotal)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between">
              <span>CK:</span>
              <span>-{formatVnd(order.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-black pt-0.5">
            <span>Tổng:</span>
            <span>{formatVnd(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <p className="text-[10px] italic mb-2">
        Bằng chữ: {numberToVietnameseWords(order.total)}
      </p>

      {/* Payment */}
      <div className="text-[11px] space-y-0.5 mb-3">
        <p>TT: {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} | Đã trả: {formatVndWithSuffix(order.paidAmount)}</p>
        {order.debtAmount > 0 && (
          <p className="font-medium">Còn nợ: {formatVndWithSuffix(order.debtAmount)}</p>
        )}
      </div>

      {/* Signatures */}
      <div className="flex justify-around text-[11px] text-center">
        <div>
          <p className="font-medium">Người mua hàng</p>
          <p className="text-[10px] text-gray-500 italic">(ký, họ tên)</p>
          <div className="h-14" />
        </div>
        <div>
          <p className="font-medium">Người bán hàng</p>
          <p className="text-[10px] text-gray-500 italic">(ký, họ tên)</p>
          <div className="h-14" />
        </div>
      </div>
    </div>
  )
}
