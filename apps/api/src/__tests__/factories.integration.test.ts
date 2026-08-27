/**
 * Self-test cho test factory helpers.
 * Đảm bảo mỗi factory insert được dữ liệu hợp lệ vào PGlite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  createCompletedOrder,
  createCustomer,
  createDebtOrder,
  createPartialReturn,
  createProduct,
  createStore,
  createUnitConversion,
  createUser,
  createVariant,
  resetFactorySeq,
} from './helpers/factories.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('Test factories', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
    resetFactorySeq()
  })

  afterAll(async () => {
    // PGlite in-memory tự clean khi process exit
  })

  // --- createStore ---
  it('createStore: tạo store mới', async () => {
    const store = await createStore(env)
    expect(store.id).toBeTruthy()
    expect(store.name).toContain('factory')
  })

  it('createStore: override name', async () => {
    const store = await createStore(env, { name: 'Tiệm ABC' })
    expect(store.name).toBe('Tiệm ABC')
  })

  // --- createUser ---
  it('createUser: tạo user staff mặc định', async () => {
    const user = await createUser(env)
    expect(user.role).toBe('staff')
    expect(user.accessToken).toBeTruthy()
    expect(user.authHeader.Authorization).toContain('Bearer ')
  })

  it('createUser: tạo owner cho store khác', async () => {
    const store2 = await createStore(env)
    const owner2 = await createUser(env, { storeId: store2.id, role: 'owner' })
    expect(owner2.storeId).toBe(store2.id)
    expect(owner2.role).toBe('owner')
  })

  it('createUser: tạo manager', async () => {
    const mgr = await createUser(env, { role: 'manager' })
    expect(mgr.role).toBe('manager')
  })

  // --- createCustomer ---
  it('createCustomer: tạo khách hàng', async () => {
    const cust = await createCustomer(env)
    expect(cust.storeId).toBe(env.storeId)
    expect(cust.currentDebt).toBe(0)
  })

  it('createCustomer: override debtLimit', async () => {
    const cust = await createCustomer(env, { debtLimit: 500_000 })
    expect(cust.debtLimit).toBe(500_000)
  })

  // --- createProduct ---
  it('createProduct: tạo sản phẩm đơn giản', async () => {
    const prod = await createProduct(env)
    expect(prod.storeId).toBe(env.storeId)
    expect(prod.sellingPrice).toBe(100_000)
    expect(prod.costPrice).toBe(50_000)
    expect(prod.hasVariants).toBe(false)
    expect(prod.trackInventory).toBe(true)
  })

  it('createProduct: override giá', async () => {
    const prod = await createProduct(env, { sellingPrice: 200_000, costPrice: 80_000 })
    expect(prod.sellingPrice).toBe(200_000)
    expect(prod.costPrice).toBe(80_000)
  })

  // --- createVariant ---
  it('createVariant: tạo biến thể', async () => {
    const prod = await createProduct(env, { withVariants: true })
    const variant = await createVariant(env, prod.id)
    expect(variant.productId).toBe(prod.id)
    expect(variant.attribute1Name).toBe('Màu')
    expect(variant.sellingPrice).toBe(120_000)
  })

  it('createVariant: 2 biến thể cho 1 sản phẩm', async () => {
    const prod = await createProduct(env, { withVariants: true })
    const v1 = await createVariant(env, prod.id, { attribute1Value: 'Đỏ' })
    const v2 = await createVariant(env, prod.id, { attribute1Value: 'Xanh' })
    expect(v1.id).not.toBe(v2.id)
    expect(v1.attribute1Value).toBe('Đỏ')
    expect(v2.attribute1Value).toBe('Xanh')
  })

  // --- createUnitConversion ---
  it('createUnitConversion: tạo đơn vị quy đổi', async () => {
    const prod = await createProduct(env)
    const uc = await createUnitConversion(env, prod.id)
    expect(uc.productId).toBe(prod.id)
    expect(uc.conversionFactor).toBe(12)
    expect(uc.sellingPrice).toBe(1_200_000)
  })

  it('createUnitConversion: override factor', async () => {
    const prod = await createProduct(env)
    const uc = await createUnitConversion(env, prod.id, {
      unit: 'lốc',
      conversionFactor: 6,
      sellingPrice: 600_000,
    })
    expect(uc.unit).toBe('lốc')
    expect(uc.conversionFactor).toBe(6)
  })

  // --- createCompletedOrder ---
  it('createCompletedOrder: đơn hàng mặc định', async () => {
    const prod = await createProduct(env)
    const result = await createCompletedOrder(env, prod.id)
    expect(result.order.status).toBe('completed')
    expect(result.order.paymentMethod).toBe('cash')
    expect(result.order.paymentStatus).toBe('paid')
    expect(result.items.length).toBe(1)
    expect(result.order.total).toBe(100_000)
  })

  it('createCompletedOrder: nhiều sản phẩm', async () => {
    const prod1 = await createProduct(env, { sellingPrice: 50_000 })
    const prod2 = await createProduct(env)
    const result = await createCompletedOrder(env, prod1.id, {
      items: [
        { productId: prod1.id, unitPrice: 50_000, quantity: 2 },
        { productId: prod2.id, unitPrice: 100_000, quantity: 1 },
      ],
    })
    expect(result.items.length).toBe(2)
    expect(result.order.total).toBe(200_000)
  })

  it('createCompletedOrder: gắn khách hàng', async () => {
    const prod = await createProduct(env)
    const cust = await createCustomer(env)
    const result = await createCompletedOrder(env, prod.id, { customerId: cust.id })
    expect(result.order.customerId).toBe(cust.id)
  })

  // --- createDebtOrder ---
  it('createDebtOrder: tạo đơn nợ + cập nhật currentDebt', async () => {
    const prod = await createProduct(env)
    const cust = await createCustomer(env)
    const result = await createDebtOrder(env, prod.id, cust.id)
    expect(result.order.paymentMethod).toBe('debt')
    expect(result.order.paymentStatus).toBe('unpaid')
    expect(result.debt.amount).toBe(result.order.total)
    expect(result.debt.remaining).toBe(result.order.total)
    expect(result.customer.currentDebt).toBe(result.order.total)
  })

  it('createDebtOrder: 2 đơn nợ liên tiếp cộng dồn', async () => {
    const prod = await createProduct(env)
    const cust = await createCustomer(env)
    const r1 = await createDebtOrder(env, prod.id, cust.id)
    const r2 = await createDebtOrder(env, prod.id, cust.id)
    expect(r2.customer.currentDebt).toBe(r1.order.total + r2.order.total)
  })

  // --- createPartialReturn ---
  it('createPartialReturn: trả hàng một phần (cash)', async () => {
    const prod = await createProduct(env)
    const cust = await createCustomer(env)
    const result = await createPartialReturn(env, prod.id, cust.id)
    expect(result.order.status).toBe('partial_return')
    expect(result.orderReturn.totalAmount).toBe(100_000)
    expect(result.orderReturn.refundAmount).toBe(100_000)
    expect(result.orderReturn.debtReductionAmount).toBe(0)
    expect(result.returnItems.length).toBe(1)
    expect(result.returnItems[0]!.quantity).toBe(1)
    expect(result.returnItems[0]!.reason).toBe('defective')
  })

  it('createPartialReturn: trả hàng giảm nợ', async () => {
    const prod = await createProduct(env)
    const cust = await createCustomer(env)
    const result = await createPartialReturn(env, prod.id, cust.id, {
      refundMethod: 'debt',
      returnQuantity: 2,
    })
    expect(result.orderReturn.refundAmount).toBe(0)
    expect(result.orderReturn.debtReductionAmount).toBe(200_000)
    expect(result.returnItems[0]!.quantity).toBe(2)
  })

  it('createPartialReturn: không cần khách hàng', async () => {
    const prod = await createProduct(env)
    const result = await createPartialReturn(env, prod.id, null)
    expect(result.order.customerId).toBeNull()
    expect(result.orderReturn.totalAmount).toBe(100_000)
  })

  // --- Uniqueness: nhiều factory không trùng ---
  it('nhiều factory tạo dữ liệu unique', async () => {
    const prods = await Promise.all([createProduct(env), createProduct(env), createProduct(env)])
    const skus = prods.map((p) => p.sku)
    expect(new Set(skus).size).toBe(3)

    const custs = await Promise.all([createCustomer(env), createCustomer(env)])
    const phones = custs.map((c) => c.phone)
    expect(new Set(phones).size).toBe(2)
  })
})
