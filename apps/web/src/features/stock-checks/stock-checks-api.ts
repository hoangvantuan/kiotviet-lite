import { z } from 'zod'

import type {
  CreateStockCheckInput,
  ListStockChecksQuery,
  StockCheckCounts,
  StockCheckDetail,
  StockCheckListItem,
  UpdateStockCheckInput,
} from '@kiotviet-lite/shared'

import { request as uploadRequest } from '@/features/bulk-import/bulk-import-api'
import { apiClient } from '@/lib/api-client'

interface Envelope<T> {
  data: T
}

interface ListEnvelope<T> {
  data: T
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    counts?: StockCheckCounts
  }
}

function buildQuery(q: Partial<ListStockChecksQuery>): string {
  const params = new URLSearchParams()
  if (q.page) params.set('page', String(q.page))
  if (q.pageSize) params.set('pageSize', String(q.pageSize))
  if (q.status) params.set('status', q.status)
  if (q.search) params.set('search', q.search)
  if (q.fromDate) params.set('fromDate', q.fromDate)
  if (q.toDate) params.set('toDate', q.toDate)
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function listStockChecksApi(query: Partial<ListStockChecksQuery>) {
  return apiClient.get<ListEnvelope<StockCheckListItem[]>>(
    `/api/v1/stock-checks${buildQuery(query)}`,
  )
}

export function getStockCheckApi(id: string) {
  return apiClient.get<Envelope<StockCheckDetail>>(`/api/v1/stock-checks/${id}`)
}

export function createStockCheckApi(input: CreateStockCheckInput) {
  return apiClient.post<Envelope<StockCheckDetail>>('/api/v1/stock-checks', input)
}

export function updateStockCheckApi(id: string, input: UpdateStockCheckInput) {
  return apiClient.patch<Envelope<StockCheckDetail>>(`/api/v1/stock-checks/${id}`, input)
}

export function confirmStockCheckApi(id: string, idempotencyKey?: string) {
  return apiClient.post<Envelope<StockCheckDetail>>(
    `/api/v1/stock-checks/${id}/confirm`,
    undefined,
    {
      idempotencyKey,
    },
  )
}

export function deleteStockCheckApi(id: string) {
  return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/stock-checks/${id}`)
}

// GL-02: nhập tồn đầu kỳ từ tệp thành các phiếu kiểm nháp
const stockImportPreviewSchema = z.object({
  filename: z.string(),
  totalRows: z.number(),
  items: z.number(),
  checks: z.number(),
  totalDiffPositive: z.number(),
  totalDiffNegative: z.number(),
  errors: z.array(z.object({ row: z.number(), column: z.string(), message: z.string() })),
  conversions: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      count: z.number(),
      rows: z.array(z.number()),
      requiresConfirmation: z.boolean(),
    }),
  ),
  requiresApproval: z.boolean(),
  sample: z.array(
    z.object({
      row: z.number(),
      sku: z.string(),
      name: z.string(),
      variantLabel: z.string().nullable(),
      systemQty: z.number(),
      actualQty: z.number(),
    }),
  ),
  digest: z.string(),
})

export type StockImportPreview = z.infer<typeof stockImportPreviewSchema>

export async function previewStockImportApi(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await uploadRequest('/api/v1/stock-checks/import/preview', {
    method: 'POST',
    body: form,
  })
  return z.object({ data: stockImportPreviewSchema }).parse(await response.json()).data
}

export async function confirmStockImportApi(
  file: File,
  digest: string,
  approveConversions: boolean,
) {
  const form = new FormData()
  form.append('file', file)
  form.append('digest', digest)
  form.append('approveConversions', String(approveConversions))
  const response = await uploadRequest('/api/v1/stock-checks/import/confirm', {
    method: 'POST',
    body: form,
  })
  return z
    .object({ data: z.object({ ids: z.array(z.string()), items: z.number() }) })
    .parse(await response.json()).data
}
