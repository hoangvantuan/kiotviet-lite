import { z } from 'zod'

import { apiClient, ApiClientError } from '@/lib/api-client'
import { useAuthStore } from '@/stores/use-auth-store'

export type ImportKind = 'products' | 'customers' | 'suppliers'
export type ImportMode = 'create-only' | 'upsert'
export type ImportError = { row: number; column: string; message: string }
export type ImportConversion = {
  code: string
  message: string
  count: number
  rows: number[]
  requiresConfirmation: boolean
}

export interface ImportPreview {
  kind: ImportKind
  mode: ImportMode
  filename: string
  totalRows: number
  creates: number
  updates: number
  noOps: number
  errors: ImportError[]
  newCategories: string[]
  newBrands: string[]
  warnings: string[]
  sourceFormat: 'template' | 'kiotviet'
  conversions: ImportConversion[]
  sample: Record<string, unknown>[]
  digest: string
}

export interface ImportJob {
  id: string
  type: 'product' | 'customer' | 'supplier'
  mode: ImportMode
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalRows: number
  processedRows: number
  succeededRows: number
  failedRows: number
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string
  originalFilename: string
}
const errorSchema = z.object({
  row: z.number(),
  column: z.string(),
  message: z.string(),
})
const previewSchema = z.object({
  kind: z.enum(['products', 'customers', 'suppliers']),
  mode: z.enum(['create-only', 'upsert']),
  filename: z.string(),
  totalRows: z.number(),
  creates: z.number(),
  updates: z.number(),
  noOps: z.number(),
  errors: z.array(errorSchema),
  newCategories: z.array(z.string()),
  newBrands: z.array(z.string()),
  warnings: z.array(z.string()),
  sourceFormat: z.enum(['template', 'kiotviet']),
  conversions: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      count: z.number(),
      rows: z.array(z.number()),
      requiresConfirmation: z.boolean(),
    }),
  ),
  sample: z.array(z.record(z.unknown())),
  digest: z.string(),
})
const jobSchema = z.object({
  id: z.string(),
  type: z.enum(['product', 'customer', 'supplier']),
  mode: z.enum(['create-only', 'upsert']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  totalRows: z.number(),
  processedRows: z.number(),
  succeededRows: z.number(),
  failedRows: z.number(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  expiresAt: z.string(),
  originalFilename: z.string(),
})

const responseErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

async function request(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = useAuthStore.getState().accessToken
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      /* no JSON body */
    }
    const parsed = responseErrorSchema.safeParse(body)
    throw new ApiClientError(
      response.status,
      parsed.success
        ? parsed.data.error
        : {
            code: 'IMPORT_REQUEST_FAILED',
            message:
              response.status === 401 || response.status === 403
                ? 'Bạn không có quyền nhập dữ liệu. Vui lòng đăng nhập bằng tài khoản chủ cửa hàng.'
                : 'Không thể xử lý tệp. Vui lòng thử lại.',
          },
    )
  }
  return response
}

function formData(file: File, mode: ImportMode): FormData {
  const form = new FormData()
  form.append('file', file)
  form.append('mode', mode)
  return form
}

export async function previewImport(
  kind: ImportKind,
  file: File,
  mode: ImportMode,
  signal?: AbortSignal,
) {
  const response = await request(`/api/v1/bulk-import/${kind}/preview`, {
    method: 'POST',
    body: formData(file, mode),
    signal,
  })
  return z.object({ data: previewSchema }).parse(await response.json()).data
}

export async function confirmImport(
  kind: ImportKind,
  file: File,
  mode: ImportMode,
  digest: string,
  approveNewNames: boolean,
  approveConversions: boolean,
) {
  const form = formData(file, mode)
  form.append('digest', digest)
  form.append('approveNewNames', String(approveNewNames))
  form.append('approveConversions', String(approveConversions))
  const response = await request(`/api/v1/bulk-import/${kind}/confirm`, {
    method: 'POST',
    body: form,
  })
  return z.object({ data: jobSchema }).parse(await response.json()).data
}

export async function listImportJobs() {
  const response = await apiClient.get<unknown>('/api/v1/bulk-import-jobs')
  return z.object({ data: z.array(jobSchema) }).parse(response).data
}

export async function getImportJob(id: string) {
  const response = await apiClient.get<unknown>(
    `/api/v1/bulk-import-jobs/${encodeURIComponent(id)}`,
  )
  return z.object({ data: jobSchema }).parse(response).data
}

export async function cancelImportJob(id: string) {
  const response = await apiClient.post<unknown>(
    `/api/v1/bulk-import-jobs/${encodeURIComponent(id)}/cancel`,
  )
  return z.object({ data: jobSchema }).parse(response).data
}

async function download(path: string, filename: string, options: RequestInit = {}) {
  const response = await request(path, options)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadImportErrors(errors: ImportError[]) {
  return download('/api/v1/bulk-import/errors.xlsx', 'loi-nhap-du-lieu.xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errors }),
  })
}

export function downloadImportFile(job: ImportJob) {
  return download(
    `/api/v1/bulk-import-jobs/${encodeURIComponent(job.id)}/file`,
    job.originalFilename,
  )
}

export function isActiveJob(job: ImportJob) {
  return job.status === 'queued' || job.status === 'running'
}

export const jobTypeForKind: Record<ImportKind, ImportJob['type']> = {
  products: 'product',
  customers: 'customer',
  suppliers: 'supplier',
}
