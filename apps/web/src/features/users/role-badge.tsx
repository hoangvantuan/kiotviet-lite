import type { UserRole } from '@kiotviet-lite/shared'

import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Chủ cửa hàng',
  manager: 'Quản lý',
  staff: 'Nhân viên',
}

const ROLE_CLASSES: Record<UserRole, string> = {
  owner: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  staff: 'bg-gray-100 text-gray-700',
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        ROLE_CLASSES[role],
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  )
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role]
}
