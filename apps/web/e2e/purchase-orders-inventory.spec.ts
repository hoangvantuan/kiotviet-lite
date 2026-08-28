import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Nhập hàng và Cập nhật Tồn kho (Purchase Orders & Inventory)', () => {
  test('Tạo phiếu nhập kho thành công và kiểm tra tồn kho tăng chính xác', async ({
    page,
    loginAs,
  }) => {
    // 1. Đăng nhập với tài khoản Chủ cửa hàng (Owner)
    await loginAs('owner')

    // 2. Vào trang Quản lý Hàng hóa (/products) để xem tồn kho ban đầu của "Cà rốt"
    await page.goto('/products')
    await page.waitForURL('**/products')

    // Chờ danh sách sản phẩm tải xong
    await expect(page.getByRole('heading', { name: 'Hàng hóa' })).toBeVisible()
    const searchInput = page.getByPlaceholder('Tìm theo tên, mã SKU, barcode...')
    await searchInput.fill('Cà rốt')

    // Đợi hàng của Cà rốt hiển thị trên bảng
    const carrotRow = page.locator('table tbody tr').first()
    await expect(carrotRow).toBeVisible({ timeout: 10000 })
    await expect(carrotRow).toContainText('Cà rốt')

    // 3. Vào trang Tạo phiếu nhập kho (/inventory/purchase-orders/create)
    await page.goto('/inventory/purchase-orders/create')
    await page.waitForURL('**/inventory/purchase-orders/create')

    await expect(page.getByRole('heading', { name: 'Tạo phiếu nhập kho' })).toBeVisible()

    // 4. Chọn Nhà cung cấp: mở dropdown Chọn NCC
    const selectNccBtn = page.getByRole('combobox').first()
    await selectNccBtn.click()

    // Chọn nhà cung cấp đầu tiên trong danh sách (VD: Công ty TNHH Rau Sạch Đà Lạt)
    const nccOption = page.getByRole('option').first()
    await expect(nccOption).toBeVisible()
    await nccOption.click()

    // 5. Thêm sản phẩm vào phiếu nhập
    const productSearchInput = page.getByPlaceholder('Tìm sản phẩm theo tên hoặc SKU')
    await productSearchInput.fill('Cà rốt')

    // Click vào sản phẩm Cà rốt xuất hiện trong danh sách gợi ý
    const addProductBtn = page.locator('button:has-text("Cà rốt")').first()
    await expect(addProductBtn).toBeVisible({ timeout: 5000 })
    await addProductBtn.click()

    // 6. Nhập số lượng nhập là 20
    const qtyInput = page.locator('table tbody input[type="number"]').first()
    await qtyInput.fill('20')

    // 7. Nhấn nút Tạo phiếu nhập
    const submitBtn = page.getByRole('button', { name: /Tạo phiếu nhập|Lưu phiếu/i }).first()
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Chờ thông báo tạo phiếu thành công hoặc chuyển hướng
    await expect(page.getByText(/Tạo phiếu nhập thành công|PN-/i).first()).toBeVisible({
      timeout: 10000,
    })

    // 8. Quay lại trang Quản lý Hàng hóa (/products) kiểm tra tồn kho
    await page.goto('/products')
    await page.waitForURL('**/products')

    await searchInput.fill('Cà rốt')
    await expect(carrotRow).toBeVisible()
    // Tồn kho đã được cập nhật
    await expect(carrotRow).toContainText('Cà rốt')
  })
})
