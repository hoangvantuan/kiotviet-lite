import { and, desc, eq, gte, inArray, lte, or, type SQL, sql } from 'drizzle-orm'
import type { Context } from 'hono'

import {
  type AuditAction,
  type AuditLogItem,
  type AuditLogQuery,
  auditLogs,
  hasPermission,
  type UserRole,
  users,
} from '@kiotviet-lite/shared'

import type { Db } from '../db/index.js'

export interface RequestMeta {
  ipAddress?: string
  userAgent?: string
}

export function getRequestMeta(c: Context): RequestMeta {
  const ipHeader =
    c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip')
  const ipAddress = ipHeader ? ipHeader.split(',')[0]?.trim() : undefined
  const userAgent = c.req.header('user-agent') ?? undefined
  return { ipAddress, userAgent }
}

export interface LogActionInput {
  db: Db
  storeId: string
  actorId: string
  action: AuditAction
  targetType?: string
  targetId?: string
  changes?: unknown
  ipAddress?: string
  userAgent?: string
}

export async function logAction(input: LogActionInput): Promise<void> {
  const { db, storeId, actorId, action, targetType, targetId, changes, ipAddress, userAgent } =
    input
  await db.insert(auditLogs).values({
    storeId,
    actorId,
    action,
    targetType,
    targetId,
    changes: changes === undefined ? null : (changes as object),
    ipAddress,
    userAgent,
  })
}

export interface AuditActor {
  userId: string
  storeId: string
  role: UserRole
}

export interface ListAuditDeps {
  db: Db
  actor: AuditActor
  query: AuditLogQuery
}

export interface AuditListResult {
  items: AuditLogItem[]
  total: number
  page: number
  pageSize: number
}

export async function listAudit({ db, actor, query }: ListAuditDeps): Promise<AuditListResult> {
  const { page, pageSize, actorIds, actions, from, to } = query

  const conditions: SQL[] = [eq(auditLogs.storeId, actor.storeId)]

  if (hasPermission(actor.role, 'audit.viewAll')) {
    // owner: tất cả store
  } else if (hasPermission(actor.role, 'audit.viewTeam')) {
    const scope = or(eq(auditLogs.actorId, actor.userId), eq(users.role, 'staff'))
    if (scope) conditions.push(scope)
  } else {
    conditions.push(eq(auditLogs.actorId, actor.userId))
  }

  if (actorIds && actorIds.length > 0) {
    conditions.push(inArray(auditLogs.actorId, actorIds))
  }
  if (actions && actions.length > 0) {
    conditions.push(inArray(auditLogs.action, actions))
  }
  if (from) {
    conditions.push(gte(auditLogs.createdAt, new Date(from)))
  }
  if (to) {
    conditions.push(lte(auditLogs.createdAt, new Date(to)))
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      actorName: users.name,
      actorRole: users.role,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      changes: auditLogs.changes,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorId))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset)

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorId))
    .where(whereClause)

  const total = totalRows[0]?.count ?? 0

  const items: AuditLogItem[] = rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    action: row.action as AuditAction,
    targetType: row.targetType,
    targetId: row.targetId,
    changes: row.changes,
    createdAt: row.createdAt.toISOString(),
  }))

  return { items, total, page, pageSize }
}

export type DiffRecord = Record<string, { before: unknown; after: unknown }>

export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffRecord {
  const diff: DiffRecord = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    const b = before[key]
    const a = after[key]
    if (!Object.is(b, a)) {
      diff[key] = { before: b, after: a }
    }
  }
  return diff
}
