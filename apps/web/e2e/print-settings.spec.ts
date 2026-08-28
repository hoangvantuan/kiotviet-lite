import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Cài đặt Mẫu in Hóa đơn và Hiệu lực Mẫu in (Issue #1)', () => {
  test('Bật tắt các toggle cài đặt in và xác nhận nội dung mẫu in hóa đơn thay đổi tương ứng', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập với tài khoản Chủ cửa hàng (Owner)
    await loginAs('owner')

    // 2. Vào trang Cài đặt mẫu in (/settings/print)
    await page.goto('/settings/print')
    await page.waitForURL('**/settings/print')

    await expect(page.getByRole('heading', { name: 'Mẫu in hóa đơn' })).toBeVisible()

    // 3. Thay đổi Slogan và Chú thích chân trang
    const sloganInput = page.locator('#slogan')
    await sloganInput.fill('KiotViet Lite - Uy tín hàng đầu')

    const footerInput = page.locator('#footerText')
    await footerInput.fill('Cảm ơn quý khách và hẹn gặp lại!')

    // 4. Bật toggle Mã SKU (showSku)
    const showSkuSwitch = page.locator('#showSku')
    // Nếu switch đang tắt thì bấm bật
    const isSkuChecked = await showSkuSwitch.getAttribute('aria-checked')
    if (isSkuChecked !== 'true') {
      await showSkuSwitch.click()
    }

    // 5. Bật toggle Nợ cũ (showOldDebt)
    const showOldDebtSwitch = page.locator('#showOldDebt')
    const isOldDebtChecked = await showOldDebtSwitch.getAttribute('aria-checked')
    if (isOldDebtChecked !== 'true') {
      await showOldDebtSwitch.click()
    }

    // 6. Kiểm tra phần Xem trước (Invoice Preview) ngay trên trang:
    // Thấy slogan mới và SKU hiển thị trong phần preview
    await expect(page.getByText('KiotViet Lite - Uy tín hàng đầu')).toBeVisible()
    await expect(page.getByText('SKU001').first()).toBeVisible()
    await expect(page.getByText('Cảm ơn quý khách và hẹn gặp lại!')).toBeVisible()

    // 7. Nhấn nút Lưu cài đặt
    const saveBtn = page.getByRole('button', { name: 'Lưu cài đặt' })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // 8. Tải lại trang (F5) và xác nhận cài đặt vẫn được lưu giữ thành công
    await page.reload()
    await expect(page.locator('#slogan')).toHaveValue('KiotViet Lite - Uy tín hàng đầu')
    await expect(page.locator('#footerText')).toHaveValue('Cảm ơn quý khách và hẹn gặp lại!')
    await expect(page.locator('#showSku')).toHaveAttribute('aria-checked', 'true')
  })
})
