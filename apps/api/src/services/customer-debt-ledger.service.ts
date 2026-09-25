import { and, asc, eq, gt, gte, inArray, sql } from 'drizzle-orm'

import { customers, debts } from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

/**
 * Sổ công nợ khách hàng (R3): nơi DUY NHẤT được đổi `customers.current_debt` và số dư của
 * `debts`. `current_debt` chỉ là tổng giữ sẵn của `debts.remaining`; mọi bút toán (phát sinh,
 * thu, giảm trừ) đi qua đây để hai số luôn đi cùng nhau và được kiểm ngay trong transaction.
 *
 * Thứ tự khóa toàn hệ thống (TIEN-103), áp cho bán, trả hàng, phiếu thu, điều chỉnh nợ:
 *
 *   1. `orders`: chứng từ gốc đang được sửa (trả hàng khóa đơn bị trả)
 *   2. `customers`
 *   3. `debts`, theo id tăng dần
 *   4. `products`, theo id tăng dần (`lockProductsInIdOrder`)
 *   5. `product_variants`, luôn sau sản phẩm của nó
 *
 * Luồng nào cần bảng đứng sau thì phải khóa xong các bảng đứng trước mà nó sẽ đụng tới, kể cả
 * khóa ngầm: chèn dòng có khóa ngoại tới một bảng sẽ lấy `FOR KEY SHARE` trên dòng được trỏ tới,
 * rồi nâng lên `FOR UPDATE` sau đó là một kiểu khóa ngược. Mọi hàm ghi ở đây tự khóa khách
 * trước, nên người gọi chỉ cần không khóa `debts` hay `products` trước khi gọi vào sổ.
 *
 * Các hàm nhận `db` là transaction của người gọi; gọi ngoài transaction thì không có bảo đảm.
 */

export interface DebtLedgerTarget {
  storeId: string
  customerId: string
}

/** payment: tiền thực thu (phiếu thu); reduction: giảm nợ không thu tiền (trả hàng, điều chỉnh). */
export type DebtSettlementKind = 'payment' | 'reduction'

export interface DebtAllocation {
  debtId: string
  amount: number
}

/** Khóa dòng khách hàng (FOR UPDATE) và trả số công nợ hiện tại. Không lọc khách đã xoá. */
export async function lockCustomerForDebt(db: Db, target: DebtLedgerTarget) {
  const [row] = await db
    .select({ id: customers.id, currentDebt: customers.currentDebt })
    .from(customers)
    .where(and(eq(customers.id, target.customerId), eq(customers.storeId, target.storeId)))
    .for('update')
    .limit(1)
  if (!row) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')
  }
  return { id: row.id, currentDebt: Number(row.currentDebt) }
}

/**
 * Kiểm bất biến `current_debt = sum(debts.remaining)` của một khách. Lệch thì ném lỗi để cả
 * transaction bị hủy, không để lệch mới chồng lên lệch cũ.
 */
export async function assertCustomerDebtBalanced(db: Db, target: DebtLedgerTarget) {
  const [customer] = await db
    .select({ currentDebt: customers.currentDebt })
    .from(customers)
    .where(and(eq(customers.id, target.customerId), eq(customers.storeId, target.storeId)))
    .limit(1)
  const [sum] = await db
    .select({ debtRemaining: sql<number>`COALESCE(SUM(${debts.remaining}), 0)` })
    .from(debts)
    .where(and(eq(debts.customerId, target.customerId), eq(debts.storeId, target.storeId)))
  const currentDebt = Number(customer?.currentDebt ?? 0)
  const debtRemaining = Number(sum?.debtRemaining ?? 0)
  if (currentDebt !== debtRemaining) {
    logger.error({ ...target, currentDebt, debtRemaining }, 'debt_ledger.invariant_violated')
    throw new ApiError(
      'INTERNAL_ERROR',
      'Công nợ khách hàng lệch với tổng các khoản nợ, thao tác đã được hủy. Vui lòng báo quản trị viên',
    )
  }
}

export interface AddCustomerDebtInput extends DebtLedgerTarget {
  type: 'sale' | 'opening' | 'adjustment'
  amount: number
  orderId?: string | null
  note?: string | null
  createdAt?: Date
}

/** Bút toán phát sinh nợ: tạo một khoản nợ và cộng vào công nợ khách. */
export async function addCustomerDebt(db: Db, input: AddCustomerDebtInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Số tiền nợ phải lớn hơn 0')
  }
  await lockCustomerForDebt(db, input)

  const [debt] = await db
    .insert(debts)
    .values({
      storeId: input.storeId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      type: input.type,
      amount: input.amount,
      paid: 0,
      reduced: 0,
      remaining: input.amount,
      note: input.note ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning({ id: debts.id, createdAt: debts.createdAt })
  if (!debt) {
    throw new ApiError('INTERNAL_ERROR', 'Không tạo được khoản nợ')
  }

  await db
    .update(customers)
    .set({ currentDebt: sql`${customers.currentDebt} + ${input.amount}` })
    .where(eq(customers.id, input.customerId))

  await assertCustomerDebtBalanced(db, input)
  return debt
}

export interface SettleCustomerDebtsInput extends DebtLedgerTarget {
  kind: DebtSettlementKind
  allocations: DebtAllocation[]
}

/**
 * Bút toán thu hoặc giảm trừ trên các khoản nợ chỉ định. Mỗi phân bổ không được vượt số còn
 * lại của khoản nợ; tổng phân bổ được trừ vào công nợ khách.
 */
export async function settleCustomerDebts(db: Db, input: SettleCustomerDebtsInput) {
  const allocations = input.allocations.filter((a) => a.amount > 0)
  if (allocations.length === 0) return
  await lockCustomerForDebt(db, input)

  // Khóa các khoản nợ theo id tăng dần để hai luồng cùng khách không khóa chéo nhau
  const debtIds = [...new Set(allocations.map((a) => a.debtId))].sort()
  await db
    .select({ id: debts.id })
    .from(debts)
    .where(inArray(debts.id, debtIds))
    .orderBy(asc(debts.id))
    .for('update')

  const column = input.kind === 'payment' ? debts.paid : debts.reduced
  const columnKey = input.kind === 'payment' ? 'paid' : 'reduced'
  let total = 0
  for (const a of allocations) {
    const updated = await db
      .update(debts)
      .set({
        [columnKey]: sql`${column} + ${a.amount}`,
        remaining: sql`${debts.remaining} - ${a.amount}`,
      })
      .where(
        and(
          eq(debts.id, a.debtId),
          eq(debts.storeId, input.storeId),
          eq(debts.customerId, input.customerId),
          gte(debts.remaining, a.amount),
        ),
      )
      .returning({ id: debts.id })
    if (updated.length !== 1) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Khoản nợ đã thay đổi hoặc không đủ số còn lại, vui lòng tải lại danh sách',
      )
    }
    total += a.amount
  }

  await db
    .update(customers)
    .set({ currentDebt: sql`${customers.currentDebt} - ${total}` })
    .where(eq(customers.id, input.customerId))

  await assertCustomerDebtBalanced(db, input)
}

export interface SettleCustomerDebtsFifoInput extends DebtLedgerTarget {
  kind: DebtSettlementKind
  amount: number
}

/** Giảm trừ hoặc thu theo FIFO: khoản nợ cũ nhất tất toán trước. Trả về phân bổ đã ghi. */
export async function settleCustomerDebtsFifo(
  db: Db,
  input: SettleCustomerDebtsFifoInput,
): Promise<DebtAllocation[]> {
  await lockCustomerForDebt(db, input)
  const openDebts = await db
    .select({ id: debts.id, remaining: debts.remaining })
    .from(debts)
    .where(
      and(
        eq(debts.storeId, input.storeId),
        eq(debts.customerId, input.customerId),
        gt(debts.remaining, 0),
      ),
    )
    .orderBy(asc(debts.createdAt), asc(debts.id))
    .for('update')

  const allocations: DebtAllocation[] = []
  let left = input.amount
  for (const d of openDebts) {
    if (left <= 0) break
    const take = Math.min(left, Number(d.remaining))
    allocations.push({ debtId: d.id, amount: take })
    left -= take
  }
  if (left > 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Số tiền vượt quá tổng nợ còn lại của khách hàng')
  }

  await settleCustomerDebts(db, { ...input, allocations })
  return allocations
}
