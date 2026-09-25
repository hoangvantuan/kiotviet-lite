import { and, eq, sql } from 'drizzle-orm'

import { documentCounters, orderReturns, orders, purchaseOrders } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'

const SEQUENCE_DIGITS = 4
const MAX_DAILY_SEQUENCE = 9999

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Ngày theo giờ Việt Nam dạng YYYYMMDD. */
export function formatDateForCode(date: Date): string {
  return DATE_FORMATTER.format(date).replace(/-/g, '')
}

type DocumentKind = 'order' | 'return' | 'purchase_order'

const DOCUMENTS = {
  order: {
    table: orders,
    column: orders.orderNumber,
    storeColumn: orders.storeId,
    prefix: (date: Date) => `HD-${formatDateForCode(date).slice(2)}-`,
    label: 'đơn hàng',
  },
  return: {
    table: orderReturns,
    column: orderReturns.returnNumber,
    storeColumn: orderReturns.storeId,
    prefix: (date: Date) => `TH-${formatDateForCode(date).slice(2)}-`,
    label: 'phiếu trả',
  },
  purchase_order: {
    table: purchaseOrders,
    column: purchaseOrders.code,
    storeColumn: purchaseOrders.storeId,
    prefix: (date: Date) => `PN-${formatDateForCode(date)}-`,
    label: 'phiếu nhập',
  },
} as const

/**
 * OFF-08: cấp mã chứng từ kế tiếp từ bộ đếm theo cửa hàng (`document_counters`), thay cho
 * `MAX + 1` rồi thử lại khi đụng mã. Phải gọi bên trong transaction tạo chứng từ: dòng bộ đếm bị
 * khóa tới khi transaction kết thúc, nên hai lần bán song song nhận hai số khác nhau, và nếu
 * transaction rollback thì số cũng được trả lại (mã không bị nhảy).
 *
 * Lần đầu một tiền tố xuất hiện (sang ngày mới, hoặc dữ liệu có từ trước khi có bộ đếm), số bắt đầu
 * sau mã lớn nhất đang có của tiền tố đó. Hai transaction cùng gieo một lúc vẫn đúng: bên thua chờ
 * bên thắng commit rồi đi nhánh ON CONFLICT DO UPDATE.
 */
export async function nextDocumentCode({
  db,
  storeId,
  kind,
  date = new Date(),
}: {
  db: Db
  storeId: string
  kind: DocumentKind
  date?: Date
}): Promise<string> {
  const doc = DOCUMENTS[kind]
  const prefix = doc.prefix(date)
  // Số nguyên do máy chủ tự tính, nhúng thẳng để Postgres không phải đoán kiểu tham số
  const suffixStart = sql.raw(String(prefix.length + 1))
  const prefixLength = sql.raw(String(prefix.length))

  const increment = { lastValue: sql`${documentCounters.lastValue} + 1`, updatedAt: new Date() }
  // Đường thường gặp: tiền tố đã có bộ đếm, chỉ một câu UPDATE (khóa dòng tới hết transaction)
  let [row] = await db
    .update(documentCounters)
    .set(increment)
    .where(and(eq(documentCounters.storeId, storeId), eq(documentCounters.prefix, prefix)))
    .returning({ value: documentCounters.lastValue })

  if (!row) {
    const [seed] = await db
      .select({
        max: sql<number | null>`MAX(substring(${doc.column} FROM ${suffixStart})::int)`,
      })
      .from(doc.table)
      .where(
        and(
          eq(doc.storeColumn, storeId),
          sql`left(${doc.column}, ${prefixLength}) = ${prefix}`,
          sql`substring(${doc.column} FROM ${suffixStart}) ~ '^[0-9]+$'`,
        ),
      )
    ;[row] = await db
      .insert(documentCounters)
      .values({ storeId, prefix, lastValue: Number(seed?.max ?? 0) + 1 })
      .onConflictDoUpdate({
        target: [documentCounters.storeId, documentCounters.prefix],
        set: increment,
      })
      .returning({ value: documentCounters.lastValue })
  }

  const value = row?.value
  if (value === undefined || value < 1) {
    throw new ApiError('INTERNAL_ERROR', `Không cấp được mã ${doc.label}`)
  }
  if (value > MAX_DAILY_SEQUENCE) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Đã vượt quá ${MAX_DAILY_SEQUENCE} ${doc.label} trong ngày, vui lòng liên hệ hỗ trợ`,
    )
  }
  return `${prefix}${String(value).padStart(SEQUENCE_DIGITS, '0')}`
}
