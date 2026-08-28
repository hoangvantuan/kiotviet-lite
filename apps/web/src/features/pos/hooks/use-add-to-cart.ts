import { useCallback } from 'react'

import { useCartStore } from '@/stores/use-cart-store'

import type { PosProductItem, PosProductVariant, PosUnitConversion } from '../types'
import { buildCartItemId, repriceOnAddAction, useRepriceOnAdd } from './use-auto-reprice'

export interface AddToCartOptions {
  product: PosProductItem
  variant?: PosProductVariant | null
  unitConversion?: PosUnitConversion | null
  unitConversionId?: string | null
  quantity?: number
  notes?: string | null
}

export function addToCartAction({
  product,
  variant = null,
  unitConversion: explicitUnitConversion = null,
  unitConversionId = null,
  quantity = 1,
  notes = null,
}: AddToCartOptions) {
  if (!Number.isInteger(quantity) || quantity <= 0) return

  const unitConversion =
    explicitUnitConversion ??
    (unitConversionId
      ? (product.unitConversions.find((u) => u.id === unitConversionId) ?? null)
      : null)

  const rawPrice = variant ? variant.price : product.basePrice
  const displayPrice = unitConversion
    ? unitConversion.sellingPrice && unitConversion.sellingPrice > 0
      ? unitConversion.sellingPrice
      : Math.round(rawPrice * unitConversion.conversionFactor)
    : rawPrice

  const rawStock = variant ? variant.stockQuantity : product.stockQuantity
  const stockQuantity = unitConversion
    ? Math.floor(rawStock / unitConversion.conversionFactor)
    : rawStock

  const effectiveUnitConversionId = unitConversion?.id ?? null

  useCartStore.getState().addItem(
    {
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      variantName: variant?.name ?? null,
      sku: variant?.sku ?? product.sku,
      unitPrice: displayPrice,
      costPrice: variant?.costPrice ?? product.costPrice,
      imageUrl: product.imageUrl,
      notes: notes?.trim() || null,
      unitName: unitConversion?.unit ?? product.unit ?? null,
      unitConversionId: effectiveUnitConversionId,
      trackInventory: product.trackInventory,
      stockQuantity,
    },
    quantity,
  )

  // Reprice với tổng số lượng hiện tại trong giỏ
  const tab = useCartStore.getState().tabs[useCartStore.getState().activeTab]
  const id = buildCartItemId(product.id, variant?.id ?? null, effectiveUnitConversionId)
  const existing = tab?.items.find((i) => i.id === id)
  const totalQty = existing ? existing.quantity : quantity

  repriceOnAddAction(product.id, variant?.id ?? null, effectiveUnitConversionId, totalQty)
}

export function useAddToCart() {
  const repriceOnAdd = useRepriceOnAdd()

  return useCallback(
    (options: AddToCartOptions) => {
      addToCartAction(options)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repriceOnAdd],
  )
}
