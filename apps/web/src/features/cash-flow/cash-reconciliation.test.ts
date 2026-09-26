import { describe, expect, it } from 'vitest'

import { reconcileCash } from './cash-reconciliation'

describe('BC-06: đối soát tiền mặt cuối ngày khi không dùng ca', () => {
  it('phải có = đầu ngày + thu tiền mặt ròng; chênh lệch = thực đếm - phải có', () => {
    expect(reconcileCash({ openingCash: 500_000, netCash: 230_000, countedCash: 725_000 })).toEqual(
      { expectedCash: 730_000, difference: -5_000 },
    )
    expect(reconcileCash({ openingCash: 0, netCash: -20_000, countedCash: null })).toEqual({
      expectedCash: -20_000,
      difference: null,
    })
  })
})
