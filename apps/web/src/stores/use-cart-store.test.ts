import { beforeEach, describe, expect, it } from 'vitest'

import { useCartStore } from './use-cart-store'

describe('useCartStore - unit conversion & desktop controls', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
  })

  const sampleItem = {
    productId: 'prod-coke',
    variantId: null,
    productName: 'Coca Cola',
    variantName: null,
    sku: 'COKE-001',
    unitPrice: 10_000,
    costPrice: 7_000,
    imageUrl: null,
    notes: null,
    unitName: 'Lon',
    unitConversionId: null,
    baseUnit: 'Lon',
    baseUnitPrice: 10_000,
    baseStockQuantity: 48,
    trackInventory: true,
    stockQuantity: 48,
    unitConversions: [
      {
        id: 'uc-loc',
        unit: 'Lốc (6 lon)',
        conversionFactor: 6,
        sellingPrice: 55_000,
      },
      {
        id: 'uc-thung',
        unit: 'Thùng (24 lon)',
        conversionFactor: 24,
        sellingPrice: 210_000,
      },
    ],
  }

  it('thêm sản phẩm lưu đầy đủ thông tin đơn vị gốc và đơn vị quy đổi', () => {
    useCartStore.getState().addItem(sampleItem, 2)

    const items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.id).toBe('prod-coke')
    expect(item.unitName).toBe('Lon')
    expect(item.baseUnit).toBe('Lon')
    expect(item.baseUnitPrice).toBe(10_000)
    expect(item.baseStockQuantity).toBe(48)
    expect(item.unitConversions).toHaveLength(2)
    expect(item.lineTotal).toBe(20_000)
  })

  it('đổi đơn vị quy đổi sang Lốc: cập nhật tên đơn vị, giá bán, tồn kho và thành tiền', () => {
    useCartStore.getState().addItem(sampleItem, 2)

    useCartStore.getState().changeItemUnit('prod-coke', 'uc-loc')

    const items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.id).toBe('prod-coke-uc-loc')
    expect(item.unitConversionId).toBe('uc-loc')
    expect(item.unitName).toBe('Lốc (6 lon)')
    expect(item.unitPrice).toBe(55_000)
    // 48 lon / 6 = 8 lốc
    expect(item.stockQuantity).toBe(8)
    expect(item.lineTotal).toBe(110_000) // 2 * 55_000
  })

  it('đổi đơn vị quy đổi từ Thùng về đơn vị gốc (Lon): khôi phục giá và tồn kho gốc', () => {
    useCartStore.getState().addItem(sampleItem, 1)
    useCartStore.getState().changeItemUnit('prod-coke', 'uc-thung')

    let items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items[0]?.unitName).toBe('Thùng (24 lon)')
    expect(items[0]?.unitPrice).toBe(210_000)
    expect(items[0]?.stockQuantity).toBe(2) // 48 / 24

    // Đổi về đơn vị gốc (null)
    useCartStore.getState().changeItemUnit('prod-coke-uc-thung', null)

    items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.id).toBe('prod-coke')
    expect(item.unitConversionId).toBeNull()
    expect(item.unitName).toBe('Lon')
    expect(item.unitPrice).toBe(10_000)
    expect(item.stockQuantity).toBe(48)
    expect(item.lineTotal).toBe(10_000)
  })

  it('đổi đơn vị sang đơn vị đã tồn tại trong giỏ thì gộp số lượng', () => {
    // Thêm 1 Lon và 1 Thùng
    useCartStore.getState().addItem(sampleItem, 1)
    useCartStore.getState().addItem(
      {
        ...sampleItem,
        unitConversionId: 'uc-thung',
        unitName: 'Thùng (24 lon)',
        unitPrice: 210_000,
        stockQuantity: 2,
      },
      1,
    )

    let items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items).toHaveLength(2)

    // Đổi 1 Lon thành 1 Thùng -> phải gộp vào Thùng hiện có thành 2 Thùng
    useCartStore.getState().changeItemUnit('prod-coke', 'uc-thung')

    items = useCartStore.getState().tabs[1]?.items ?? []
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.id).toBe('prod-coke-uc-thung')
    expect(item.quantity).toBe(2)
    expect(item.unitPrice).toBe(210_000)
    expect(item.lineTotal).toBe(420_000)
  })

  it('đổi đơn vị quy đổi reset priceSource về retail_price và xoá priceSourceDetail', () => {
    useCartStore.getState().addItem({
      ...sampleItem,
      priceSource: 'customer_price',
      priceSourceDetail: 'Giá riêng KH',
    })

    const initialItem = useCartStore.getState().tabs[1]?.items[0]
    expect(initialItem?.priceSource).toBe('customer_price')
    expect(initialItem?.priceSourceDetail).toBe('Giá riêng KH')

    useCartStore.getState().changeItemUnit('prod-coke', 'uc-loc')

    const updatedItem = useCartStore.getState().tabs[1]?.items[0]
    expect(updatedItem?.unitConversionId).toBe('uc-loc')
    expect(updatedItem?.priceSource).toBe('retail_price')
    expect(updatedItem?.priceSourceDetail).toBeNull()
  })

  it('updateItemPrice với targetTabIndex cập nhật đúng tab chỉ định không ảnh hưởng activeTab', () => {
    // Tab 1 có sampleItem
    useCartStore.getState().setActiveTab(1)
    useCartStore.getState().addItem(sampleItem, 1)

    // Chuyển sang Tab 2
    useCartStore.getState().setActiveTab(2)

    // Cập nhật giá cho Tab 1 từ background
    useCartStore.getState().updateItemPrice('prod-coke', 12_000, 'price_list', 'Bảng giá sỉ', 1)

    // Tab 1 phải có giá mới
    const tab1Item = useCartStore.getState().tabs[1]?.items[0]
    expect(tab1Item?.unitPrice).toBe(12_000)
    expect(tab1Item?.priceSource).toBe('price_list')
    expect(tab1Item?.priceSourceDetail).toBe('Bảng giá sỉ')

    // Tab 2 hiện tại vẫn rỗng và không bị xáo trộn
    expect(useCartStore.getState().tabs[2]?.items).toHaveLength(0)
    expect(useCartStore.getState().activeTab).toBe(2)
  })
})

describe('useCartStore - PIN duyệt gắn với đúng giỏ lúc duyệt', () => {
  const item = {
    productId: 'prod-milk',
    variantId: null,
    productName: 'Sữa',
    variantName: null,
    sku: 'MILK-001',
    unitPrice: 100_000,
    imageUrl: null,
    notes: null,
    unitName: 'Hộp',
    unitConversionId: null,
    baseUnit: 'Hộp',
    baseUnitPrice: 100_000,
    baseStockQuantity: 10,
    trackInventory: true,
    stockQuantity: 10,
    unitConversions: [],
  }

  beforeEach(() => {
    useCartStore.getState().setActiveTab(1)
    useCartStore.getState().clearCart()
    useCartStore.getState().addItem(item, 1)
    useCartStore.getState().updateOrderDiscount('amount', 5_000)
    useCartStore.getState().setPriceOverridePin('1234', 'manager-1')
  })

  const tab = () => useCartStore.getState().tabs[1]!

  it('đổi chiết khấu đơn sau khi duyệt thì bỏ PIN và người duyệt', () => {
    expect(tab().priceOverridePin).toBe('1234')
    useCartStore.getState().updateOrderDiscount('percent', 100)
    expect(tab().priceOverridePin).toBeNull()
    expect(tab().priceApproverId).toBeNull()
  })

  it('đổi số lượng hay chiết khấu dòng sau khi duyệt thì bỏ PIN', () => {
    useCartStore.getState().updateQuantity('prod-milk', 3)
    expect(tab().priceOverridePin).toBeNull()

    useCartStore.getState().setPriceOverridePin('1234', 'manager-1')
    useCartStore.getState().updateLineDiscount('prod-milk', 'amount', 50_000)
    expect(tab().priceOverridePin).toBeNull()
  })

  it('đổi phần không ảnh hưởng giá (ghi chú dòng) thì giữ PIN', () => {
    expect(tab().priceOverridePin).toBe('1234')
    useCartStore.getState().updateLineNotes('prod-milk', 'giao sau')
    expect(tab().priceOverridePin).toBe('1234')
    expect(tab().priceApproverId).toBe('manager-1')
  })
})

describe('useCartStore - bán số lẻ hàng cân ký (GL-07, POS-09)', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart()
  })

  const meat = {
    productId: 'prod-meat',
    variantId: null,
    productName: 'Thịt heo',
    variantName: null,
    sku: 'KG-01',
    unitPrice: 45_000,
    imageUrl: null,
    notes: null,
    unitName: 'kg',
    unitConversionId: null,
    trackInventory: true,
    stockQuantity: 10,
    allowDecimalQuantity: true,
    unitConversions: [{ id: 'uc-thung', unit: 'Thùng', conversionFactor: 10, sellingPrice: 0 }],
  }
  const items = () => useCartStore.getState().tabs[1]?.items ?? []

  it('1,255 kg × 45.000 đ ra 56.475 đ; cộng dồn không lệch số thực', () => {
    useCartStore.getState().addItem(meat, 1.255)
    expect(items()[0]).toMatchObject({ quantity: 1.255, lineTotal: 56_475 })
    useCartStore.getState().addItem(meat, 0.1)
    useCartStore.getState().addItem(meat, 0.2)
    expect(items()[0]!.quantity).toBe(1.555)
    useCartStore.getState().updateQuantity('prod-meat', 0.333)
    expect(items()[0]).toMatchObject({ quantity: 0.333, lineTotal: 14_985 })
  })

  it('hàng không bật cờ bỏ qua số lẻ, giữ số cũ', () => {
    const can = { ...meat, productId: 'prod-can', allowDecimalQuantity: false }
    useCartStore.getState().addItem(can, 1.5)
    expect(items()).toHaveLength(0)
    useCartStore.getState().addItem(can, 2)
    useCartStore.getState().updateQuantity('prod-can', 1.5)
    expect(items()[0]!.quantity).toBe(2)
  })

  it('đổi sang đơn vị chỉ nhận số nguyên thì số lẻ về 1', () => {
    useCartStore.getState().addItem(meat, 1.5)
    useCartStore.getState().changeItemUnit('prod-meat', 'uc-thung')
    expect(items()[0]).toMatchObject({ quantity: 1, unitConversionId: 'uc-thung' })
  })
})
