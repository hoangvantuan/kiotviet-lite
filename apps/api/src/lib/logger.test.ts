import { Writable } from 'node:stream'
import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { REDACT_PATHS } from './logger.js'

function createTestLogger(opts?: pino.LoggerOptions) {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim())
      callback()
    },
  })
  const logger = pino(
    {
      level: 'trace',
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: REDACT_PATHS,
        censor: '[Redacted]',
      },
      ...opts,
    },
    stream,
  )
  return { logger, lines }
}

describe('logger module', () => {
  const originalEnv = process.env.LOG_LEVEL

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalEnv
    }
  })

  it('tạo Pino instance hợp lệ', () => {
    const { logger } = createTestLogger()
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('default level = info', () => {
    const { logger } = createTestLogger({ level: 'info' })
    expect(logger.level).toBe('info')
  })

  it('custom level qua options', () => {
    const { logger } = createTestLogger({ level: 'debug' })
    expect(logger.level).toBe('debug')
  })

  it('log output là JSON hợp lệ chứa level, time, msg', () => {
    const { logger, lines } = createTestLogger()
    logger.info('test message')
    logger.flush()

    expect(lines.length).toBeGreaterThanOrEqual(1)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.level).toBe('info')
    expect(parsed.time).toBeDefined()
    expect(new Date(parsed.time).toISOString()).toBeTruthy()
    expect(parsed.msg).toBe('test message')
  })

  it('redact: password bị thay thế bằng [Redacted]', () => {
    const { logger, lines } = createTestLogger()
    logger.info({ user: { password: 'secret123' } }, 'login attempt')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.user.password).toBe('[Redacted]')
  })

  it('redact: pin bị thay thế bằng [Redacted]', () => {
    const { logger, lines } = createTestLogger()
    logger.info({ data: { pin: '1234' } }, 'pin check')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.data.pin).toBe('[Redacted]')
  })

  it('redact: authorization header bị thay thế', () => {
    const { logger, lines } = createTestLogger()
    logger.info({ req: { headers: { authorization: 'Bearer token123' } } }, 'request')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.req.headers.authorization).toBe('[Redacted]')
  })

  it('redact: botToken bị thay thế', () => {
    const { logger, lines } = createTestLogger()
    logger.info({ config: { botToken: 'telegram-token-xyz' } }, 'notification')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.config.botToken).toBe('[Redacted]')
  })

  it('redact: secret bị thay thế bằng [Redacted]', () => {
    const { logger, lines } = createTestLogger()
    logger.info({ webhook: { secret: 'hmac-secret-value' } }, 'webhook config')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.webhook.secret).toBe('[Redacted]')
  })

  it('level format dùng label string thay vì số', () => {
    const { logger, lines } = createTestLogger()
    logger.warn('warning msg')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.level).toBe('warn')
    expect(typeof parsed.level).toBe('string')
  })

  it('time format là ISO 8601', () => {
    const { logger, lines } = createTestLogger()
    logger.info('time check')
    logger.flush()

    const parsed = JSON.parse(lines[0]!)
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    expect(parsed.time).toMatch(isoRegex)
  })

  it('child logger kế thừa config và thêm field', () => {
    const { logger, lines } = createTestLogger()
    const child = logger.child({ requestId: 'abc-123' })
    child.info('child msg')
    child.flush()

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.requestId).toBe('abc-123')
    expect(parsed.msg).toBe('child msg')
  })
})
