import { Lock, Pencil, Unlock } from 'lucide-react'

import type { UserListItem } from '@kiotviet-lite/shared'

import { Button } from '@/components/ui/button'

import { RoleBadge } from './role-badge'

interface StaffCardListProps {
  items: UserListItem[]
  onEdit: (u: UserListItem) => void
  onToggleLock: (u: UserListItem) => void
}

export function StaffCardList({ items, onEdit, onToggleLock }: StaffCardListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((user) => (
        <div
          key={user.id}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{user.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{user.phone ?? ''}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <RoleBadge role={user.role} />
              {user.isActive ? (
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Hoạt động
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Khoá
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
              <Pencil className="h-4 w-4" />
              <span>Sửa</span>
            </Button>
            <Button
              variant={user.isActive ? 'outline' : 'default'}
              size="sm"
              onClick={() => onToggleLock(user)}
            >
              {user.isActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              <span>{user.isActive ? 'Khoá' : 'Mở khoá'}</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
