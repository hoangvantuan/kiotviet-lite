import { orders, receipts, stockChecks, supplierPayments } from '@kiotviet-lite/shared/schema'

import type { Db } from './index.js'

interface SeedDataPresence {
  orders: boolean
  receipts: boolean
  supplierPayments: boolean
  stockChecks: boolean
}

/** Dữ liệu mẫu không tạo bản ghi ở bốn bảng này. */
export function getSeedBlockers(data: Readonly<SeedDataPresence>): string[] {
  const blockers: string[] = []
  if (data.orders) blockers.push('đơn hàng (orders)')
  if (data.receipts) blockers.push('phiếu thu (receipts)')
  if (data.supplierPayments) blockers.push('phiếu chi (supplier_payments)')
  if (data.stockChecks) blockers.push('phiếu kiểm kê (stock_checks)')
  return blockers
}

/** Kiểm tra toàn bộ cơ sở dữ liệu: kịch bản xóa mọi cửa hàng, không chỉ một cửa hàng. */
export async function assertSeedSafe(db: Db): Promise<void> {
  if (process.env.FORCE_SEED === '1') return

  const [orderRows, receiptRows, paymentRows, stockCheckRows] = await Promise.all([
    db.select({ id: orders.id }).from(orders).limit(1),
    db.select({ id: receipts.id }).from(receipts).limit(1),
    db.select({ id: supplierPayments.id }).from(supplierPayments).limit(1),
    db.select({ id: stockChecks.id }).from(stockChecks).limit(1),
  ])
  const blockers = getSeedBlockers({
    orders: orderRows.length > 0,
    receipts: receiptRows.length > 0,
    supplierPayments: paymentRows.length > 0,
    stockChecks: stockCheckRows.length > 0,
  })
  if (blockers.length > 0) {
    throw new Error(
      `Không thể khởi tạo dữ liệu mẫu: có dữ liệu thật trong bảng ${blockers.join(', ')}. ` +
        'Không có dữ liệu nào bị xóa. Nếu thực sự muốn xóa dữ liệu, đặt FORCE_SEED=1 rồi chạy pnpm --filter api db:seed.',
    )
  }
}
