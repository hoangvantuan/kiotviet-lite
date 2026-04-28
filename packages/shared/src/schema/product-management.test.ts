import { describe, expect, it } from 'vitest'

import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './product-management.js'

const validUuid = '0190d000-0000-7000-8000-000000000001'

describe('createProductSchema', () => {
  it('chấp nhận input tối thiểu (name + sellingPrice)', () => {
    const r = createProductSchema.safeParse({
      name: 'Cà phê đen',
      sellingPrice: 25000,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.unit).toBe('Cái')
      expect(r.data.status).toBe('active')
      expect(r.data.trackInventory).toBe(false)
      expect(r.data.minStock).toBe(0)
      expect(r.data.initialStock).toBe(0)
    }
  })

  it('chấp nhận input đầy đủ', () => {
    const r = createProductSchema.safeParse({
      name: 'Cà phê, sữa đặc',
      sku: 'SP-000001',
      barcode: '8934567890123',
      categoryId: validUuid,
      sellingPrice: 25000,
      costPrice: 12000,
      unit: 'Ly',
      imageUrl: 'https://example.com/abc.jpg',
      status: 'active',
      trackInventory: true,
      minStock: 10,
      initialStock: 50,
    })
    expect(r.success).toBe(true)
  })

  it('từ chối tên trống', () => {
    expect(createProductSchema.safeParse({ name: '', sellingPrice: 0 }).success).toBe(false)
  })

  it('từ chối tên > 255 ký tự', () => {
    expect(createProductSchema.safeParse({ name: 'a'.repeat(256), sellingPrice: 0 }).success).toBe(
      false,
    )
  })

  it('chấp nhận dấu phẩy trong tên (khác categories)', () => {
    expect(
      createProductSchema.safeParse({ name: 'Cà phê, sữa đặc', sellingPrice: 0 }).success,
    ).toBe(true)
  })

  it('từ chối tên có emoji', () => {
    expect(createProductSchema.safeParse({ name: 'Cà phê 🍵', sellingPrice: 0 }).success).toBe(
      false,
    )
  })

  it('từ chối SKU regex sai (có space)', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, sku: 'SP 001' }).success,
    ).toBe(false)
  })

  it('chấp nhận SKU regex đúng (chữ số _ - . /)', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, sku: 'SP-001_a.b/c' }).success,
    ).toBe(true)
  })

  it('từ chối barcode regex sai (có dash)', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, barcode: '893-456' }).success,
    ).toBe(false)
  })

  it('chấp nhận barcode chỉ chữ + số', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, barcode: '8934567890123' })
        .success,
    ).toBe(true)
  })

  it('từ chối sellingPrice âm', () => {
    expect(createProductSchema.safeParse({ name: 'X', sellingPrice: -1 }).success).toBe(false)
  })

  it('từ chối sellingPrice không phải integer', () => {
    expect(createProductSchema.safeParse({ name: 'X', sellingPrice: 25000.5 }).success).toBe(false)
  })

  it('từ chối categoryId không phải uuid', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, categoryId: 'not-uuid' }).success,
    ).toBe(false)
  })

  it('chấp nhận categoryId null', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, categoryId: null }).success,
    ).toBe(true)
  })

  it('từ chối imageUrl không hợp lệ', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, imageUrl: 'not-url' }).success,
    ).toBe(false)
  })
})

describe('updateProductSchema', () => {
  it('chấp nhận chỉ name', () => {
    expect(updateProductSchema.safeParse({ name: 'Tên mới' }).success).toBe(true)
  })

  it('chấp nhận chỉ sellingPrice', () => {
    expect(updateProductSchema.safeParse({ sellingPrice: 30000 }).success).toBe(true)
  })

  it('từ chối object rỗng', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false)
  })

  it('chấp nhận trackInventory = false', () => {
    expect(updateProductSchema.safeParse({ trackInventory: false }).success).toBe(true)
  })
})

describe('listProductsQuerySchema', () => {
  it('coerce page/pageSize từ string', () => {
    const r = listProductsQuerySchema.safeParse({ page: '2', pageSize: '50' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(2)
      expect(r.data.pageSize).toBe(50)
    }
  })

  it('default values', () => {
    const r = listProductsQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.pageSize).toBe(20)
      expect(r.data.status).toBe('all')
    }
  })

  it("chấp nhận categoryId = 'none'", () => {
    const r = listProductsQuerySchema.safeParse({ categoryId: 'none' })
    expect(r.success).toBe(true)
  })

  it('chấp nhận categoryId là uuid', () => {
    const r = listProductsQuerySchema.safeParse({ categoryId: validUuid })
    expect(r.success).toBe(true)
  })

  it('từ chối pageSize > 100', () => {
    expect(listProductsQuerySchema.safeParse({ pageSize: 200 }).success).toBe(false)
  })

  it('chấp nhận stockFilter enum', () => {
    expect(listProductsQuerySchema.safeParse({ stockFilter: 'out_of_stock' }).success).toBe(true)
  })

  it('từ chối stockFilter sai enum', () => {
    expect(listProductsQuerySchema.safeParse({ stockFilter: 'unknown' }).success).toBe(false)
  })
})
