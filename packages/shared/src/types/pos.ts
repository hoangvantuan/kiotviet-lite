export interface PosUnitConversion {
  id: string
  unit: string
  conversionFactor: number
  sellingPrice: number | null
  /** Đơn vị này nhận số lượng lẻ (ADR-0015). Thiếu (dữ liệu lưu từ bản cũ) nghĩa là không */
  allowDecimalQuantity?: boolean
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
  /** Bán số lẻ (hàng cân ký, ADR-0015); biến thể theo cờ này */
  allowDecimalQuantity: boolean
  hasVariants: boolean
  categoryId: string | null
  variants: PosVariantItem[]
  unitConversions: PosUnitConversion[]
}
