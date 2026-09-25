import { describe, expect, it } from 'vitest'

import { formatVnd } from './receipts.service.js'

describe('formatVnd', () => {
  it('formats integer amount with Vietnamese locale', () => {
    expect(formatVnd(1_000_000)).toBe('1.000.000đ')
  })

  it('formats zero', () => {
    expect(formatVnd(0)).toBe('0đ')
  })
})
