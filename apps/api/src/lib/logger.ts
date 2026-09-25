import { AsyncLocalStorage } from 'node:async_hooks'
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import pino from 'pino'

import { env } from './env.js'

type RequestLogContext = {
  requestId?: string
  storeId?: string
  actorId?: string
  jobId?: string
}

const requestContext = new AsyncLocalStorage<RequestLogContext>()

export function withRequestLogContext<T>(requestId: string, work: () => T): T {
  return requestContext.run({ requestId }, work)
}

// Tác vụ nền (job nhập hàng loạt) không có request; gắn jobId để mọi log của job đối chiếu được.
export function withLogContext<T>(context: { jobId: string }, work: () => T): T {
  return requestContext.run({ ...requestContext.getStore(), ...context }, work)
}

export function setRequestLogActor(storeId: string, actorId: string): void {
  const context = requestContext.getStore()
  if (context) {
    context.storeId = storeId
    context.actorId = actorId
  }
}

function safeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: typeof err }
  const code =
    'code' in err && typeof err.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(err.code)
      ? err.code
      : undefined
  const frames = err.stack
    ?.split('\n')
    .slice(1)
    .map((line) => line.match(/(?:^|\s)at (?:.*\()?([^\s()]+:\d+:\d+)\)?$/)?.[1])
    .filter((frame): frame is string => Boolean(frame))
    .slice(0, 8)
  const type = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(err.name) ? err.name : 'Error'
  return { type, ...(code ? { code } : {}), ...(frames?.length ? { frames } : {}) }
}

const isDev = process.env.NODE_ENV !== 'production'

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000

// pino-roll supports removeOtherLogFiles at runtime; its v4 type omits this option.
const fileRotationLimit = { count: 300, removeOtherLogFiles: true }

async function pruneExpiredLogs(): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS
  const entries = await readdir(env.logDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^app\.(?:\d{4}-\d\d-\d\d\.)?\d+\.log$/.test(entry.name))
      .map(async (entry) => {
        const path = join(env.logDir, entry.name)
        if ((await stat(path)).mtimeMs < cutoff) await unlink(path)
      }),
  )
}

function resolveLogLevel(): string {
  const level = env.logLevel
  return VALID_LOG_LEVELS.includes(level) ? level : 'info'
}

export const REDACT_PATHS = [
  'req.headers.authorization',
  '*.password',
  '*.passwordHash',
  '*.pin',
  '*.pinHash',
  // PIN duyệt nằm trong payload đơn (POS và đơn ngoại tuyến trong /sync/push)
  '*.priceOverridePin',
  '*.debtLimitOverridePin',
  '*.orderData.priceOverridePin',
  '*.orderData.debtLimitOverridePin',
  '*.input.priceOverridePin',
  '*.input.debtLimitOverridePin',
  '*.botToken',
  '*.secret',
  '*.hmacSecret',
  '*.configEncrypted',
]

export const loggerOptions: pino.LoggerOptions = {
  level: resolveLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => ({ ...requestContext.getStore() }),
  serializers: { err: safeError },
  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]',
  },
}

async function createLogger(): Promise<pino.Logger> {
  if (isDev) {
    return pino(loggerOptions, pino.transport({ target: 'pino-pretty' }))
  }

  const { default: pinoRoll } = await import('pino-roll')

  const fileStream = await pinoRoll({
    file: join(env.logDir, 'app'),
    frequency: 'daily',
    extension: '.log',
    mkdir: true,
    limit: fileRotationLimit,
    size: '100m',
  })

  const streams: pino.StreamEntry[] = [{ stream: process.stdout }, { stream: fileStream }]

  return pino(loggerOptions, pino.multistream(streams))
}

export let logger: pino.Logger = pino(loggerOptions)

export async function initLogger(): Promise<void> {
  logger = await createLogger()
  if (!isDev) {
    await pruneExpiredLogs().catch((err: unknown) =>
      logger.warn({ err }, 'expired log cleanup failed'),
    )
    setInterval(() => {
      void pruneExpiredLogs().catch((err: unknown) =>
        logger.warn({ err }, 'expired log cleanup failed'),
      )
    }, ROTATION_INTERVAL_MS).unref()
  }
}

export type { Logger } from 'pino'
