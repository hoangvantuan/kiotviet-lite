import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ListVolumePricesQuery, ReplaceVolumePricesInput } from '@kiotviet-lite/shared'

import {
  getVolumePricesForProductApi,
  listVolumePricesApi,
  replaceVolumePricesForProductApi,
} from './volume-prices-api'

const VOLUME_PRICES_KEY = ['volume-prices'] as const

export function useVolumePricesQuery(query: Partial<ListVolumePricesQuery>) {
  return useQuery({
    queryKey: [...VOLUME_PRICES_KEY, 'list', query],
    queryFn: async () => listVolumePricesApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useVolumePricesForProductQuery(
  productId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...VOLUME_PRICES_KEY, 'product', productId],
    queryFn: async () => (await getVolumePricesForProductApi(productId as string)).data,
    enabled: Boolean(productId) && options?.enabled !== false,
  })
}

export function useReplaceVolumePricesMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { productId: string; input: ReplaceVolumePricesInput }) =>
      replaceVolumePricesForProductApi(vars.productId, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VOLUME_PRICES_KEY })
    },
  })
}
