import { expect, type Page, test } from './fixtures/auth.fixture'

// Price provenance must survive POS checkout and remain visible in order detail.
// Requires the seeded owner and product "Cà rốt" on a migrated PostgreSQL database.

async function addProductToCart(page: Page) {
  await page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i }).fill('Cà rốt')
  await page
    .getByRole('option', { name: /Cà rốt/i })
    .getByRole('button')
    .click()
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click()
}

test.describe('#32 Price source: POS -> Order Detail', () => {
  test('Desktop: price source badge visible in POS cart and order detail', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    await addProductToCart(page)
    const cartRow = page.getByRole('row').filter({ hasText: 'Cà rốt' })
    await expect(cartRow.getByText('Giá lẻ')).toBeVisible()

    // Checkout with cash
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    const denominationBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000|200\.000/i })
      .first()
    if (await denominationBtn.isVisible().catch(() => false)) {
      await denominationBtn.click()
    }

    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Wait for success toast or order confirmation
    await expect(page.getByText(/Tạo đơn thành công|Đơn hàng.*đã tạo|HD-/i).first()).toBeVisible({
      timeout: 10000,
    })

    // Navigate to order history
    await page.goto('/orders')
    await page.waitForURL('**/orders')
    await page.getByRole('button', { name: 'Tất cả', exact: true }).click()

    // Click on the first (most recent) order
    const orderRow = page.locator('table tbody tr, [data-testid="order-item"]').first()
    await expect(orderRow).toBeVisible({ timeout: 10000 })
    await orderRow.click()
    await expect(
      page.getByRole('row').filter({ hasText: 'Cà rốt' }).getByText('Giá lẻ'),
    ).toBeVisible()
  })

  test('Mobile: price source badge visible in order detail', async ({ page, loginAs }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 })

    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    await addProductToCart(page)
    await page.getByRole('button', { name: /Mở giỏ hàng/i }).click()
    await expect(page.getByText('Giá lẻ')).toBeVisible()
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled()
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    const denominationBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000|200\.000/i })
      .first()
    if (await denominationBtn.isVisible().catch(() => false)) {
      await denominationBtn.click()
    }

    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    await expect(page.getByText(/Tạo đơn thành công|Đơn hàng.*đã tạo|HD-/i).first()).toBeVisible({
      timeout: 10000,
    })

    // Navigate to orders
    await page.goto('/orders')
    await page.waitForURL('**/orders')
    await page.getByRole('button', { name: 'Tất cả', exact: true }).click()

    // Mobile list uses clickable cards, not links or visible table rows.
    const orderNumber = page
      .locator('main [class*="md:hidden"][class*="space-y-2"]')
      .getByText(/^HD-\d+/)
      .first()
    await expect(orderNumber).toBeVisible({ timeout: 10000 })
    await orderNumber.click()

    // Assert the visible item provenance, not a hidden navigation label.
    await expect(
      page.locator('main [class*="md:hidden"][class*="divide-y"]').getByText('Giá lẻ', {
        exact: true,
      }),
    ).toBeVisible()
  })
})
