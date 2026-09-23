import { describe, expect, it } from 'vitest'

import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  variantsConfigSchema,
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

  it('chấp nhận mã hàng chứa khoảng trắng, thay vì từ chối', () => {
    const r = createProductSchema.safeParse({ name: 'X', sellingPrice: 0, sku: 'SP 001' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sku).toBe('SP 001')
  })

  it('chấp nhận SKU regex đúng (chữ số _ - . /)', () => {
    expect(
      createProductSchema.safeParse({ name: 'X', sellingPrice: 0, sku: 'SP-001_a.b/c' }).success,
    ).toBe(true)
  })

  it('chấp nhận dấu câu mới trong tên và chữ mọi ngôn ngữ trong mã hàng', () => {
    const r = createProductSchema.safeParse({
      name: 'Lốc + * : % = ; # ? – 1',
      sku: 'Hàng 日本語 + * , @ = 1',
      sellingPrice: 0,
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận mã hàng có dấu tổ hợp Unicode ở chữ tiếng Việt và chữ Hindi', () => {
    const r = createProductSchema.safeParse({
      name: 'X',
      sku: 'Vie\u0302\u0323t अक्षर',
      sellingPrice: 0,
    })
    expect(r.success).toBe(true)
  })

  it('chuẩn hóa khoảng trắng tên và mã hàng trước khi trả về', () => {
    const r = createProductSchema.safeParse({
      name: '  Cà  phê\u00a0\u00a0sữa  ',
      sku: '  Mã  hàng\u00a0\u00a0mới  ',
      sellingPrice: 0,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Cà phê sữa')
      expect(r.data.sku).toBe('Mã hàng mới')
    }
  })

  it('từ chối dấu bằng đầu chuỗi và ký tự điều khiển cả ở đầu cuối', () => {
    for (const field of ['name', 'sku'] as const) {
      for (const value of [
        ' =A',
        'A\nB',
        'A\tB',
        'A\r',
        '\u0000A',
        'A\u007f',
        'A\u0085',
        '\u2028A',
        'A\uFEFF',
      ]) {
        const r = createProductSchema.safeParse({
          name: 'Tên hợp lệ',
          sku: 'MA-1',
          sellingPrice: 0,
          [field]: value,
        })
        expect(r.success, `${field}: ${JSON.stringify(value)}`).toBe(false)
      }
      const r = createProductSchema.safeParse({
        name: 'Tên hợp lệ',
        sku: 'MA-1',
        sellingPrice: 0,
        [field]: 'A=B',
      })
      expect(r.success).toBe(true)
    }
  })

  it('không nới quy tắc mã vạch khi nới mã hàng', () => {
    for (const barcode of ['ABC DEF', 'Hàng', 'AB+CD', 'AB=CD']) {
      expect(
        createProductSchema.safeParse({ name: 'X', sku: 'Mã hàng +1', barcode, sellingPrice: 0 })
          .success,
      ).toBe(false)
    }
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

  it('áp dụng cùng quy tắc và chuẩn hóa khi sửa sản phẩm lẫn biến thể', () => {
    const r = updateProductSchema.safeParse({
      name: '  Gói  1+1 = 2 – Mới ',
      sku: '  Mã  hàng + 日本語 ',
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [{ sku: '  Đỏ  +1 ', attribute1Value: 'Đỏ', sellingPrice: 100 }],
      },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.name).toBe('Gói 1+1 = 2 – Mới')
      expect(r.data.sku).toBe('Mã hàng + 日本語')
      expect(r.data.variantsConfig?.variants[0]?.sku).toBe('Đỏ +1')
    }
    expect(updateProductSchema.safeParse({ sku: ' =SAI' }).success).toBe(false)
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

describe('variantsConfigSchema', () => {
  const baseVariant = {
    sku: 'AT-001-do-s',
    attribute1Value: 'Đỏ',
    attribute2Value: 'S',
    sellingPrice: 100000,
    stockQuantity: 0,
  }

  it('chấp nhận 1 thuộc tính (attribute2Name = null)', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu sắc',
      attribute2Name: null,
      variants: [
        { sku: 'AT-001-do', attribute1Value: 'Đỏ', sellingPrice: 100000 },
        { sku: 'AT-001-xanh', attribute1Value: 'Xanh', sellingPrice: 100000 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận 2 thuộc tính đầy đủ', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu sắc',
      attribute2Name: 'Kích cỡ',
      variants: [baseVariant, { ...baseVariant, sku: 'AT-001-do-m', attribute2Value: 'M' }],
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận variant có id (update existing)', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      variants: [
        {
          id: '0190d000-0000-7000-8000-000000000010',
          sku: 'AT-001-do',
          attribute1Value: 'Đỏ',
          sellingPrice: 100000,
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('từ chối tổ hợp (attribute1Value, attribute2Value) trùng', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: 'Size',
      variants: [baseVariant, { ...baseVariant, sku: 'AT-001-do-s-2' }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('Tổ hợp'))).toBe(true)
    }
  })

  it('từ chối SKU trùng trong array (case-insensitive)', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: 'Size',
      variants: [baseVariant, { ...baseVariant, sku: 'AT-001-DO-S', attribute2Value: 'M' }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('SKU biến thể bị trùng'))).toBe(true)
    }
  })

  it('từ chối barcode trùng', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: 'Size',
      variants: [
        { ...baseVariant, barcode: '1234567890' },
        { ...baseVariant, sku: 'AT-001-do-m', attribute2Value: 'M', barcode: '1234567890' },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('Barcode'))).toBe(true)
    }
  })

  it('từ chối khi attribute2Name set nhưng variant.attribute2Value null', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: 'Size',
      variants: [{ ...baseVariant, attribute2Value: null }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối khi attribute2Name null nhưng có variant.attribute2Value', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: null,
      variants: [{ ...baseVariant, attribute2Value: 'M' }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối tên 2 thuộc tính trùng case-insensitive', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu',
      attribute2Name: 'màu',
      variants: [{ ...baseVariant, attribute2Value: 'M' }],
    })
    expect(r.success).toBe(false)
  })

  it('từ chối > 100 variants', () => {
    const variants = Array.from({ length: 101 }, (_, i) => ({
      sku: `AT-${String(i).padStart(3, '0')}`,
      attribute1Value: `V${i}`,
      sellingPrice: 1000,
    }))
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'X',
      variants,
    })
    expect(r.success).toBe(false)
  })

  it('từ chối 0 variant', () => {
    const r = variantsConfigSchema.safeParse({ attribute1Name: 'X', variants: [] })
    expect(r.success).toBe(false)
  })

  it('từ chối tên thuộc tính có ký tự không hợp lệ (emoji)', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Màu 🎨',
      variants: [{ sku: 'X-1', attribute1Value: 'Đỏ', sellingPrice: 100 }],
    })
    expect(r.success).toBe(false)
  })

  it('chấp nhận giá trị thuộc tính có dấu chấm (1.5L)', () => {
    const r = variantsConfigSchema.safeParse({
      attribute1Name: 'Dung tích',
      variants: [{ sku: 'X-15', attribute1Value: '1.5L', sellingPrice: 100 }],
    })
    expect(r.success).toBe(true)
  })
})

describe('createProductSchema variantsConfig', () => {
  it('chấp nhận create kèm variantsConfig', () => {
    const r = createProductSchema.safeParse({
      name: 'Áo thun',
      sellingPrice: 0,
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [{ sku: 'AT-do', attribute1Value: 'Đỏ', sellingPrice: 100000 }],
      },
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận variantsConfig = null', () => {
    const r = createProductSchema.safeParse({
      name: 'X',
      sellingPrice: 0,
      variantsConfig: null,
    })
    expect(r.success).toBe(true)
  })
})

describe('updateProductSchema variantsConfig', () => {
  it('chấp nhận chỉ variantsConfig', () => {
    const r = updateProductSchema.safeParse({
      variantsConfig: {
        attribute1Name: 'Màu',
        variants: [{ sku: 'AT-do', attribute1Value: 'Đỏ', sellingPrice: 100000 }],
      },
    })
    expect(r.success).toBe(true)
  })

  it('chấp nhận variantsConfig = null (tắt biến thể)', () => {
    const r = updateProductSchema.safeParse({ variantsConfig: null })
    expect(r.success).toBe(true)
  })
})

describe('createProductSchema unitConversions (Story 2.4)', () => {
  it('chấp nhận unitConversions với 3 phần tử valid', () => {
    const r = createProductSchema.safeParse({
      name: 'Coca-cola lon',
      sellingPrice: 10000,
      unit: 'Lon',
      unitConversions: [
        { unit: 'Lốc', conversionFactor: 6, sellingPrice: 60000 },
        { unit: 'Thùng', conversionFactor: 24, sellingPrice: 240000 },
        { unit: 'Pallet', conversionFactor: 240, sellingPrice: 2400000 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('từ chối unitConversions với 4 phần tử (max 3)', () => {
    const r = createProductSchema.safeParse({
      name: 'X',
      sellingPrice: 0,
      unitConversions: [
        { unit: 'A', conversionFactor: 2, sellingPrice: 0 },
        { unit: 'B', conversionFactor: 3, sellingPrice: 0 },
        { unit: 'C', conversionFactor: 4, sellingPrice: 0 },
        { unit: 'D', conversionFactor: 5, sellingPrice: 0 },
      ],
    })
    expect(r.success).toBe(false)
  })
})
