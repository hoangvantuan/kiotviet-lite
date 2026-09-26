import { useCallback } from 'react'

import { mulQty } from '@kiotviet-lite/shared'

import { useCartStore } from '@/stores/use-cart-store'

import { guardAddToCart } from '../stock-guard'
import type { PosProductItem, PosProductVariant, PosUnitConversion } from '../types'
import { computeUnitConversionPriceAndStock } from '../utils'
import { buildCartItemId, repriceOnAddAction, useRepriceOnAdd } from './use-auto-reprice'

export interface AddToCartOptions {
  product: PosProductItem
  variant?: PosProductVariant | null
  unitConversion?: PosUnitConversion | null
  unitConversionId?: string | null
  quantity?: number
  notes?: string | null
}

/** Thêm hàng vào giỏ đang mở; trả về false khi không thêm (số lượng sai, bị chặn vì tồn kho) */
export function addToCartAction({
  product,
  variant = null,
  unitConversion: explicitUnitConversion = null,
  unitConversionId = null,
  quantity = 1,
  notes = null,
}: AddToCartOptions): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false
  const unitConversion =
    explicitUnitConversion ??
    (unitConversionId
      ? (product.unitConversions.find((u) => u.id === unitConversionId) ?? null)
      : null)

  const rawPrice = variant ? variant.price : product.basePrice
  const rawStock = variant ? variant.stockQuantity : product.stockQuantity
  const { unitPrice: displayPrice, stockQuantity } = computeUnitConversionPriceAndStock(
    rawPrice,
    rawStock,
    unitConversion,
  )

  const effectiveUnitConversionId = unitConversion?.id ?? null

  // POS-13: kiểm tồn kho theo tổng cùng hàng trong giỏ, cùng quy tắc với sửa số lượng và quét mã
  const allowed = guardAddToCart(
    {
      productId: product.id,
      variantId: variant?.id ?? null,
      trackInventory: product.trackInventory,
      baseStock: rawStock,
      name: variant ? `${product.name} (${variant.name})` : product.name,
      baseUnit: product.unit ?? null,
    },
    mulQty(quantity, unitConversion?.conversionFactor ?? 1),
  )
  if (!allowed) return false
  useCartStore.getState().addItem(
    {
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      variantName: variant?.name ?? null,
      sku: variant?.sku ?? product.sku,
      unitPrice: displayPrice,
      // BC-13: người không có quyền products.viewCost không nhận giá vốn (undefined)
      costPrice: variant?.costPrice ?? product.costPrice,
      imageUrl: product.imageUrl,
      notes: notes?.trim() || null,
      unitName: unitConversion?.unit ?? product.unit ?? null,
      unitConversionId: effectiveUnitConversionId,
      trackInventory: product.trackInventory,
      allowDecimalQuantity: product.allowDecimalQuantity ?? false,
      stockQuantity,
      baseUnit: product.unit ?? null,
      baseUnitPrice: rawPrice,
      baseStockQuantity: rawStock,
      unitConversions: product.unitConversions ?? [],
    },
    quantity,
  )

  // Reprice với tổng số lượng hiện tại trong giỏ
  const tab = useCartStore.getState().tabs[useCartStore.getState().activeTab]
  const id = buildCartItemId(product.id, variant?.id ?? null, effectiveUnitConversionId)
  const existing = tab?.items.find((i) => i.id === id)
  const totalQty = existing ? existing.quantity : quantity

  repriceOnAddAction(product.id, variant?.id ?? null, effectiveUnitConversionId, totalQty)
  return true
}

export function useAddToCart() {
  const repriceOnAdd = useRepriceOnAdd()

  return useCallback(
    (options: AddToCartOptions) => addToCartAction(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repriceOnAdd],
  )
}
