import { expect, type Page, test } from './fixtures/auth.fixture'

/**
 * Issue #32 E2E: Price source journey
 * POS reprice -> create order -> view order detail (desktop + mobile)
 *
 * Prerequisites (seed data): product "Cà rốt" exists with retail price.
 * Coordinator runs this serially on integrated runtime (shared PostgreSQL + API :3000 + web :5173).
 */

async function addProductToCart(page: Page, productNameRegex: RegExp) {
  const productBtn = page.getByRole('button', { name: productNameRegex }).first()
  await expect(productBtn).toBeVisible({ timeout: 10000 })
  await productBtn.click()

  const addToCartBtn = page.getByRole('button', { name: /Thêm vào giỏ|Them vao gio/i })
  if (await addToCartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addToCartBtn.click()
  }
}

test.describe('#32 Price source: POS -> Order Detail', () => {
  test('Desktop: price source badge visible in POS cart and order detail', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Add product to cart
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Cart should show a price source badge (Giá lẻ for retail_price)
    const cartSection = page.locator('[data-testid="cart-items"], .cart-items, aside').first()
    await expect(cartSection).toBeVisible({ timeout: 5000 })
    // The PriceSourceBadge should now render for retail_price too
    const badge = cartSection
      .locator('text=/Giá lẻ|Giá SL|Giá riêng|CK danh mục|Bảng giá|Sửa giá/')
      .first()
    await expect(badge).toBeVisible({ timeout: 5000 })

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

    // Click on the first (most recent) order
    const orderRow = page.locator('table tbody tr, [data-testid="order-item"]').first()
    await expect(orderRow).toBeVisible({ timeout: 10000 })
    await orderRow.click()

    // Order detail page should show price source badge
    const detailBadge = page
      .locator('text=/Giá lẻ|Giá SL|Giá riêng|CK danh mục|Bảng giá|Sửa giá/')
      .first()
    await expect(detailBadge).toBeVisible({ timeout: 5000 })
  })

  test('Mobile: price source badge visible in order detail', async ({ page, loginAs }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 })

    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Add product
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Checkout
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

    await expect(page.getByText(/Tạo đơn thành công|Đơn hàng.*đã tạo|HD-/i).first()).toBeVisible({
      timeout: 10000,
    })

    // Navigate to orders
    await page.goto('/orders')
    await page.waitForURL('**/orders')

    // Click first order (mobile may use card layout)
    const orderCard = page
      .locator('table tbody tr, [data-testid="order-item"], a[href*="/orders/"]')
      .first()
    await expect(orderCard).toBeVisible({ timeout: 10000 })
    await orderCard.click()

    // Price source badge in mobile detail view
    const detailBadge = page
      .locator('text=/Giá lẻ|Giá SL|Giá riêng|CK danh mục|Bảng giá|Sửa giá/')
      .first()
    await expect(detailBadge).toBeVisible({ timeout: 5000 })
  })
})
