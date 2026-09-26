import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCartStore } from '@/stores/use-cart-store'

import {
  cartBaseQuantity,
  changeCartItemUnit,
  checkStock,
  guardAddToCart,
  type StockTarget,
  updateCartQuantity,
  usePosStockPolicy,
} from './stock-guard'

const toast = vi.hoisted(() => ({ showWarning: vi.fn(), showError: vi.fn() }))
vi.mock('@/lib/toast', () => toast)

// POS-13: tồn 1 bán 3 bị chặn hay chỉ cảnh báo tùy cài đặt cửa hàng, cộng mọi dòng cùng hàng

const coke = {
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
  baseStockQuantity: 8,
  trackInventory: true,
  stockQuantity: 8,
  unitConversions: [{ id: 'uc-loc', unit: 'Lốc', conversionFactor: 6, sellingPrice: 55_000 }],
}

const target: StockTarget = {
  productId: 'prod-coke',
  variantId: null,
  trackInventory: true,
  baseStock: 1,
  name: 'Coca Cola',
  baseUnit: 'Lon',
}

function items() {
  const s = useCartStore.getState()
  return s.tabs[s.activeTab]?.items ?? []
}

beforeEach(() => {
  useCartStore.getState().clearCart()
  usePosStockPolicy.getState().setAllowNegativeStock(true)
  toast.showWarning.mockReset()
  toast.showError.mockReset()
})

describe('checkStock', () => {
  it('trong tồn kho hoặc không theo dõi tồn thì cho qua', () => {
    expect(checkStock(target, 1, false)).toEqual({ status: 'ok' })
    expect(checkStock({ ...target, trackInventory: false }, 99, false)).toEqual({ status: 'ok' })
  })

  it('tồn 1 bán 3: cho bán âm thì cảnh báo, không cho thì chặn, đều nêu rõ số lượng', () => {
    const warn = checkStock(target, 3, true)
    expect(warn.status).toBe('warn')
    expect(warn.status !== 'ok' && warn.message).toBe(
      'Vượt tồn kho: Coca Cola chỉ còn 1 Lon, trong giỏ sẽ có 3 Lon. Tồn kho sẽ bị âm',
    )
    const blocked = checkStock(target, 3, false)
    expect(blocked.status).toBe('blocked')
    expect(blocked.status !== 'ok' && blocked.message).toContain(
      'Cửa hàng không cho bán vượt tồn kho',
    )
  })

  it('hết hàng thì nói hết hàng', () => {
    const r = checkStock({ ...target, baseStock: 0 }, 1, false)
    expect(r.status !== 'ok' && r.message).toContain('Hết hàng: Coca Cola')
  })
})

describe('kiểm tồn trên giỏ', () => {
  it('cộng số lượng quy đổi của mọi dòng cùng hàng', () => {
    useCartStore.getState().addItem(coke, 2)
    useCartStore.getState().addItem({ ...coke, unitConversionId: 'uc-loc', unitName: 'Lốc' }, 1)
    expect(cartBaseQuantity(items(), 'prod-coke', null)).toBe(8)
  })

  it('thêm vượt tồn khi cửa hàng không cho bán âm: chặn và báo lỗi', () => {
    usePosStockPolicy.getState().setAllowNegativeStock(false)
    useCartStore.getState().addItem(coke, 1)
    expect(guardAddToCart({ ...target, baseStock: 1 }, 2)).toBe(false)
    expect(toast.showError).toHaveBeenCalledTimes(1)
  })

  it('thêm vượt tồn khi cửa hàng cho bán âm: cho thêm và cảnh báo', () => {
    useCartStore.getState().addItem(coke, 1)
    expect(guardAddToCart({ ...target, baseStock: 1 }, 2)).toBe(true)
    expect(toast.showWarning).toHaveBeenCalledTimes(1)
  })

  it('sửa số lượng vượt tồn bị chặn thì giữ số lượng cũ, giảm thì luôn được', () => {
    usePosStockPolicy.getState().setAllowNegativeStock(false)
    useCartStore.getState().addItem(coke, 2)
    const id = items()[0]!.id
    expect(updateCartQuantity(id, 9)).toBe(false)
    expect(items()[0]!.quantity).toBe(2)
    expect(updateCartQuantity(id, 8)).toBe(true)
    expect(updateCartQuantity(id, 1)).toBe(true)
    expect(items()[0]!.quantity).toBe(1)
  })

  it('đổi sang đơn vị lớn làm vượt tồn thì bị chặn', () => {
    usePosStockPolicy.getState().setAllowNegativeStock(false)
    useCartStore.getState().addItem(coke, 2)
    const id = items()[0]!.id
    expect(changeCartItemUnit(id, 'uc-loc')).toBe(false)
    expect(items()[0]!.unitConversionId).toBeNull()
    expect(toast.showError).toHaveBeenCalledTimes(1)
  })
})

// GL-07 (ADR-0015): hàng số lẻ ở hai đơn vị, cộng dồn tồn giỏ phải chính xác tới 0,001
describe('kiểm tồn hàng số lẻ ở nhiều đơn vị', () => {
  const rice = {
    ...coke,
    productId: 'prod-gao',
    productName: 'Gạo ST25',
    sku: 'GAO-ST25',
    unitName: 'kg',
    baseUnit: 'kg',
    unitPrice: 30_000,
    baseUnitPrice: 30_000,
    allowDecimalQuantity: true,
    baseStockQuantity: 0.3,
    stockQuantity: 0.3,
    unitConversions: [
      {
        id: 'uc-tui',
        unit: 'Túi 2kg',
        conversionFactor: 2,
        sellingPrice: 58_000,
        allowDecimalQuantity: true,
      },
    ],
  }
  const riceTarget: StockTarget = {
    productId: 'prod-gao',
    variantId: null,
    trackInventory: true,
    baseStock: 0.3,
    name: 'Gạo ST25',
    baseUnit: 'kg',
  }

  beforeEach(() => usePosStockPolicy.getState().setAllowNegativeStock(false))

  it('0,1 kg và 0,1 túi (0,2 kg) vừa đúng tồn 0,3 kg: không bị chặn', () => {
    useCartStore.getState().addItem(rice, 0.1)
    expect(cartBaseQuantity(items(), 'prod-gao', null)).toBe(0.1)
    expect(guardAddToCart(riceTarget, 0.2)).toBe(true)
    useCartStore
      .getState()
      .addItem({ ...rice, unitConversionId: 'uc-tui', unitName: 'Túi 2kg' }, 0.1)
    expect(cartBaseQuantity(items(), 'prod-gao', null)).toBe(0.3)
    const tui = items().find((i) => i.unitConversionId === 'uc-tui')!
    // Sửa lại đúng số cũ qua đường tăng số lượng: vẫn trong tồn
    useCartStore.getState().updateQuantity(tui.id, 0.05)
    expect(updateCartQuantity(tui.id, 0.1)).toBe(true)
    expect(toast.showError).not.toHaveBeenCalled()
  })

  it('vượt tồn ở hai đơn vị: chặn, báo số lẻ theo vi-VN', () => {
    useCartStore.getState().addItem(rice, 0.2)
    useCartStore
      .getState()
      .addItem({ ...rice, unitConversionId: 'uc-tui', unitName: 'Túi 2kg' }, 0.05)
    const tui = items().find((i) => i.unitConversionId === 'uc-tui')!
    expect(updateCartQuantity(tui.id, 0.1)).toBe(false)
    expect(items().find((i) => i.id === tui.id)!.quantity).toBe(0.05)
    expect(toast.showError).toHaveBeenCalledWith(
      'Vượt tồn kho: Gạo ST25 chỉ còn 0,3 kg, trong giỏ sẽ có 0,4 kg. Cửa hàng không cho bán vượt tồn kho',
    )
  })
})
