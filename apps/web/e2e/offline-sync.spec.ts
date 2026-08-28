import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Ngoại tuyến và Chỉ báo Đồng bộ (Offline & Sync Indicator)', () => {
  test('Kiểm tra giao diện ứng dụng khi hoạt động bình thường và trạng thái kết nối', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập vào hệ thống
    await loginAs('owner')

    // 2. Vào trang POS bán hàng
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // 3. Kiểm tra trang POS tải ổn định với danh sách sản phẩm
    await expect(page.getByRole('button', { name: /Cà rốt/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Gio hang trong')).toBeVisible()

    // 4. Xác nhận trạng thái online ban đầu: không có cảnh báo lỗi kết nối chặn màn hình
    const alertError = page.locator('.bg-destructive\\/10')
    await expect(alertError).toHaveCount(0)
  })
})
