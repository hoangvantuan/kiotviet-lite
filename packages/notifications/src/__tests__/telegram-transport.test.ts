import { uuidv7 } from 'uuidv7'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationEvent } from '@kiotviet-lite/shared'

const mockSendMessage = vi.fn()

const { MockGrammyError, MockHttpError } = vi.hoisted(() => {
  class MockGrammyError extends Error {
    constructor(
      message: string,
      public error_code: number,
    ) {
      super(message)
      this.name = 'GrammyError'
    }
  }

  class MockHttpError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'HttpError'
    }
  }

  return { MockGrammyError, MockHttpError }
})

vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(() => ({
    api: { sendMessage: mockSendMessage },
  })),
  GrammyError: MockGrammyError,
  HttpError: MockHttpError,
}))

import { TelegramTransport } from '../transports/telegram.js'

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: uuidv7(),
    storeId: uuidv7(),
    type: 'stock.negative',
    severity: 'error',
    title: 'Tồn kho âm',
    body: 'Sản phẩm ABC giảm xuống -5',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('TelegramTransport', () => {
  const transport = new TelegramTransport()
  const validConfig = { botToken: 'test-token', chatId: '12345' }

  beforeEach(() => {
    mockSendMessage.mockReset()
  })

  it('gửi thành công, trả ok: true', async () => {
    mockSendMessage.mockResolvedValueOnce({ message_id: 1 })

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({ ok: true, attempts: 1 })
    expect(mockSendMessage).toHaveBeenCalledWith('12345', expect.stringContaining('[ERROR]'), {
      parse_mode: 'HTML',
    })
  })

  it('message chứa severity badge, title, body, time', async () => {
    mockSendMessage.mockResolvedValueOnce({ message_id: 1 })
    const event = makeEvent({ title: 'Test Alert', body: 'Some body' })

    await transport.send(event, validConfig)

    const message = mockSendMessage.mock.calls[0]?.[1] as string
    expect(message).toContain('<b>[ERROR]')
    expect(message).toContain('Test Alert')
    expect(message).toContain('Some body')
    expect(message).toContain('<i>')
  })

  it('thiếu botToken hoặc chatId: trả error không retriable', async () => {
    const result1 = await transport.send(makeEvent(), { chatId: '123' })
    expect(result1).toEqual({
      ok: false,
      error: 'Missing botToken or chatId',
      attempts: 1,
      retriable: false,
    })

    const result2 = await transport.send(makeEvent(), { botToken: 'tok' })
    expect(result2).toEqual({
      ok: false,
      error: 'Missing botToken or chatId',
      attempts: 1,
      retriable: false,
    })
  })

  it('GrammyError 401: trả retriable false', async () => {
    mockSendMessage.mockRejectedValueOnce(new MockGrammyError('Unauthorized', 401))

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized',
      attempts: 1,
      retriable: false,
    })
  })

  it('GrammyError 500: trả retriable true', async () => {
    mockSendMessage.mockRejectedValueOnce(new MockGrammyError('Internal Server Error', 500))

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({
      ok: false,
      error: 'Internal Server Error',
      attempts: 1,
      retriable: true,
    })
  })

  it('GrammyError 429: trả retriable true', async () => {
    mockSendMessage.mockRejectedValueOnce(new MockGrammyError('Too Many Requests', 429))

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({
      ok: false,
      error: 'Too Many Requests',
      attempts: 1,
      retriable: true,
    })
  })

  it('GrammyError 403: trả retriable false', async () => {
    mockSendMessage.mockRejectedValueOnce(new MockGrammyError('Forbidden', 403))

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({
      ok: false,
      error: 'Forbidden',
      attempts: 1,
      retriable: false,
    })
  })

  it('HttpError (network): trả retriable true', async () => {
    mockSendMessage.mockRejectedValueOnce(new MockHttpError('Network failure'))

    const result = await transport.send(makeEvent(), validConfig)

    expect(result).toEqual({
      ok: false,
      error: 'Network failure',
      attempts: 1,
      retriable: true,
    })
  })
})
