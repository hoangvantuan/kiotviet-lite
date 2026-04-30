import { useMutation } from '@tanstack/react-query'

import type { ResolvePricesInput } from '@kiotviet-lite/shared'

import { useCartStore } from '@/stores/use-cart-store'

import { resolvePricesApi } from '../pos-pricing-api'

export function useResolvePricesMutation() {
  const updateItemPrice = useCartStore((s) => s.updateItemPrice)

  return useMutation({
    mutationFn: (input: ResolvePricesInput) => resolvePricesApi(input),
    onSuccess: (response) => {
      for (const item of response.data) {
        const id = item.variantId ? `${item.productId}-${item.variantId}` : item.productId
        updateItemPrice(id, item.price, item.source, item.sourceDetail)
      }
    },
  })
}
