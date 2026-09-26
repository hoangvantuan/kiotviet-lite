import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'
import { isBrowserOffline, isUnreachableError, searchProductsOffline } from '@/lib/offline-catalog'

import type { PosProductItem } from '../types'

interface PosProductsResponse {
  data: PosProductItem[]
}

/**
 * OFF-09: tìm hàng cho POS. Máy chủ là nguồn chính; mất mạng hoặc máy chủ không phản hồi thì tìm
 * trên bản sao danh mục trong PGlite (cùng cách khớp: tên không dấu, mã, mã vạch, biến thể, đơn vị).
 * Mọi chỗ tìm hàng của POS (danh sách, ô tìm, Enter, quét mã) đi qua hàm này.
 */
export async function searchPosProducts(params: {
  q?: string
  categoryId?: string
}): Promise<PosProductItem[]> {
  const offline = () => searchProductsOffline({ search: params.q, categoryId: params.categoryId })
  if (isBrowserOffline()) return offline()
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.categoryId) qs.set('categoryId', params.categoryId)
  const query = qs.toString()
  try {
    const res = await apiClient.get<PosProductsResponse>(
      `/api/v1/pos/products/search${query ? `?${query}` : ''}`,
    )
    return res.data
  } catch (error) {
    if (isUnreachableError(error)) return offline()
    throw error
  }
}

export function usePosProducts(categoryId?: string) {
  return useQuery({
    queryKey: ['pos-products', categoryId ?? 'all'],
    queryFn: () => searchPosProducts({ categoryId }),
    staleTime: 30_000,
    // Ngoại tuyến vẫn chạy để đọc bản sao cục bộ
    networkMode: 'always',
  })
}

export function usePosSearch(query: string) {
  return useQuery({
    queryKey: ['pos-search', query],
    queryFn: () => searchPosProducts({ q: query }),
    enabled: query.trim().length >= 1,
    staleTime: 10_000,
    networkMode: 'always',
  })
}
