import { describe, expect, it } from 'vitest'

import {
  formatDebtLimitLabel,
  remainingDebtAllowance,
  resolveEffectiveDebtLimit,
} from './debt-limit.js'

describe('resolveEffectiveDebtLimit (ADR-0009)', () => {
  it('cờ không giới hạn thắng mọi hạn mức: null', () => {
    expect(
      resolveEffectiveDebtLimit({ debtUnlimited: true, customerDebtLimit: 0, groupDebtLimit: 5 }),
    ).toBeNull()
  })

  it('hạn mức riêng của khách, kể cả 0, được ưu tiên hơn nhóm', () => {
    expect(
      resolveEffectiveDebtLimit({
        debtUnlimited: false,
        customerDebtLimit: 0,
        groupDebtLimit: 500,
      }),
    ).toBe(0)
    expect(
      resolveEffectiveDebtLimit({
        debtUnlimited: false,
        customerDebtLimit: 300,
        groupDebtLimit: 500,
      }),
    ).toBe(300)
  })

  it('khách không đặt hạn mức thì theo nhóm; không có cả hai thì 0 (không cho nợ)', () => {
    expect(
      resolveEffectiveDebtLimit({
        debtUnlimited: false,
        customerDebtLimit: null,
        groupDebtLimit: 500,
      }),
    ).toBe(500)
    expect(
      resolveEffectiveDebtLimit({
        debtUnlimited: false,
        customerDebtLimit: null,
        groupDebtLimit: null,
      }),
    ).toBe(0)
  })
})

describe('remainingDebtAllowance và formatDebtLimitLabel', () => {
  it('phân biệt không giới hạn với không cho nợ', () => {
    expect(remainingDebtAllowance(null, 1_000)).toBeNull()
    expect(remainingDebtAllowance(0, 0)).toBe(0)
    expect(remainingDebtAllowance(1_000, 300)).toBe(700)
    expect(formatDebtLimitLabel(null)).toBe('Không giới hạn')
    expect(formatDebtLimitLabel(0)).toBe('Không cho nợ')
    expect(formatDebtLimitLabel(1_000_000)).toContain('1.000.000')
  })
})
