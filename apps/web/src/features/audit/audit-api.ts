import type { AuditLogItem, AuditLogQuery } from '@kiotviet-lite/shared'

import { apiClient } from '@/lib/api-client'

interface ApiEnvelope<T> {
  data: T
}

export interface AuditLogListResponse {
  items: AuditLogItem[]
  total: number
  page: number
  pageSize: number
}

function buildQueryString(query: AuditLogQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.actorIds && query.actorIds.length > 0) {
    for (const id of query.actorIds) params.append('actorIds', id)
  }
  if (query.actions && query.actions.length > 0) {
    for (const a of query.actions) params.append('actions', a)
  }
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function listAuditLogsApi(query: AuditLogQuery): Promise<AuditLogListResponse> {
  const res = await apiClient.get<ApiEnvelope<AuditLogListResponse>>(
    `/api/v1/audit-logs${buildQueryString(query)}`,
  )
  return res.data
}
