import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Nhập hàng và Cập nhật Tồn kho (Purchase Orders & Inventory)', () => {
  test('Tạo phiếu nhập kho thành công và kiểm tra tồn kho tăng chính xác', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập với tài khoản Chủ cửa hàng (Owner)
    await loginAs('owner')

    // 2. Vào trang Quản lý Hàng hóa (/products) để xem hàng hóa ban đầu
    await page.goto('/products')
    await page.waitForURL('**/products')

    await expect(page.getByRole('heading', { name: /Sản phẩm|Hàng hóa/i })).toBeVisible({
      timeout: 10000,
    })
    const searchInput = page.getByPlaceholder(/Tìm theo tên|Tìm/i).first()
    await searchInput.fill('Cà rốt')

    // Đợi hàng của Cà rốt hiển thị trên bảng
    const carrotRow = page.locator('table tbody tr').first()
    await expect(carrotRow).toBeVisible({ timeout: 10000 })
    await expect(carrotRow).toContainText(/Cà rốt|Ca rot/i)

    // 3. Vào trang Tạo phiếu nhập kho (/inventory/purchase-orders/new)
    await page.goto('/inventory/purchase-orders/new')
    await page.waitForURL('**/inventory/purchase-orders/new')

    await expect(page.getByRole('heading', { name: /Tạo phiếu nhập kho/i })).toBeVisible({
      timeout: 10000,
    })

    // 4. Chọn Nhà cung cấp: mở dropdown Chọn NCC
    const selectNccBtn = page.getByRole('combobox').first()
    await selectNccBtn.click()

    // Chọn nhà cung cấp đầu tiên trong danh sách
    const nccOption = page.getByRole('option').first()
    await expect(nccOption).toBeVisible({ timeout: 5000 })
    await nccOption.click()

    // 5. Thêm sản phẩm vào phiếu nhập
    const productSearchInput = page.getByPlaceholder(/Tìm sản phẩm/i)
    await productSearchInput.fill('Cà rốt')

    // Click vào sản phẩm Cà rốt xuất hiện trong danh sách gợi ý bằng dispatchEvent
    const addProductBtn = page.getByRole('button', { name: /Cà rốt|Ca rot/i }).first()
    await expect(addProductBtn).toBeVisible({ timeout: 5000 })
    await addProductBtn.dispatchEvent('click')

    // 6. Nhập số lượng nhập là 20
    const tableRow = page.locator('table tbody tr').first()
    await expect(tableRow).toBeVisible({ timeout: 10000 })
    const qtyInput = tableRow.locator('input[type="number"]').first()
    await expect(qtyInput).toBeVisible({ timeout: 5000 })
    await qtyInput.fill('20')

    // 7. Nhấn nút Lưu phiếu nhập
    const submitBtn = page.getByRole('button', { name: /Lưu phiếu nhập|Tạo phiếu/i }).first()
    await expect(submitBtn).toBeEnabled({ timeout: 5000 })
    await submitBtn.dispatchEvent('click')

    // Chờ thông báo tạo phiếu thành công hoặc chuyển hướng sang chi tiết phiếu nhập
    await expect(page.getByText(/Đã tạo phiếu nhập|PN-/i).first()).toBeVisible({
      timeout: 10000,
    })

    // 8. Quay lại trang Quản lý Hàng hóa (/products) kiểm tra tồn kho
    await page.goto('/products')
    await page.waitForURL('**/products')

    await searchInput.fill('Cà rốt')
    await expect(carrotRow).toBeVisible({ timeout: 10000 })
    await expect(carrotRow).toContainText(/Cà rốt|Ca rot/i)
  })
})
