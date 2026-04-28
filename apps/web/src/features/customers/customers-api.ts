import type {
  CreateCustomerGroupInput,
  CreateCustomerInput,
  CustomerDetail,
  CustomerGroupItem,
  CustomerListItem,
  ListCustomersQuery,
  QuickCreateCustomerInput,
  UpdateCustomerGroupInput,
  UpdateCustomerInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

// ========== Customer Groups ==========

export function listCustomerGroupsApi() {
  return apiClient.get<Envelope<CustomerGroupItem[]>>('/api/v1/customer-groups')
}

export function createCustomerGroupApi(input: CreateCustomerGroupInput) {
  return apiClient.post<Envelope<CustomerGroupItem>>('/api/v1/customer-groups', input)
}

export function updateCustomerGroupApi(id: string, input: UpdateCustomerGroupInput) {
  return apiClient.patch<Envelope<CustomerGroupItem>>(`/api/v1/customer-groups/${id}`, input)
}

export function deleteCustomerGroupApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/customer-groups/${id}`)
}

// ========== Customers ==========

function buildQuery(q: Partial<ListCustomersQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.groupId) params.set('groupId', q.groupId)
  if (q.hasDebt && q.hasDebt !== 'all') params.set('hasDebt', q.hasDebt)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listCustomersApi(query: Partial<ListCustomersQuery>) {
  return apiClient.get<ListEnvelope<CustomerListItem[]>>(`/api/v1/customers${buildQuery(query)}`)
}

export function listTrashedCustomersApi(page = 1, pageSize = 20) {
  return apiClient.get<ListEnvelope<CustomerListItem[]>>(
    `/api/v1/customers/trashed?page=${page}&pageSize=${pageSize}`,
  )
}

export function getCustomerApi(id: string) {
  return apiClient.get<Envelope<CustomerDetail>>(`/api/v1/customers/${id}`)
}

export function createCustomerApi(input: CreateCustomerInput) {
  return apiClient.post<Envelope<CustomerDetail>>('/api/v1/customers', input)
}

export function quickCreateCustomerApi(input: QuickCreateCustomerInput) {
  return apiClient.post<Envelope<CustomerDetail>>('/api/v1/customers/quick-create', input)
}

export function updateCustomerApi(id: string, input: UpdateCustomerInput) {
  return apiClient.patch<Envelope<CustomerDetail>>(`/api/v1/customers/${id}`, input)
}

export function deleteCustomerApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/customers/${id}`)
}

export function restoreCustomerApi(id: string) {
  return apiClient.post<Envelope<CustomerDetail>>(`/api/v1/customers/${id}/restore`)
}
