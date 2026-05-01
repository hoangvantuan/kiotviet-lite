import type { CompareRow } from '@kiotviet-lite/shared'

import { buildCsv } from '../../../lib/csv'

const HEADERS = [
  'product_sku',
  'product_name',
  'cost_price',
  'price_a',
  'margin_a_percent',
  'price_b',
  'margin_b_percent',
  'diff_amount',
  'diff_percent',
  'below_cost_a',
  'below_cost_b',
]

function numOrEmpty(value: number | null): string | number {
  if (value === null || Number.isNaN(value)) return ''
  return value
}

function floatOrEmpty(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ''
  return value.toFixed(2)
}

function boolBit(value: boolean): number {
  return value ? 1 : 0
}

export function buildCompareCsv(rows: CompareRow[]): string {
  const dataRows: (string | number | null)[][] = rows.map((r) => [
    r.productSku,
    r.productName,
    numOrEmpty(r.productCostPrice),
    numOrEmpty(r.priceA),
    floatOrEmpty(r.marginA),
    numOrEmpty(r.priceB),
    floatOrEmpty(r.marginB),
    numOrEmpty(r.diffAmount),
    floatOrEmpty(r.diffPercent),
    boolBit(r.isBelowCostA),
    boolBit(r.isBelowCostB),
  ])
  return buildCsv(HEADERS, dataRows)
}
