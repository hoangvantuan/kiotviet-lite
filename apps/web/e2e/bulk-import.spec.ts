import { expect, type Page, type Route, test } from '@playwright/test'
import { Buffer } from 'node:buffer'

// Bộ này mock toàn bộ API bằng page.route. Trên bản build production, request đi qua service
// worker không bị page.route chặn, nên phải chặn service worker (project chromium-prod).
test.use({ serviceWorkers: 'block' })

// Origin của trang đang test (dev 5173 hoặc bản build), để header CORS của mock khớp mọi project
const allowOrigin = (route: Route) => route.request().headers()['origin'] ?? '*'

const now = '2026-09-23T10:00:00.000Z'
const later = '2026-10-23T10:00:00.000Z'
const job = {
  id: 'job-1',
  type: 'product',
  mode: 'upsert',
  status: 'queued',
  totalRows: 3,
  processedRows: 0,
  succeededRows: 0,
  failedRows: 0,
  errorMessage: null,
  createdAt: now,
  startedAt: null,
  finishedAt: null,
  expiresAt: later,
  originalFilename: 'products.xlsx',
}
const preview = {
  kind: 'products',
  mode: 'upsert',
  filename: 'products.xlsx',
  totalRows: 3,
  creates: 1,
  updates: 1,
  noOps: 0,
  errors: [{ row: 4, column: 'Tên sản phẩm', message: 'Tên không hợp lệ' }],
  newCategories: ['Đồ khô'],
  newBrands: ['Nhãn mới'],
  warnings: ['Kiểm tra dữ liệu trước khi nhập'],
  sample: [{ 'Tên sản phẩm': 'Gạo trắng' }],
  digest: 'digest-1',
}

async function mockCatalog(page: Page, role: 'owner' | 'manager' | 'staff') {
  let currentJob = { ...job }
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    let data: unknown = []
    if (url.pathname === '/api/v1/auth/refresh')
      data = { accessToken: 'test-token', expiresIn: 900 }
    else if (url.pathname === '/api/v1/me')
      data = {
        id: '00000000-0000-4000-8000-000000000001',
        storeId: '00000000-0000-4000-8000-000000000002',
        name: 'Tester',
        phone: null,
        role,
      }
    else if (url.pathname === '/api/v1/bulk-import-jobs')
      data = [currentJob, { ...job, id: 'other', type: 'supplier', originalFilename: 'other.xlsx' }]
    else if (url.pathname === '/api/v1/bulk-import-jobs/job-1/cancel') {
      currentJob = { ...currentJob, status: 'cancelled' }
      data = currentJob
    } else if (url.pathname === '/api/v1/bulk-import-jobs/job-1') data = currentJob
    else if (url.pathname === '/api/v1/bulk-import/products/preview') data = preview
    else if (url.pathname === '/api/v1/bulk-import/products/confirm') data = currentJob
    else if (url.pathname === '/api/v1/products/low-stock-count') data = { count: 0 }
    else if (url.pathname.includes('categories') || url.pathname.includes('brands')) data = []
    await route.fulfill({
      status: url.pathname.endsWith('/confirm') ? 201 : 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': allowOrigin(route),
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify({ data, meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
    })
  })
}

test('owner previews errors and names before committing; history survives reopening and filters catalog', async ({
  page,
}) => {
  await mockCatalog(page, 'owner')
  await page.goto('/products')
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nhập sản phẩm từ Excel' })
  await expect(dialog.getByText('Tồn kho trong tệp sẽ được bỏ qua')).toBeVisible()
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'products.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('xlsx'),
  })
  await dialog.getByRole('radio', { name: /Thêm hoặc cập nhật/ }).check()
  await dialog.getByRole('button', { name: 'Xem trước' }).click()
  await expect(dialog.getByText('Dòng 4, cột Tên sản phẩm:')).toBeVisible()
  await expect(dialog.getByText('Gạo trắng')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Xác nhận nhập' })).toBeDisabled()
  const errorsRequest = page.waitForRequest('**/api/v1/bulk-import/errors.xlsx')
  await dialog.getByRole('button', { name: 'Tải Excel lỗi' }).click()
  expect((await errorsRequest).postDataJSON()).toEqual({ errors: preview.errors })
  await dialog.getByRole('checkbox', { name: /Tôi đồng ý tạo/ }).check()
  await expect(dialog.getByRole('button', { name: 'Xác nhận nhập' })).toBeDisabled()
  await page.route('**/api/v1/bulk-import/products/preview', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': allowOrigin(route),
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({ data: { ...preview, errors: [], digest: 'digest-valid' } }),
    }),
  )
  await dialog.getByRole('button', { name: 'Quay lại' }).click()
  await dialog.getByRole('button', { name: 'Xem trước' }).click()
  await expect(dialog.getByText('Dòng 4, cột Tên sản phẩm:')).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: /Tôi đồng ý tạo/ }).check()
  const confirm = page.waitForRequest('**/api/v1/bulk-import/products/confirm')
  await dialog.getByRole('button', { name: 'Xác nhận nhập' }).click()
  const request = await confirm
  expect(request.postData()).toContain('name="digest"')
  expect(request.postData()).toContain('digest-valid')
  expect(request.postData()).toContain('name="approveNewNames"')
  expect(request.postData()).toContain('true')
  await expect(dialog.getByText('Đang chờ xử lý')).toBeVisible()
  await expect(dialog.getByText('Đã xử lý 0/3 dòng')).toBeVisible()
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click()
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  await dialog.getByRole('button', { name: 'Lịch sử nhập' }).click()
  await expect(dialog.getByText('products.xlsx')).toBeVisible()
  await expect(dialog.getByText('other.xlsx')).toHaveCount(0)
  const fileRequest = page.waitForRequest('**/api/v1/bulk-import-jobs/job-1/file')
  await dialog.getByRole('button', { name: 'Tải tệp gốc' }).click()
  expect((await fileRequest).headers().authorization).toBe('Bearer test-token')
})

test('unchanged export can be confirmed without manufacturing a product update', async ({
  page,
}) => {
  await mockCatalog(page, 'owner')
  await page.route('**/api/v1/bulk-import/products/preview', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': allowOrigin(route),
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({
        data: {
          ...preview,
          totalRows: 11_055,
          creates: 0,
          updates: 0,
          noOps: 11_055,
          errors: [],
          newCategories: [],
          newBrands: [],
          digest: 'digest-noop',
        },
      }),
    }),
  )
  await page.goto('/products')
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'products.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('xlsx'),
  })
  await dialog.getByRole('radio', { name: /Thêm hoặc cập nhật/ }).check()
  await dialog.getByRole('button', { name: 'Xem trước' }).click()
  const confirmButton = dialog.getByRole('button', { name: 'Xác nhận nhập' })
  await expect(confirmButton).toBeEnabled()
  const request = page.waitForRequest('**/api/v1/bulk-import/products/confirm')
  await confirmButton.click()
  expect((await request).postData()).toContain('digest-noop')
})

test('invalid files cannot reach preview; changing file clears prior preview', async ({ page }) => {
  await mockCatalog(page, 'owner')
  await page.goto('/products')
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'wrong.csv', mimeType: 'text/csv', buffer: Buffer.from('wrong') })
  await expect(dialog.getByRole('alert')).toContainText('Chỉ chấp nhận')
  await expect(dialog.getByRole('button', { name: 'Xem trước' })).toBeDisabled()
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'oversized.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  })
  await expect(dialog.getByRole('alert')).toContainText('8 MiB')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'products.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('xlsx'),
  })
  await dialog.getByRole('button', { name: 'Xem trước' }).click()
  await expect(dialog.getByText('Dòng 4, cột Tên sản phẩm:')).toBeVisible()
  await dialog.getByRole('button', { name: 'Quay lại' }).click()
  await expect(dialog.getByText('Dòng 4, cột Tên sản phẩm:')).toHaveCount(0)
})

test('late preview response cannot replace a newly selected file', async ({ page }) => {
  await mockCatalog(page, 'owner')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/bulk-import/products/preview', async (route) => {
    await gate
    await route
      .fulfill({
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': allowOrigin(route),
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({ data: preview }),
      })
      .catch(() => {})
  })
  await page.goto('/products')
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'first.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('one'),
  })
  const request = page.waitForRequest('**/api/v1/bulk-import/products/preview')
  await dialog.getByRole('button', { name: 'Xem trước' }).click()
  await request
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'second.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('two'),
  })
  release()
  await expect(dialog.getByText('second.xlsx')).toBeVisible()
  await expect(dialog.getByText('Dòng 4, cột Tên sản phẩm:')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
})

test('active import can be cancelled and failed history explains the failure', async ({ page }) => {
  await mockCatalog(page, 'owner')
  await page.goto('/products')
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Lịch sử nhập' }).click()
  await expect(dialog.getByText('Đang chờ xử lý')).toBeVisible()
  await dialog.getByRole('button', { name: 'Huỷ lần nhập' }).click()
  await expect(dialog.getByText('Đã huỷ', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click()

  await page.route('**/api/v1/bulk-import-jobs', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': allowOrigin(route),
        'access-control-allow-credentials': 'true',
      },
      body: JSON.stringify({
        data: [
          {
            ...job,
            id: 'failed-job',
            status: 'failed',
            originalFilename: 'failed.xlsx',
            errorMessage: 'Không đọc được tệp gốc',
          },
        ],
      }),
    }),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Nhập Excel' }).click()
  await dialog.getByRole('button', { name: 'Lịch sử nhập' }).click()
  await expect(dialog.getByText('Không đọc được tệp gốc')).toBeVisible()
})

for (const role of ['owner', 'manager', 'staff'] as const) {
  test(`${role} catalog actions honor role`, async ({ page }) => {
    await mockCatalog(page, role)
    for (const path of ['/products', '/customers', '/inventory/suppliers']) {
      await page.goto(path)
      if (role === 'owner')
        await expect(page.getByRole('button', { name: 'Nhập Excel' })).toBeVisible()
      else await expect(page.getByRole('button', { name: 'Nhập Excel' })).toHaveCount(0)
      if (role !== 'staff')
        await expect(page.getByRole('button', { name: 'Xuất Excel' })).toBeVisible()
      else await expect(page.getByRole('button', { name: 'Xuất Excel' })).toHaveCount(0)
    }
  })
}
