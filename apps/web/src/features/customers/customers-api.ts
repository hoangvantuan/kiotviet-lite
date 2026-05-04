import type {
  CreateCustomerGroupInput,
  CreateCustomerInput,
  CreateDebtAdjustmentInput,
  CustomerDebtsResponse,
  CustomerDetail,
  CustomerGroupItem,
  CustomerListItem,
  CustomerOrderItem,
  CustomerStats,
  DebtAdjustmentDetail,
  DebtAdjustmentListItem,
  ListCustomerOrdersQuery,
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

// ========== Customer Detail Tabs ==========

function buildOrdersQuery(q: Partial<ListCustomerOrdersQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.status) params.set('status', q.status)
  if (q.dateFrom) params.set('dateFrom', q.dateFrom)
  if (q.dateTo) params.set('dateTo', q.dateTo)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function getCustomerOrdersApi(id: string, query: Partial<ListCustomerOrdersQuery>) {
  return apiClient.get<ListEnvelope<CustomerOrderItem[]>>(
    `/api/v1/customers/${id}/orders${buildOrdersQuery(query)}`,
  )
}

export function getCustomerDebtsApi(id: string) {
  return apiClient.get<Envelope<CustomerDebtsResponse>>(`/api/v1/customers/${id}/debts`)
}

export function getCustomerStatsApi(id: string) {
  return apiClient.get<Envelope<CustomerStats>>(`/api/v1/customers/${id}/stats`)
}

// ========== Debt Adjustments ==========

export function listDebtAdjustmentsApi(
  customerId: string,
  query?: { page?: number; pageSize?: number },
) {
  const params = new URLSearchParams()
  params.set('customerId', customerId)
  if (query?.page) params.set('page', String(query.page))
  if (query?.pageSize) params.set('pageSize', String(query.pageSize))
  return apiClient.get<ListEnvelope<DebtAdjustmentListItem[]>>(
    `/api/v1/debt-adjustments?${params.toString()}`,
  )
}

export function createDebtAdjustmentApi(input: CreateDebtAdjustmentInput) {
  return apiClient.post<Envelope<DebtAdjustmentDetail>>('/api/v1/debt-adjustments', input)
}
