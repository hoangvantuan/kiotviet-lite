import type { AuditLogItem } from '@kiotviet-lite/shared'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { RoleBadge } from '@/features/users/role-badge'

import { getActionLabel } from './action-labels'

interface AuditDetailSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: AuditLogItem | null
}

export function AuditDetailSheet({ open, onOpenChange, item }: AuditDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Chi tiết hoạt động</SheetTitle>
          <SheetDescription>{item ? getActionLabel(item.action) : ''}</SheetDescription>
        </SheetHeader>

        {item && (
          <div className="mt-6 space-y-4 text-sm">
            <DetailRow label="Thời gian" value={formatDateTime(item.createdAt)} />
            <DetailRow
              label="Người thực hiện"
              value={
                <span className="inline-flex items-center gap-2">
                  <span>{item.actorName}</span>
                  <RoleBadge role={item.actorRole} />
                </span>
              }
            />
            <DetailRow label="Hành động" value={getActionLabel(item.action)} />
            {item.targetType && (
              <DetailRow
                label="Đối tượng"
                value={`${item.targetType}${item.targetId ? ` #${item.targetId.slice(0, 8)}` : ''}`}
              />
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Thay đổi</p>
              <ChangesView changes={item.changes} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function ChangesView({ changes }: { changes: unknown }) {
  if (!changes || (typeof changes === 'object' && Object.keys(changes as object).length === 0)) {
    return <p className="text-sm text-muted-foreground">Không có chi tiết thay đổi.</p>
  }

  const json = JSON.stringify(changes, null, 2)
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
      {json}
    </pre>
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
