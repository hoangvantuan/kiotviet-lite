import { type CreateOrderInput, inventoryTransactions, type UserRole } from '@kiotviet-lite/shared'

import { createOrder } from '../../services/orders.service.js'
import { createProduct } from './factories.js'
import type { TestEnv } from './test-env.js'

export interface SellLine {
  product: { id: string; name: string }
  quantity: number
  unitPrice?: number
  /** Chiết khấu dòng theo số tiền */
  discountAmount?: number
}

export interface SellOptions {
  customerId?: string | null
  actor?: { userId: string; storeId: string; role: UserRole }
  /** Chiết khấu đơn theo số tiền, phân bổ về dòng theo tỷ lệ ở máy chủ */
  orderDiscount?: number
  paymentMethod?: 'cash' | 'transfer' | 'debt'
}

/**
 * Bán qua đúng service POS (tồn kho, sổ kho, sổ công nợ), không chèn thẳng bảng như factories.
 * Ghi nợ khi có khách và `paymentMethod` không nêu; khách phải có hạn mức đủ.
 */
export async function sell(env: TestEnv, lines: SellLine[], opts: SellOptions = {}) {
  const customerId = opts.customerId ?? null
  const items = lines.map((l) => {
    const unitPrice = l.unitPrice ?? 100_000
    const discountAmount = l.discountAmount ?? 0
    return {
      productId: l.product.id,
      variantId: null,
      productName: l.product.name,
      variantName: null,
      unit: 'cái',
      unitPrice,
      quantity: l.quantity,
      discountType: discountAmount > 0 ? ('amount' as const) : null,
      discountValue: discountAmount,
      discountAmount,
      lineTotal: unitPrice * l.quantity - discountAmount,
      note: null,
      unitConversionId: null,
      originalPrice: null,
      priceOverride: false,
      priceOverrideReason: null,
      priceOverridePinUsed: false,
    }
  })
  const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0)
  const orderDiscount = opts.orderDiscount ?? 0
  const total = subtotal - orderDiscount
  const method = opts.paymentMethod ?? (customerId ? 'debt' : 'cash')
  return createOrder({
    db: env.db,
    actor: opts.actor ?? { userId: env.owner.id, storeId: env.storeId, role: env.owner.role },
    input: {
      customerId,
      subtotal,
      discountType: orderDiscount > 0 ? 'amount' : null,
      discountValue: orderDiscount,
      discountAmount: orderDiscount,
      total,
      paymentMethod: method,
      paymentStatus: method === 'debt' ? 'unpaid' : 'paid',
      ...(method === 'debt'
        ? { debtAmount: total }
        : method === 'transfer'
          ? { transferAmount: total }
          : { cashAmount: total }),
      debtLimitOverridden: false,
      note: null,
      items,
    } as CreateOrderInput,
  })
}

/** Sản phẩm có tồn đầu kỳ ghi đủ sổ kho, để bất biến I6 (tồn bằng tổng sổ kho) giữ đúng */
export async function stockedProduct(env: TestEnv, stock = 100, name = 'Sữa Ensure') {
  const product = await createProduct(env, {
    name,
    currentStock: stock,
    costPrice: 60_000,
    sellingPrice: 100_000,
  })
  await env.db.insert(inventoryTransactions).values({
    storeId: env.storeId,
    productId: product.id,
    type: 'initial_stock',
    quantity: stock,
    stockAfter: stock,
    note: 'Tồn đầu kỳ',
    createdBy: env.owner.id,
  })
  return product
}
