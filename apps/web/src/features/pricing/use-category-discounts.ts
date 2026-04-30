import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCategoryDiscountInput,
  ListCategoryDiscountsQuery,
  UpdateCategoryDiscountInput,
} from '@kiotviet-lite/shared'

import {
  createCategoryDiscountApi,
  deleteCategoryDiscountApi,
  getCategoryDiscountApi,
  listCategoryDiscountsApi,
  updateCategoryDiscountApi,
} from './category-discounts-api'

const CATEGORY_DISCOUNTS_KEY = ['category-discounts'] as const

export function useCategoryDiscountsQuery(query: Partial<ListCategoryDiscountsQuery>) {
  return useQuery({
    queryKey: [...CATEGORY_DISCOUNTS_KEY, 'list', query],
    queryFn: async () => listCategoryDiscountsApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useCategoryDiscountQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...CATEGORY_DISCOUNTS_KEY, 'detail', id],
    queryFn: async () => (await getCategoryDiscountApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateCategoryDiscountMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryDiscountInput) => createCategoryDiscountApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORY_DISCOUNTS_KEY })
    },
  })
}

export function useUpdateCategoryDiscountMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCategoryDiscountInput }) =>
      updateCategoryDiscountApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORY_DISCOUNTS_KEY })
    },
  })
}

export function useDeleteCategoryDiscountMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCategoryDiscountApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORY_DISCOUNTS_KEY })
    },
  })
}
