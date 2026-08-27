import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { customers, products, productVariants } from '@kiotviet-lite/shared'

import { createOrdersRoutes } from '../routes/orders.routes.js'
import { createPosRoutes } from '../routes/pos.routes.js'
import { createTestEnv, type TestEnv } from './helpers/test-env.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-please-change'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-please-change'
  process.env.ACCESS_TOKEN_TTL_SECONDS = '900'
  process.env.REFRESH_TOKEN_TTL_SECONDS = '604800'
  process.env.BCRYPT_ROUNDS = '4'
  process.env.COOKIE_SECURE = 'false'
})

describe('Orders detail and print data fields', () => {
  let env: TestEnv
  let posApp: ReturnType<typeof createPosRoutes>
  let ordersApp: ReturnType<typeof createOrdersRoutes>

  beforeEach(async () => {
    env = await createTestEnv()
    posApp = createPosRoutes({ db: env.db })
    ordersApp = createOrdersRoutes({ db: env.db })
  })

  afterEach(async () => {
    await env.close()
  })

  it('createOrder và getOrderDetail trả về đúng sku, costPrice, oldDebt, customerCurrentDebt', async () => {
    // 1. Tạo customer có nợ ban đầu là 150.000
    const [customer] = await env.db
      .insert(customers)
      .values({
        storeId: env.storeId,
        name: 'Nguyễn Văn Test',
        phone: '0988888888',
        currentDebt: 150_000,
      })
      .returning()

    // 2. Tạo product 1 không variant
    const [prod1] = await env.db
      .insert(products)
      .values({
        storeId: env.storeId,
        name: 'Sản phẩm không variant',
        sku: 'SKU-PROD-1',
        costPrice: 40_000,
        sellingPrice: 60_000,
        currentStock: 100,
        trackInventory: true,
        unit: 'cái',
      })
      .returning()

    // 3. Tạo product 2 có variant
    const [prod2] = await env.db
      .insert(products)
      .values({
        storeId: env.storeId,
        name: 'Sản phẩm có variant',
        sku: 'SKU-PROD-2-BASE',
        costPrice: 50_000,
        sellingPrice: 80_000,
        currentStock: 100,
        trackInventory: true,
        unit: 'hộp',
      })
      .returning()

    const [variant2] = await env.db
      .insert(productVariants)
      .values({
        storeId: env.storeId,
        productId: prod2!.id,
        attribute1Name: 'Size',
        attribute1Value: 'L',
        sku: 'SKU-VAR-L',
        costPrice: 55_000,
        sellingPrice: 90_000,
        stockQuantity: 50,
      })
      .returning()

    // 4. Tạo đơn qua POS: bán 2 item, ghi nợ 50.000
    const createRes = await posApp.request('/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...env.owner.authHeader,
      },
      body: JSON.stringify({
        customerId: customer!.id,
        subtotal: 210_000,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        total: 210_000,
        paymentMethod: 'debt',
        paymentStatus: 'partial',
        debtAmount: 50_000,
        debtLimitOverridden: false,
        cashAmount: 160_000,
        transferAmount: 0,
        change: 0,
        note: null,
        items: [
          {
            productId: prod1!.id,
            variantId: null,
            productName: 'Sản phẩm không variant',
            variantName: null,
            unit: 'cái',
            unitPrice: 60_000,
            quantity: 2,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 120_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
          {
            productId: prod2!.id,
            variantId: variant2!.id,
            productName: 'Sản phẩm có variant',
            variantName: 'Size L',
            unit: 'hộp',
            unitPrice: 90_000,
            quantity: 1,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            lineTotal: 90_000,
            note: null,
            unitConversionId: null,
            originalPrice: null,
            priceOverride: false,
            priceOverrideReason: null,
            priceOverridePinUsed: false,
          },
        ],
      }),
    })

    expect(createRes.status).toBe(201)
    interface CreatedOrderData {
      id: string
      oldDebt?: number | null
      customerCurrentDebt?: number | null
      items: Array<{
        productId: string
        sku?: string | null
        costPrice?: number | null
      }>
    }
    const createBody = (await createRes.json()) as { data: CreatedOrderData }
    const createdOrder = createBody.data

    // Kiểm tra thông tin trả về từ createOrder
    expect(createdOrder.oldDebt).toBe(150_000)
    expect(createdOrder.customerCurrentDebt).toBe(200_000)
    expect(createdOrder.items).toHaveLength(2)
    expect(createdOrder.items[0]?.sku).toBe('SKU-PROD-1')
    expect(createdOrder.items[0]?.costPrice).toBe(40_000)
    expect(createdOrder.items[1]?.sku).toBe('SKU-VAR-L')
    expect(createdOrder.items[1]?.costPrice).toBe(55_000)

    // 5. Gọi GET /:id qua ordersApp
    const getRes = await ordersApp.request(`/${createdOrder.id}`, {
      method: 'GET',
      headers: env.owner.authHeader,
    })

    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as { data: CreatedOrderData }
    const orderDetail = getBody.data

    expect(orderDetail.id).toBe(createdOrder.id)
    expect(orderDetail.oldDebt).toBe(150_000)
    expect(orderDetail.customerCurrentDebt).toBe(200_000)
    expect(orderDetail.items).toHaveLength(2)

    interface OrderDetailItemTest {
      productId: string
      sku?: string | null
      costPrice?: number | null
    }

    const item1 = orderDetail.items.find((it: OrderDetailItemTest) => it.productId === prod1!.id)
    expect(item1).toBeDefined()
    expect(item1?.sku).toBe('SKU-PROD-1')
    expect(item1?.costPrice).toBe(40_000)

    const item2 = orderDetail.items.find((it: OrderDetailItemTest) => it.productId === prod2!.id)
    expect(item2).toBeDefined()
    expect(item2?.sku).toBe('SKU-VAR-L')
    expect(item2?.costPrice).toBe(55_000)
  })
})
