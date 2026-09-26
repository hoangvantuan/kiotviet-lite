import { type APIRequestContext, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

/**
 * OFF-09, OFF-15, GL-03: bán hàng khi mất mạng trên bản sao danh mục đã đồng bộ.
 *
 * Mở POS (tải danh mục về PGlite), rút mạng thật của trình duyệt, tìm hàng và khách không dấu,
 * giá theo bảng giá của nhóm khách tính tại máy, ghi nợ thấy nợ và hạn mức theo lần đồng bộ. Có
 * mạng lại thì đơn lên máy chủ đúng giá máy chủ tính cho cùng giỏ.
 */
test.describe.configure({ mode: 'serial' })

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'
// Khách sỉ (bảng giá "Giá sỉ" theo nhóm), không bài E2E nào khác dùng
const CUSTOMER_PHONE = '0911000003'
const CUSTOMER_NAME = 'Vũ Thị Phương'
const PRODUCT_SKU = 'RC001'

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
type ListedOrder = { id: string; total: number; paymentMethod: string; reviewStatus: string }

let apiCtx: APIRequestContext
let origin: string

test.beforeAll(async ({ baseURL }) => {
  // Bản build (VITE_API_URL rỗng) gọi API qua proxy cùng origin, bản dev gọi thẳng máy chủ API
  origin = new URL(baseURL!).origin
  const sameOrigin = !process.env.VITE_API_URL || process.env.E2E_TARGET === 'prod'
  apiCtx = await playwrightRequest.newContext({ baseURL: sameOrigin ? origin : API_URL })
})

test.afterAll(async () => {
  await apiCtx?.dispose()
})

test('mất mạng: tìm hàng và khách, giá theo bảng giá, ghi nợ thấy nợ; có mạng lại đơn lên đúng giá', async ({
  page,
  loginAs,
}) => {
  // PGlite chạy trong worker và ghi IndexedDB sau mỗi lệnh: trên CI lượt đồng bộ danh mục đầu tiên
  // mất khoảng 20 giây dù máy chủ trả mỗi trang trong vài mili giây, vượt hạn giờ mặc định 30 giây
  test.setTimeout(90_000)
  const api = await apiAs(apiCtx, origin)
  const customer = (
    await api.get<Listed<{ id: string }>>(`/api/v1/customers?search=${CUSTOMER_PHONE}`)
  ).data[0]!
  const product = (await api.get<Listed<{ id: string }>>(`/api/v1/products?search=${PRODUCT_SKU}`))
    .data[0]!
  const online = await api.post<{ data: Array<{ price: number; source: string }> }>(
    '/api/v1/pos/resolve-prices',
    { customerId: customer.id, items: [{ productId: product.id, variantId: null, quantity: 1 }] },
  )
  const expectedPrice = online.data[0]!.price
  expect(online.data[0]!.source).toBe('price_list')
  const ordersBefore = (
    await api.get<Listed<ListedOrder>>(`/api/v1/orders?customerId=${customer.id}&pageSize=1`)
  ).meta.total

  await loginAs('owner')
  // Loại dữ liệu cuối của một lượt đồng bộ danh mục
  const catalogSynced = page.waitForResponse(
    (res) => res.url().includes('/api/v1/sync/pull?entity=category_discounts') && res.ok(),
    { timeout: 30_000 },
  )
  await page.goto('/pos')
  await page.waitForURL('**/pos')
  await catalogSynced

  await page.context().setOffline(true)
  const banner = page.getByTestId('pos-offline-price-warning')
  await expect(banner).toContainText('theo dữ liệu đồng bộ lúc', { timeout: 10_000 })

  // Khách: gõ không dấu
  await page.getByRole('button', { name: /Kh[aá]ch l[eẻ]/i }).click()
  await page.getByPlaceholder(/m[aã] ho[aặ]c s[oố] đi[eệ]n tho[aạ]i/i).fill('vu thi phuong')
  await page.getByRole('button', { name: new RegExp(CUSTOMER_NAME) }).click()
  await expect(page.getByText(CUSTOMER_NAME).first()).toBeVisible()

  // Hàng: gõ không dấu
  const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
  await searchInput.fill('ca rot')
  const option = page.locator('#pos-search-listbox button', { hasText: 'Cà rốt' }).first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()
  const addButton = page
    .getByRole('dialog', { name: 'Cà rốt' })
    .getByRole('button', { name: 'Thêm vào giỏ' })
  if (await addButton.isVisible().catch(() => false)) await addButton.click()
  const row = page.locator('table tbody tr', { hasText: 'Cà rốt' }).first()
  await expect(row).toBeVisible()
  // Giá sỉ của nhóm khách, tính tại máy bằng cùng quy tắc với máy chủ
  await expect(row).toContainText(expectedPrice.toLocaleString('vi-VN'), { timeout: 10_000 })

  // Ghi nợ: nợ và hạn mức theo lần đồng bộ
  await page.getByRole('button', { name: /Thanh to[aá]n/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Ghi n[oợ]/i }).click()
  await expect(dialog.getByText('Nợ hiện tại')).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByTestId('debt-synced-at')).toContainText(
    'Nợ và hạn mức theo dữ liệu đồng bộ lúc',
  )
  const complete = dialog.getByRole('button', { name: /Hoàn thành/i })
  await expect(complete).toBeEnabled()
  await complete.click()
  await expect(page.getByText(/Đơn hàng hoàn thành|Đơn hàng mới/i).first()).toBeVisible({
    timeout: 10_000,
  })
  const newOrder = page
    .getByRole('dialog')
    .getByRole('button', { name: /Đơn hàng mới|Đ[oơ]n m[oớ]i/i })
    .first()
  if (await newOrder.isVisible().catch(() => false)) await newOrder.click()

  // Có mạng lại: đơn tự lên máy chủ (OFF-02); quá hạn thì bấm "Đồng bộ ngay" để kiểm luồng bấm tay
  await page.context().setOffline(false)
  const synced = async () =>
    (await api.get<Listed<ListedOrder>>(`/api/v1/orders?customerId=${customer.id}&pageSize=1`)).meta
      .total
  try {
    await expect.poll(synced, { timeout: 20_000 }).toBe(ordersBefore + 1)
  } catch {
    await page
      .locator('header button')
      .filter({ has: page.locator('svg.lucide-refresh-cw') })
      .first()
      .click()
    await page.getByRole('button', { name: 'Đồng bộ ngay' }).click()
    await expect.poll(synced, { timeout: 20_000 }).toBe(ordersBefore + 1)
  }

  const orders = await api.get<Listed<ListedOrder>>(
    `/api/v1/orders?customerId=${customer.id}&pageSize=${ordersBefore + 1}`,
  )
  const synced1 = orders.data.find((o) => o.paymentMethod === 'debt' && o.total === expectedPrice)
  expect(synced1, JSON.stringify(orders.data)).toBeTruthy()
})
