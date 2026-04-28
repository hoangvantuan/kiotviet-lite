export interface PosUnitConversion {
  id: string
  unit: string
  conversionFactor: number
  sellingPrice: number | null
}

export interface PosProductVariant {
  id: string
  name: string
  sku: string
  barcode: string | null
  price: number
  stockQuantity: number
  attributes: Record<string, string>
}

export interface PosProductItem {
  id: string
  name: string
  sku: string
  barcode: string | null
  basePrice: number
  imageUrl: string | null
  trackInventory: boolean
  stockQuantity: number
  hasVariants: boolean
  categoryId: string | null
  unit: string
  variants: PosProductVariant[]
  unitConversions: PosUnitConversion[]
}
