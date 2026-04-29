import type {
  CreateStockCheckInput,
  ListStockChecksQuery,
  StockCheckCounts,
  StockCheckDetail,
  StockCheckListItem,
  UpdateStockCheckInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    counts?: StockCheckCounts
  }
}

function buildQuery(q: Partial<ListStockChecksQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.status) params.set('status', q.status)
  if (q.search) params.set('search', q.search)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listStockChecksApi(query: Partial<ListStockChecksQuery>) {
  return apiClient.get<ListEnvelope<StockCheckListItem[]>>(
    `/api/v1/stock-checks${buildQuery(query)}`,
  )
}

export function getStockCheckApi(id: string) {
  return apiClient.get<Envelope<StockCheckDetail>>(`/api/v1/stock-checks/${id}`)
}

export function createStockCheckApi(input: CreateStockCheckInput) {
  return apiClient.post<Envelope<StockCheckDetail>>('/api/v1/stock-checks', input)
}

export function updateStockCheckApi(id: string, input: UpdateStockCheckInput) {
  return apiClient.patch<Envelope<StockCheckDetail>>(`/api/v1/stock-checks/${id}`, input)
}

export function confirmStockCheckApi(id: string) {
  return apiClient.post<Envelope<StockCheckDetail>>(`/api/v1/stock-checks/${id}/confirm`)
}

export function deleteStockCheckApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/stock-checks/${id}`)
}
