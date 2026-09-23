import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  categories,
  customers,
  orders,
  receipts,
  stockChecks,
  stores,
  supplierPayments,
  suppliers,
  users,
} from '@kiotviet-lite/shared/schema'

import { seed } from '../db/seed.js'
import { getSeedBlockers } from '../db/seed-guard.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

describe('bảo vệ dữ liệu thật khi khởi tạo dữ liệu mẫu', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
    vi.unstubAllEnvs()
  })

  it('hàm thuần chỉ báo đúng các bảng có dữ liệu thật', () => {
    expect(
      getSeedBlockers({
        orders: true,
        receipts: false,
        supplierPayments: true,
        stockChecks: false,
      }),
    ).toEqual(['đơn hàng (orders)', 'phiếu chi (supplier_payments)'])
    expect(
      getSeedBlockers({
        orders: false,
        receipts: false,
        supplierPayments: false,
        stockChecks: false,
      }),
    ).toEqual([])
  })

  it('chấp nhận cơ sở dữ liệu rỗng', async () => {
    await env.db.delete(users)
    await env.db.delete(stores)
    await seed(env.db)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })

  it('chấp nhận cơ sở dữ liệu chỉ chứa dữ liệu mẫu', async () => {
    await env.db.insert(categories).values({ storeId: env.storeId, name: 'Danh mục mẫu' })
    await env.db.insert(customers).values({
      code: 'TEST-KH-41-1',
      storeId: env.storeId,
      name: 'Khách hàng mẫu',
      phone: '0901234567',
    })
    await env.db
      .insert(suppliers)
      .values({ code: 'TEST-NCC-41-2', storeId: env.storeId, name: 'Nhà cung cấp mẫu' })
    await seed(env.db)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })

  it('từ chối đơn hàng của bất kỳ cửa hàng nào, giữ nguyên dữ liệu', async () => {
    const [secondStore] = await env.db.insert(stores).values({ name: 'Cửa hàng khác' }).returning()
    const [secondUser] = await env.db
      .insert(users)
      .values({
        storeId: secondStore!.id,
        name: 'Người dùng khác',
        role: 'owner',
        passwordHash: 'hash',
      })
      .returning()
    await env.db.insert(orders).values({
      storeId: secondStore!.id,
      userId: secondUser!.id,
      orderNumber: 'DH-1',
      subtotal: 1000,
      total: 1000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
    })
    await expect(seed(env.db)).rejects.toThrow(/đơn hàng \(orders\).*FORCE_SEED=1/)
    expect(await env.db.select({ id: orders.id }).from(orders)).toHaveLength(1)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(2)
    expect(await env.db.select({ id: users.id }).from(users)).toHaveLength(4)
  })

  it('từ chối phiếu thu, giữ nguyên dữ liệu', async () => {
    const [customer] = await env.db
      .insert(customers)
      .values({ code: 'TEST-KH-41-3', storeId: env.storeId, name: 'Khách', phone: '0901234567' })
      .returning()
    await env.db.insert(receipts).values({
      storeId: env.storeId,
      customerId: customer!.id,
      createdBy: env.owner.id,
      amount: 500,
    })
    await expect(seed(env.db)).rejects.toThrow(/phiếu thu \(receipts\).*FORCE_SEED=1/)
    expect(await env.db.select({ id: receipts.id }).from(receipts)).toHaveLength(1)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })

  it('từ chối phiếu chi, giữ nguyên dữ liệu', async () => {
    const [supplier] = await env.db
      .insert(suppliers)
      .values({ code: 'TEST-NCC-41-4', storeId: env.storeId, name: 'Nhà cung cấp' })
      .returning()
    await env.db.insert(supplierPayments).values({
      storeId: env.storeId,
      supplierId: supplier!.id,
      createdBy: env.owner.id,
      amount: 500,
    })
    await expect(seed(env.db)).rejects.toThrow(/phiếu chi \(supplier_payments\).*FORCE_SEED=1/)
    expect(await env.db.select({ id: supplierPayments.id }).from(supplierPayments)).toHaveLength(1)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })

  it('từ chối phiếu kiểm kê kể cả bản nháp, giữ nguyên dữ liệu', async () => {
    await env.db
      .insert(stockChecks)
      .values({ storeId: env.storeId, code: 'KK-1', createdBy: env.owner.id })
    await expect(seed(env.db)).rejects.toThrow(/phiếu kiểm kê \(stock_checks\).*FORCE_SEED=1/)
    expect(await env.db.select({ id: stockChecks.id }).from(stockChecks)).toHaveLength(1)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })

  it('ép chạy chỉ khi biến môi trường nhận đúng giá trị 1', async () => {
    await env.db
      .insert(stockChecks)
      .values({ storeId: env.storeId, code: 'KK-1', createdBy: env.owner.id })
    vi.stubEnv('FORCE_SEED', 'true')
    await expect(seed(env.db)).rejects.toThrow('phiếu kiểm kê')
    vi.stubEnv('FORCE_SEED', '1')
    await seed(env.db)
    expect(await env.db.select({ id: stockChecks.id }).from(stockChecks)).toHaveLength(0)
    expect(await env.db.select({ id: stores.id }).from(stores)).toHaveLength(1)
  })
})
