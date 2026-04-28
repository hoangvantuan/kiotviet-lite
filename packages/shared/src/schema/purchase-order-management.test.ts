import { describe, expect, it } from 'vitest'

import {
  createPurchaseOrderSchema,
  discountTypeSchema,
  listPurchaseOrdersQuerySchema,
  paymentStatusSchema,
  purchaseOrderItemInputSchema,
} from './purchase-order-management.js'

const productUuid = '0190d000-0000-7000-8000-000000000001'
const variantUuid = '0190d000-0000-7000-8000-000000000002'
const supplierUuid = '0190d000-0000-7000-8000-000000000010'

describe('discountTypeSchema', () => {
  it('chấp nhận amount', () => {
    expect(discountTypeSchema.safeParse('amount').success).toBe(true)
  })

  it('chấp nhận percent', () => {
    expect(discountTypeSchema.safeParse('percent').success).toBe(true)
  })

  it('từ chối giá trị khác', () => {
    expect(discountTypeSchema.safeParse('fixed').success).toBe(false)
  })
})

describe('paymentStatusSchema', () => {
  it('chấp nhận unpaid/partial/paid', () => {
    expect(paymentStatusSchema.safeParse('unpaid').success).toBe(true)
    expect(paymentStatusSchema.safeParse('partial').success).toBe(true)
    expect(paymentStatusSchema.safeParse('paid').success).toBe(true)
  })

  it('từ chối khác', () => {
    expect(paymentStatusSchema.safeParse('done').success).toBe(false)
  })
})

describe('purchaseOrderItemInputSchema', () => {
  it('chấp nhận item hợp lệ không variant', () => {
    const r = purchaseOrderItemInputSchema.safeParse({
      productId: productUuid,
      quantity: 10,
      unitPrice: 50000,
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận item có variant', () => {
    const r = purchaseOrderItemInputSchema.safeParse({
      productId: productUuid,
      variantId: variantUuid,
      quantity: 5,
      unitPrice: 100000,
      discountType: 'percent',
      discountValue: 500,
    })
    expect(r.success).toBe(true)
  })

  it('từ chối quantity = 0', () => {
    expect(
      purchaseOrderItemInputSchema.safeParse({
        productId: productUuid,
        quantity: 0,
        unitPrice: 100,
      }).success,
    ).toBe(false)
  })

  it('từ chối unitPrice âm', () => {
    expect(
      purchaseOrderItemInputSchema.safeParse({
        productId: productUuid,
        quantity: 1,
        unitPrice: -1,
      }).success,
    ).toBe(false)
  })

  it('chấp nhận unitPrice = 0', () => {
    expect(
      purchaseOrderItemInputSchema.safeParse({
        productId: productUuid,
        quantity: 1,
        unitPrice: 0,
      }).success,
    ).toBe(true)
  })

  it('từ chối quantity không phải số nguyên', () => {
    expect(
      purchaseOrderItemInputSchema.safeParse({
        productId: productUuid,
        quantity: 1.5,
        unitPrice: 100,
      }).success,
    ).toBe(false)
  })
})

describe('createPurchaseOrderSchema', () => {
  it('chấp nhận phiếu hợp lệ', () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: supplierUuid,
      items: [{ productId: productUuid, quantity: 10, unitPrice: 50000 }],
    })
    expect(r.success).toBe(true)
  })

  it('từ chối items rỗng', () => {
    expect(
      createPurchaseOrderSchema.safeParse({ supplierId: supplierUuid, items: [] }).success,
    ).toBe(false)
  })

  it('từ chối items > 200', () => {
    const items = Array.from({ length: 201 }, () => ({
      productId: productUuid,
      quantity: 1,
      unitPrice: 100,
    }))
    expect(createPurchaseOrderSchema.safeParse({ supplierId: supplierUuid, items }).success).toBe(
      false,
    )
  })

  it('từ chối supplierId không phải uuid', () => {
    expect(
      createPurchaseOrderSchema.safeParse({
        supplierId: 'not-a-uuid',
        items: [{ productId: productUuid, quantity: 1, unitPrice: 100 }],
      }).success,
    ).toBe(false)
  })

  it('default discountTotalType=amount, paidAmount=0', () => {
    const r = createPurchaseOrderSchema.safeParse({
      supplierId: supplierUuid,
      items: [{ productId: productUuid, quantity: 1, unitPrice: 100 }],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.discountTotalType).toBe('amount')
      expect(r.data.paidAmount).toBe(0)
    }
  })

  it('từ chối paidAmount âm', () => {
    expect(
      createPurchaseOrderSchema.safeParse({
        supplierId: supplierUuid,
        items: [{ productId: productUuid, quantity: 1, unitPrice: 100 }],
        paidAmount: -1,
      }).success,
    ).toBe(false)
  })
})

describe('listPurchaseOrdersQuerySchema', () => {
  it('default page=1, pageSize=20', () => {
    const r = listPurchaseOrdersQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('chấp nhận fromDate ISO', () => {
    expect(
      listPurchaseOrdersQuerySchema.safeParse({ fromDate: '2026-04-01T00:00:00Z' }).success,
    ).toBe(true)
  })

  it('từ chối fromDate không phải ISO', () => {
    expect(listPurchaseOrdersQuerySchema.safeParse({ fromDate: '2026-04-01' }).success).toBe(false)
  })

  it('chấp nhận paymentStatus enum', () => {
    expect(listPurchaseOrdersQuerySchema.safeParse({ paymentStatus: 'paid' }).success).toBe(true)
  })

  it('từ chối paymentStatus invalid', () => {
    expect(listPurchaseOrdersQuerySchema.safeParse({ paymentStatus: 'done' }).success).toBe(false)
  })
})
