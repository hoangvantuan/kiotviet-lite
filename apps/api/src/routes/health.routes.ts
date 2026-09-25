import { sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { Db } from '../db/index.js'
import journal from '../db/migrations/meta/_journal.json' with { type: 'json' }
import { isShuttingDown } from '../lib/lifecycle.js'
import { logger } from '../lib/logger.js'

const DEFAULT_TIMEOUT_MS = 2_000

export type ReadinessCheck = 'ok' | 'down' | 'pending' | 'shutting_down'

export interface ReadinessResult {
  ready: boolean
  checks: { db: ReadinessCheck; migrations: ReadinessCheck }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Kiểm phụ thuộc thật: DB trả lời `select 1` trong hạn, và số migration đã áp dụng
 * không ít hơn số migration mà bản build này mang theo (bảng của drizzle migrator).
 */
export async function checkReadiness(
  db: Db,
  options: { timeoutMs?: number; expectedMigrations?: number } = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const expected = options.expectedMigrations ?? journal.entries.length
  if (isShuttingDown()) {
    return { ready: false, checks: { db: 'shutting_down', migrations: 'shutting_down' } }
  }
  try {
    const rows = await withTimeout(
      db.execute<{ applied: number }>(
        sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
      ),
      timeoutMs,
    )
    // postgres-js trả mảng, PGlite trả { rows }
    const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as {
      applied: number
    }[]
    const applied = Number(list[0]?.applied ?? 0)
    const migrations: ReadinessCheck = applied >= expected ? 'ok' : 'pending'
    return { ready: migrations === 'ok', checks: { db: 'ok', migrations } }
  } catch (error) {
    // Bảng migration chưa tồn tại nghĩa là DB tới được nhưng chưa migrate.
    const code = (error as { code?: string; cause?: { code?: string } }).code
    const causeCode = (error as { cause?: { code?: string } }).cause?.code
    if (code === '42P01' || code === '3F000' || causeCode === '42P01' || causeCode === '3F000') {
      return { ready: false, checks: { db: 'ok', migrations: 'pending' } }
    }
    return { ready: false, checks: { db: 'down', migrations: 'down' } }
  }
}

// Mount tại /api/v1/health.
//   GET /api/v1/health       readiness: DB + migration; 503 khi chưa sẵn sàng (Docker, uptime monitor)
//   GET /api/v1/health/live  liveness: tiến trình còn phục vụ HTTP, không chạm DB
export function createHealthRoutes(args: {
  db: Db
  timeoutMs?: number
  expectedMigrations?: number
}) {
  const app = new Hono()
  let lastReady: boolean | undefined

  app.get('/live', (c) => c.json({ status: 'ok' }))

  app.get('/', async (c) => {
    const result = await checkReadiness(args.db, args)
    if (result.ready !== lastReady) {
      if (result.ready) logger.info({ checks: result.checks }, 'readiness ok')
      else logger.error({ checks: result.checks }, 'readiness failed')
      lastReady = result.ready
    }
    c.header('Cache-Control', 'no-store')
    return c.json(
      { status: result.ready ? 'ok' : 'unavailable', checks: result.checks },
      result.ready ? 200 : 503,
    )
  })

  return app
}
