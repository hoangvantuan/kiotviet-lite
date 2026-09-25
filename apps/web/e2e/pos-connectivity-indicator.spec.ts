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
    await expect(page.getByRole('combobox', { name: /Tìm theo tên, mã hàng/i })).toBeVisible()
    await expect(page.getByText('Chưa có sản phẩm trong đơn hàng')).toBeVisible()

    // 4. Xác nhận không có cảnh báo lỗi kết nối chặn màn hình
    const alertError = page.locator('.bg-destructive\\/10')
    await expect(alertError).toHaveCount(0)
  })
})
