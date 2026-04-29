import type {
  ListVolumePricesQuery,
  ReplaceVolumePricesInput,
  VolumePricesForProduct,
  VolumePricesListItem,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}
interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildListQuery(q: Partial<ListVolumePricesQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listVolumePricesApi(query: Partial<ListVolumePricesQuery>) {
  return apiClient.get<ListEnvelope<VolumePricesListItem[]>>(
    `/api/v1/volume-prices${buildListQuery(query)}`,
  )
}

export function getVolumePricesForProductApi(productId: string) {
  return apiClient.get<Envelope<VolumePricesForProduct>>(
    `/api/v1/volume-prices/products/${productId}`,
  )
}

export function replaceVolumePricesForProductApi(
  productId: string,
  input: ReplaceVolumePricesInput,
) {
  return apiClient.put<Envelope<VolumePricesForProduct>>(
    `/api/v1/volume-prices/products/${productId}`,
    input,
  )
}
