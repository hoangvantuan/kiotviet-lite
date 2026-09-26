import { type APIRequestContext, type Page, request as playwrightRequest } from '@playwright/test'

import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

/**
 * POS-06, POS-07, TIEN-02: một ca bán hàng trọn vẹn.
 *
 * Mở ca với tiền quỹ đầu ca, bán một đơn tiền mặt và một đơn chuyển khoản (thấy mã VietQR),
 * trả hàng đơn tiền mặt (hoàn tiền mặt theo đơn gốc), đóng ca với số tiền đếm đúng bằng số phải
 * có thì chênh lệch bằng 0. Cài đặt ca và tài khoản ngân hàng bật qua API rồi tắt lại sau bài,
 * để các bài POS khác (không mở ca) không bị chặn.
 */
test.describe.configure({ mode: 'serial' })

const API_URL = process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'
const OPENING_CASH = 500_000

interface Api {
  get: <T = unknown>(path: string) => Promise<T>
  post: <T = unknown>(path: string, body: unknown) => Promise<T>
  patch: <T = unknown>(path: string, body: unknown) => Promise<T>
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
    patch: async (path, body) => {
      const res = await ctx.patch(path, { headers, data: body })
      expect(res.ok(), `${path}: ${await res.text()}`).toBe(true)
      return res.json()
    },
  }
}

interface ShiftSummary {
  openingCash: number
  cashSales: number
  cashRefunds: number
  expectedCash: number
  transferIn: number
  orderCount: number
  returnCount: number
}
interface ShiftDetail {
  id: string
  status: 'open' | 'closed'
  openingCash: number
  expectedCash: number | null
  countedCash: number | null
  difference: number | null
  summary: ShiftSummary
}
interface CurrentShift {
  data: { shiftsEnabled: boolean; shift: ShiftDetail | null }
}

let apiCtx: APIRequestContext
let api: Api

/** Đóng ca còn mở của chủ cửa hàng (lần chạy trước hỏng giữa chừng hay lần thử lại). */
async function closeOpenShift() {
  const current = await api.get<CurrentShift>('/api/v1/shifts/current')
  const shift = current.data.shift
  if (!shift) return
  await api.post(`/api/v1/shifts/${shift.id}/close`, {
    countedCash: shift.summary.expectedCash,
    note: 'Đóng tự động sau bài E2E',
  })
}

test.beforeAll(async ({ baseURL }) => {
  // Cùng cách gọi API như r4-idempotency.spec.ts: bản build đi cùng origin, bản dev gọi thẳng API.
  const origin = new URL(baseURL!).origin
  const sameOrigin = process.env.E2E_TARGET === 'prod'
  apiCtx = await playwrightRequest.newContext({ baseURL: sameOrigin ? origin : API_URL })
  api = await apiAs(apiCtx, origin)
  await api.patch('/api/v1/store', {
    shiftsEnabled: true,
    bankBin: '970436',
    bankAccountNumber: '0011001234567',
    bankAccountName: 'NGUYEN VAN AN',
  })
  await closeOpenShift()
})

test.afterAll(async () => {
  if (api) {
    await closeOpenShift()
    await api.patch('/api/v1/store', { shiftsEnabled: false })
  }
  await apiCtx?.dispose()
})

async function addCarrotToCart(page: Page) {
  await page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i }).fill('Cà rốt')
  await page
    .getByRole('option', { name: /Cà rốt/i })
    .getByRole('button')
    .click()
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click()
}

/** Thanh toán giỏ hiện tại, trả về mã đơn trên hộp hoàn tất. */
async function checkout(page: Page, method: 'cash' | 'transfer'): Promise<string> {
  const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
  await expect(payBtn).toBeEnabled()
  await payBtn.click()

  const dialog = page.getByRole('dialog')
  if (method === 'cash') {
    await dialog.locator('button').filter({ hasText: '50.000' }).first().click()
  } else {
    await dialog.getByRole('button', { name: 'Chuyển khoản' }).click()
    // POS-07: mã VietQR sinh ngay trên máy, chứa số tiền của đơn
    const qr = dialog.getByTestId('vietqr-code')
    await expect(qr).toBeVisible()
    await expect(qr).toHaveAttribute('data-payload', /540525000/)
  }
  await dialog.getByRole('button', { name: /Hoàn thành/i }).click()

  const orderNumber = page.locator('p.font-mono').filter({ hasText: /HD-/ })
  await expect(orderNumber).toBeVisible({ timeout: 10_000 })
  const code = (await orderNumber.textContent())!.trim()
  await page.getByRole('button', { name: 'Đơn hàng mới' }).click()
  return code
}

test('Mở ca, bán tiền mặt và chuyển khoản, trả hàng, đóng ca khớp tiền', async ({
  page,
  loginAs,
}) => {
  await loginAs('owner')

  // 1. Vào POS khi cửa hàng dùng ca: hộp mở ca hiện ra
  await page.goto('/pos')
  const openDialog = page.getByTestId('open-shift-dialog')
  await expect(openDialog).toBeVisible({ timeout: 10_000 })
  await openDialog.locator('#shift-opening-cash').fill(String(OPENING_CASH))
  await openDialog.getByRole('button', { name: 'Mở ca' }).click()
  await expect(openDialog).toBeHidden()
  await expect(page.getByTestId('shift-control')).toBeVisible()

  const opened = await api.get<CurrentShift>('/api/v1/shifts/current')
  const shiftId = opened.data.shift!.id
  expect(opened.data.shift!.openingCash).toBe(OPENING_CASH)

  // 2. Đơn tiền mặt và đơn chuyển khoản, mỗi đơn một Cà rốt 25.000
  await addCarrotToCart(page)
  const cashOrder = await checkout(page, 'cash')
  await addCarrotToCart(page)
  await checkout(page, 'transfer')

  // 3. Trả hàng đơn tiền mặt: phương thức hoàn chọn sẵn tiền mặt theo đơn gốc (TIEN-02)
  const found = await api.get<{ data: { id: string }[] }>(
    `/api/v1/orders?search=${encodeURIComponent(cashOrder)}`,
  )
  await page.goto(`/orders/${found.data[0]!.id}`)
  await page.getByRole('button', { name: /Trả hàng/i }).click()
  const returnDialog = page.getByRole('dialog')
  await returnDialog
    .getByRole('textbox', { name: /Số lượng trả/ })
    .first()
    .fill('1')
  const refundMethod = returnDialog.getByRole('radiogroup', { name: 'Phương thức hoàn tiền' })
  await expect(refundMethod.getByRole('radio', { name: 'Tiền mặt' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await returnDialog.getByRole('button', { name: /Xác nhận trả hàng/i }).click()
  await expect(returnDialog.getByText(/Trả hàng thành công|TH-/i).first()).toBeVisible({
    timeout: 10_000,
  })

  // 4. Số phải có = đầu ca + bán tiền mặt - hoàn tiền mặt; chuyển khoản không vào ngăn kéo
  const before = await api.get<{ data: ShiftDetail }>(`/api/v1/shifts/${shiftId}`)
  const summary = before.data.summary
  expect(summary.orderCount).toBe(2)
  expect(summary.returnCount).toBe(1)
  expect(summary.cashSales).toBe(25_000)
  expect(summary.transferIn).toBe(25_000)
  expect(summary.cashRefunds).toBe(25_000)
  expect(summary.expectedCash).toBe(OPENING_CASH)

  // 5. Đóng ca với tiền đếm đúng bằng số phải có: biên bản ghi "Khớp"
  await page.goto('/pos')
  await page.getByTestId('shift-control').click()
  const closeDialog = page.getByTestId('close-shift-dialog')
  await expect(closeDialog.getByTestId('shift-expected-cash')).toContainText('500.000')
  await closeDialog.locator('#shift-counted-cash').fill(String(OPENING_CASH))
  await closeDialog.getByRole('button', { name: 'Đóng ca' }).click()
  // Bản in ẩn cũng có số chênh lệch, nên chỉ xét hộp biên bản đang hiện
  const report = page.getByRole('dialog', { name: 'Biên bản đóng ca' })
  await expect(report.getByTestId('shift-difference')).toContainText('Khớp', { timeout: 10_000 })

  const closed = await api.get<{ data: ShiftDetail }>(`/api/v1/shifts/${shiftId}`)
  expect(closed.data.status).toBe('closed')
  expect(closed.data.expectedCash).toBe(OPENING_CASH)
  expect(closed.data.countedCash).toBe(OPENING_CASH)
  expect(closed.data.difference).toBe(0)
})
