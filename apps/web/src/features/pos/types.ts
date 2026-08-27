import type { PosVariantItem } from '@kiotviet-lite/shared'

export type { PosProductItem, PosUnitConversion, PosVariantItem } from '@kiotviet-lite/shared'
export type PosProductVariant = PosVariantItem

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
  sku?: string | null
  costPrice?: number | null
}

export interface OrderDetail {
  id: string
  orderNumber: string
  customerId: string | null
  customerName?: string | null
  customerPhone?: string | null
  subtotal: number
  discountAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  cashAmount: number | null
  transferAmount: number | null
  debtAmount: number
  change: number
  oldDebt?: number | null
  customerCurrentDebt?: number | null
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
