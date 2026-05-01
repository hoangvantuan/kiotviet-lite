import type { CompareRow } from '@kiotviet-lite/shared'

export interface CompareFiltersState {
  search: string
  onlyBelowCostB: boolean
  onlyDiffOver10: boolean
  onlyBoth: boolean
}

export const DEFAULT_COMPARE_FILTERS: CompareFiltersState = {
  search: '',
  onlyBelowCostB: false,
  onlyDiffOver10: false,
  onlyBoth: false,
}

export function applyCompareFilters(
  rows: CompareRow[],
  filters: CompareFiltersState,
): CompareRow[] {
  const term = filters.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (filters.onlyBelowCostB && !r.isBelowCostB) return false
    if (filters.onlyDiffOver10 && (r.diffPercent === null || Math.abs(r.diffPercent) <= 10))
      return false
    if (filters.onlyBoth && (r.isMissingA || r.isMissingB)) return false
    if (
      term &&
      !r.productName.toLowerCase().includes(term) &&
      !r.productSku.toLowerCase().includes(term)
    )
      return false
    return true
  })
}
