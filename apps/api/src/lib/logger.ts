import { join } from 'node:path'
import pino from 'pino'

import { env } from './env.js'

const isDev = process.env.NODE_ENV !== 'production'

const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

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
  '*.botToken',
  '*.secret',
  '*.hmacSecret',
  '*.configEncrypted',
]

const pinoConfig: pino.LoggerOptions = {
  level: resolveLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: '[Redacted]',
  },
}

async function createLogger(): Promise<pino.Logger> {
  if (isDev) {
    return pino(pinoConfig, pino.transport({ target: 'pino-pretty' }))
  }

  const { createRollStream } = await import('pino-roll')

  const fileStream = await createRollStream({
    file: join(env.logDir, 'app'),
    frequency: 'daily',
    extension: '.log',
    mkdir: true,
    limit: { count: 30 },
    size: '100m',
  })

  const streams: pino.StreamEntry[] = [{ stream: process.stdout }, { stream: fileStream }]

  return pino(pinoConfig, pino.multistream(streams))
}

export let logger: pino.Logger = pino(pinoConfig)

export async function initLogger(): Promise<void> {
  logger = await createLogger()
}

export type { Logger } from 'pino'
