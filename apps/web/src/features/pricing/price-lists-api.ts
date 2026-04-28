import type {
  CreatePriceListInput,
  CreatePriceListItemInput,
  ListPriceListItemsQuery,
  ListPriceListsQuery,
  PriceListDetail,
  PriceListItemListItem,
  PriceListListItem,
  UpdatePriceListInput,
  UpdatePriceListItemInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}
interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildListQuery(q: Partial<ListPriceListsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.method) params.set('method', q.method)
  if (q.status && q.status !== 'all') params.set('status', q.status)
  const s = params.toString()
  return s ? `?${s}` : ''
}

function buildItemsQuery(q: Partial<ListPriceListItemsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listPriceListsApi(query: Partial<ListPriceListsQuery>) {
  return apiClient.get<ListEnvelope<PriceListListItem[]>>(
    `/api/v1/price-lists${buildListQuery(query)}`,
  )
}

export function listTrashedPriceListsApi(page = 1, pageSize = 20) {
  return apiClient.get<ListEnvelope<PriceListListItem[]>>(
    `/api/v1/price-lists/trashed?page=${page}&pageSize=${pageSize}`,
  )
}

export function getPriceListApi(id: string) {
  return apiClient.get<Envelope<PriceListDetail>>(`/api/v1/price-lists/${id}`)
}

export function createPriceListApi(input: CreatePriceListInput) {
  return apiClient.post<Envelope<PriceListDetail>>(`/api/v1/price-lists`, input)
}

export function updatePriceListApi(id: string, input: UpdatePriceListInput) {
  return apiClient.patch<Envelope<PriceListDetail>>(`/api/v1/price-lists/${id}`, input)
}

export function deletePriceListApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/price-lists/${id}`)
}

export function restorePriceListApi(id: string) {
  return apiClient.post<Envelope<PriceListDetail>>(`/api/v1/price-lists/${id}/restore`)
}

export function recalculatePriceListApi(id: string) {
  return apiClient.post<
    Envelope<{
      updatedCount: number
      addedCount: number
      removedCount: number
      preservedOverrideCount: number
    }>
  >(`/api/v1/price-lists/${id}/recalculate`)
}

export function listPriceListItemsApi(
  priceListId: string,
  query: Partial<ListPriceListItemsQuery>,
) {
  return apiClient.get<ListEnvelope<PriceListItemListItem[]>>(
    `/api/v1/price-lists/${priceListId}/items${buildItemsQuery(query)}`,
  )
}

export function createPriceListItemApi(priceListId: string, input: CreatePriceListItemInput) {
  return apiClient.post<Envelope<PriceListItemListItem>>(
    `/api/v1/price-lists/${priceListId}/items`,
    input,
  )
}

export function updatePriceListItemApi(
  priceListId: string,
  itemId: string,
  input: UpdatePriceListItemInput,
) {
  return apiClient.patch<Envelope<PriceListItemListItem>>(
    `/api/v1/price-lists/${priceListId}/items/${itemId}`,
    input,
  )
}

export function deletePriceListItemApi(priceListId: string, itemId: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(
    `/api/v1/price-lists/${priceListId}/items/${itemId}`,
  )
}
