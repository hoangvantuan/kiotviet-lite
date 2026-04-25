import { describe, expect, it } from 'vitest'

import { isThrottled } from '../throttle.js'

describe('isThrottled (unit, no DB)', () => {
  it('returns false when throttleSeconds <= 0', async () => {
    const mockDb = {} as never
    const result = await isThrottled(mockDb, 'store-1', 'stock.negative', 'ch-1', 0)
    expect(result).toBe(false)
  })

  it('returns false when throttleSeconds is negative', async () => {
    const mockDb = {} as never
    const result = await isThrottled(mockDb, 'store-1', 'stock.negative', 'ch-1', -10)
    expect(result).toBe(false)
  })
})
