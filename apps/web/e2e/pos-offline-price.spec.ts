import { expect, type Page, test } from './fixtures/auth.fixture'
import { waitForOfflineDB } from './helpers/offline'

/**
 * Issue #34 E2E: POS offline price warning smoke test
 *
 * Kiểm tra cảnh báo giá không thể cập nhật khi ngoại tuyến trên POS và
 * hoàn tất đơn hàng theo quy tắc ngoại tuyến.
 */

async function addProductToCart(page: Page, productName: string) {
  const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
  await expect(searchInput).toBeVisible()
  await searchInput.fill(productName)
  const option = page.locator('#pos-search-listbox button').first()
  await expect(option).toBeVisible()
  await option.click()
  const addButton = page.getByRole('dialog', { name: productName }).getByRole('button', {
    name: 'Thêm vào giỏ',
  })
  if (await addButton.isVisible()) await addButton.click()
  await expect(page.locator('table tbody tr').first()).toContainText(productName)
}

test.describe('#34 POS Offline Price Warning & Checkout Smoke Test', () => {
  test('POS ngoại tuyến hiển thị cảnh báo giá và hoàn tất đơn ngoại tuyến', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')
    // GL-03: chờ lượt đồng bộ danh mục đầu tiên xong (loại dữ liệu cuối) rồi mới rút mạng
    const catalogSynced = page.waitForResponse(
      (res) => res.url().includes('/api/v1/sync/pull?entity=category_discounts') && res.ok(),
      { timeout: 30_000 },
    )
    await page.goto('/pos')
    await page.waitForURL('**/pos')
    await catalogSynced

    // Add the item while online so its catalog data is available locally.
    await addProductToCart(page, 'Cà rốt')

    const offlineWarning = page.getByTestId('pos-offline-price-warning')
    await expect(offlineWarning).not.toBeVisible()

    // Exercise the browser's actual offline state rather than dispatching a
    // synthetic event while navigator.onLine remains true.
    await waitForOfflineDB(page)
    await page.context().setOffline(true)
    await expect(offlineWarning).toBeVisible({ timeout: 5000 })
    await expect(offlineWarning).toContainText(
      'Đang ngoại tuyến: giá, tồn kho và công nợ theo dữ liệu đồng bộ lúc',
    )
    await expect(offlineWarning).toContainText(
      'Giá đang hiện trên từng dòng sẽ được giữ nguyên khi hoàn tất đơn',
    )

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
