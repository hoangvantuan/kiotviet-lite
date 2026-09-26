import type { NegativeStockDetail, StaleStockCheckItem } from '@kiotviet-lite/shared'
import { addQty, formatQuantity, subQty } from '@kiotviet-lite/shared'

import { ApiClientError } from '@/lib/api-client'

export interface StockCheckDiffSummary {
  totalDiffPositive: number
  totalDiffNegative: number
  unchangedCount: number
  changedCount: number
}

export function computeStockCheckTotals(
  items: { systemQty: number; actualQty: number }[],
): StockCheckDiffSummary {
  let pos = 0
  let neg = 0
  let unchanged = 0
  for (const it of items) {
    const diff = subQty(it.actualQty, it.systemQty)
    if (diff > 0) pos = addQty(pos, diff)
    else if (diff < 0) neg = subQty(neg, diff)
    else unchanged++
  }
  return {
    totalDiffPositive: pos,
    totalDiffNegative: neg,
    unchangedCount: unchanged,
    changedCount: items.length - unchanged,
  }
}

export interface DiffDisplay {
  text: string
  className: string
}

export function formatDiff(diff: number): DiffDisplay {
  if (diff > 0) {
    return { text: `+${formatQuantity(diff)}`, className: 'text-green-600 font-medium' }
  }
  if (diff < 0) {
    return { text: formatQuantity(diff), className: 'text-red-600 font-medium' }
  }
  return { text: '0', className: 'text-gray-500' }
}

/**
 * Thông báo lỗi khi xác nhận phiếu kiểm. Tồn đổi sau lúc đếm (KHO-02) liệt kê từng dòng kèm số lúc
 * đếm và số hiện tại để người dùng biết cần đếm lại dòng nào, rồi sửa phiếu và lưu trước khi xác nhận.
 */
export function formatConfirmStockCheckError(err: unknown): string {
  if (!(err instanceof ApiClientError)) return 'Không xác nhận được phiếu kiểm'
  if (err.code === 'BUSINESS_RULE_VIOLATION') {
    const details = err.details as
      | {
          code?: string
          items?: Array<
            Partial<Pick<NegativeStockDetail, 'wouldBe'>> &
              Partial<Pick<StaleStockCheckItem, 'variantLabel' | 'systemQty' | 'currentStock'>> & {
                productName: string
              }
          >
        }
      | undefined
    const items = Array.isArray(details?.items) ? details.items : null
    if (details?.code === 'STOCK_CHANGED_SINCE_COUNT' && items) {
      const list = items
        .map((d) => {
          const name = d.variantLabel ? `${d.productName} - ${d.variantLabel}` : d.productName
          return `• ${name} (lúc đếm ${formatQuantity(d.systemQty)}, hiện ${formatQuantity(d.currentStock)})`
        })
        .join('\n')
      return `Tồn kho đã thay đổi sau lúc đếm. Vui lòng đếm lại các dòng sau, sửa phiếu và lưu trước khi xác nhận:\n${list}`
    }
    if (details?.code === 'NEGATIVE_STOCK' && items) {
      const list = items
        .map((d) => `• ${d.productName} (sẽ còn ${formatQuantity(d.wouldBe)})`)
        .join('\n')
      return `Tồn sẽ âm sau khi xác nhận:\n${list}`
    }
  }
  return err.message
}
