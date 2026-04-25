import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react'

import type { AuditAction, AuditLogItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RoleBadge } from '@/features/users/role-badge'
import { useUsersQuery } from '@/features/users/use-users'

import { getActionLabel } from './action-labels'
import { AuditDetailSheet } from './audit-detail-sheet'
import { type AuditFilters, AuditFilterSheet } from './audit-filter-sheet'
import { useAuditLogsQuery } from './use-audit-logs'

const PAGE_SIZE = 20

const DEFAULT_FILTERS: AuditFilters = {
  actorIds: [],
  actions: [],
  from: defaultFromDate(),
  to: '',
}

export function AuditLogViewer() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [detail, setDetail] = useState<AuditLogItem | null>(null)

  const usersQuery = useUsersQuery()

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      actorIds: filters.actorIds.length > 0 ? filters.actorIds : undefined,
      actions: filters.actions.length > 0 ? (filters.actions as AuditAction[]) : undefined,
      from: dateInputToIsoStart(filters.from),
      to: dateInputToIsoEnd(filters.to),
    }),
    [page, filters],
  )

  const auditQuery = useAuditLogsQuery(query)

  const items = auditQuery.data?.items ?? []
  const total = auditQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Lịch sử hoạt động</h2>
          <p className="text-sm text-muted-foreground">
            Theo dõi các thao tác quan trọng trong cửa hàng.
          </p>
        </div>
        <Button variant="outline" onClick={() => setFilterOpen(true)}>
          <Filter className="h-4 w-4" />
          <span>Bộ lọc</span>
        </Button>
      </div>

      {auditQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải lịch sử…</p>
      ) : auditQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được lịch sử hoạt động.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Không có hoạt động nào trong khoảng thời gian này.
        </p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} onClick={() => setDetail(item)} className="cursor-pointer">
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.actorName}</span>
                      <RoleBadge role={item.actorRole} />
                    </div>
                  </TableCell>
                  <TableCell>{getActionLabel(item.action)}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {summariseChanges(item.changes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Tổng {total} mục, trang {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || auditQuery.isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Trước</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || auditQuery.isLoading}
          >
            <span>Sau</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AuditFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        initialValue={filters}
        users={usersQuery.data ?? []}
        onApply={(next) => {
          setFilters(next)
          setPage(1)
        }}
      />

      <AuditDetailSheet
        open={detail !== null}
        onOpenChange={(v) => {
          if (!v) setDetail(null)
        }}
        item={detail}
      />
    </div>
  )
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${min} ${dd}/${mm}/${yyyy}`
}

function defaultFromDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function dateInputToIsoStart(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function dateInputToIsoEnd(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T23:59:59.999`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function summariseChanges(changes: unknown): string {
  if (!changes) return ''
  if (typeof changes !== 'object') return String(changes)
  const obj = changes as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length === 0) return ''
  return keys.slice(0, 3).join(', ') + (keys.length > 3 ? `, +${keys.length - 3}` : '')
}
