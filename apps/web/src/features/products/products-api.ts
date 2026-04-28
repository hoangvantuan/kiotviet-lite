import type {
  CreateProductInput,
  ListProductsQuery,
  ProductDetail,
  ProductListItem,
  UpdateProductInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

function buildQuery(q: Partial<ListProductsQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.search) params.set('search', q.search)
  if (q.categoryId) params.set('categoryId', q.categoryId)
  if (q.status) params.set('status', q.status)
  if (q.stockFilter) params.set('stockFilter', q.stockFilter)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listProductsApi(query: Partial<ListProductsQuery>) {
  return apiClient.get<ListEnvelope<ProductListItem[]>>(`/api/v1/products${buildQuery(query)}`)
}

export function listTrashedProductsApi(query: Partial<ListProductsQuery>) {
  return apiClient.get<ListEnvelope<ProductListItem[]>>(
    `/api/v1/products/trashed${buildQuery(query)}`,
  )
}

export function getProductApi(id: string) {
  return apiClient.get<Envelope<ProductDetail>>(`/api/v1/products/${id}`)
}

export function createProductApi(input: CreateProductInput) {
  return apiClient.post<Envelope<ProductDetail>>('/api/v1/products', input)
}

export function updateProductApi(id: string, input: UpdateProductInput) {
  return apiClient.patch<Envelope<ProductDetail>>(`/api/v1/products/${id}`, input)
}

export function deleteProductApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/products/${id}`)
}

export function restoreProductApi(id: string) {
  return apiClient.post<Envelope<ProductDetail>>(`/api/v1/products/${id}/restore`)
}
