import type {
  CreateOpeningDebtInput,
  CreateSupplierDebtAdjustmentInput,
  CreateSupplierInput,
  ListSuppliersQuery,
  SupplierDebtAdjustmentDetail,
  SupplierDebtAdjustmentListItem,
  SupplierDetail,
  SupplierListItem,
  UpdateSupplierInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ListSuppliersQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.hasDebt && q.hasDebt !== 'all') params.set('hasDebt', q.hasDebt)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listSuppliersApi(query: Partial<ListSuppliersQuery>) {
  return apiClient.get<ListEnvelope<SupplierListItem[]>>(`/api/v1/suppliers${buildQuery(query)}`)
}

export function listTrashedSuppliersApi(page = 1, pageSize = 50) {
  return apiClient.get<ListEnvelope<SupplierListItem[]>>(
    `/api/v1/suppliers/trashed?page=${page}&pageSize=${pageSize}`,
  )
}

export function getSupplierApi(id: string) {
  return apiClient.get<Envelope<SupplierDetail>>(`/api/v1/suppliers/${id}`)
}

export function createSupplierApi(input: CreateSupplierInput) {
  return apiClient.post<Envelope<SupplierDetail>>('/api/v1/suppliers', input)
}

export function updateSupplierApi(id: string, input: UpdateSupplierInput) {
  return apiClient.patch<Envelope<SupplierDetail>>(`/api/v1/suppliers/${id}`, input)
}

export function deleteSupplierApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/suppliers/${id}`)
}

export function restoreSupplierApi(id: string) {
  return apiClient.post<Envelope<SupplierDetail>>(`/api/v1/suppliers/${id}/restore`)
}

export function createSupplierDebtAdjustmentApi(
  input: CreateSupplierDebtAdjustmentInput,
  idempotencyKey?: string,
) {
  return apiClient.post<Envelope<SupplierDebtAdjustmentDetail>>(
    '/api/v1/supplier-debt-adjustments',
    input,
    { idempotencyKey },
  )
}

export function listSupplierDebtAdjustmentsApi(supplierId: string, page = 1) {
  const params = new URLSearchParams({ supplierId, page: String(page) })
  return apiClient.get<ListEnvelope<SupplierDebtAdjustmentListItem[]>>(
    `/api/v1/supplier-debt-adjustments?${params.toString()}`,
  )
}

export function createSupplierOpeningDebtApi(
  supplierId: string,
  input: CreateOpeningDebtInput,
  idempotencyKey?: string,
) {
  return apiClient.post<Envelope<SupplierDebtAdjustmentDetail>>(
    `/api/v1/supplier-debt-adjustments/${supplierId}/opening-debt`,
    input,
    { idempotencyKey },
  )
}
