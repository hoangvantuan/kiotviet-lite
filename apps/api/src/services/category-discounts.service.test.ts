import { describe, expect, it } from 'vitest'

import { computeEffectiveStatus } from './category-discounts.service.js'

const today = new Date('2026-04-30T00:00:00.000Z')

describe('computeEffectiveStatus', () => {
  it('isActive=false → inactive', () => {
    expect(
      computeEffectiveStatus({ isActive: false, effectiveFrom: null, effectiveTo: null }, today),
    ).toBe('inactive')
  })

  it('isActive=true, no dates → active', () => {
    expect(
      computeEffectiveStatus({ isActive: true, effectiveFrom: null, effectiveTo: null }, today),
    ).toBe('active')
  })

  it('effectiveFrom > today → pending', () => {
    expect(
      computeEffectiveStatus(
        { isActive: true, effectiveFrom: '2026-05-01', effectiveTo: null },
        today,
      ),
    ).toBe('pending')
  })

  it('effectiveTo < today → expired', () => {
    expect(
      computeEffectiveStatus(
        { isActive: true, effectiveFrom: null, effectiveTo: '2026-04-29' },
        today,
      ),
    ).toBe('expired')
  })

  it('effectiveFrom = today → active', () => {
    expect(
      computeEffectiveStatus(
        { isActive: true, effectiveFrom: '2026-04-30', effectiveTo: null },
        today,
      ),
    ).toBe('active')
  })

  it('effectiveTo = today → active', () => {
    expect(
      computeEffectiveStatus(
        { isActive: true, effectiveFrom: null, effectiveTo: '2026-04-30' },
        today,
      ),
    ).toBe('active')
  })

  it('isActive=false trump dates → inactive', () => {
    expect(
      computeEffectiveStatus(
        { isActive: false, effectiveFrom: '2026-05-01', effectiveTo: null },
        today,
      ),
    ).toBe('inactive')
  })

  it('expired trump pending khi cả 2 sai (chỉ có expired check theo logic)', () => {
    expect(
      computeEffectiveStatus(
        { isActive: true, effectiveFrom: '2026-05-01', effectiveTo: '2026-04-01' },
        today,
      ),
    ).toBe('expired')
  })
})
