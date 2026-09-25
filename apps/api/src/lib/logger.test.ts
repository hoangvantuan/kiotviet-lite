import { Writable } from 'node:stream'
import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { loggerOptions, withLogContext, withRequestLogContext } from './logger.js'

function createTestLogger(opts?: pino.LoggerOptions) {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString().trim())
      callback()
    },
  })
  const logger = pino({ ...loggerOptions, level: 'trace', ...opts }, stream)
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

  it('redact: PIN người duyệt trong đơn hàng và đơn đồng bộ bị thay thế', () => {
    const { logger, lines } = createTestLogger()
    logger.info(
      {
        body: { priceOverridePin: '111111', debtLimitOverridePin: '222222' },
        offline: { orderData: { priceOverridePin: '111111', debtLimitOverridePin: '222222' } },
        ctx: { input: { priceOverridePin: '111111', debtLimitOverridePin: '222222' } },
      },
      'create order',
    )
    logger.flush()

    const line = lines[0]!
    expect(line).not.toContain('111111')
    expect(line).not.toContain('222222')
    const parsed = JSON.parse(line)
    expect(parsed.body.priceOverridePin).toBe('[Redacted]')
    expect(parsed.offline.orderData.debtLimitOverridePin).toBe('[Redacted]')
    expect(parsed.ctx.input.priceOverridePin).toBe('[Redacted]')
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

  it('không mang field của log trước sang request khác', async () => {
    const { logger, lines } = createTestLogger()
    await withRequestLogContext('first-request', async () => {
      logger.info({ supplierName: 'Private supplier' }, 'first')
      await Promise.resolve()
      logger.info('second')
    })
    await withRequestLogContext('next-request', async () => {
      logger.info('third')
    })
    logger.flush()

    const [first, second, third] = lines.map((line) => JSON.parse(line))
    expect(first.requestId).toBe('first-request')
    expect(second).toMatchObject({ requestId: 'first-request', msg: 'second' })
    expect(second.supplierName).toBeUndefined()
    expect(third).toMatchObject({ requestId: 'next-request', msg: 'third' })
    expect(third.supplierName).toBeUndefined()
  })

  it('không ghi thông điệp lỗi có dữ liệu nhạy cảm', () => {
    const { logger, lines } = createTestLogger()
    logger.error({ err: new Error('PIN 123456 của khách hàng') }, 'unhandled error')
    logger.flush()

    const entry = JSON.parse(lines[0]!)
    expect(entry.err.type).toBe('Error')
    expect(JSON.stringify(entry)).not.toContain('123456')
  })

  // GL-22: log "supplier.created" của job nhập bị rollback trước đây không có gì nối với job.
  it('log trong tác vụ nền mang jobId, giữ requestId của request khởi tạo', async () => {
    const { logger, lines } = createTestLogger()
    await withRequestLogContext('req-1', () =>
      withLogContext({ jobId: 'job-1' }, async () => {
        await Promise.resolve()
        logger.info('supplier.created')
      }),
    )
    logger.info('outside')
    expect(JSON.parse(lines[0]!)).toMatchObject({ requestId: 'req-1', jobId: 'job-1' })
    expect(JSON.parse(lines[1]!)).not.toHaveProperty('jobId')
  })
})
