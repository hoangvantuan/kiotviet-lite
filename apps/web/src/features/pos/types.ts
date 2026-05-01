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
  costPrice: number | null
  stockQuantity: number
  attributes: Record<string, string>
}

export interface PosProductItem {
  id: string
  name: string
  sku: string
  barcode: string | null
  basePrice: number
  costPrice: number | null
  imageUrl: string | null
  trackInventory: boolean
  stockQuantity: number
  hasVariants: boolean
  categoryId: string | null
  unit: string
  variants: PosProductVariant[]
  unitConversions: PosUnitConversion[]
}

export interface OrderDetailItem {
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  unit: string | null
  unitPrice: number
  quantity: number
  discountAmount: number
  lineTotal: number
}

export interface OrderDetail {
  id: string
  orderNumber: string
  customerId: string | null
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  debtAmount: number
  change: number
  note: string | null
  status: string
  items: OrderDetailItem[]
  createdAt: string
}

export interface StockInfoVariant {
  id: string
  name: string
  stockQuantity: number
}

export interface StockInfo {
  productId: string
  productName: string
  currentStock: number
  minStock: number
  trackInventory: boolean
  unit: string
  variants: StockInfoVariant[]
}
