import { useEffect, useState } from 'react'

import type { AuditAction, UserListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { ACTION_GROUPS } from './action-labels'

export interface AuditFilters {
  actorIds: string[]
  actions: AuditAction[]
  from: string
  to: string
}

interface AuditFilterSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialValue: AuditFilters
  users: UserListItem[]
  onApply: (next: AuditFilters) => void
}

export function AuditFilterSheet({
  open,
  onOpenChange,
  initialValue,
  users,
  onApply,
}: AuditFilterSheetProps) {
  const [draft, setDraft] = useState<AuditFilters>(initialValue)

  useEffect(() => {
    if (open) setDraft(initialValue)
  }, [open, initialValue])

  const toggleActor = (id: string) => {
    setDraft((prev) =>
      prev.actorIds.includes(id)
        ? { ...prev, actorIds: prev.actorIds.filter((x) => x !== id) }
        : { ...prev, actorIds: [...prev.actorIds, id] },
    )
  }

  const toggleAction = (action: AuditAction) => {
    setDraft((prev) =>
      prev.actions.includes(action)
        ? { ...prev, actions: prev.actions.filter((x) => x !== action) }
        : { ...prev, actions: [...prev.actions, action] },
    )
  }

  const reset = () => {
    setDraft({ actorIds: [], actions: [], from: '', to: '' })
  }

  const apply = () => {
    onApply(draft)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Bộ lọc lịch sử</SheetTitle>
          <SheetDescription>
            Chọn người thực hiện, loại hành động và khoảng thời gian.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Khoảng thời gian</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="filter-from" className="text-xs">
                  Từ ngày
                </Label>
                <Input
                  id="filter-from"
                  type="date"
                  value={draft.from}
                  onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-to" className="text-xs">
                  Đến ngày
                </Label>
                <Input
                  id="filter-to"
                  type="date"
                  value={draft.to}
                  onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Người thực hiện</h3>
            <div className="flex flex-col gap-2">
              {users.length === 0 && (
                <p className="text-xs text-muted-foreground">Chưa có nhân viên nào.</p>
              )}
              {users.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={draft.actorIds.includes(u.id)}
                    onChange={() => toggleActor(u.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>{u.name}</span>
                  <span className="text-xs text-muted-foreground">({u.phone ?? ''})</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Loại hành động</h3>
            <div className="space-y-3">
              {ACTION_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.actions.map((action) => {
                      const checked = draft.actions.includes(action)
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => toggleAction(action)}
                          className={
                            checked
                              ? 'rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs text-primary'
                              : 'rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent'
                          }
                        >
                          {action}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <SheetFooter className="mt-6 flex-row gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={reset}>
            Đặt lại
          </Button>
          <Button type="button" onClick={apply}>
            Áp dụng
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
