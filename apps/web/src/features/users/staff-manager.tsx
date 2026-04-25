import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'

import type { UserListItem, UserRole } from '@kiotviet-lite/shared'

import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMediaQuery } from '@/hooks/use-media-query'

import { LockConfirmDialog } from './lock-confirm-dialog'
import { StaffCardList } from './staff-card-list'
import { StaffFormDialog } from './staff-form-dialog'
import { StaffTable } from './staff-table'
import { useUsersQuery } from './use-users'

type RoleFilter = 'all' | UserRole

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function StaffManager() {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 300)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserListItem | null>(null)
  const [lockTarget, setLockTarget] = useState<UserListItem | null>(null)

  const isDesktop = useMediaQuery('(min-width: 768px)')
  const usersQuery = useUsersQuery()

  const filteredUsers = useMemo(() => {
    const list = usersQuery.data ?? []
    const q = debouncedSearch.trim().toLowerCase()
    return list.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (q.length === 0) return true
      return u.name.toLowerCase().includes(q) || (u.phone ?? '').toLowerCase().includes(q)
    })
  }, [usersQuery.data, debouncedSearch, roleFilter])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nhân viên</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý tài khoản và phân quyền nhân viên trong cửa hàng.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="self-start md:self-auto">
          <Plus className="h-4 w-4" />
          <span>Thêm nhân viên</span>
        </Button>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc số điện thoại"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            <SelectItem value="owner">Chủ cửa hàng</SelectItem>
            <SelectItem value="manager">Quản lý</SelectItem>
            <SelectItem value="staff">Nhân viên</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {usersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách…</p>
      ) : usersQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách nhân viên.</p>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Chưa có nhân viên"
          description="Hãy thêm nhân viên đầu tiên cho cửa hàng của bạn."
          actionLabel="Thêm nhân viên"
          onAction={() => setCreateOpen(true)}
        />
      ) : isDesktop ? (
        <StaffTable
          items={filteredUsers}
          onEdit={(u) => setEditTarget(u)}
          onToggleLock={(u) => setLockTarget(u)}
        />
      ) : (
        <StaffCardList
          items={filteredUsers}
          onEdit={(u) => setEditTarget(u)}
          onToggleLock={(u) => setLockTarget(u)}
        />
      )}

      <StaffFormDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      {editTarget && (
        <StaffFormDialog
          mode="edit"
          user={editTarget}
          open={editTarget !== null}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null)
          }}
        />
      )}
      <LockConfirmDialog
        open={lockTarget !== null}
        onOpenChange={(v) => {
          if (!v) setLockTarget(null)
        }}
        user={lockTarget}
      />
    </div>
  )
}
