import { describe, expect, it } from 'vitest'

import {
  createCategoryDiscountSchema,
  listCategoryDiscountsQuerySchema,
  updateCategoryDiscountSchema,
} from './category-discount-management.js'

const CAT_UUID = '00000000-0000-7000-8000-000000000001'
const CUST_UUID = '00000000-0000-7000-8000-000000000002'
const GROUP_UUID = '00000000-0000-7000-8000-000000000003'

describe('createCategoryDiscountSchema', () => {
  it('chấp nhận body với customerGroupId', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      minQty: 5,
      effectiveFrom: '2026-05-01',
      effectiveTo: '2026-12-31',
      isActive: true,
      note: 'Khuyến mãi',
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận body với customerId', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerId: CUST_UUID,
      discountType: 'amount',
      discountValue: 5000,
    })
    expect(r.success).toBe(true)
  })

  it('reject khi cả 2 target đều null', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      discountType: 'percent',
      discountValue: 10,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message)
      expect(messages).toContain('Chọn 1 khách hàng hoặc 1 nhóm khách hàng')
    }
  })

  it('reject khi cả 2 target có giá trị', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerId: CUST_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message)
      expect(messages).toContain('Chỉ chọn 1 khách hàng HOẶC 1 nhóm, không cả hai')
    }
  })

  it('reject discountType=percent + value > 100', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 101,
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận discountType=percent + value = 100', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 100,
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận discountType=amount + value lớn (1 tỷ)', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'amount',
      discountValue: 1_000_000_000,
    })
    expect(r.success).toBe(true)
  })

  it('reject discountValue > 9_999_999_999_999', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'amount',
      discountValue: 10_000_000_000_000,
    })
    expect(r.success).toBe(false)
  })

  it('reject effectiveTo < effectiveFrom', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      effectiveFrom: '2026-12-31',
      effectiveTo: '2026-01-01',
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận effectiveFrom = effectiveTo', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      effectiveFrom: '2026-05-01',
      effectiveTo: '2026-05-01',
    })
    expect(r.success).toBe(true)
  })

  it('reject minQty = 0', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      minQty: 0,
    })
    expect(r.success).toBe(false)
  })

  it('default minQty = 1', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.minQty).toBe(1)
    }
  })

  it('strict: reject key lạ', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      storeId: CAT_UUID,
    })
    expect(r.success).toBe(false)
  })

  it('reject categoryId không phải uuid', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: 'not-uuid',
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận note = null', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      note: null,
    })
    expect(r.success).toBe(true)
  })

  it('reject note > 255 ký tự', () => {
    const r = createCategoryDiscountSchema.safeParse({
      categoryId: CAT_UUID,
      customerGroupId: GROUP_UUID,
      discountType: 'percent',
      discountValue: 10,
      note: 'a'.repeat(256),
    })
    expect(r.success).toBe(false)
  })
})

describe('updateCategoryDiscountSchema', () => {
  it('reject empty object', () => {
    const r = updateCategoryDiscountSchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('chấp nhận chỉ discountValue', () => {
    const r = updateCategoryDiscountSchema.safeParse({ discountValue: 20 })
    expect(r.success).toBe(true)
  })

  it('chấp nhận chỉ isActive', () => {
    const r = updateCategoryDiscountSchema.safeParse({ isActive: false })
    expect(r.success).toBe(true)
  })

  it('strict: reject categoryId', () => {
    const r = updateCategoryDiscountSchema.safeParse({
      discountValue: 20,
      categoryId: CAT_UUID,
    })
    expect(r.success).toBe(false)
  })

  it('strict: reject customerId', () => {
    const r = updateCategoryDiscountSchema.safeParse({
      discountValue: 20,
      customerId: CUST_UUID,
    })
    expect(r.success).toBe(false)
  })

  it('strict: reject customerGroupId', () => {
    const r = updateCategoryDiscountSchema.safeParse({
      discountValue: 20,
      customerGroupId: GROUP_UUID,
    })
    expect(r.success).toBe(false)
  })

  it('reject discountType=percent + value > 100', () => {
    const r = updateCategoryDiscountSchema.safeParse({
      discountType: 'percent',
      discountValue: 150,
    })
    expect(r.success).toBe(false)
  })

  it('reject effectiveTo < effectiveFrom', () => {
    const r = updateCategoryDiscountSchema.safeParse({
      effectiveFrom: '2026-12-31',
      effectiveTo: '2026-01-01',
    })
    expect(r.success).toBe(false)
  })
})

describe('listCategoryDiscountsQuerySchema', () => {
  it('default page=1, pageSize=20', () => {
    const r = listCategoryDiscountsQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
    }
  })

  it('coerce string sang number', () => {
    const r = listCategoryDiscountsQuerySchema.safeParse({ page: '3', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(3)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('chấp nhận effectiveStatus enum', () => {
    const r = listCategoryDiscountsQuerySchema.safeParse({ effectiveStatus: 'active' })
    expect(r.success).toBe(true)
  })

  it('reject effectiveStatus enum sai', () => {
    const r = listCategoryDiscountsQuerySchema.safeParse({ effectiveStatus: 'unknown' })
    expect(r.success).toBe(false)
  })

  it('chấp nhận isActive coerce từ string', () => {
    const r = listCategoryDiscountsQuerySchema.safeParse({ isActive: 'true' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.isActive).toBe(true)
    }
  })
})
