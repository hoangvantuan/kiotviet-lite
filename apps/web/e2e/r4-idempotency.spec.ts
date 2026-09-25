import { type APIRequestContext, type Page, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

/**
 * R4 (POS-02, TIEN-04, KHO-08, OFF-07): mất phản hồi sau khi máy chủ đã lưu.
 *
 * Bọc window.fetch: request tạo chứng từ vẫn tới máy chủ và được lưu, nhưng trình duyệt nhận lỗi
 * mạng như khi đứt kết nối lúc chờ phản hồi. Người dùng thấy "Chưa rõ đã lưu hay chưa", bấm lưu
 * lại (kể cả sau khi đóng form, nhập lại, hay chuyển qua ngoại tuyến rồi có mạng lại) thì vẫn chỉ
 * có một chứng từ, kho và công nợ chỉ đổi một lần. Tiền đề và phần kiểm tra đi thẳng qua API.
 *
 * Các bài ghi dữ liệu nối tiếp nhau trên cùng DB seed, nên chạy tuần tự.
 */
test.describe.configure({ mode: 'serial' })

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'
const LOSE_FLAG = 'e2e:lose-response'
const UNKNOWN_OUTCOME = /Chưa rõ đã lưu hay chưa/

const PRODUCT_SKU = 'DL001'
const CUSTOMER_PHONE = '0911000004'
const SUPPLIER_CODE = 'NCC000002'

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
  meta: { total: number }
}
type Product = { id: string; name: string; unit: string; currentStock: number }
type Party = { id: string; name: string; currentDebt: number }

async function product(api: Api) {
  const res = await api.get<Listed<Product>>(`/api/v1/products?search=${PRODUCT_SKU}`)
  return res.data[0]!
}
async function customer(api: Api) {
  const res = await api.get<Listed<Party>>(`/api/v1/customers?search=${CUSTOMER_PHONE}`)
  return res.data[0]!
}
async function supplier(api: Api) {
  const res = await api.get<Listed<Party>>(`/api/v1/suppliers?search=${SUPPLIER_CODE}`)
  return res.data[0]!
}
async function total(api: Api, path: string) {
  return (await api.get<Listed<unknown>>(path)).meta.total
}

/** Đơn bán qua API (tiền đề): giá lấy từ máy chủ để khớp bảng giá của khách. */
async function createOrderViaApi(
  api: Api,
  opts: { customerId: string | null; quantity: number; debt: boolean },
) {
  const p = await product(api)
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
  return res.data
}

/**
 * Bọc fetch trước khi ứng dụng chạy: khi cờ trong sessionStorage khớp đường dẫn của một POST,
 * request vẫn được gửi và đọc hết phản hồi (máy chủ đã lưu xong), rồi báo lỗi mạng cho ứng dụng.
 * Cờ chỉ dùng một lần.
 */
async function installLoseResponse(page: Page) {
  await page.addInitScript((flag: string) => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const pattern = sessionStorage.getItem(flag)
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (
        pattern &&
        method === 'POST' &&
        new RegExp(pattern).test(new URL(url, location.href).pathname)
      ) {
        sessionStorage.removeItem(flag)
        const res = await original(input, init)
        await res.text()
        throw new TypeError('Failed to fetch')
      }
      return original(input, init)
    }
  }, LOSE_FLAG)
}

async function loseNextResponse(page: Page, pathPattern: string) {
  await page.evaluate(
    ([flag, pattern]: string[]) => sessionStorage.setItem(flag!, pattern!),
    [LOSE_FLAG, pathPattern],
  )
}

async function expectUnknownOutcome(page: Page) {
  await expect(page.getByText(UNKNOWN_OUTCOME).first()).toBeVisible({ timeout: 10000 })
}

let apiCtx: APIRequestContext
let api: Api

test.beforeAll(async ({ baseURL }) => {
  // Gọi API theo đúng đường trang đang gọi: bản build (VITE_API_URL rỗng) đi qua proxy cùng origin,
  // lớp chống CSRF nhận vì cùng host; bản dev gọi thẳng API, Origin là trang dev (ALLOWED_ORIGINS).
  const origin = new URL(baseURL!).origin
  const sameOrigin = process.env.E2E_TARGET === 'prod'
  apiCtx = await playwrightRequest.newContext({ baseURL: sameOrigin ? origin : API_URL })
  api = await apiAs(apiCtx, origin)
})

test.afterAll(async () => {
  await apiCtx?.dispose()
})

test.beforeEach(async ({ page, loginAs }) => {
  await installLoseResponse(page)
  await loginAs('owner')
})

async function addToCart(page: Page, name: string) {
  await page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i }).fill(name)
  await page
    .getByRole('option', { name: new RegExp(name) })
    .getByRole('button')
    .click()
  const addButton = page.getByRole('button', { name: 'Thêm vào giỏ' })
  if (await addButton.isVisible().catch(() => false)) await addButton.click()
  await expect(page.locator('table tbody tr').first()).toContainText(name)
}

/** Mở hộp thanh toán và chọn một mệnh giá tiền mặt: `pick` chọn nút đầu hay nút cuối */
async function openPaymentAndPayCash(page: Page, pick: 'first' | 'last' = 'first') {
  await page.getByRole('button', { name: /Thanh to[aá]n/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()
  const cashButtons = dialog.locator('button').filter({ hasText: /^[\d.]+\.000\s*đ$/ })
  await expect(cashButtons.first()).toBeVisible()
  expect(await cashButtons.count()).toBeGreaterThan(1)
  await (pick === 'first' ? cashButtons.first() : cashButtons.last()).click()
  return dialog
}

async function closePaymentDialog(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
}

test('POS: mất phản hồi rồi bấm Hoàn thành lại, vẫn một đơn, kho trừ một lần', async ({ page }) => {
  const ordersBefore = await total(api, '/api/v1/orders?pageSize=1')
  const stockBefore = (await product(api)).currentStock

  await page.goto('/pos')
  await addToCart(page, 'Dưa leo')
  const dialog = await openPaymentAndPayCash(page)

  await loseNextResponse(page, '/api/v1/pos/orders$')
  const complete = dialog.getByRole('button', { name: /Hoàn thành/i })
  await complete.click()
  await expectUnknownOutcome(page)
  // Máy chủ đã lưu dù trình duyệt không nhận được phản hồi
  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)

  // Hộp thoại thanh toán vẫn mở với nội dung cũ: bấm lại nhận đúng đơn đã lưu
  const replay = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/pos/orders') && r.request().method() === 'POST',
  )
  await complete.click()
  expect((await replay).headers()['idempotent-replayed']).toBe('true')
  await expect(page.getByText(/Đơn hàng đã hoàn thành/).first()).toBeVisible({ timeout: 10000 })

  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)
  expect((await product(api)).currentStock).toBe(stockBefore - 1)
})

test('POS: mất phản hồi, đóng rồi mở lại hộp thanh toán, chọn mệnh giá khác: vẫn một đơn, báo đơn trước đã lưu', async ({
  page,
}) => {
  const ordersBefore = await total(api, '/api/v1/orders?pageSize=1')
  const stockBefore = (await product(api)).currentStock

  await page.goto('/pos')
  await addToCart(page, 'Dưa leo')
  let dialog = await openPaymentAndPayCash(page, 'first')
  await loseNextResponse(page, '/api/v1/pos/orders$')
  await dialog.getByRole('button', { name: /Hoàn thành/i }).click()
  await expectUnknownOutcome(page)
  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)

  // Hộp thanh toán đặt lại tiền khách đưa mỗi lần mở: thu ngân chọn mệnh giá khác
  await closePaymentDialog(page)
  dialog = await openPaymentAndPayCash(page, 'last')
  const retry = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/pos/orders') && r.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: /Hoàn thành/i }).click()
  expect((await retry).status()).toBe(422)
  await expect(page.getByText(/Đơn trước có thể đã được lưu \(HD-/).first()).toBeVisible({
    timeout: 10000,
  })
  await expect(page.getByRole('button', { name: 'Mở đơn' })).toBeVisible()

  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)
  expect((await product(api)).currentStock).toBe(stockBefore - 1)
})

test('POS: mất phản hồi, mất mạng, lưu vào hàng chờ, có mạng lại thì đồng bộ không tạo đơn thứ hai', async ({
  page,
}) => {
  const ordersBefore = await total(api, '/api/v1/orders?pageSize=1')
  const stockBefore = (await product(api)).currentStock

  await page.goto('/pos')
  await addToCart(page, 'Dưa leo')
  const dialog = await openPaymentAndPayCash(page)

  await loseNextResponse(page, '/api/v1/pos/orders$')
  const complete = dialog.getByRole('button', { name: /Hoàn thành/i })
  await complete.click()
  await expectUnknownOutcome(page)
  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)

  // Mất mạng hẳn, mở lại hộp chọn mệnh giá khác: lần lưu lại đi vào hàng chờ ngoại tuyến với
  // cùng clientId
  await page.context().setOffline(true)
  await closePaymentDialog(page)
  const reopened = await openPaymentAndPayCash(page, 'last')
  await reopened.getByRole('button', { name: /Hoàn thành/i }).click()
  await expect(page.getByText(/Đơn hàng đã lưu \(ngoại tuyến, chờ đồng bộ\)/).first()).toBeVisible({
    timeout: 10000,
  })

  // Có mạng lại: đồng bộ tay (tự đồng bộ ngoại tuyến chưa bật, để Đợt 2)
  await page.keyboard.press('Escape')
  await page.context().setOffline(false)
  await page.locator('button:has(svg.lucide-refresh-cw)').first().click()
  const push = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/sync/push') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Đồng bộ ngay' }).click()
  const pushBody = (await (await push).json()) as {
    data: { results: Array<{ status: string }> }
  }
  expect(pushBody.data.results.map((r) => r.status)).toEqual(['duplicate'])

  expect(await total(api, '/api/v1/orders?pageSize=1')).toBe(ordersBefore + 1)
  expect((await product(api)).currentStock).toBe(stockBefore - 1)
})

test('Phiếu thu: mất phản hồi rồi bấm lưu lại, nợ khách giảm một lần', async ({ page }) => {
  const c = await customer(api)
  await createOrderViaApi(api, { customerId: c.id, quantity: 2, debt: true })
  const debtBefore = (await customer(api)).currentDebt
  const receiptsBefore = await total(api, `/api/v1/receipts?customerId=${c.id}&pageSize=1`)

  await page.goto('/receipts')
  await page
    .getByRole('button', { name: /Tạo phiếu thu/i })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Tìm theo tên, mã hoặc số điện thoại').fill(CUSTOMER_PHONE)
  await dialog.getByRole('button', { name: new RegExp(c.name) }).click()
  await dialog.locator('#receipt-amount').fill('10000')

  await loseNextResponse(page, '/api/v1/receipts$')
  const submit = dialog.getByRole('button', { name: 'Xác nhận thu tiền' })
  await submit.click()
  await expectUnknownOutcome(page)
  expect(await total(api, `/api/v1/receipts?customerId=${c.id}&pageSize=1`)).toBe(
    receiptsBefore + 1,
  )

  await submit.click()
  await expect(dialog.getByRole('heading', { name: 'Tạo phiếu thu nợ' })).toBeHidden({
    timeout: 10000,
  })

  expect(await total(api, `/api/v1/receipts?customerId=${c.id}&pageSize=1`)).toBe(
    receiptsBefore + 1,
  )
  expect((await customer(api)).currentDebt).toBe(debtBefore - 10000)
})

async function fillSupplierPayment(page: Page, supplierName: string, amount: string) {
  await page
    .getByRole('button', { name: /Tạo phiếu chi/i })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Chọn nhà cung cấp/ }).click()
  await page.getByPlaceholder('Tìm nhà cung cấp...').fill(supplierName)
  await page
    .getByRole('button', { name: new RegExp(supplierName) })
    .last()
    .click()
  await dialog.locator('#payment-amount').fill(amount)
  return dialog
}

test('Phiếu chi: mất phản hồi, đóng form, nhập lại đúng nội dung, lưu: một phiếu, nợ NCC giảm một lần', async ({
  page,
}) => {
  const s = await supplier(api)
  const p = await product(api)
  await api.post('/api/v1/purchase-orders', {
    supplierId: s.id,
    items: [{ productId: p.id, quantity: 5, unitPrice: 10000 }],
    paidAmount: 0,
  })
  const debtBefore = (await supplier(api)).currentDebt
  const paymentsPath = `/api/v1/supplier-payments?supplierId=${s.id}&pageSize=1`
  const paymentsBefore = await total(api, paymentsPath)

  await page.goto('/inventory/supplier-payments')
  let dialog = await fillSupplierPayment(page, s.name, '20000')
  await loseNextResponse(page, '/api/v1/supplier-payments$')
  await dialog.getByRole('button', { name: 'Lưu phiếu chi' }).click()
  await expectUnknownOutcome(page)
  expect(await total(api, paymentsPath)).toBe(paymentsBefore + 1)

  // Đóng form, mở lại và nhập đúng nội dung cũ
  await dialog.getByRole('button', { name: 'Huỷ' }).click()
  await expect(dialog).toBeHidden()
  dialog = await fillSupplierPayment(page, s.name, '20000')
  await dialog.getByRole('button', { name: 'Lưu phiếu chi' }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })

  expect(await total(api, paymentsPath)).toBe(paymentsBefore + 1)
  expect((await supplier(api)).currentDebt).toBe(debtBefore - 20000)
})

test('Phiếu chi: mất mạng, lưu, đóng form, nhập lại, có mạng, lưu: một phiếu', async ({ page }) => {
  const s = await supplier(api)
  const debtBefore = (await supplier(api)).currentDebt
  const paymentsPath = `/api/v1/supplier-payments?supplierId=${s.id}&pageSize=1`
  const paymentsBefore = await total(api, paymentsPath)

  await page.goto('/inventory/supplier-payments')
  let dialog = await fillSupplierPayment(page, s.name, '5000')
  await page.context().setOffline(true)
  await dialog.getByRole('button', { name: 'Lưu phiếu chi' }).click()
  await expectUnknownOutcome(page)
  await dialog.getByRole('button', { name: 'Huỷ' }).click()
  await expect(dialog).toBeHidden()

  await page.context().setOffline(false)
  dialog = await fillSupplierPayment(page, s.name, '5000')
  await dialog.getByRole('button', { name: 'Lưu phiếu chi' }).click()
  await expect(dialog).toBeHidden({ timeout: 10000 })

  // Mutation đã hủy khi đóng form không tự gửi thêm lần nào khi có mạng lại
  await page.waitForTimeout(1000)
  expect(await total(api, paymentsPath)).toBe(paymentsBefore + 1)
  expect((await supplier(api)).currentDebt).toBe(debtBefore - 5000)
})

test('Phiếu nhập: mất phản hồi rồi bấm lưu lại, một phiếu, kho cộng một lần', async ({ page }) => {
  const purchasesBefore = await total(api, '/api/v1/purchase-orders?pageSize=1')
  const stockBefore = (await product(api)).currentStock

  await page.goto('/inventory/purchase-orders/new')
  await expect(page.getByRole('heading', { name: /Tạo phiếu nhập hàng/i })).toBeVisible({
    timeout: 10000,
  })
  await page.getByRole('combobox').first().click()
  await page.getByRole('option').first().click()
  await page.getByPlaceholder(/Tìm sản phẩm/i).fill('Dưa leo')
  await page
    .getByRole('button', { name: /Dưa leo/ })
    .first()
    .dispatchEvent('click')
  const row = page.locator('table tbody tr').first()
  await expect(row).toContainText('Dưa leo')
  await row.locator('input[type="number"]').first().fill('3')

  await loseNextResponse(page, '/api/v1/purchase-orders$')
  const submit = page.getByRole('button', { name: /Lưu phiếu nhập/i }).first()
  await submit.click()
  await expectUnknownOutcome(page)
  expect(await total(api, '/api/v1/purchase-orders?pageSize=1')).toBe(purchasesBefore + 1)

  await submit.click()
  await expect(page.getByText(/Đã tạo phiếu nhập/).first()).toBeVisible({ timeout: 10000 })

  expect(await total(api, '/api/v1/purchase-orders?pageSize=1')).toBe(purchasesBefore + 1)
  expect((await product(api)).currentStock).toBe(stockBefore + 3)
})

test('Phiếu trả: mất phản hồi rồi bấm xác nhận lại, một phiếu, kho cộng một lần', async ({
  page,
}) => {
  const order = await createOrderViaApi(api, { customerId: null, quantity: 2, debt: false })
  const stockBefore = (await product(api)).currentStock
  const returnsPath = `/api/v1/orders/${order.id}/returns`
  const returnsCount = async () => (await api.get<{ data: unknown[] }>(returnsPath)).data.length

  await page.goto(`/orders/${order.id}`)
  await page.getByRole('button', { name: /Trả hàng/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="number"]').first().fill('1')

  await loseNextResponse(page, `/api/v1/orders/${order.id}/returns$`)
  const confirm = dialog.getByRole('button', { name: /Xác nhận trả hàng/i })
  await confirm.click()
  await expectUnknownOutcome(page)
  expect(await returnsCount()).toBe(1)

  await confirm.click()
  await expect(dialog.getByText(/Trả hàng thành công|TH-/).first()).toBeVisible({
    timeout: 10000,
  })

  expect(await returnsCount()).toBe(1)
  expect((await product(api)).currentStock).toBe(stockBefore + 1)
})
