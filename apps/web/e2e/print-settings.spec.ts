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

    await expect(page.getByRole('heading', { name: /M[aẫ]u in h[oó]a đ[oơ]n/i })).toBeVisible()

    const uniqueSlogan = `KiotViet Lite - Uy tín ${Date.now()}`
    const uniqueFooter = `Cảm ơn quý khách - ${Date.now()}`

    // 3. Thay đổi Slogan và Chú thích chân trang
    const sloganInput = page.locator('#slogan')
    await sloganInput.fill(uniqueSlogan)

    const footerInput = page.locator('#footerText')
    await footerInput.fill(uniqueFooter)

    // 4. Bật toggle Mã SKU (showSku)
    const showSkuSwitch = page.locator('#showSku')
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

    // 6. Kiểm tra phần Xem trước (Invoice Preview) ngay trên trang
    await expect(page.getByText(uniqueSlogan)).toBeVisible()
    await expect(page.getByText('SKU001').first()).toBeVisible()
    await expect(page.getByText(uniqueFooter)).toBeVisible()

    // 7. Nhấn nút Lưu cài đặt
    const saveBtn = page.getByRole('button', { name: /L[uư]u c[aà]i đ[aặ]t/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })
    await saveBtn.click()

    // 8. Tải lại trang (F5) và xác nhận cài đặt vẫn được lưu giữ thành công
    await page.reload()
    await expect(page.locator('#slogan')).toHaveValue(uniqueSlogan)
    await expect(page.locator('#footerText')).toHaveValue(uniqueFooter)
    await expect(page.locator('#showSku')).toHaveAttribute('aria-checked', 'true')
  })
})
