import { describe, expect, it } from 'vitest'

import type { UserRole } from '../schema/auth.js'
import { hasPermission, type Permission, PERMISSIONS } from './permissions.js'

const ROLES: UserRole[] = ['owner', 'manager', 'staff']

const MATRIX: Record<Permission, Record<UserRole, boolean>> = {
  'users.manage': { owner: true, manager: false, staff: false },
  'store.manage': { owner: true, manager: false, staff: false },
  'audit.viewAll': { owner: true, manager: false, staff: false },
  'audit.viewTeam': { owner: false, manager: true, staff: false },
  'audit.viewOwn': { owner: true, manager: true, staff: true },
  'reports.view': { owner: true, manager: true, staff: false },
  'products.manage': { owner: true, manager: true, staff: false },
  'pos.sell': { owner: true, manager: true, staff: true },
  'customers.view': { owner: true, manager: true, staff: true },
  'customers.manage': { owner: true, manager: true, staff: false },
  'pricing.view': { owner: true, manager: true, staff: true },
  'pricing.manage': { owner: true, manager: true, staff: false },
  'inventory.manage': { owner: true, manager: true, staff: false },
}

describe('PERMISSIONS map', () => {
  it('khai báo đầy đủ permission keys (8 base + 2 customer + 2 pricing + 1 inventory)', () => {
    const keys = Object.keys(PERMISSIONS).sort()
    expect(keys).toEqual(
      [
        'audit.viewAll',
        'audit.viewOwn',
        'audit.viewTeam',
        'customers.manage',
        'customers.view',
        'inventory.manage',
        'pos.sell',
        'pricing.manage',
        'pricing.view',
        'products.manage',
        'reports.view',
        'store.manage',
        'users.manage',
      ].sort(),
    )
  })

  it('mọi role trong PERMISSIONS đều thuộc 3 role hợp lệ', () => {
    for (const roles of Object.values(PERMISSIONS)) {
      for (const r of roles) {
        expect(ROLES).toContain(r)
      }
    }
  })
})

describe('hasPermission - ma trận quyền', () => {
  for (const perm of Object.keys(MATRIX) as Permission[]) {
    for (const role of ROLES) {
      const expected = MATRIX[perm][role]
      it(`${role} vs ${perm} → ${expected}`, () => {
        expect(hasPermission(role, perm)).toBe(expected)
      })
    }
  }
})

describe('hasPermission - các kết hợp đặc trưng', () => {
  it('Owner có tất cả quyền trừ audit.viewTeam', () => {
    expect(hasPermission('owner', 'users.manage')).toBe(true)
    expect(hasPermission('owner', 'store.manage')).toBe(true)
    expect(hasPermission('owner', 'audit.viewAll')).toBe(true)
    expect(hasPermission('owner', 'audit.viewOwn')).toBe(true)
    expect(hasPermission('owner', 'reports.view')).toBe(true)
    expect(hasPermission('owner', 'products.manage')).toBe(true)
    expect(hasPermission('owner', 'pos.sell')).toBe(true)
    expect(hasPermission('owner', 'audit.viewTeam')).toBe(false)
    expect(hasPermission('owner', 'inventory.manage')).toBe(true)
  })

  it('Manager: KHÔNG có users.manage / store.manage / audit.viewAll', () => {
    expect(hasPermission('manager', 'users.manage')).toBe(false)
    expect(hasPermission('manager', 'store.manage')).toBe(false)
    expect(hasPermission('manager', 'audit.viewAll')).toBe(false)
    expect(hasPermission('manager', 'audit.viewTeam')).toBe(true)
    expect(hasPermission('manager', 'reports.view')).toBe(true)
    expect(hasPermission('manager', 'products.manage')).toBe(true)
    expect(hasPermission('manager', 'pos.sell')).toBe(true)
    expect(hasPermission('manager', 'inventory.manage')).toBe(true)
  })

  it('Staff: chỉ có audit.viewOwn, pos.sell, customers.view, pricing.view', () => {
    expect(hasPermission('staff', 'users.manage')).toBe(false)
    expect(hasPermission('staff', 'store.manage')).toBe(false)
    expect(hasPermission('staff', 'audit.viewAll')).toBe(false)
    expect(hasPermission('staff', 'audit.viewTeam')).toBe(false)
    expect(hasPermission('staff', 'audit.viewOwn')).toBe(true)
    expect(hasPermission('staff', 'reports.view')).toBe(false)
    expect(hasPermission('staff', 'products.manage')).toBe(false)
    expect(hasPermission('staff', 'pos.sell')).toBe(true)
    expect(hasPermission('staff', 'customers.view')).toBe(true)
    expect(hasPermission('staff', 'customers.manage')).toBe(false)
    expect(hasPermission('staff', 'pricing.view')).toBe(true)
    expect(hasPermission('staff', 'pricing.manage')).toBe(false)
    expect(hasPermission('staff', 'inventory.manage')).toBe(false)
  })
})
