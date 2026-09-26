import { type APIRequestContext, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

/**
 * TIEN-111: nhân viên lập phiếu thu trên giao diện. TIEN-113: bảng khách có cột Hạn mức.
 * KHO-07, UX-05, UX-06: khung Thanh toán phiếu nhập không che danh sách sản phẩm và gợi ý ở
 * 1366x768 và 375x812, nút lưu không nằm sau thanh điều hướng đáy.
 *
 * Tiền đề (đơn ghi nợ) và phần kiểm số liệu đi thẳng qua API.
 */
test.describe.configure({ mode: 'serial' })

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'

const PRODUCT_SKU = 'OC001'
// Khách VIP (hạn mức nợ 50 triệu theo nhóm), không bài E2E nào khác dùng
const CUSTOMER_PHONE = '0911000002'

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
type Product = { id: string; name: string; unit: string }
type Customer = { id: string; name: string; currentDebt: number }
type Receipt = { id: string; createdByName: string | null }

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

async function customer() {
  return (await api.get<Listed<Customer>>(`/api/v1/customers?search=${CUSTOMER_PHONE}`)).data[0]!
}

/** Đơn ghi nợ qua API, giá lấy từ máy chủ để khớp bảng giá của khách */
async function createDebtOrder(customerId: string, quantity: number) {
  const p = (await api.get<Listed<Product>>(`/api/v1/products?search=${PRODUCT_SKU}`)).data[0]!
  const resolved = await api.post<{ data: Array<{ price: number }> }>(
    '/api/v1/pos/resolve-prices',
    { customerId, items: [{ productId: p.id, quantity }] },
  )
  const unitPrice = resolved.data[0]!.price
  const amount = unitPrice * quantity
  await api.post('/api/v1/pos/orders', {
    customerId,
    subtotal: amount,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    total: amount,
    paymentMethod: 'debt',
    paymentStatus: 'unpaid',
    debtAmount: amount,
    items: [
      {
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        unit: p.unit,
        unitPrice,
        quantity,
        discountType: null,
        discountValue: 0,
        discountAmount: 0,
        lineTotal: amount,
        note: null,
        unitConversionId: null,
      },
    ],
  })
  return amount
}

test('TIEN-111: nhân viên lập phiếu thu nợ, nợ khách giảm đúng số thu', async ({
  page,
  loginAs,
}) => {
  const c = await customer()
  await createDebtOrder(c.id, 2)
  const debtBefore = (await customer()).currentDebt

  await loginAs('staff')
  await page.goto('/receipts')
  await page
    .getByRole('button', { name: /Tạo phiếu thu/i })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Tìm theo tên, mã hoặc số điện thoại').fill(CUSTOMER_PHONE)
  await dialog.getByRole('button', { name: new RegExp(c.name) }).click()
  await dialog.locator('#receipt-amount').fill('10000')
  await dialog.getByRole('button', { name: 'Xác nhận thu tiền' }).click()
  await expect(dialog.getByRole('heading', { name: 'Tạo phiếu thu nợ' })).toBeHidden({
    timeout: 10000,
  })

  expect((await customer()).currentDebt).toBe(debtBefore - 10000)
  const latest = await api.get<Listed<Receipt>>(`/api/v1/receipts?customerId=${c.id}&pageSize=1`)
  expect(latest.data[0]!.createdByName).toBe(SEED_USERS.staff.name)
})

test('TIEN-113: bảng khách hàng có cột Hạn mức', async ({ page, loginAs }) => {
  await loginAs('owner')
  await page.goto('/customers')
  await expect(page.getByRole('columnheader', { name: 'Hạn mức' })).toBeVisible({
    timeout: 10000,
  })
  const row = page.locator('table tbody tr').filter({ hasText: CUSTOMER_PHONE }).first()
  // Khách VIP kế thừa hạn mức 50 triệu của nhóm
  await expect(row).toContainText(/50\.000\.000/)
})

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 375, height: 812 },
]) {
  test(`KHO-07/UX-05/UX-06: phiếu nhập ở ${viewport.width}x${viewport.height}, khung Thanh toán không che nội dung`, async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize(viewport)
    await loginAs('owner')
    await page.goto('/inventory/purchase-orders/new')
    await expect(page.getByRole('heading', { name: /Tạo phiếu nhập hàng/i })).toBeVisible({
      timeout: 10000,
    })

    // Khung Thanh toán nằm trong luồng trang, không dính đáy
    const payment = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Thanh toán' }),
    })
    expect(await payment.evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky')
    expect(await payment.evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed')

    // Bấm gợi ý bằng click thật: Playwright báo lỗi nếu phần tử bị khối khác che
    await page.getByPlaceholder(/Tìm sản phẩm/i).fill('Cà rốt')
    await page
      .getByRole('button', { name: /Cà rốt/i })
      .first()
      .click({ timeout: 5000 })
    const line = page.locator('table tbody tr').first()
    await expect(line).toContainText(/Cà rốt/i)
    await line.locator('input[type="number"]').first().click({ timeout: 5000 })

    // Cuộn tới cuối: nút Lưu không bị thanh điều hướng đáy che
    const save = page.getByRole('button', { name: 'Lưu phiếu nhập' })
    await save.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    // Nút đang tắt (chưa chọn nhà cung cấp) không nhận con trỏ, nên điểm giữa nút phải rơi vào
    // chính nút hoặc khung chứa nút, không phải thanh điều hướng đáy hay khối nào đè lên
    const onTop = await save.evaluate((btn) => {
      const box = btn.getBoundingClientRect()
      const el = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return !!el && (btn.contains(el) || el.contains(btn))
    })
    expect(onTop).toBe(true)
  })
}
