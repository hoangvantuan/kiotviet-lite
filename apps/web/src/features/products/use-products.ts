import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateProductInput,
  ListProductsQuery,
  RecordManualAdjustInput,
  RecordPurchaseInput,
  UnitConversionInput,
  UnitConversionUpdate,
  UpdateProductInput,
} from '@kiotviet-lite/shared'

import {
  createProductApi,
  createUnitConversionApi,
  deleteProductApi,
  deleteUnitConversionApi,
  getLowStockCountApi,
  getProductApi,
  listInventoryTransactionsApi,
  listLowStockProductsApi,
  listProductsApi,
  listTrashedProductsApi,
  listUnitConversionsApi,
  recordManualAdjustmentApi,
  recordPurchaseApi,
  restoreProductApi,
  updateProductApi,
  updateUnitConversionApi,
} from './products-api'

const PRODUCTS_KEY = ['products'] as const
const LOW_STOCK_COUNT_KEY = ['low-stock-count'] as const
const LOW_STOCK_LIST_KEY = ['low-stock-list'] as const

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
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_LIST_KEY })
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
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_LIST_KEY })
    },
  })
}

export function useDeleteProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProductApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_LIST_KEY })
    },
  })
}

export function useRestoreProductMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreProductApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
    },
  })
}

// ========== Story 2.4: Unit conversions ==========

export function useUnitConversionsQuery(productId: string | undefined) {
  return useQuery({
    queryKey: ['unit-conversions', productId],
    queryFn: async () => (await listUnitConversionsApi(productId as string)).data,
    enabled: Boolean(productId),
  })
}

export function useCreateUnitConversionMutation(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UnitConversionInput) => createUnitConversionApi(productId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-conversions', productId] })
      qc.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'detail', productId] })
    },
  })
}

export function useUpdateUnitConversionMutation(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { conversionId: string; input: UnitConversionUpdate }) =>
      updateUnitConversionApi(productId, vars.conversionId, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-conversions', productId] })
      qc.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'detail', productId] })
    },
  })
}

export function useDeleteUnitConversionMutation(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversionId: string) => deleteUnitConversionApi(productId, conversionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unit-conversions', productId] })
      qc.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'detail', productId] })
    },
  })
}

// ========== Story 2.4: Low stock ==========

export function useLowStockCountQuery() {
  return useQuery({
    queryKey: LOW_STOCK_COUNT_KEY,
    queryFn: async () => (await getLowStockCountApi()).data.count,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useLowStockListQuery(enabled = true) {
  return useQuery({
    queryKey: LOW_STOCK_LIST_KEY,
    queryFn: async () => listLowStockProductsApi(1, 50),
    enabled,
    staleTime: 30_000,
  })
}

// ========== Story 2.4: Inventory transactions (helpers) ==========

export function useInventoryTransactionsQuery(
  productId: string | undefined,
  page = 1,
  pageSize = 20,
) {
  return useQuery({
    queryKey: ['inventory-transactions', productId, page, pageSize],
    queryFn: async () => listInventoryTransactionsApi(productId as string, page, pageSize),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  })
}

export function useRecordPurchaseMutation(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordPurchaseInput) => recordPurchaseApi(productId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_LIST_KEY })
      qc.invalidateQueries({ queryKey: ['inventory-transactions', productId] })
      qc.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'detail', productId] })
    },
  })
}

export function useRecordManualAdjustmentMutation(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordManualAdjustInput) => recordManualAdjustmentApi(productId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRODUCTS_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_COUNT_KEY })
      qc.invalidateQueries({ queryKey: LOW_STOCK_LIST_KEY })
      qc.invalidateQueries({ queryKey: ['inventory-transactions', productId] })
      qc.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'detail', productId] })
    },
  })
}
