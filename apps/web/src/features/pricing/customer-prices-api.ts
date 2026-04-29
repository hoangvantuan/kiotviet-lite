import type {
  CreateCustomerPriceInput,
  CustomerPriceListItem,
  ListCustomerPricesQuery,
  UpdateCustomerPriceInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}
interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildListQuery(q: Partial<ListCustomerPricesQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.customerId) params.set('customerId', q.customerId)
  if (q.productId) params.set('productId', q.productId)
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listCustomerPricesApi(query: Partial<ListCustomerPricesQuery>) {
  return apiClient.get<ListEnvelope<CustomerPriceListItem[]>>(
    `/api/v1/customer-prices${buildListQuery(query)}`,
  )
}

export function getCustomerPriceApi(id: string) {
  return apiClient.get<Envelope<CustomerPriceListItem>>(`/api/v1/customer-prices/${id}`)
}

export function createCustomerPriceApi(input: CreateCustomerPriceInput) {
  return apiClient.post<Envelope<CustomerPriceListItem>>(`/api/v1/customer-prices`, input)
}

export function updateCustomerPriceApi(id: string, input: UpdateCustomerPriceInput) {
  return apiClient.patch<Envelope<CustomerPriceListItem>>(`/api/v1/customer-prices/${id}`, input)
}

export function deleteCustomerPriceApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/customer-prices/${id}`)
}
