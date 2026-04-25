import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { UpdateStoreInput } from '@kiotviet-lite/shared'

import { getStoreApi, updateStoreApi } from './store-settings-api'

const STORE_KEY = ['store'] as const

export function useStoreQuery() {
  return useQuery({
    queryKey: STORE_KEY,
    queryFn: async () => (await getStoreApi()).data,
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
