import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customerPrices, customers, products } from '@kiotviet-lite/shared'

import { listCustomerPrices } from '../services/customer-prices.service.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.BCRYPT_ROUNDS = '4'
})

describe('M24 — COUNT(*) OVER() trả total đúng khi trang rỗng', () => {
  let env: TestEnv

  beforeEach(async () => {
    env = await createTestEnv()
  })

  afterEach(async () => {
    await env.close()
  })

  it('trang vượt quá dữ liệu vẫn trả total đúng', async () => {
    // Tạo dữ liệu: 1 customer, 1 product, 3 customer prices
    const [customer] = await env.db
      .insert(customers)
      .values({
        storeId: env.storeId,
        name: 'KH Test',
        phone: '0944444444',
      })
      .returning()

    await env.db.insert(products).values({
      storeId: env.storeId,
      name: 'SP Test',
      sku: 'SKU-M24',
      sellingPrice: 50000,
      costPrice: 30000,
    })

    // Tạo 3 bản ghi giá riêng
    for (let i = 0; i < 3; i++) {
      const [prod] = await env.db
        .insert(products)
        .values({
          storeId: env.storeId,
          name: `SP Test ${i + 2}`,
          sku: `SKU-M24-${i + 2}`,
          sellingPrice: 50000 + i * 10000,
          costPrice: 30000,
        })
        .returning()
      await env.db.insert(customerPrices).values({
        storeId: env.storeId,
        customerId: customer!.id,
        productId: prod!.id,
        price: 40000 + i * 5000,
      })
    }

    // Trang 1 (pageSize=2): phải có 2 items, total=3
    const page1 = await listCustomerPrices({
      db: env.db,
      storeId: env.storeId,
      query: { page: 1, pageSize: 2 },
    })
    expect(page1.total).toBe(3)
    expect(page1.items).toHaveLength(2)
    expect(page1.totalPages).toBe(2)

    // Trang 2: phải có 1 item, total vẫn = 3
    const page2 = await listCustomerPrices({
      db: env.db,
      storeId: env.storeId,
      query: { page: 2, pageSize: 2 },
    })
    expect(page2.total).toBe(3)
    expect(page2.items).toHaveLength(1)

    // Trang 100 (vượt quá dữ liệu): items rỗng nhưng total vẫn = 3
    const pageEmpty = await listCustomerPrices({
      db: env.db,
      storeId: env.storeId,
      query: { page: 100, pageSize: 2 },
    })
    expect(pageEmpty.items).toHaveLength(0)
    expect(pageEmpty.total).toBe(3) // ĐÂY LÀ BUG CŨ: trước đây trả 0
    expect(pageEmpty.totalPages).toBe(2)
  })

  it('không có dữ liệu trả total=0 đúng nghĩa', async () => {
    const result = await listCustomerPrices({
      db: env.db,
      storeId: env.storeId,
      query: { page: 1, pageSize: 20 },
    })
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.totalPages).toBe(1)
  })
})
