import { useQuery } from '@tanstack/react-query'

import type { AuditLogQuery } from '@kiotviet-lite/shared'

import { listAuditLogsApi } from './audit-api'

export function useAuditLogsQuery(query: AuditLogQuery) {
  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => listAuditLogsApi(query),
  })
}
