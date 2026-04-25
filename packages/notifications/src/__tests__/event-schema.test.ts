import { uuidv7 } from 'uuidv7'
import { describe, expect, it } from 'vitest'

import { notificationEventSchema } from '../event-schema.js'

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tồn kho âm',
    body: 'Sản phẩm X bị âm kho tại chi nhánh chính',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('notificationEventSchema', () => {
  it('parses valid event', () => {
    const result = notificationEventSchema.parse(validEvent())
    expect(result.type).toBe('stock.negative')
    expect(result.severity).toBe('error')
  })

  it('accepts optional context and correlationId', () => {
    const result = notificationEventSchema.parse(
      validEvent({ context: { sku: 'ABC123' }, correlationId: 'req-001' }),
    )
    expect(result.context).toEqual({ sku: 'ABC123' })
    expect(result.correlationId).toBe('req-001')
  })

  it('rejects missing required fields', () => {
    expect(() => notificationEventSchema.parse({})).toThrow()
    expect(() => notificationEventSchema.parse({ id: uuidv7() })).toThrow()
  })

  it('rejects invalid severity', () => {
    expect(() => notificationEventSchema.parse(validEvent({ severity: 'debug' }))).toThrow()
  })

  it('rejects invalid event type', () => {
    expect(() => notificationEventSchema.parse(validEvent({ type: 'unknown.event' }))).toThrow()
  })

  it('rejects title > 200 chars', () => {
    expect(() => notificationEventSchema.parse(validEvent({ title: 'a'.repeat(201) }))).toThrow()
  })

  it('rejects body > 2000 chars', () => {
    expect(() => notificationEventSchema.parse(validEvent({ body: 'b'.repeat(2001) }))).toThrow()
  })

  it('rejects invalid uuid for id', () => {
    expect(() => notificationEventSchema.parse(validEvent({ id: 'not-a-uuid' }))).toThrow()
  })
})
