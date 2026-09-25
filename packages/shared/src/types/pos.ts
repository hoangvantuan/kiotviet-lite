export interface PosUnitConversion {
  id: string
  unit: string
  conversionFactor: number
  sellingPrice: number | null
}

export interface PosVariantItem {
  id: string
  name: string
  sku: string
  barcode: string | null
  price: number
  /** Chỉ có khi người gọi có quyền products.viewCost (BC-13). */
  costPrice?: number | null
  stockQuantity: number
  attributes: Record<string, string>
}

export interface PosProductItem {
  id: string
  name: string
  sku: string
  barcode: string | null
  unit: string
  basePrice: number
  /** Chỉ có khi người gọi có quyền products.viewCost (BC-13). */
  costPrice?: number | null
  imageUrl: string | null
  trackInventory: boolean
  stockQuantity: number
  hasVariants: boolean
  categoryId: string | null
  variants: PosVariantItem[]
  unitConversions: PosUnitConversion[]
}
