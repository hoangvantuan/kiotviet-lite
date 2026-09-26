import { type APIRequestContext, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

/**
 * TIEN-107: hủy phiếu thu và hủy đơn bán trên giao diện. Tiền đề (đơn, phiếu thu) và phần kiểm số
 * liệu đi thẳng qua API: sau khi hủy, công nợ khách và tồn kho về như chưa có chứng từ.
 *
 * Các bài ghi dữ liệu nối tiếp nhau trên cùng DB seed, nên chạy tuần tự.
 */
test.describe.configure({ mode: 'serial' })

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'

const PRODUCT_SKU = 'OC001'
// Khách sỉ (hạn mức nợ 100 triệu), không bài E2E nào khác dùng
const CUSTOMER_PHONE = '0911000003'
const CUSTOMER_NAME = 'Vũ Thị Phương'

interface Api {
  get: <T = unknown>(path: string) => Promise<T>
  post: <T = unknown>(path: string, body: unknown) => Promise<T>
}

async function apiAs(ctx: APIRequestContext, origin: string): Promise<Api> {
  const login = await ctx.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { phone: SEED_USERS.owner.phone, password: SEED_USERS.owner.password },
  })
  expect(login.ok(), await login.text()).toBe(true)
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken
  const headers = { Authorization: `Bearer ${token}`, Origin: origin }
  return {
    get: async (path) => {
      const res = await ctx.get(path, { headers })
      expect(res.ok(), `${path}: ${await res.text()}`).toBe(true)
      return res.json()
    },
    post: async (path, body) => {
      const res = await ctx.post(path, { headers, data: body })
      expect(res.ok(), `${path}: ${await res.text()}`).toBe(true)
      return res.json()
    },
  }
}

interface Listed<T> {
  data: T[]
}
type Product = { id: string; name: string; unit: string; currentStock: number }
type Customer = { id: string; name: string; currentDebt: number }

let apiCtx: APIRequestContext
let api: Api

test.beforeAll(async ({ baseURL }) => {
  const origin = new URL(baseURL!).origin
  const sameOrigin = process.env.E2E_TARGET === 'prod'
  apiCtx = await playwrightRequest.newContext({ baseURL: sameOrigin ? origin : API_URL })
  api = await apiAs(apiCtx, origin)
})

test.afterAll(async () => {
  await apiCtx?.dispose()
})

async function product() {
  return (await api.get<Listed<Product>>(`/api/v1/products?search=${PRODUCT_SKU}`)).data[0]!
}
async function customer() {
  return (await api.get<Listed<Customer>>(`/api/v1/customers?search=${CUSTOMER_PHONE}`)).data[0]!
}

/** Đơn bán qua API: giá lấy từ máy chủ để khớp bảng giá của khách */
async function createOrder(opts: { customerId: string | null; quantity: number; debt: boolean }) {
  const p = await product()
  const resolved = await api.post<{ data: Array<{ price: number }> }>(
    '/api/v1/pos/resolve-prices',
    { customerId: opts.customerId, items: [{ productId: p.id, quantity: opts.quantity }] },
  )
  const unitPrice = resolved.data[0]!.price
  const amount = unitPrice * opts.quantity
  const res = await api.post<{ data: { id: string; orderNumber: string } }>('/api/v1/pos/orders', {
    customerId: opts.customerId,
    subtotal: amount,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: amount,
    ...(opts.debt
      ? { paymentMethod: 'debt', paymentStatus: 'unpaid', debtAmount: amount }
      : { paymentMethod: 'cash', paymentStatus: 'paid', cashAmount: amount }),
    items: [
      {
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        unit: p.unit,
        unitPrice,
        quantity: opts.quantity,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        lineTotal: amount,
        note: null,
        unitConversionId: null,
      },
    ],
  })
  return { ...res.data, amount }
}

test('hủy phiếu thu: công nợ khách cộng lại đúng số đã thu', async ({ page, loginAs }) => {
  const c = await customer()
  const order = await createOrder({ customerId: c.id, quantity: 1, debt: true })
  const open = await api.get<{ data: { items: Array<{ id: string; orderId: string | null }> } }>(
    `/api/v1/receipts/customer-debts/${c.id}`,
  )
  const debt = open.data.items.find((d) => d.orderId === order.id)!
  await api.post('/api/v1/receipts', {
    customerId: c.id,
    amount: order.amount,
    paymentMethod: 'cash',
    allocationMode: 'manual',
    allocations: [{ debtId: debt.id, amount: order.amount }],
    note: 'E2E hủy phiếu thu',
  })
  const debtAfterReceipt = (await customer()).currentDebt

  await loginAs('owner')
  await page.goto('/receipts')
  const row = page.locator('table tbody tr').filter({ hasText: CUSTOMER_NAME }).first()
  await expect(row).toBeVisible({ timeout: 10000 })
  await row.getByRole('button', { name: /Xem/ }).click()

  const detail = page.getByRole('dialog').filter({ hasText: 'Chi tiết phiếu thu' })
  await detail.getByRole('button', { name: 'Hủy phiếu thu' }).click()

  const cancelDialog = page.getByRole('dialog').filter({ hasText: 'Lý do hủy' })
  const confirm = cancelDialog.getByRole('button', { name: 'Xác nhận hủy' })
  await expect(confirm).toBeDisabled()
  await cancelDialog.getByLabel('Lý do hủy').fill('Thu trùng, kiểm thử E2E')
  await confirm.click()

  await expect(detail.getByText(/Phiếu đã hủy lúc/)).toBeVisible({ timeout: 10000 })
  await expect(detail.getByText('Lý do: Thu trùng, kiểm thử E2E')).toBeVisible()
  expect((await customer()).currentDebt).toBe(debtAfterReceipt + order.amount)
})

test('nhân viên hủy đơn bán bằng PIN quản lý: hàng về kho, đơn ghi đã hủy', async ({
  page,
  loginAs,
}) => {
  const order = await createOrder({ customerId: null, quantity: 2, debt: false })
  const stockAfterSale = (await product()).currentStock

  await loginAs('staff')
  await page.goto(`/orders/${order.id}`)
  await expect(page.getByRole('heading', { name: order.orderNumber })).toBeVisible({
    timeout: 10000,
  })
  await page.getByRole('button', { name: 'Hủy đơn' }).click()

  const cancelDialog = page.getByRole('dialog').filter({ hasText: 'Lý do hủy' })
  await expect(cancelDialog.getByText(/cần chủ cửa hàng hoặc quản lý nhập mã PIN/)).toBeVisible()
  await cancelDialog.getByLabel('Lý do hủy').fill('Bán nhầm, kiểm thử E2E')
  await cancelDialog.getByRole('button', { name: 'Xác nhận hủy' }).click()

  const pinDialog = page.getByRole('dialog').filter({ hasText: 'Duyệt hủy chứng từ' })
  await expect(pinDialog).toBeVisible()
  await pinDialog.getByRole('combobox').click()
  await page.getByRole('option', { name: new RegExp(SEED_USERS.manager.name) }).click()
  const otp = pinDialog.locator('input').first()
  await expect(otp).toBeEnabled({ timeout: 10000 })
  await otp.focus()
  await otp.pressSequentially(SEED_USERS.manager.pin, { delay: 80 })

  await expect(page.getByText(/Đơn đã hủy lúc/)).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Lý do: Bán nhầm, kiểm thử E2E')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hủy đơn' })).toHaveCount(0)
  expect((await product()).currentStock).toBe(stockAfterSale + 2)
})
