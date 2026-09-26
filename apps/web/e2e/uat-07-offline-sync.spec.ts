import { type APIRequestContext, type Page, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { waitForOfflineDB } from './helpers/offline'
import { SEED_USERS } from './helpers/test-data'

/**
 * UAT 07, luồng o1-sync (OFF-02, OFF-03, OFF-04, OFF-05, OFF-10, OFF-16, OFF-17, OFF-20):
 * bán ngoại tuyến, tải lại khi mất mạng, mở đóng tab thứ hai, có mạng lại tự đồng bộ, đổi người
 * trên cùng máy, và 120 đơn chờ. Kết quả kiểm thẳng qua API.
 *
 * Chỉ chạy đích prod: tải lại khi mất mạng cần service worker của bản build. Các bài ghi dữ liệu
 * nối tiếp nhau trên cùng DB seed nên chạy tuần tự.
 */
test.describe.configure({ mode: 'serial' })
test.skip(
  process.env.E2E_TARGET !== 'prod',
  'Tải lại khi ngoại tuyến cần service worker của bản build',
)

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'
const UI_PRODUCT = 'Dưa leo'
const BULK_PRODUCT_SKU = 'M3001'
/** UAT 7.3: có mạng lại thì đơn chờ lên máy chủ trong 30 giây, không cần bấm */
const AUTO_SYNC_TIMEOUT_MS = 30_000

interface Listed<T> {
  data: T[]
  meta: { total: number }
}
interface OrderRow {
  id: string
  orderNumber: string
  createdByName: string | null
}
interface ProductRow {
  id: string
  name: string
  unit: string
  sellingPrice: number
}

let apiCtx: APIRequestContext
let apiHeaders: Record<string, string>

async function apiGet<T>(path: string): Promise<T> {
  const res = await apiCtx.get(path, { headers: apiHeaders })
  expect(res.ok(), `${path}: ${await res.text()}`).toBe(true)
  return (await res.json()) as T
}

/** Đơn trên máy chủ theo mã tạm in trên hóa đơn (OFF-17): không lệ thuộc bài khác chạy song song */
async function orderByTempCode(code: string): Promise<OrderRow | null> {
  const res = await apiGet<Listed<OrderRow>>(`/api/v1/orders?search=${code}`)
  return res.meta.total === 1 ? res.data[0]! : null
}
async function orderByClientId(clientId: string): Promise<OrderRow | null> {
  const res = await apiGet<Listed<OrderRow>>(`/api/v1/orders?clientId=${clientId}`)
  return res.data[0] ?? null
}

test.beforeAll(async ({ baseURL }) => {
  const origin = new URL(baseURL!).origin
  const sameOrigin = process.env.E2E_TARGET === 'prod'
  apiCtx = await playwrightRequest.newContext({ baseURL: sameOrigin ? origin : API_URL })
  const login = await apiCtx.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { phone: SEED_USERS.owner.phone, password: SEED_USERS.owner.password },
  })
  expect(login.ok(), await login.text()).toBe(true)
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken
  apiHeaders = { Authorization: `Bearer ${token}`, Origin: origin }
})

test.afterAll(async () => {
  await apiCtx?.dispose()
})

/** Chờ service worker cài xong precache, để tải lại khi mất mạng vẫn mở được app */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (!registration.active) throw new Error('service worker chưa kích hoạt')
  })
}

function indicator(page: Page) {
  return page.getByTestId('offline-indicator')
}

async function expectPending(page: Page, count: number) {
  await expect(indicator(page)).toHaveAttribute(
    'aria-label',
    new RegExp(`${count} đơn ngoại tuyến chưa đồng bộ`),
    { timeout: 10_000 },
  )
}

async function openTab(page: Page, n: number) {
  await page.getByRole('tab', { name: new RegExp(`^Đơn ${n},`) }).click()
}

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

/** Thanh toán tiền mặt khi mất mạng, rồi đóng hộp hoàn tất bằng Esc (OFF-16). Trả về mã tạm. */
async function checkoutOffline(page: Page, tab: number): Promise<string> {
  await page.getByRole('button', { name: /Thanh to[aá]n/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()
  await dialog
    .locator('button')
    .filter({ hasText: /^[\d.]+\.000\s*đ$/ })
    .first()
    .click()
  await dialog.getByRole('button', { name: /Hoàn thành/i }).click()
  await expect(page.getByText(/Đơn hàng đã lưu \(ngoại tuyến, chờ đồng bộ\)/).first()).toBeVisible({
    timeout: 10_000,
  })
  // OFF-17: hóa đơn ngoại tuyến in mã tạm có tiền tố rõ ràng
  const tempCode = page.getByText(/^TAM-[0-9A-F]{8}$/).first()
  await expect(tempCode).toBeVisible()
  const code = (await tempCode.textContent())!.trim()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  // OFF-16: đóng bằng Esc cũng dọn giỏ, không để đơn vừa bán nằm lại
  await expect(page.getByRole('tab', { name: `Đơn ${tab}, trống` })).toBeVisible()
  return code
}

test('UAT 7.1 đến 7.4: bán 3 đơn ngoại tuyến, tải lại vẫn bán, mở đóng tab 2, có mạng tự đồng bộ', async ({
  page,
  context,
  loginAs,
}) => {
  test.setTimeout(120_000)
  const codes: string[] = []

  await loginAs('staff')
  await page.goto('/pos')
  await waitForServiceWorker(page)
  // OFF-21: không còn nút "Chọn khách hàng" luôn bị khóa trên thanh tiêu đề
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Chọn khách hàng' }),
  ).toHaveCount(0)
  // Mỗi tab giỏ một đơn, chuẩn bị khi có mạng: giỏ lưu bền nên tải lại vẫn còn
  for (const tab of [1, 2, 3]) {
    await openTab(page, tab)
    await addToCart(page, UI_PRODUCT)
  }

  await waitForOfflineDB(page)
  await context.setOffline(true)
  await expect(indicator(page)).toHaveAttribute('aria-label', /Đang ngoại tuyến/)
  // OFF-20: bấm chỉ báo có câu giải thích
  await indicator(page).click()
  await expect(
    page.getByText(/Dữ liệu sẽ được lưu cục bộ và tự động đồng bộ khi có mạng/),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await openTab(page, 1)
  codes.push(await checkoutOffline(page, 1))
  await expectPending(page, 1)

  // OFF-03: tải lại khi mất mạng không về trang đăng nhập; OFF-02: số đơn chờ đọc lại từ PGlite
  await page.reload()
  await expect(page).toHaveURL(/\/pos$/)
  await expectPending(page, 1)
  await openTab(page, 2)
  codes.push(await checkoutOffline(page, 2))
  await openTab(page, 3)
  codes.push(await checkoutOffline(page, 3))
  await expectPending(page, 3)

  // OFF-04: tab thứ hai dùng chung PGlite qua tab chủ, đóng nó không làm mất đơn
  const second = await context.newPage()
  await second.goto('/pos')
  await expectPending(second, 3)
  await second.close()
  await expectPending(page, 3)

  // UAT 7.3: có mạng lại thì tự đồng bộ, không bấm gì
  await context.setOffline(false)
  const syncedCount = async () =>
    (await Promise.all(codes.map(orderByTempCode))).filter(Boolean).length
  await expect.poll(syncedCount, { timeout: AUTO_SYNC_TIMEOUT_MS }).toBe(3)
  await expect(indicator(page)).toBeHidden({ timeout: 10_000 })

  // OFF-05: đơn ghi cho người bán; OFF-17: sau đồng bộ đơn mang mã máy chủ
  const synced = await Promise.all(codes.map(orderByTempCode))
  expect(synced.map((o) => o!.createdByName)).toEqual(Array(3).fill(SEED_USERS.staff.name))
  for (const o of synced) expect(o!.orderNumber).toMatch(/^HD-/)
})

test('OFF-05: nhân viên bán ngoại tuyến, đăng xuất, chủ đăng nhập: đơn vẫn ghi cho nhân viên', async ({
  page,
  context,
  loginAs,
}) => {
  test.setTimeout(90_000)

  await loginAs('staff')
  await page.goto('/pos')
  await waitForServiceWorker(page)
  await openTab(page, 1)
  await addToCart(page, UI_PRODUCT)
  await waitForOfflineDB(page)
  await context.setOffline(true)
  const code = await checkoutOffline(page, 1)
  await expectPending(page, 1)

  // Đăng xuất khi còn đơn chờ: có cảnh báo, người dùng vẫn chọn đăng xuất được
  await page.getByRole('link', { name: 'Quay về trang chủ' }).click()
  await page.getByRole('button', { name: 'Đăng xuất' }).first().click()
  const guard = page.getByRole('alertdialog')
  await expect(guard.getByText('Còn đơn chưa đồng bộ')).toBeVisible()
  await guard.getByRole('button', { name: 'Vẫn đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login/)

  // Chưa ai đăng nhập: có mạng lại cũng không đẩy đơn
  await context.setOffline(false)
  await page.waitForTimeout(2_000)
  expect(await orderByTempCode(code)).toBeNull()

  // Chủ đăng nhập trên cùng máy: đơn đồng bộ nhưng người bán vẫn là nhân viên
  await loginAs('owner')
  await expect
    .poll(async () => (await orderByTempCode(code))?.createdByName ?? null, {
      timeout: AUTO_SYNC_TIMEOUT_MS,
    })
    .toBe(SEED_USERS.staff.name)
})

interface E2EHooks {
  seedOfflineOrders: (n: number, order: unknown) => Promise<string[]>
  offlineDBIsLeader: () => boolean | null
}

/** Đơn tiền mặt một dòng của sản phẩm seed M3001, dùng cho móc ghi thẳng hàng chờ */
async function bulkOrderData() {
  const products = await apiGet<Listed<ProductRow>>(`/api/v1/products?search=${BULK_PRODUCT_SKU}`)
  const product = products.data[0]!
  const price = product.sellingPrice
  return {
    subtotal: price,
    discountAmount: 0,
    total: price,
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    cashAmount: price,
    items: [
      {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        unitPrice: price,
        quantity: 1,
        discountAmount: 0,
        lineTotal: price,
      },
    ],
  }
}

function isLeader(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __kvlE2E: E2EHooks }).__kvlE2E.offlineDBIsLeader(),
  )
}

test('OFF-04: đóng tab CHỦ trong lúc tab kia đang ghi đơn: tab kia lên làm chủ, không mất đơn', async ({
  page,
  context,
  loginAs,
}) => {
  // CI đồng bộ khoảng một đơn mỗi giây (OFF-10 mất 2 phút cho 120 đơn), nên hạn giờ như OFF-10
  test.setTimeout(240_000)
  const COUNT = 100
  const orderData = await bulkOrderData()

  await loginAs('owner')
  await page.goto('/pos')
  await waitForServiceWorker(page)
  await waitForOfflineDB(page)
  // Tab mở trước làm chủ, giữ cơ sở dữ liệu trong IndexedDB đúng tên mà worker dò tab bản cũ
  expect(await isLeader(page)).toBe(true)
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
  ).toContain('/pglite/kiotviet-lite')

  const second = await context.newPage()
  await second.goto('/pos')
  await waitForOfflineDB(second)
  expect(await isLeader(second)).toBe(false)

  await context.setOffline(true)
  const writing = second.evaluate(
    ({ count, order }) =>
      (window as unknown as { __kvlE2E: E2EHooks }).__kvlE2E.seedOfflineOrders(count, order),
    { count: COUNT, order: orderData },
  )
  // Đóng tab chủ khi tab kia đang ghi giữa chừng
  await second.waitForFunction(() =>
    /\d+ đơn ngoại tuyến chưa đồng bộ/.test(
      document.querySelector('[data-testid="offline-indicator"]')?.getAttribute('aria-label') ?? '',
    ),
  )
  await page.close()

  const clientIds = await writing
  expect(clientIds).toHaveLength(COUNT)
  await expect.poll(() => isLeader(second), { timeout: 15_000 }).toBe(true)
  await expectPending(second, COUNT)

  await context.setOffline(false)
  await expect(indicator(second)).toBeHidden({ timeout: 150_000 })
  const found = await Promise.all(clientIds.map(orderByClientId))
  expect(found.filter(Boolean)).toHaveLength(COUNT)
})

test('OFF-10: 120 đơn ngoại tuyến đồng bộ hết theo lô, kiểm qua API', async ({
  page,
  context,
  loginAs,
}) => {
  test.setTimeout(240_000)
  const orderData = await bulkOrderData()

  await loginAs('owner')
  await page.goto('/pos')
  await expect(page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i })).toBeVisible()
  await waitForServiceWorker(page)
  await waitForOfflineDB(page)
  await context.setOffline(true)
  const clientIds = await page.evaluate(
    (order) => (window as unknown as { __kvlE2E: E2EHooks }).__kvlE2E.seedOfflineOrders(120, order),
    orderData,
  )
  expect(clientIds).toHaveLength(120)
  await expectPending(page, 120)

  await context.setOffline(false)
  await expect(indicator(page)).toBeHidden({ timeout: 120_000 })
  // Kiểm từng đơn qua clientId: đủ 120 đơn trên máy chủ, không lệ thuộc bài khác chạy song song
  const found = await Promise.all(clientIds.map(orderByClientId))
  expect(found.filter(Boolean)).toHaveLength(120)
})
