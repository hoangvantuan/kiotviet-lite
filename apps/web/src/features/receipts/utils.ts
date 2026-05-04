import type { OpenDebtItem } from '@kiotviet-lite/shared'

export interface FifoAllocation {
  debtId: string
  orderCode: string
  amount: number
}

export interface FifoComputeResult {
  allocations: FifoAllocation[]
  unallocated: number
}

/**
 * Compute FIFO allocation: phân bổ amount vào danh sách debts theo thứ tự (đã sort FIFO ASC).
 * Mỗi debt được trả tối đa = remaining của nó. Phần dư trả ở unallocated.
 */
export function computeFifoAllocation(debts: OpenDebtItem[], amount: number): FifoComputeResult {
  const allocations: FifoAllocation[] = []
  let remaining = amount
  for (const d of debts) {
    if (remaining <= 0) break
    const take = Math.min(d.remaining, remaining)
    if (take > 0) {
      allocations.push({ debtId: d.id, orderCode: d.orderCode, amount: take })
      remaining -= take
    }
  }
  return { allocations, unallocated: remaining }
}
