import type {
  CategoryItem,
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export function listCategoriesApi() {
  return apiClient.get<ApiEnvelope<CategoryItem[]>>('/api/v1/categories')
}

export function createCategoryApi(input: CreateCategoryInput) {
  return apiClient.post<ApiEnvelope<CategoryItem>>('/api/v1/categories', input)
}

export function updateCategoryApi(id: string, input: UpdateCategoryInput) {
  return apiClient.patch<ApiEnvelope<CategoryItem>>(`/api/v1/categories/${id}`, input)
}

export function reorderCategoriesApi(input: ReorderCategoriesInput) {
  return apiClient.post<ApiEnvelope<{ ok: true }>>('/api/v1/categories/reorder', input)
}

export function deleteCategoryApi(id: string) {
  return apiClient.delete<ApiEnvelope<{ ok: true }>>(`/api/v1/categories/${id}`)
}
