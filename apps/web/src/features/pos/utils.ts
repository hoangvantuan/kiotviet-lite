const DENOMINATIONS = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000]

/**
 * Returns suggested denomination amounts for cash payment.
 * Each suggestion is the smallest multiple of a denomination that is >= total.
 * Returns up to 5 unique values in ascending order.
 *
 * Examples:
 * - total = 47_000 -> [50_000, 100_000, 200_000, 500_000]
 * - total = 100_000 -> [100_000, 200_000, 500_000]
 * - total = 0 -> []
 */
export function getDenominations(total: number): number[] {
  if (total <= 0) return []

  const result: number[] = []

  for (const d of DENOMINATIONS) {
    const rounded = Math.ceil(total / d) * d
    if (rounded >= total && !result.includes(rounded)) {
      result.push(rounded)
    }
  }

  // Add exact total if not already present
  if (!result.includes(total)) {
    result.unshift(total)
  }

  // Deduplicate, sort ascending, max 5
  return [...new Set(result)].sort((a, b) => a - b).slice(0, 5)
}

import { fromMilli, toMilli } from '@kiotviet-lite/shared'

import type { PosUnitConversion } from './types'

/**
 * Calculates display price and available stock based on unit conversion factor.
 */
export function computeUnitConversionPriceAndStock(
  basePrice: number,
  baseStock: number,
  unitConversion: PosUnitConversion | null,
): { unitPrice: number; stockQuantity: number } {
  if (!unitConversion) {
    return { unitPrice: basePrice, stockQuantity: baseStock }
  }
  const unitPrice =
    unitConversion.sellingPrice && unitConversion.sellingPrice > 0
      ? unitConversion.sellingPrice
      : Math.round(basePrice * unitConversion.conversionFactor)
  // Tồn theo đơn vị lớn làm tròn xuống: về 0,001 khi đơn vị nhận số lẻ, về số nguyên khi không
  const stockQuantity = unitConversion.allowDecimalQuantity
    ? fromMilli(Math.floor(toMilli(baseStock) / unitConversion.conversionFactor))
    : Math.floor(baseStock / unitConversion.conversionFactor)
  return { unitPrice, stockQuantity }
}
