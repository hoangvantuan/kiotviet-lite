import { expect, type Page, test } from './fixtures/auth.fixture'

/**
 * Issue #34 E2E: POS offline price warning smoke test
 *
 * Kiểm tra cảnh báo giá không thể cập nhật khi ngoại tuyến trên POS và
 * hoàn tất đơn hàng theo quy tắc ngoại tuyến.
 */

async function addProductToCart(page: Page, productNameRegex: RegExp) {
  const productBtn = page.getByRole('button', { name: productNameRegex }).first()
  const isVisible = await productBtn.isVisible().catch(() => false)
  if (!isVisible) {
    const gridToggle = page.getByRole('button', { name: /Lưới sản phẩm|Lưới ảnh/i })
    if (await gridToggle.isVisible().catch(() => false)) {
      await gridToggle.click()
    }
  }

  await expect(productBtn).toBeVisible({ timeout: 10000 })
  await productBtn.click()

  const addToCartBtn = page.getByRole('button', { name: /Thêm vào giỏ|Them vao gio/i })
  if (await addToCartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addToCartBtn.click()
  }
}

test.describe('#34 POS Offline Price Warning & Checkout Smoke Test', () => {
  test('POS ngoại tuyến hiển thị cảnh báo giá và hoàn tất đơn ngoại tuyến', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Ban đầu trực tuyến: banner cảnh báo không hiển thị
    const offlineWarning = page.locator('[data-testid="pos-offline-price-warning"]')
    await expect(offlineWarning).not.toBeVisible()

    // Chuyển sang ngoại tuyến bằng cách kích hoạt sự kiện offline trên window
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // Banner cảnh báo ngoại tuyến xuất hiện rõ ràng
    await expect(offlineWarning).toBeVisible({ timeout: 5000 })
    await expect(offlineWarning).toContainText('Đang ngoại tuyến: Không thể cập nhật giá')
    await expect(offlineWarning).toContainText(
      'Giá đang hiện trên từng dòng sẽ được giữ nguyên khi hoàn tất đơn',
    )

    // Thêm sản phẩm vào giỏ
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Thanh toán đơn ngoại tuyến
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    // Chọn mệnh giá tiền mặt
    const denominationBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000|200\.000/i })
      .first()
    if (await denominationBtn.isVisible().catch(() => false)) {
      await denominationBtn.click()
    } else {
      const cashInput = paymentDialog.locator('input[placeholder="0"]').first()
      await cashInput.fill('100000')
    }

    // Hoàn tất đơn
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Dialog hoàn thành đơn hàng xuất hiện
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })
  })
})
