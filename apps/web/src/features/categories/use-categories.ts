import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '@kiotviet-lite/shared'

import {
  createCategoryApi,
  deleteCategoryApi,
  listCategoriesApi,
  reorderCategoriesApi,
  updateCategoryApi,
} from './categories-api'

const CATEGORIES_KEY = ['categories'] as const

export function useCategoriesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => (await listCategoriesApi()).data,
    enabled: options?.enabled,
  })
}

export function useCreateCategoryMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategoryApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}

export function useUpdateCategoryMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCategoryInput }) =>
      updateCategoryApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}

export function useReorderCategoriesMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReorderCategoriesInput) => reorderCategoriesApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}

export function useDeleteCategoryMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCategoryApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}
