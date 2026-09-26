import { useQuery } from '@tanstack/react-query'

import type { CartItem } from '@/stores/use-cart-store'

import { searchPosProducts } from './use-pos-products'

/**
 * Trạng thái giá vốn của một dòng trong giỏ:
 * - known: có giá vốn.
 * - none: sản phẩm chưa có giá vốn.
 * - loading: dòng vừa khôi phục từ localStorage (không lưu giá vốn), đang nạp lại.
 * - unavailable: không nạp lại được (mất mạng, sản phẩm đã bị xóa). Không được coi là 0.
 */
export type CartItemCost =
  | { status: 'known'; costPrice: number }
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'unavailable' }

type Lookup = Pick<CartItem, 'productId' | 'variantId' | 'sku'>

/**
 * Lấy lại giá vốn như lúc thêm vào giỏ (giá vốn biến thể, không có thì của sản phẩm).
 * Tìm theo SKU vì API tìm kiếm POS khớp cả SKU sản phẩm lẫn SKU biến thể, rồi chọn đúng
 * productId. Trả undefined khi không còn tìm thấy sản phẩm.
 */
export async function fetchCartItemCostPrice(item: Lookup): Promise<number | null | undefined> {
  const products = await searchPosProducts({ q: item.sku })
  const product = products.find((p) => p.id === item.productId)
  if (!product) return undefined
  if (!item.variantId) return product.costPrice
  const variant = product.variants.find((v) => v.id === item.variantId)
  if (!variant) return undefined
  return variant.costPrice ?? product.costPrice
}

export function useCartItemCost(item: CartItem | null, enabled: boolean): CartItemCost {
  const needsFetch = enabled && item !== null && item.costPrice === undefined
  const query = useQuery({
    queryKey: ['pos-cart-item-cost', item?.productId, item?.variantId ?? null],
    // React Query không nhận undefined làm dữ liệu, nên gói lại
    queryFn: async () => ({ costPrice: await fetchCartItemCostPrice(item!) }),
    enabled: needsFetch,
    staleTime: 30_000,
    retry: false,
  })

  return deriveCartItemCost(item, {
    fetched: query.data?.costPrice,
    loading: needsFetch && query.isPending,
  })
}

/** Giá vốn trong giỏ ưu tiên hơn giá vừa nạp; thiếu cả hai thì không bao giờ trả về 0. */
export function deriveCartItemCost(
  item: Pick<CartItem, 'costPrice'> | null,
  remote: { fetched: number | null | undefined; loading: boolean },
): CartItemCost {
  if (!item) return { status: 'none' }
  const costPrice = item.costPrice !== undefined ? item.costPrice : remote.fetched
  if (costPrice === null) return { status: 'none' }
  if (typeof costPrice === 'number') return { status: 'known', costPrice }
  return remote.loading ? { status: 'loading' } : { status: 'unavailable' }
}
