import type { VariantsConfigResponse } from '@kiotviet-lite/shared'

const SKU_REGEX = /^[A-Za-z0-9_\-./]+$/

export interface AttributeDef {
  name: string
  values: string[]
}

export interface VariantFormItem {
  id?: string
  sku: string
  barcode: string
  attribute1Value: string
  attribute2Value: string | null
  sellingPrice: number
  costPrice: number | null
  stockQuantity: number
  status: 'active' | 'inactive'
  _isNew?: boolean
  _pendingDelete?: boolean
  _hasTransactions?: boolean
}

export interface VariantsForm {
  attribute1: AttributeDef | null
  attribute2: AttributeDef | null
  variants: VariantFormItem[]
}

export function slugifyForSku(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildVariantSku(
  parentSku: string,
  value1: string,
  value2: string | null,
  index: number,
): string {
  const parts = [slugifyForSku(value1)]
  if (value2 !== null && value2 !== undefined) parts.push(slugifyForSku(value2))
  const filtered = parts.filter((p) => p.length > 0)
  if (filtered.length === 0) return `${parentSku}-V${index + 1}`
  const candidate = `${parentSku}-${filtered.join('-')}`
  if (!SKU_REGEX.test(candidate)) return `${parentSku}-V${index + 1}`
  return candidate
}

export function buildVariantName(value1: string, value2: string | null): string {
  if (value2 === null || value2 === undefined) return value1
  return `${value1} - ${value2}`
}

export function cartesianProduct(
  a: string[],
  b?: string[],
): Array<{ v1: string; v2: string | null }> {
  if (!b || b.length === 0) {
    return a.map((v1) => ({ v1, v2: null }))
  }
  const out: Array<{ v1: string; v2: string | null }> = []
  for (const v1 of a) {
    for (const v2 of b) out.push({ v1, v2 })
  }
  return out
}

interface MergeArgs {
  existing: VariantFormItem[]
  combos: Array<{ v1: string; v2: string | null }>
  parentSku: string
  defaultSellingPrice: number
  defaultCostPrice: number | null
}

export function mergeVariants({
  existing,
  combos,
  parentSku,
  defaultSellingPrice,
  defaultCostPrice,
}: MergeArgs): VariantFormItem[] {
  const existingByCombo = new Map<string, VariantFormItem>()
  for (const v of existing) {
    if (v._pendingDelete) continue
    const key = `${v.attribute1Value.toLowerCase()}::${(v.attribute2Value ?? '').toLowerCase()}`
    existingByCombo.set(key, v)
  }

  const next: VariantFormItem[] = []
  combos.forEach((combo, i) => {
    const key = `${combo.v1.toLowerCase()}::${(combo.v2 ?? '').toLowerCase()}`
    const found = existingByCombo.get(key)
    if (found) {
      next.push({ ...found, attribute1Value: combo.v1, attribute2Value: combo.v2 })
      existingByCombo.delete(key)
    } else {
      next.push({
        sku: buildVariantSku(parentSku, combo.v1, combo.v2, i),
        barcode: '',
        attribute1Value: combo.v1,
        attribute2Value: combo.v2,
        sellingPrice: defaultSellingPrice,
        costPrice: defaultCostPrice,
        stockQuantity: 0,
        status: 'active',
        _isNew: true,
      })
    }
  })

  // Combos still in map = removed: keep with pendingDelete flag if id exists, drop if new
  for (const leftover of existingByCombo.values()) {
    if (leftover.id) {
      next.push({ ...leftover, _pendingDelete: true })
    }
  }

  return next
}

export function fromResponse(config: VariantsConfigResponse): VariantsForm {
  const values1 = Array.from(new Set(config.variants.map((v) => v.attribute1Value)))
  const values2 = config.attribute2Name
    ? Array.from(
        new Set(
          config.variants
            .map((v) => v.attribute2Value)
            .filter((v): v is string => v !== null && v !== undefined),
        ),
      )
    : []

  return {
    attribute1: { name: config.attribute1Name, values: values1 },
    attribute2: config.attribute2Name ? { name: config.attribute2Name, values: values2 } : null,
    variants: config.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode ?? '',
      attribute1Value: v.attribute1Value,
      attribute2Value: v.attribute2Value,
      sellingPrice: v.sellingPrice,
      costPrice: v.costPrice,
      stockQuantity: v.stockQuantity,
      status: v.status,
      _hasTransactions: v.hasTransactions,
    })),
  }
}

export interface VariantsConfigPayload {
  attribute1Name: string
  attribute2Name: string | null
  variants: Array<{
    id?: string
    sku: string
    barcode?: string | null
    attribute1Value: string
    attribute2Value?: string | null
    sellingPrice: number
    costPrice?: number | null
    stockQuantity: number
    status: 'active' | 'inactive'
  }>
}

export function toPayload(form: VariantsForm): VariantsConfigPayload | null {
  if (!form.attribute1) return null
  const visible = form.variants.filter((v) => !v._pendingDelete)
  return {
    attribute1Name: form.attribute1.name,
    attribute2Name: form.attribute2 ? form.attribute2.name : null,
    variants: visible.map((v) => {
      const item: VariantsConfigPayload['variants'][number] = {
        sku: v.sku,
        attribute1Value: v.attribute1Value,
        sellingPrice: v.sellingPrice,
        stockQuantity: v.stockQuantity,
        status: v.status,
      }
      if (v.id) item.id = v.id
      const bc = v.barcode.trim()
      if (bc) item.barcode = bc
      else item.barcode = null
      if (form.attribute2) item.attribute2Value = v.attribute2Value
      else item.attribute2Value = null
      if (v.costPrice !== null && v.costPrice !== undefined) item.costPrice = v.costPrice
      else item.costPrice = null
      return item
    }),
  }
}

export function countDeletions(variants: VariantFormItem[]): {
  hardDelete: number
  softDelete: number
} {
  let hardDelete = 0
  let softDelete = 0
  for (const v of variants) {
    if (!v._pendingDelete) continue
    if (v._hasTransactions) softDelete++
    else hardDelete++
  }
  return { hardDelete, softDelete }
}

export function countAdditions(variants: VariantFormItem[]): number {
  return variants.filter((v) => v._isNew && !v._pendingDelete).length
}
