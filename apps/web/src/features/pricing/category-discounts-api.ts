import type {
  CategoryDiscountListItem,
  CreateCategoryDiscountInput,
  ListCategoryDiscountsQuery,
  UpdateCategoryDiscountInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}
interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildListQuery(q: Partial<ListCategoryDiscountsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.categoryId) params.set('categoryId', q.categoryId)
  if (q.customerId) params.set('customerId', q.customerId)
  if (q.customerGroupId) params.set('customerGroupId', q.customerGroupId)
  if (q.isActive !== undefined) params.set('isActive', String(q.isActive))
  if (q.effectiveStatus) params.set('effectiveStatus', q.effectiveStatus)
  if (q.search) params.set('search', q.search)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listCategoryDiscountsApi(query: Partial<ListCategoryDiscountsQuery>) {
  return apiClient.get<ListEnvelope<CategoryDiscountListItem[]>>(
    `/api/v1/category-discounts${buildListQuery(query)}`,
  )
}

export function getCategoryDiscountApi(id: string) {
  return apiClient.get<Envelope<CategoryDiscountListItem>>(`/api/v1/category-discounts/${id}`)
}

export function createCategoryDiscountApi(input: CreateCategoryDiscountInput) {
  return apiClient.post<Envelope<CategoryDiscountListItem>>(`/api/v1/category-discounts`, input)
}

export function updateCategoryDiscountApi(id: string, input: UpdateCategoryDiscountInput) {
  return apiClient.patch<Envelope<CategoryDiscountListItem>>(
    `/api/v1/category-discounts/${id}`,
    input,
  )
}

export function deleteCategoryDiscountApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/category-discounts/${id}`)
}
