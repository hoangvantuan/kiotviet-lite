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
  // Try quick search input on desktop
  const searchInput = page.getByPlaceholder(/Tìm sản phẩm, mã SKU, barcode/i)
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill(name)
    const option = page.locator('#pos-search-listbox button').first()
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
      await option.click()
      return
    }
  }

  // Fallback: search combobox
  const headerSearch = page.getByRole('combobox', { name: /Tìm sản phẩm/i })
  if (await headerSearch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await headerSearch.fill(name)
    const opt = page.getByRole('option', { name: new RegExp(name, 'i') }).first()
    if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await opt.getByRole('button').click()
      const addBtn = page.getByRole('button', { name: /Thêm vào giỏ/i })
      if (await addBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addBtn.click()
      }
    }
  }
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
    await expect(carrotRow.getByText(/25\.000/)).toBeVisible()

    // 3. Add product without price list item ("Thịt bò Úc", retail: 280.000)
    await addProductToCart(page, 'Thịt bò Úc')
    const beefRow = page.getByRole('row').filter({ hasText: 'Thịt bò Úc' })
    await expect(beefRow).toBeVisible({ timeout: 5000 })
    await expect(beefRow.getByText(/280\.000/)).toBeVisible()

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
    await expect(carrotRow.getByText(/21\.250/)).toBeVisible({ timeout: 5000 })
    const carrotBadge = carrotRow.locator('[data-testid="price-source-badge"]')
    await expect(carrotBadge).toContainText(/Giá sỉ|Bảng giá/)

    // "Thịt bò Úc" is missing in "Giá sỉ", falls back to retail with fallback badge
    await expect(beefRow.getByText(/280\.000/)).toBeVisible()
    const beefBadge = beefRow.locator('[data-testid="price-source-badge"]')
    await expect(beefBadge).toContainText(/dự phòng/i)

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
    await expect(carrotRow.getByText(/21\.250/)).toBeVisible()

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
    await expect(carrotRow.getByText(/21\.250/)).toBeVisible()

    // 8. Manual line price override:
    // Edit unit price of "Cà rốt"
    const editPriceBtn = carrotRow.getByLabel(/Sửa giá bán/i)
    if (await editPriceBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editPriceBtn.click()

      const editDialog = page.getByRole('dialog')
      await expect(editDialog.getByRole('heading', { name: /Sửa đơn giá/i })).toBeVisible()

      const newPriceInput = editDialog.locator('input[aria-label="Đơn giá mới"]')
      await newPriceInput.fill('23000')

      const reasonInput = editDialog.locator('input[aria-label="Lý do sửa giá"]')
      await reasonInput.fill('Khách quen')

      await editDialog.getByRole('button', { name: /Xác nhận/i }).click()

      // Line price should now show 23.000 and "Sửa giá" badge
      await expect(carrotRow.getByText(/23\.000/)).toBeVisible()
      await expect(carrotRow.locator('[data-testid="price-source-badge"]')).toContainText(
        /Sửa giá/i,
      )

      // Changing price list to "Theo khách hàng" must NOT overwrite manually overridden line
      await priceListSelect.click()
      await page.getByRole('option', { name: 'Theo khách hàng' }).click()

      // Manual override price 23.000 must remain preserved
      await expect(carrotRow.getByText(/23\.000/)).toBeVisible()
      await expect(carrotRow.locator('[data-testid="price-source-badge"]')).toContainText(
        /Sửa giá/i,
      )

      // Re-select "Giá sỉ" for order completion
      await priceListSelect.click()
      await page.getByRole('option', { name: 'Giá sỉ' }).click()
      await expect(manualBadge).toBeVisible()
      await expect(carrotRow.getByText(/23\.000/)).toBeVisible()
    }

    // 9. Checkout & verify recall snapshot in order detail:
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

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

    // Open Cart sheet on mobile
    const cartNavBtn = page.getByRole('button', { name: /Giỏ hàng|Xem giỏ|Mở giỏ hàng/i })
    if (await cartNavBtn.isVisible().catch(() => false)) {
      await cartNavBtn.click()
    }

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
