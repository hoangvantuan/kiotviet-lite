import type { FormulaType, RoundingRule } from '../schema/price-list-management.js'
import { formatVndWithSuffix } from './currency.js'

const ROUNDING_UNITS: Record<
  RoundingRule,
  { unit: number; mode: 'round' | 'ceil' | 'floor' } | null
> = {
  none: null,
  nearest_hundred: { unit: 100, mode: 'round' },
  nearest_five_hundred: { unit: 500, mode: 'round' },
  nearest_thousand: { unit: 1000, mode: 'round' },
  ceil_hundred: { unit: 100, mode: 'ceil' },
  ceil_five_hundred: { unit: 500, mode: 'ceil' },
  ceil_thousand: { unit: 1000, mode: 'ceil' },
  floor_hundred: { unit: 100, mode: 'floor' },
  floor_five_hundred: { unit: 500, mode: 'floor' },
  floor_thousand: { unit: 1000, mode: 'floor' },
}

export function applyFormula(
  basePrice: number,
  formulaType: FormulaType,
  formulaValue: number,
): number {
  let result: number
  switch (formulaType) {
    case 'percent_increase':
      result = Math.round((basePrice * (10000 + formulaValue)) / 10000)
      break
    case 'percent_decrease':
      result = Math.round((basePrice * (10000 - formulaValue)) / 10000)
      break
    case 'amount_increase':
      result = basePrice + formulaValue
      break
    case 'amount_decrease':
      result = basePrice - formulaValue
      break
  }
  return Math.max(0, result)
}

export function applyRounding(price: number, rule: RoundingRule): number {
  const cfg = ROUNDING_UNITS[rule]
  if (!cfg) return price
  const fn = cfg.mode === 'round' ? Math.round : cfg.mode === 'ceil' ? Math.ceil : Math.floor
  return fn(price / cfg.unit) * cfg.unit
}

export function computeFinalPrice(
  basePrice: number,
  formulaType: FormulaType,
  formulaValue: number,
  roundingRule: RoundingRule,
): number {
  const computed = applyFormula(basePrice, formulaType, formulaValue)
  const rounded = applyRounding(computed, roundingRule)
  return Math.max(0, rounded)
}

export function formatFormulaLabel(formulaType: FormulaType, formulaValue: number): string {
  switch (formulaType) {
    case 'percent_increase':
      return `Tăng ${(formulaValue / 100).toString()}%`
    case 'percent_decrease':
      return `Giảm ${(formulaValue / 100).toString()}%`
    case 'amount_increase':
      return `Tăng ${formatVndWithSuffix(formulaValue)}`
    case 'amount_decrease':
      return `Giảm ${formatVndWithSuffix(formulaValue)}`
  }
}

export function formatRoundingLabel(rule: RoundingRule): string {
  switch (rule) {
    case 'none':
      return 'Không làm tròn'
    case 'nearest_hundred':
      return `Làm tròn ${formatVndWithSuffix(100)}`
    case 'nearest_five_hundred':
      return `Làm tròn ${formatVndWithSuffix(500)}`
    case 'nearest_thousand':
      return `Làm tròn ${formatVndWithSuffix(1000)}`
    case 'ceil_hundred':
      return `Làm tròn lên ${formatVndWithSuffix(100)}`
    case 'ceil_five_hundred':
      return `Làm tròn lên ${formatVndWithSuffix(500)}`
    case 'ceil_thousand':
      return `Làm tròn lên ${formatVndWithSuffix(1000)}`
    case 'floor_hundred':
      return `Làm tròn xuống ${formatVndWithSuffix(100)}`
    case 'floor_five_hundred':
      return `Làm tròn xuống ${formatVndWithSuffix(500)}`
    case 'floor_thousand':
      return `Làm tròn xuống ${formatVndWithSuffix(1000)}`
  }
}
