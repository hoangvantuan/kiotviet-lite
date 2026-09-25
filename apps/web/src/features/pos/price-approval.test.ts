import { describe, expect, it } from 'vitest'

import { priceApprovalFromError, requiredPriceApproval } from './price-approval'

type Tab = Parameters<typeof requiredPriceApproval>[0]

function tab(opts: {
  override?: boolean
  lineDiscount?: number
  orderDiscount?: number
  pin?: string | null
}): Tab {
  return {
    items: [
      {
        priceOverride: opts.override ?? false,
        discountAmount: opts.lineDiscount ?? 0,
      },
    ] as Tab['items'],
    orderDiscountAmount: opts.orderDiscount ?? 0,
    priceOverridePin: opts.pin ?? null,
  }
}

describe('requiredPriceApproval (POS-01)', () => {
  it('giỏ không sửa giá, không chiết khấu: không cần duyệt', () => {
    expect(requiredPriceApproval(tab({}), 'staff', false)).toBeNull()
  })

  it('nhân viên chiết khấu dòng hay chiết khấu đơn: cần người giữ pos.editPrice', () => {
    expect(requiredPriceApproval(tab({ lineDiscount: 1_000 }), 'staff', false)).toEqual([
      'pos.editPrice',
    ])
    expect(requiredPriceApproval(tab({ orderDiscount: 1_000 }), 'staff', false)).toEqual([
      'pos.editPrice',
    ])
  })

  it('quản lý tự chiết khấu: không cần duyệt; sửa giá thì luôn cần PIN', () => {
    expect(requiredPriceApproval(tab({ orderDiscount: 1_000 }), 'manager', false)).toBeNull()
    expect(requiredPriceApproval(tab({ override: true }), 'manager', false)).toEqual([
      'pos.editPrice',
    ])
  })

  it('đã có PIN duyệt hoặc đang ngoại tuyến: không mở hộp duyệt', () => {
    expect(
      requiredPriceApproval(tab({ lineDiscount: 1_000, pin: '123456' }), 'staff', false),
    ).toBeNull()
    expect(requiredPriceApproval(tab({ lineDiscount: 1_000 }), 'staff', true)).toBeNull()
  })
})

describe('priceApprovalFromError', () => {
  it('thiếu PIN duyệt: dùng requiredPermissions của máy chủ', () => {
    expect(
      priceApprovalFromError('VALIDATION_ERROR', {
        requiredPermissions: ['pos.editPrice', 'pos.editPriceBelowCost'],
      }),
    ).toEqual(['pos.editPrice', 'pos.editPriceBelowCost'])
  })

  it('người duyệt thiếu quyền dưới giá vốn: cần người giữ cả hai quyền', () => {
    expect(
      priceApprovalFromError('FORBIDDEN', { missingPermissions: ['pos.editPriceBelowCost'] }),
    ).toEqual(['pos.editPrice', 'pos.editPriceBelowCost'])
  })

  it('lỗi khác (vd duyệt hạn mức nợ) không mở hộp duyệt giá', () => {
    expect(
      priceApprovalFromError('FORBIDDEN', { missingPermissions: ['pos.overrideDebtLimit'] }),
    ).toBeNull()
    expect(priceApprovalFromError('BUSINESS_RULE_VIOLATION', undefined)).toBeNull()
  })
})
