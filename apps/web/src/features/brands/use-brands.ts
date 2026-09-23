import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { BrandItem, ListBrandsQuery } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'

interface BrandResponse {
  data: BrandItem
}
export interface BrandListResponse {
  data: BrandItem[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

const BRANDS_KEY = ['brands'] as const

export function useBrandsQuery(query: ListBrandsQuery) {
  const storeId = useAuthStore((state) => state.user?.storeId)
  return useQuery({
    queryKey: [...BRANDS_KEY, storeId, query],
    queryFn: () =>
      apiClient.get<BrandListResponse>(
        `/api/v1/brands?${new URLSearchParams({
          page: String(query.page),
          pageSize: String(query.pageSize),
          status: query.status,
          search: query.search ?? '',
        })}`,
      ),
    enabled: storeId !== undefined,
  })
}

export function useAllBrandsQuery() {
  const storeId = useAuthStore((state) => state.user?.storeId)
  return useQuery({
    queryKey: [...BRANDS_KEY, storeId, 'all'],
    queryFn: async () => {
      let allItems: BrandItem[] = []
      let page = 1
      let totalPages = 1
      while (page <= totalPages) {
        const res = await apiClient.get<BrandListResponse>(
          `/api/v1/brands?page=${page}&pageSize=100&status=active`,
        )
        allItems = allItems.concat(res.data)
        totalPages = res.meta.totalPages
        page++
      }
      return allItems
    },
    enabled: storeId !== undefined,
  })
}

export function useBrandMutation() {
  const cache = useQueryClient()
  const invalidate = () => cache.invalidateQueries({ queryKey: BRANDS_KEY })
  const create = useMutation({
    mutationFn: (name: string) => apiClient.post<BrandResponse>('/api/v1/brands', { name }),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.patch<BrandResponse>(`/api/v1/brands/${id}`, { name }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/brands/${id}`),
    onSuccess: invalidate,
  })
  const restore = useMutation({
    mutationFn: (id: string) => apiClient.post<BrandResponse>(`/api/v1/brands/${id}/restore`),
    onSuccess: invalidate,
  })
  return { create, update, remove, restore }
}
