import type {
  CreateProductInput,
  InventoryTransactionItem,
  ListProductsQuery,
  ProductDetail,
  ProductListItem,
  RecordManualAdjustInput,
  RecordPurchaseInput,
  UnitConversionInput,
  UnitConversionItem,
  UnitConversionUpdate,
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

// ========== Story 2.4: Unit conversions ==========

export function listUnitConversionsApi(productId: string) {
  return apiClient.get<Envelope<UnitConversionItem[]>>(
    `/api/v1/products/${productId}/unit-conversions`,
  )
}

export function createUnitConversionApi(productId: string, input: UnitConversionInput) {
  return apiClient.post<Envelope<UnitConversionItem>>(
    `/api/v1/products/${productId}/unit-conversions`,
    input,
  )
}

export function updateUnitConversionApi(
  productId: string,
  conversionId: string,
  input: UnitConversionUpdate,
) {
  return apiClient.patch<Envelope<UnitConversionItem>>(
    `/api/v1/products/${productId}/unit-conversions/${conversionId}`,
    input,
  )
}

export function deleteUnitConversionApi(productId: string, conversionId: string) {
  return apiClient.delete<void>(`/api/v1/products/${productId}/unit-conversions/${conversionId}`)
}

// ========== Story 2.4: Low stock ==========

export function getLowStockCountApi() {
  return apiClient.get<Envelope<{ count: number }>>('/api/v1/products/low-stock-count')
}

export function listLowStockProductsApi(page = 1, pageSize = 50) {
  return apiClient.get<ListEnvelope<ProductListItem[]>>(
    `/api/v1/products/low-stock?page=${page}&pageSize=${pageSize}`,
  )
}

// ========== Story 2.4: Inventory transactions (helpers) ==========

export function recordPurchaseApi(productId: string, input: RecordPurchaseInput) {
  return apiClient.post<
    Envelope<{ product: ProductDetail; transaction: InventoryTransactionItem }>
  >(`/api/v1/products/${productId}/inventory/purchase`, input)
}

export function recordManualAdjustmentApi(productId: string, input: RecordManualAdjustInput) {
  return apiClient.post<
    Envelope<{ product: ProductDetail; transaction: InventoryTransactionItem }>
  >(`/api/v1/products/${productId}/inventory/adjust`, input)
}

export function listInventoryTransactionsApi(productId: string, page = 1, pageSize = 20) {
  return apiClient.get<ListEnvelope<InventoryTransactionItem[]>>(
    `/api/v1/products/${productId}/inventory-transactions?page=${page}&pageSize=${pageSize}`,
  )
}
