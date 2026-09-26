import { expect, type Page, test } from './fixtures/auth.fixture'

/**
 * POS-08, POS-17: bán biến thể có giá riêng trong bảng giá, hộp hoàn thành đơn không tự đóng.
 *
 * Dữ liệu seed: bảng "Giá sỉ" có dòng riêng cho biến thể "Bia Heineken, Chai 330ml" giá 14.500,
 * không có dòng cho sản phẩm Bia Heineken, nên biến thể "Lon 330ml" lấy giá bán 18.000.
 */

async function addVariant(page: Page, variant: string) {
  await page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i }).fill('Bia Heineken')
  await page
    .getByRole('option', { name: /Bia Heineken/i })
    .getByRole('button')
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Chọn biến thể' })).toBeDisabled()
  await dialog.getByRole('button', { name: variant, exact: true }).click()
  await dialog.getByRole('button', { name: 'Thêm vào giỏ' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('POS-08: giá theo biến thể', () => {
  test('Desktop: biến thể có dòng riêng lấy giá của dòng đó, hộp hoàn thành đơn đứng yên tới khi bấm Đơn hàng mới', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const priceListSelect = page.locator('[data-testid="pos-price-list-select"]')
    await expect(priceListSelect).toBeVisible({ timeout: 10000 })
    await priceListSelect.click()
    await page.getByRole('option', { name: 'Giá sỉ' }).click()
    await expect(priceListSelect).toContainText('Giá sỉ')

    await addVariant(page, 'Chai 330ml')
    const chaiRow = page.getByRole('row').filter({ hasText: 'Chai 330ml' })
    await expect(chaiRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('14.500')
    await expect(chaiRow.locator('[data-testid="price-source-badge"]')).toContainText(
      /Giá sỉ|Bảng giá/,
    )

    await addVariant(page, 'Lon 330ml')
    const lonRow = page.getByRole('row').filter({ hasText: 'Lon 330ml' })
    await expect(lonRow.getByRole('button', { name: 'Sửa giá bán' })).toContainText('18.000')

    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()
    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()
    const cashInput = paymentDialog.getByLabel('Tiền khách đưa')
    if (await cashInput.isVisible().catch(() => false)) {
      await cashInput.fill('50000')
      // POS-20: phân cách nghìn ngay khi gõ
      await expect(cashInput).toHaveValue('50.000')
    }
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // POS-17: không tự đóng sau vài giây
    const done = page.getByText('Đơn hàng hoàn thành!')
    await expect(done).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(4500)
    await expect(done).toBeVisible()
    await expect(page.getByRole('button', { name: /In hoá đơn/ })).toBeVisible()

    await page.getByRole('button', { name: 'Đơn hàng mới' }).click()
    await expect(done).toBeHidden()
  })
})
