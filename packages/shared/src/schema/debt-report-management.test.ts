import { describe, expect, it } from 'vitest'

import { debtAgingQuerySchema, debtSummaryQuerySchema } from './debt-report-management.js'
import { updateStoreSchema } from './store-settings.js'

describe('debtAgingQuerySchema', () => {
  it('accepts empty object (defaults)', () => {
    const result = debtAgingQuerySchema.parse({})
    expect(result.from).toBeUndefined()
    expect(result.to).toBeUndefined()
  })

  it('accepts valid from/to dates (datetime format)', () => {
    const result = debtAgingQuerySchema.parse({
      from: '2026-01-01T00:00:00Z',
      to: '2026-05-04T23:59:59Z',
    })
    expect(result.from).toBe('2026-01-01T00:00:00Z')
    expect(result.to).toBe('2026-05-04T23:59:59Z')
  })

  it('accepts valid from/to dates (YYYY-MM-DD format)', () => {
    const result = debtAgingQuerySchema.parse({
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(result.from).toBe('2026-08-01')
    expect(result.to).toBe('2026-08-31')
  })

  it('rejects invalid date format', () => {
    expect(() => debtAgingQuerySchema.parse({ from: 'not-a-date' })).toThrow()
  })
})

describe('debtSummaryQuerySchema', () => {
  it('accepts empty object (defaults)', () => {
    const result = debtSummaryQuerySchema.parse({})
    expect(result.from).toBeUndefined()
  })

  it('accepts valid date range', () => {
    const result = debtSummaryQuerySchema.parse({
      from: '2026-04-01T00:00:00Z',
      to: '2026-05-01T00:00:00Z',
    })
    expect(result.from).toBe('2026-04-01T00:00:00Z')
  })

  it('rejects invalid date', () => {
    expect(() => debtSummaryQuerySchema.parse({ to: '2026-13-01' })).toThrow()
  })
})

describe('updateStoreSchema debt fields', () => {
  it('accepts valid debtWarningPercent (1-100)', () => {
    const result = updateStoreSchema.parse({ debtWarningPercent: 75 })
    expect(result.debtWarningPercent).toBe(75)
  })

  it('accepts debtWarningPercent = 1 (min)', () => {
    const result = updateStoreSchema.parse({ debtWarningPercent: 1 })
    expect(result.debtWarningPercent).toBe(1)
  })

  it('accepts debtWarningPercent = 100 (max)', () => {
    const result = updateStoreSchema.parse({ debtWarningPercent: 100 })
    expect(result.debtWarningPercent).toBe(100)
  })

  it('rejects debtWarningPercent = 0', () => {
    expect(() => updateStoreSchema.parse({ debtWarningPercent: 0 })).toThrow()
  })

  it('rejects debtWarningPercent = 101', () => {
    expect(() => updateStoreSchema.parse({ debtWarningPercent: 101 })).toThrow()
  })

  it('rejects debtWarningPercent float', () => {
    expect(() => updateStoreSchema.parse({ debtWarningPercent: 80.5 })).toThrow()
  })

  it('accepts valid debtOverdueDays ("30,60,90")', () => {
    const result = updateStoreSchema.parse({ debtOverdueDays: '30,60,90' })
    expect(result.debtOverdueDays).toBe('30,60,90')
  })

  it('accepts single value debtOverdueDays', () => {
    const result = updateStoreSchema.parse({ debtOverdueDays: '45' })
    expect(result.debtOverdueDays).toBe('45')
  })

  it('rejects debtOverdueDays with letters', () => {
    expect(() => updateStoreSchema.parse({ debtOverdueDays: 'abc' })).toThrow()
  })

  it('rejects debtOverdueDays with value > 999', () => {
    expect(() => updateStoreSchema.parse({ debtOverdueDays: '1000' })).toThrow()
  })

  it('rejects empty debtOverdueDays', () => {
    expect(() => updateStoreSchema.parse({ debtOverdueDays: '' })).toThrow()
  })

  it('accepts both debt fields together', () => {
    const result = updateStoreSchema.parse({
      debtWarningPercent: 85,
      debtOverdueDays: '15,45,90',
    })
    expect(result.debtWarningPercent).toBe(85)
    expect(result.debtOverdueDays).toBe('15,45,90')
  })
})
