import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateCustomerGroupInput,
  CreateCustomerInput,
  ListCustomersQuery,
  QuickCreateCustomerInput,
  UpdateCustomerGroupInput,
  UpdateCustomerInput,
} from '@kiotviet-lite/shared'

import {
  createCustomerApi,
  createCustomerGroupApi,
  deleteCustomerApi,
  deleteCustomerGroupApi,
  getCustomerApi,
  listCustomerGroupsApi,
  listCustomersApi,
  listTrashedCustomersApi,
  quickCreateCustomerApi,
  restoreCustomerApi,
  updateCustomerApi,
  updateCustomerGroupApi,
} from './customers-api'

const CUSTOMER_GROUPS_KEY = ['customer-groups'] as const
const CUSTOMERS_KEY = ['customers'] as const

// ========== Customer Groups ==========

export function useCustomerGroupsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CUSTOMER_GROUPS_KEY,
    queryFn: async () => (await listCustomerGroupsApi()).data,
    enabled: options?.enabled,
  })
}

export function useCreateCustomerGroupMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomerGroupInput) => createCustomerGroupApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
    },
  })
}

export function useUpdateCustomerGroupMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCustomerGroupInput }) =>
      updateCustomerGroupApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
    },
  })
}

export function useDeleteCustomerGroupMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomerGroupApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
    },
  })
}

// ========== Customers ==========

export function useCustomersQuery(query: Partial<ListCustomersQuery>) {
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, 'list', query],
    queryFn: async () => listCustomersApi(query),
    placeholderData: keepPreviousData,
  })
}

export function useTrashedCustomersQuery(page: number, pageSize = 20) {
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, 'trashed', page, pageSize],
    queryFn: async () => listTrashedCustomersApi(page, pageSize),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, 'detail', id],
    queryFn: async () => (await getCustomerApi(id as string)).data,
    enabled: Boolean(id),
  })
}

export function useCreateCustomerMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomerApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
    },
  })
}

export function useQuickCreateCustomerMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: QuickCreateCustomerInput) => quickCreateCustomerApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
    },
  })
}

export function useUpdateCustomerMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCustomerInput }) =>
      updateCustomerApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
    },
  })
}

export function useDeleteCustomerMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomerApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
    },
  })
}

export function useRestoreCustomerMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreCustomerApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY })
      qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_KEY })
    },
  })
}
