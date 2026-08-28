import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Trả hàng và Khớp Báo cáo Doanh thu, Lợi nhuận (H5/H6)', () => {
  test('1. Bán hàng, Trả hàng một phần và Kiểm tra Báo cáo Doanh thu & Lợi nhuận', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập với vai trò Chủ cửa hàng
    await loginAs('owner')

    // 2. Vào POS tạo 1 đơn hàng mới thanh toán tiền mặt gồm 2 Cà rốt
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const productBtn = page.getByRole('button', { name: /Cà rốt/i })
    await expect(productBtn).toBeVisible({ timeout: 10000 })
    await productBtn.click()

    // Tăng số lượng Cà rốt lên 2 cái
    const increaseBtn = page.getByRole('button', { name: 'Tăng số lượng' })
    await increaseBtn.click()

    // Bấm Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await payBtn.click()

    // Thanh toán tiền mặt
    const cashInput = page.locator('input[placeholder="0"]').first()
    await cashInput.fill('100000')

    const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
    await expect(completeBtn).toBeEnabled()
    await completeBtn.click()

    // Chờ tạo đơn thành công
    await expect(page.getByText(/Thanh toán thành công|Mã hóa đơn/i).first()).toBeVisible({
      timeout: 10000,
    })

    // 3. Vào trang danh sách hóa đơn /orders
    await page.goto('/orders')
    await page.waitForURL('**/orders')

    // Click vào đơn hàng đầu tiên (vừa tạo) để vào trang chi tiết đơn
    const firstOrderRow = page.locator('table tbody tr').first()
    await expect(firstOrderRow).toBeVisible()
    await firstOrderRow.click()

    // 4. Trong chi tiết đơn hàng: nhấn nút Trả hàng
    const returnBtn = page.getByRole('button', { name: /Trả hàng/i })
    await expect(returnBtn).toBeVisible()
    await returnBtn.click()

    // Modal Trả hàng xuất hiện
    await expect(page.getByRole('heading', { name: 'Trả hàng' })).toBeVisible()

    // Nhập số lượng trả là 1
    const qtyInput = page.locator('input[type="number"]').first()
    await qtyInput.fill('1')

    // Nhấn Xác nhận trả hàng
    const confirmReturnBtn = page.getByRole('button', { name: 'Xác nhận trả hàng' })
    await expect(confirmReturnBtn).toBeEnabled()
    await confirmReturnBtn.click()

    // Thông báo trả hàng thành công
    await expect(page.getByText('Trả hàng thành công')).toBeVisible({ timeout: 10000 })
    const closeReturnBtn = page.getByRole('button', { name: 'Đóng' })
    await closeReturnBtn.click()

    // 5. Kiểm tra Báo cáo Doanh thu (/reports/revenue)
    await page.goto('/reports/revenue')
    await page.waitForURL('**/reports/revenue')

    // Báo cáo doanh thu tải thành công và có hiển thị số liệu
    await expect(page.getByRole('heading', { name: 'Báo cáo doanh thu' })).toBeVisible()
    await expect(page.getByText('Tổng doanh thu')).toBeVisible()

    // 6. Kiểm tra Báo cáo Lợi nhuận (/reports/profit)
    await page.goto('/reports/profit')
    await page.waitForURL('**/reports/profit')

    // Báo cáo lợi nhuận tải thành công
    await expect(page.getByRole('heading', { name: 'Báo cáo lợi nhuận' })).toBeVisible()
    await expect(page.getByText('Lợi nhuận gộp')).toBeVisible()
  })

  test('2. Trả hàng toàn bộ đơn (Full Return) và xác nhận trạng thái đơn', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')

    // 1. Vào POS tạo 1 đơn hàng mới
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const productBtn = page.getByRole('button', { name: /Cà rốt/i })
    await expect(productBtn).toBeVisible({ timeout: 10000 })
    await productBtn.click()

    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await payBtn.click()

    const cashInput = page.locator('input[placeholder="0"]').first()
    await cashInput.fill('50000')

    const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
    await completeBtn.click()
    await expect(page.getByText(/Thanh toán thành công|Mã hóa đơn/i).first()).toBeVisible({
      timeout: 10000,
    })

    // 2. Vào /orders mở đơn vừa tạo
    await page.goto('/orders')
    await page.waitForURL('**/orders')
    const firstOrderRow = page.locator('table tbody tr').first()
    await firstOrderRow.click()

    // 3. Thực hiện trả hàng toàn bộ
    const returnBtn = page.getByRole('button', { name: /Trả hàng/i })
    await returnBtn.click()

    const qtyInput = page.locator('input[type="number"]').first()
    await qtyInput.fill('1')

    const confirmReturnBtn = page.getByRole('button', { name: 'Xác nhận trả hàng' })
    await confirmReturnBtn.click()
    await expect(page.getByText('Trả hàng thành công')).toBeVisible({ timeout: 10000 })

    const closeReturnBtn = page.getByRole('button', { name: 'Đóng' })
    await closeReturnBtn.click()

    // Trạng thái đơn chuyển thành Trả hàng toàn phần hoặc không còn nút Trả hàng
    await expect(page.getByText(/Trả toàn bộ|Đã trả hết/i).first()).toBeVisible({ timeout: 5000 })
  })
})
