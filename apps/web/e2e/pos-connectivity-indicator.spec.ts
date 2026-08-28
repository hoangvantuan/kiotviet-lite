import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Trạng thái Kết nối và Chỉ báo Giao diện POS (Connectivity Indicator)', () => {
  test('Kiểm tra giao diện bán hàng POS sẵn sàng và chỉ báo trạng thái hoạt động bình thường', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập vào hệ thống
    await loginAs('owner')

    // 2. Vào trang POS bán hàng
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // 3. Kiểm tra trang POS tải ổn định với danh sách sản phẩm và giỏ hàng sẵn sàng
    const productBtn = page.getByRole('button', { name: /Cà rốt|Ca rot/i }).first()
    await expect(productBtn).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Giỏ hàng trống|Gio hang trong/i)).toBeVisible()

    // 4. Xác nhận không có cảnh báo lỗi kết nối chặn màn hình
    const alertError = page.locator('.bg-destructive\\/10')
    await expect(alertError).toHaveCount(0)
  })
})
