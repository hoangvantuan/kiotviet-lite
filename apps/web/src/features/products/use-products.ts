import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '@kiotviet-lite/shared'

import {
  createProductApi,
  deleteProductApi,
  getProductApi,
  listProductsApi,
  listTrashedProductsApi,
  restoreProductApi,
  updateProductApi,
} from './products-api'

const PRODUCTS_KEY = ['products'] as const

export function useProductsQuery(query: Partial<ListProductsQuery>) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'list', query],
    queryFn: async () => listProductsApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useTrashedProductsQuery(query: Partial<ListProductsQuery>, enabled = true) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'trashed', query],
    queryFn: async () => listTrashedProductsApi(query),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useProductQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'detail', id],
    queryFn: async () => (await getProductApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProductApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

export function useUpdateProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateProductInput }) =>
      updateProductApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

export function useDeleteProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProductApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}

export function useRestoreProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreProductApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
    },
  })
}
