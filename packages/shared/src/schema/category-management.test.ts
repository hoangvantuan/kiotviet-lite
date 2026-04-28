import { describe, expect, it } from 'vitest'

import {
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from './category-management.js'

const validUuid = '0190d000-0000-7000-8000-000000000001'
const validUuid2 = '0190d000-0000-7000-8000-000000000002'

describe('createCategorySchema', () => {
  it('chấp nhận name hợp lệ, parentId omit', () => {
    expect(createCategorySchema.safeParse({ name: 'Đồ uống' }).success).toBe(true)
  })

  it('chấp nhận parentId null', () => {
    expect(createCategorySchema.safeParse({ name: 'Đồ uống', parentId: null }).success).toBe(true)
  })

  it('chấp nhận parentId là uuid', () => {
    expect(createCategorySchema.safeParse({ name: 'Cà phê', parentId: validUuid }).success).toBe(
      true,
    )
  })

  it('trim whitespace ở name', () => {
    const r = createCategorySchema.safeParse({ name: '  Đồ uống  ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Đồ uống')
    }
  })

  it('từ chối name rỗng (chỉ whitespace)', () => {
    expect(createCategorySchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('từ chối name dài hơn 100 ký tự', () => {
    expect(createCategorySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('từ chối name có ký tự không cho phép (emoji)', () => {
    expect(createCategorySchema.safeParse({ name: 'Đồ ăn 🍕' }).success).toBe(false)
  })

  it('từ chối name có ký tự không cho phép (HTML tags)', () => {
    expect(createCategorySchema.safeParse({ name: '<script>alert</script>' }).success).toBe(false)
  })

  it("chấp nhận ký tự đặc biệt cho phép: -_&()'./", () => {
    expect(createCategorySchema.safeParse({ name: 'Đồ ăn (mới) - 2026' }).success).toBe(true)
    expect(createCategorySchema.safeParse({ name: 'Bánh & kẹo' }).success).toBe(true)
    expect(createCategorySchema.safeParse({ name: "Trà_đặc'biệt" }).success).toBe(true)
  })

  it('từ chối parentId không phải uuid', () => {
    expect(createCategorySchema.safeParse({ name: 'X', parentId: 'not-a-uuid' }).success).toBe(
      false,
    )
  })
})

describe('updateCategorySchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(updateCategorySchema.safeParse({ name: 'Tên mới' }).success).toBe(true)
  })

  it('chấp nhận chỉ parentId (đổi cha)', () => {
    expect(updateCategorySchema.safeParse({ parentId: validUuid }).success).toBe(true)
  })

  it('chấp nhận parentId null (chuyển lên cấp 1)', () => {
    expect(updateCategorySchema.safeParse({ parentId: null }).success).toBe(true)
  })

  it('từ chối object rỗng', () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false)
  })

  it('từ chối name không hợp lệ khi truyền', () => {
    expect(updateCategorySchema.safeParse({ name: '' }).success).toBe(false)
    expect(updateCategorySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('từ chối parentId không phải uuid', () => {
    expect(updateCategorySchema.safeParse({ parentId: 'invalid' }).success).toBe(false)
  })
})

describe('reorderCategoriesSchema', () => {
  it('chấp nhận parentId null + ids hợp lệ', () => {
    expect(
      reorderCategoriesSchema.safeParse({ parentId: null, orderedIds: [validUuid, validUuid2] })
        .success,
    ).toBe(true)
  })

  it('chấp nhận parentId uuid + ids', () => {
    expect(
      reorderCategoriesSchema.safeParse({
        parentId: validUuid,
        orderedIds: [validUuid2],
      }).success,
    ).toBe(true)
  })

  it('từ chối orderedIds rỗng', () => {
    expect(reorderCategoriesSchema.safeParse({ parentId: null, orderedIds: [] }).success).toBe(
      false,
    )
  })

  it('từ chối orderedIds quá 200', () => {
    const big = Array.from({ length: 201 }, () => validUuid)
    expect(reorderCategoriesSchema.safeParse({ parentId: null, orderedIds: big }).success).toBe(
      false,
    )
  })

  it('từ chối id không phải uuid', () => {
    expect(
      reorderCategoriesSchema.safeParse({ parentId: null, orderedIds: ['not-uuid'] }).success,
    ).toBe(false)
  })

  it('từ chối thiếu parentId', () => {
    expect(reorderCategoriesSchema.safeParse({ orderedIds: [validUuid] }).success).toBe(false)
  })
})
