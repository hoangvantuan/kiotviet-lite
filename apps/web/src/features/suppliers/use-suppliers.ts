import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from '@kiotviet-lite/shared'

import {
  createSupplierApi,
  deleteSupplierApi,
  getSupplierApi,
  listSuppliersApi,
  listTrashedSuppliersApi,
  restoreSupplierApi,
  updateSupplierApi,
} from './suppliers-api'

const SUPPLIERS_KEY = ['suppliers'] as const

export function useSuppliersQuery(query: Partial<ListSuppliersQuery>) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, 'list', query],
    queryFn: async () => listSuppliersApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useTrashedSuppliersQuery(page: number, pageSize = 50) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, 'trashed', page, pageSize],
    queryFn: async () => listTrashedSuppliersApi(page, pageSize),
    placeholderData: keepPreviousData,
  })
}

export function useSupplierQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, 'detail', id],
    queryFn: async () => (await getSupplierApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateSupplierMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplierApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIERS_KEY })
    },
  })
}

export function useUpdateSupplierMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateSupplierInput }) =>
      updateSupplierApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIERS_KEY })
    },
  })
}

export function useDeleteSupplierMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSupplierApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIERS_KEY })
    },
  })
}

export function useRestoreSupplierMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreSupplierApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIERS_KEY })
    },
  })
}
