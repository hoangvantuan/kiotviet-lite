export function convertToBaseUnit(quantity: number, factor: number): number {
  return quantity * factor
}

export function formatUnitDisplay(unit: string, factor: number, baseUnit: string): string {
  return `1 ${unit} = ${factor} ${baseUnit}`
}

export interface ExistingUnit {
  unit: string
}

export function validateUnitNotConflict(
  unit: string,
  parentUnit: string,
  others: ExistingUnit[],
  selfIndex?: number,
): string | null {
  const trimmed = unit.trim()
  if (trimmed.length === 0) return 'Đơn vị không được trống'
  if (trimmed.toLowerCase() === parentUnit.trim().toLowerCase()) {
    return 'Đơn vị quy đổi phải khác đơn vị tính của sản phẩm'
  }
  for (let i = 0; i < others.length; i++) {
    if (selfIndex !== undefined && i === selfIndex) continue
    if (others[i]!.unit.trim().toLowerCase() === trimmed.toLowerCase()) {
      return 'Đơn vị quy đổi đã tồn tại'
    }
  }
  return null
}
