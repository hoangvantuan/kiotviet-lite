import type { UserRole } from '../schema/auth.js'

export const PERMISSIONS = {
  'users.manage': ['owner'],
  'store.manage': ['owner'],
  'audit.viewAll': ['owner'],
  'audit.viewTeam': ['manager'],
  'audit.viewOwn': ['owner', 'manager', 'staff'],
  'reports.view': ['owner', 'manager'],
  'products.manage': ['owner', 'manager'],
  'pos.sell': ['owner', 'manager', 'staff'],
  'customers.view': ['owner', 'manager', 'staff'],
  'customers.manage': ['owner', 'manager'],
} as const satisfies Record<string, ReadonlyArray<UserRole>>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: UserRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as ReadonlyArray<UserRole>).includes(role)
}
