import { describe, expect, it, vi } from 'vitest'

import { withRetry } from '../retry.js'
import type { SendResult } from '../transports/base.js'

describe('withRetry', () => {
  it('returns success on first attempt', async () => {
    const fn = vi.fn<() => Promise<SendResult>>().mockResolvedValue({ ok: true, attempts: 1 })
    const result = await withRetry(fn, 3)
    expect(result).toEqual({ ok: true, attempts: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries and succeeds on attempt 4 (default)', async () => {
    const fn = vi
      .fn<() => Promise<SendResult>>()
      .mockResolvedValueOnce({ ok: false, error: 'timeout', attempts: 1, retriable: true })
      .mockResolvedValueOnce({ ok: false, error: 'timeout', attempts: 1, retriable: true })
      .mockResolvedValueOnce({ ok: false, error: 'timeout', attempts: 1, retriable: true })
      .mockResolvedValue({ ok: true, attempts: 1 })

    vi.useFakeTimers()
    const promise = withRetry(fn)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(16000)
    const result = await promise
    vi.useRealTimers()

    expect(result).toEqual({ ok: true, attempts: 4 })
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('returns dead after max attempts (default 4)', async () => {
    const fn = vi
      .fn<() => Promise<SendResult>>()
      .mockResolvedValue({ ok: false, error: 'fail', attempts: 1, retriable: true })

    vi.useFakeTimers()
    const promise = withRetry(fn)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(16000)
    const result = await promise
    vi.useRealTimers()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts).toBe(4)
      expect(result.error).toBe('fail')
    }
  })

  it('stops immediately on non-retriable error', async () => {
    const fn = vi
      .fn<() => Promise<SendResult>>()
      .mockResolvedValue({ ok: false, error: '403 Forbidden', attempts: 1, retriable: false })

    const result = await withRetry(fn, 3)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts).toBe(1)
      expect(result.retriable).toBe(false)
    }
  })
})
