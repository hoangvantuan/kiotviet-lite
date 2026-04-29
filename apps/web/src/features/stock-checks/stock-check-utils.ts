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
    const diff = it.actualQty - it.systemQty
    if (diff > 0) pos += diff
    else if (diff < 0) neg += -diff
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
    return { text: `+${diff}`, className: 'text-green-600 font-medium' }
  }
  if (diff < 0) {
    return { text: String(diff), className: 'text-red-600 font-medium' }
  }
  return { text: '0', className: 'text-gray-500' }
}
