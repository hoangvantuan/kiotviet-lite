import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { UpdateStoreInput } from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import { getStoreApi, updateStoreApi } from './store-settings-api'

const STORE_KEY = ['store'] as const

export function useStoreQuery() {
  const storeId = useAuthStore((state) => state.user?.storeId)
  return useQuery({
    queryKey: [...STORE_KEY, storeId],
    queryFn: async () => (await getStoreApi()).data,
    enabled: !!storeId,
  })
}

export function useUpdateStoreMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateStoreInput) => updateStoreApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STORE_KEY })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
