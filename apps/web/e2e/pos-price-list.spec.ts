import { expect, type Page, test } from './fixtures/auth.fixture'

/**
 * Issue #35 E2E: POS Manual Price List Selection, Fallbacks, Tabs & Snapshot Immutability
 *
 * Scenarios verified:
 * 1. Desktop: Select price list, visible "Đã chọn thủ công" badge, line price recalculation,
 *    fallback price for missing items, independent tabs, customer change preservation,
 *    manual price override preservation across price list changes, and order recall snapshot.
 * 2. Mobile: Manual price list selection with badge, offline locking and warning banner.
 */

async function addProductToCart(page: Page, name: string) {
  await page.getByRole('combobox', { name: /Tìm sản phẩm/i }).fill(name)
  await page
    .getByRole('option', { name: new RegExp(name, 'i') })
    .getByRole('button')
    .click()
  await page.getByRole('button', { name: 'Thêm vào giỏ' }).click()
}

test.describe('Issue #35: POS Price List Selection (Desktop & Mobile)', () => {
  test('1. Desktop: Choose price list, assert line prices, fallback, independent tabs, customer change, manual override, and recall snapshot', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Ensure quick mode is enabled for direct addition
    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (await modeSwitch.isVisible().catch(() => false)) {
      if (!(await modeSwitch.isChecked())) {
        await modeSwitch.click()
      }
    }

    // 1. Verify Price List selector is visible on desktop checkout panel
    const priceListSelect = page.locator('[data-testid="pos-price-list-select"]')
    await expect(priceListSelect).toBeVisible({ timeout: 10000 })
    await expect(priceListSelect).toContainText('Theo khách hàng')

    const manualBadge = page.locator('[data-testid="pos-price-list-manual-badge"]')
    await expect(manualBadge).not.toBeVisible()

    // 2. Add product with price list item ("Cà rốt", retail: 25.000)
    await addProductToCart(page, 'Cà rốt')
    const carrotRow = page.getByRole('row').filter({ hasText: 'Cà rốt' })
    await expect(carrotRow).toBeVisible({ timeout: 5000 })
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('25.000')

    // 3. Add product missing from the selected list ("Sườn non heo", retail: 150.000)
    await addProductToCart(page, 'Sườn non heo')
    const fallbackRow = page.getByRole('row').filter({ hasText: 'Sườn non heo' })
    await expect(fallbackRow).toBeVisible({ timeout: 5000 })
    await expect(fallbackRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('150.000')

    // 4. Actually select "Giá sỉ" from price list dropdown
    await priceListSelect.click()
    const wholesaleOption = page.getByRole('option', { name: 'Giá sỉ' })
    await expect(wholesaleOption).toBeVisible({ timeout: 3000 })
    await wholesaleOption.click()

    // Verify "Đã chọn thủ công" badge is now visible
    await expect(priceListSelect).toContainText('Giá sỉ')
    await expect(manualBadge).toBeVisible()
    await expect(manualBadge).toContainText('Đã chọn thủ công')

    // 5. Assert line prices after price list selection:
    // "Cà rốt" recalculated to wholesale price 21.250
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('21.250')
    const carrotBadge = carrotRow.locator('[data-testid="price-source-badge"]')
    await expect(carrotBadge).toContainText(/Giá sỉ|Bảng giá/)

    // Missing list item keeps retail price and displays the fallback source
    await expect(fallbackRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('150.000')
    const fallbackBadge = fallbackRow.locator('[data-testid="price-source-badge"]')
    await expect(fallbackBadge).toContainText(/dự phòng/i)

    // 5b. Bảng công thức "Giá VIP" (giảm 5% so với giá sỉ, làm tròn trăm) có dòng giá thật:
    // Cà rốt 21.250 x 95% = 20.187,5 làm tròn thành 20.200, mặt hàng ngoài bảng vẫn dự phòng
    await priceListSelect.click()
    await page.getByRole('option', { name: 'Giá VIP' }).click()
    await expect(priceListSelect).toContainText('Giá VIP')
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('20.200')
    await expect(carrotBadge).toContainText(/Giá VIP|Bảng giá/)
    await expect(fallbackRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('150.000')
    await expect(fallbackBadge).toContainText(/dự phòng/i)

    // Quay lại "Giá sỉ" cho các bước sau
    await priceListSelect.click()
    await page.getByRole('option', { name: 'Giá sỉ' }).click()
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('21.250')

    // 6. Independent tabs:
    // Switch to Tab 2
    const tab2Btn = page.getByRole('tab', { name: /Đơn 2|Hoá đơn 2/i })
    await tab2Btn.click()

    // Tab 2 must have default "Theo khách hàng" and NO manual badge
    await expect(priceListSelect).toContainText('Theo khách hàng')
    await expect(manualBadge).not.toBeVisible()

    // Switch back to Tab 1
    const tab1Btn = page.getByRole('tab', { name: /Đơn 1|Hoá đơn 1/i })
    await tab1Btn.click()

    // Tab 1 must still have "Giá sỉ", manual badge, and recalculated prices
    await expect(priceListSelect).toContainText('Giá sỉ')
    await expect(manualBadge).toBeVisible()
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('21.250')

    // 7. Customer change preserves manual price list:
    const customerInput = page.getByPlaceholder(/Tìm khách hàng/i).first()
    if (await customerInput.isVisible().catch(() => false)) {
      await customerInput.click()
      const custOption = page
        .locator('[role="listbox"] button, [data-slot="combobox-item"]')
        .first()
      if (await custOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await custOption.click()
      }
    }

    // Price list must remain "Giá sỉ" with "Đã chọn thủ công" badge
    await expect(priceListSelect).toContainText('Giá sỉ')
    await expect(manualBadge).toBeVisible()
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('21.250')

    // 8. Manual line price override:
    // Edit unit price of "Cà rốt"
    const editPriceBtn = carrotRow.getByRole('button', { name: 'Sửa giá bán' })
    await editPriceBtn.click()

    const editDialog = page.getByRole('dialog', { name: 'Sửa giá bán' })
    await editDialog.getByRole('textbox', { name: 'Giá mới' }).fill('23000')
    await editDialog.getByRole('textbox', { name: 'Lý do (tuỳ chọn)' }).fill('Khách quen')
    await editDialog.getByRole('button', { name: 'Áp dụng' }).click()
    const pinDialog = page.getByRole('dialog', { name: 'Xác thực PIN' })
    await expect(pinDialog).toBeVisible()
    await pinDialog.locator('input').first().pressSequentially('111111')
    await expect(pinDialog).not.toBeVisible()

    // Line price should now show 23.000 and "Sửa giá" badge
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('23.000')
    await expect(carrotRow).toContainText('Đã sửa giá')

    // Changing price list to "Theo khách hàng" must NOT overwrite manually overridden line
    await priceListSelect.click()
    await page.getByRole('option', { name: 'Theo khách hàng' }).click()

    // Manual override price 23.000 must remain preserved
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('23.000')
    await expect(carrotRow).toContainText('Đã sửa giá')

    // Re-select "Giá sỉ" for order completion
    await priceListSelect.click()
    await page.getByRole('option', { name: 'Giá sỉ' }).click()
    await expect(manualBadge).toBeVisible()
    await expect(carrotRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('23.000')

    // 9. Checkout & verify recall snapshot in order detail:
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    await paymentDialog.getByRole('button', { name: '173.000 đ' }).click()
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Wait for completion dialog or order created confirmation
    await expect(
      page.getByText(/Tạo đơn thành công|Đơn hàng.*đã hoàn thành|HD-/i).first(),
    ).toBeVisible({ timeout: 10000 })

    // Navigate to orders list and inspect the created order
    await page.goto('/orders')
    await page.waitForURL('**/orders')

    const firstOrderRow = page.locator('table tbody tr').first()
    await expect(firstOrderRow).toBeVisible({ timeout: 10000 })
    await firstOrderRow.click()

    // Verify snapshot: order detail displays snapshotted price list name
    await expect(page.getByText(/Bảng giá:/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Giá sỉ')).toBeVisible()

    // Verify price source badges are visible on order items
    await expect(page.locator('[data-testid="price-source-badge"]').first()).toBeVisible()
  })

  test('2. Mobile: Price list selector is visible, allows manual selection, and disables when offline', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs('staff')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    await addProductToCart(page, 'Cà rốt')
    await page.getByRole('button', { name: /Mở giỏ hàng/i }).click()

    const priceListSelect = page.locator('[data-testid="pos-price-list-select"]')
    await expect(priceListSelect).toBeVisible({ timeout: 10000 })
    await expect(priceListSelect).toBeEnabled()

    // Select "Giá sỉ" on mobile
    await priceListSelect.click()
    const wholesaleOption = page.getByRole('option', { name: 'Giá sỉ' })
    await expect(wholesaleOption).toBeVisible({ timeout: 3000 })
    await wholesaleOption.click()

    const manualBadge = page.locator('[data-testid="pos-price-list-manual-badge"]')
    await expect(manualBadge).toBeVisible()
    await expect(manualBadge).toContainText('Đã chọn thủ công')

    // Trigger offline mode
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // Offline banner must appear and price list select must be disabled
    const offlineWarning = page.locator('[data-testid="pos-offline-price-warning"]')
    await expect(offlineWarning).toBeVisible({ timeout: 5000 })
    await expect(priceListSelect).toBeDisabled()
  })
})
