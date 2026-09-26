import { create } from 'zustand'

import { showError, showWarning } from '@/lib/toast'
import { type CartItem, useCartStore } from '@/stores/use-cart-store'

/**
 * POS-13: một chỗ kiểm tồn kho cho mọi đường đưa hàng vào giỏ (thêm, sửa số lượng, đổi đơn vị,
 * quét mã vạch). Tồn kho tính theo đơn vị cơ bản của sản phẩm hoặc của biến thể, cộng mọi dòng cùng
 * hàng trong giỏ (một hàng có thể nằm ở nhiều dòng đơn vị quy đổi). Cửa hàng cho bán âm thì chỉ cảnh
 * báo, không cho thì chặn; máy chủ kiểm lại cùng quy tắc khi tạo đơn.
 */
interface StockPolicyState {
  /** Theo cài đặt cửa hàng; mặc định cho bán âm như máy chủ */
  allowNegativeStock: boolean
  setAllowNegativeStock: (allow: boolean) => void
}

export const usePosStockPolicy = create<StockPolicyState>((set) => ({
  allowNegativeStock: true,
  setAllowNegativeStock: (allow) => set({ allowNegativeStock: allow }),
}))

export interface StockLine {
  productId: string
  variantId: string | null
  unitConversionId: string | null
  quantity: number
  unitConversions?: CartItem['unitConversions']
}

export interface StockTarget {
  productId: string
  variantId: string | null
  trackInventory: boolean
  /** Tồn kho theo đơn vị cơ bản của sản phẩm, hoặc của biến thể */
  baseStock: number
  name: string
  baseUnit: string | null
}

export type StockCheck =
  | { status: 'ok' }
  | { status: 'warn'; message: string }
  | { status: 'blocked'; message: string }

export function conversionFactorOf(line: StockLine): number {
  if (!line.unitConversionId) return 1
  return line.unitConversions?.find((u) => u.id === line.unitConversionId)?.conversionFactor ?? 1
}

/** Tổng số lượng quy về đơn vị cơ bản của cùng hàng trong giỏ, bỏ qua dòng `exceptLineId` */
export function cartBaseQuantity(
  items: Array<StockLine & { id: string }>,
  productId: string,
  variantId: string | null,
  exceptLineId?: string,
): number {
  return items
    .filter(
      (i) =>
        i.id !== exceptLineId &&
        i.productId === productId &&
        (i.variantId ?? null) === (variantId ?? null),
    )
    .reduce((sum, i) => sum + i.quantity * conversionFactorOf(i), 0)
}

/** Kiểm khi giỏ sẽ có tổng `nextBaseQty` (đơn vị cơ bản) của hàng `target` */
export function checkStock(
  target: StockTarget,
  nextBaseQty: number,
  allowNegativeStock: boolean,
): StockCheck {
  if (!target.trackInventory || nextBaseQty <= target.baseStock) return { status: 'ok' }
  const available = Math.max(0, target.baseStock)
  const unit = target.baseUnit ? ` ${target.baseUnit}` : ''
  const detail =
    available === 0
      ? `Hết hàng: ${target.name}`
      : `Vượt tồn kho: ${target.name} chỉ còn ${available}${unit}, trong giỏ sẽ có ${nextBaseQty}${unit}`
  if (allowNegativeStock) return { status: 'warn', message: `${detail}. Tồn kho sẽ bị âm` }
  return { status: 'blocked', message: `${detail}. Cửa hàng không cho bán vượt tồn kho` }
}

/** Báo kết quả kiểm cho người bán; trả về true nếu được làm tiếp */
export function reportStockCheck(result: StockCheck): boolean {
  if (result.status === 'ok') return true
  if (result.status === 'warn') {
    showWarning(result.message)
    return true
  }
  showError(result.message)
  return false
}

function activeItems(): CartItem[] {
  const state = useCartStore.getState()
  return state.tabs[state.activeTab]?.items ?? []
}

function targetOf(item: CartItem): StockTarget {
  return {
    productId: item.productId,
    variantId: item.variantId,
    trackInventory: item.trackInventory,
    baseStock: item.baseStockQuantity ?? item.stockQuantity,
    name: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
    baseUnit: item.baseUnit ?? item.unitName,
  }
}

/** Kiểm trước khi thêm `addBaseQty` (đơn vị cơ bản) của một hàng vào giỏ đang mở */
export function guardAddToCart(target: StockTarget, addBaseQty: number): boolean {
  const inCart = cartBaseQuantity(activeItems(), target.productId, target.variantId)
  return reportStockCheck(
    checkStock(target, inCart + addBaseQty, usePosStockPolicy.getState().allowNegativeStock),
  )
}

/** Sửa số lượng một dòng giỏ qua kiểm tồn kho; chặn thì giữ số lượng cũ */
export function updateCartQuantity(id: string, qty: number): boolean {
  const item = activeItems().find((i) => i.id === id)
  if (!item) return false
  if (qty > item.quantity) {
    const others = cartBaseQuantity(activeItems(), item.productId, item.variantId, id)
    const next = others + qty * conversionFactorOf(item)
    const ok = reportStockCheck(
      checkStock(targetOf(item), next, usePosStockPolicy.getState().allowNegativeStock),
    )
    if (!ok) return false
  }
  useCartStore.getState().updateQuantity(id, qty)
  return true
}

/** Đổi đơn vị một dòng giỏ qua kiểm tồn kho (đổi sang đơn vị lớn làm tăng số lượng quy đổi) */
export function changeCartItemUnit(id: string, unitConversionId: string | null): boolean {
  const item = activeItems().find((i) => i.id === id)
  if (!item) return false
  const others = cartBaseQuantity(activeItems(), item.productId, item.variantId, id)
  const next = others + item.quantity * conversionFactorOf({ ...item, unitConversionId })
  const current = others + item.quantity * conversionFactorOf(item)
  if (next > current) {
    const ok = reportStockCheck(
      checkStock(targetOf(item), next, usePosStockPolicy.getState().allowNegativeStock),
    )
    if (!ok) return false
  }
  useCartStore.getState().changeItemUnit(id, unitConversionId)
  return true
}
