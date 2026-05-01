import type { CompareRow, CompareSummary } from '../schema/price-list-management.js'

export interface ComputeCompareRowInput {
  productId: string
  productName: string
  productSku: string
  productImageUrl: string | null
  productSellingPrice: number
  productCostPrice: number | null
  priceA: number | null
  priceB: number | null
}

function roundTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

export function computeCompareRow(input: ComputeCompareRowInput): CompareRow {
  const {
    productId,
    productName,
    productSku,
    productImageUrl,
    productSellingPrice,
    productCostPrice,
    priceA,
    priceB,
  } = input

  const isMissingA = priceA === null
  const isMissingB = priceB === null

  const diffAmount = priceA !== null && priceB !== null ? priceB - priceA : null

  const diffPercent =
    priceA !== null && priceA > 0 && priceB !== null
      ? roundTwoDecimals(((priceB - priceA) / priceA) * 100)
      : null

  const marginA =
    priceA !== null && priceA > 0 && productCostPrice !== null
      ? roundTwoDecimals(((priceA - productCostPrice) / priceA) * 100)
      : null

  const marginB =
    priceB !== null && priceB > 0 && productCostPrice !== null
      ? roundTwoDecimals(((priceB - productCostPrice) / priceB) * 100)
      : null

  const isBelowCostA = priceA !== null && productCostPrice !== null && priceA < productCostPrice
  const isBelowCostB = priceB !== null && productCostPrice !== null && priceB < productCostPrice

  return {
    productId,
    productName,
    productSku,
    productImageUrl,
    productSellingPrice,
    productCostPrice,
    priceA,
    priceB,
    diffAmount,
    diffPercent,
    marginA,
    marginB,
    isBelowCostA,
    isBelowCostB,
    isMissingA,
    isMissingB,
  }
}

export function computeCompareSummary(rows: CompareRow[]): CompareSummary {
  let bothCount = 0
  let onlyACount = 0
  let onlyBCount = 0
  let diffOver10Count = 0
  let belowCostBCount = 0
  let belowCostACount = 0

  for (const row of rows) {
    if (!row.isMissingA && !row.isMissingB) {
      bothCount++
      if (row.diffPercent !== null && Math.abs(row.diffPercent) > 10) {
        diffOver10Count++
      }
    } else if (row.isMissingB && !row.isMissingA) {
      onlyACount++
    } else if (row.isMissingA && !row.isMissingB) {
      onlyBCount++
    }
    if (row.isBelowCostB) belowCostBCount++
    if (row.isBelowCostA) belowCostACount++
  }

  return {
    totalProducts: rows.length,
    bothCount,
    onlyACount,
    onlyBCount,
    diffOver10Count,
    belowCostBCount,
    belowCostACount,
  }
}
