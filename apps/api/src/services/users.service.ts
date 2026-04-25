import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import crypto from 'node:crypto'

import {
  type CreateUserInput,
  refreshTokens,
  type UpdateUserInput,
  type UserListItem,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'
import { ApiError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { diffObjects, logAction, type RequestMeta } from './audit.service.js'

export interface UsersActor {
  userId: string
  storeId: string
  role: UserRole
}

function toUserListItem(row: typeof users.$inferSelect): UserListItem {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }
}

export interface ListUsersDeps {
  db: Db
  storeId: string
}

export async function listUsers({ db, storeId }: ListUsersDeps): Promise<UserListItem[]> {
  const rows = await db.query.users.findMany({
    where: eq(users.storeId, storeId),
    orderBy: [desc(users.createdAt)],
  })
  return rows.map(toUserListItem)
}

export interface CreateUserDeps {
  db: Db
  actor: UsersActor
  input: CreateUserInput
  meta?: RequestMeta
}

// Decision: NV mới chỉ có PIN, chưa có password login. Tạo passwordHash từ random
// UUID để giữ NOT NULL constraint, NV không thể login bằng password (chỉ Owner biết
// PIN của họ). Flow login bằng PIN sẽ implement ở Epic sau.
export async function createUser({
  db,
  actor,
  input,
  meta,
}: CreateUserDeps): Promise<UserListItem> {
  const existing = await db.query.users.findFirst({
    where: eq(users.phone, input.phone),
  })
  if (existing) {
    throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', {
      field: 'phone',
    })
  }

  const passwordHash = await hashPassword(crypto.randomUUID())
  const pinHash = await hashPassword(input.pin)

  return db.transaction(async (tx) => {
    let created: typeof users.$inferSelect
    try {
      const [row] = await tx
        .insert(users)
        .values({
          storeId: actor.storeId,
          name: input.name,
          phone: input.phone,
          passwordHash,
          pinHash,
          role: input.role,
        })
        .returning()

      if (!row) {
        throw new ApiError('INTERNAL_ERROR', 'Không tạo được nhân viên')
      }
      created = row
    } catch (err) {
      if (err instanceof ApiError) throw err
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        throw new ApiError('CONFLICT', 'Số điện thoại đã được sử dụng', { field: 'phone' })
      }
      throw err
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'user.created',
      targetType: 'user',
      targetId: created.id,
      changes: { name: input.name, phone: input.phone, role: input.role },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return toUserListItem(created)
  })
}

export interface UpdateUserDeps {
  db: Db
  actor: UsersActor
  targetId: string
  input: UpdateUserInput
  meta?: RequestMeta
}

export async function updateUser({
  db,
  actor,
  targetId,
  input,
  meta,
}: UpdateUserDeps): Promise<UserListItem> {
  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhân viên')
  }

  if (
    input.role !== undefined &&
    actor.userId === targetId &&
    target.role === 'owner' &&
    input.role !== 'owner'
  ) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Owner không thể tự hạ vai trò')
  }

  if (input.isActive === false && actor.userId === targetId) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Không thể tự khoá tài khoản của mình')
  }

  const updates: Partial<typeof users.$inferInsert> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.role !== undefined) updates.role = input.role
  if (input.isActive !== undefined) updates.isActive = input.isActive

  const before = {
    name: target.name,
    role: target.role,
    isActive: target.isActive,
  }
  const after = {
    name: input.name ?? target.name,
    role: input.role ?? target.role,
    isActive: input.isActive ?? target.isActive,
  }

  const pinChange = input.pin !== undefined
  if (pinChange) {
    updates.pinHash = await hashPassword(input.pin as string)
    updates.failedPinAttempts = 0
    updates.pinLockedUntil = null
  }

  if (Object.keys(updates).length === 0) {
    return toUserListItem(target)
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(users).set(updates).where(eq(users.id, targetId)).returning()

    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không cập nhật được nhân viên')
    }

    if (input.isActive === false && target.isActive) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, targetId), isNull(refreshTokens.revokedAt)))
    }

    const fieldDiff = diffObjects(before, after)
    if (Object.keys(fieldDiff).length > 0) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'user.updated',
        targetType: 'user',
        targetId,
        changes: fieldDiff,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    if (pinChange) {
      await logAction({
        db: tx as unknown as Db,
        storeId: actor.storeId,
        actorId: actor.userId,
        actorRole: actor.role,
        action: 'user.pin_reset',
        targetType: 'user',
        targetId,
        changes: { pin: 'reset' },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      })
    }

    return toUserListItem(updated)
  })
}

export interface LockUserDeps {
  db: Db
  actor: UsersActor
  targetId: string
  meta?: RequestMeta
}

export async function lockUser({ db, actor, targetId, meta }: LockUserDeps): Promise<UserListItem> {
  if (actor.userId === targetId) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Không thể tự khoá tài khoản của mình')
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhân viên')
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ isActive: false })
      .where(and(eq(users.id, targetId), ne(users.id, actor.userId)))
      .returning()

    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không khoá được nhân viên')
    }

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, targetId), isNull(refreshTokens.revokedAt)))

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'user.locked',
      targetType: 'user',
      targetId,
      changes: { isActive: { before: target.isActive, after: false } },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return toUserListItem(updated)
  })
}

export async function unlockUser({
  db,
  actor,
  targetId,
  meta,
}: LockUserDeps): Promise<UserListItem> {
  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) })
  if (!target || target.storeId !== actor.storeId) {
    throw new ApiError('NOT_FOUND', 'Không tìm thấy nhân viên')
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ isActive: true, failedPinAttempts: 0, pinLockedUntil: null })
      .where(eq(users.id, targetId))
      .returning()

    if (!updated) {
      throw new ApiError('INTERNAL_ERROR', 'Không mở khoá được nhân viên')
    }

    await logAction({
      db: tx as unknown as Db,
      storeId: actor.storeId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'user.unlocked',
      targetType: 'user',
      targetId,
      changes: { isActive: { before: target.isActive, after: true } },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    })

    return toUserListItem(updated)
  })
}
