import { expect, test } from './fixtures/auth.fixture'
import { SEED_USERS } from './helpers/test-data'

test.describe('Kiểm thử khói (Smoke Test) - Đăng nhập và điều hướng', () => {
  test('Đăng nhập thành công bằng tài khoản seed chủ cửa hàng và thấy trang chủ', async ({
    page,
  }) => {
    const owner = SEED_USERS.owner

    // 1. Mở trang đăng nhập
    await page.goto('/login')
    await expect(page).toHaveTitle(/KiotViet Lite/)

    // 2. Nhập số điện thoại và mật khẩu của tài khoản seed
    await page.locator('#phone').fill(owner.phone)
    await page.locator('#password').fill(owner.password)

    // 3. Nhấn nút Đăng nhập
    const submitBtn = page.getByRole('button', { name: 'Đăng nhập' })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 4. Xác nhận chuyển hướng về trang chủ và thấy lời chào người dùng
    await page.waitForURL('**/')
    await expect(page.getByText(`Xin chào, ${owner.name}`)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Chào mừng đến KiotViet Lite')).toBeVisible()
  })
})
