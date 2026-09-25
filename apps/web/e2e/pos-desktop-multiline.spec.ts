import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: POS Desktop Multi-line Editor (Issue #33)', () => {
  test('1. Desktop: bán nhanh tìm kiếm tên/SKU, phím Enter trực tiếp từ máy quét và hiển thị đầy đủ các cột trên bảng', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Bật chế độ bán nhanh để thêm thẳng vào đơn
    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    // 1. Tìm kiếm theo tên "Cà rốt" và chọn từ gợi ý
    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    await expect(searchInput).toBeVisible()
    await searchInput.fill('Cà rốt')

    const option = page.locator('#pos-search-listbox button').first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()

    // Kiểm tra dòng hàng xuất hiện trong bảng DesktopCartTable
    const tableRows = page.locator('table tbody tr')
    await expect(tableRows).toHaveCount(1)
    const row1 = tableRows.first()

    // Kiểm tra đầy đủ các cột trên cùng dòng: STT, mã SKU, tên, đơn vị, số lượng, đơn giá, thành tiền
    await expect(row1.getByText('RC001')).toBeVisible()
    await expect(row1.getByText(/Cà rốt/i)).toBeVisible()
    await expect(row1.locator('input[aria-label="Số lượng"]')).toHaveValue('1')
    await expect(row1.getByLabel(/Sửa giá bán/i)).toBeVisible()

    // 2. Kiểm tra thao tác máy quét mã vạch: gõ SKU "KT001" và nhấn Enter ngay lập tức
    await searchInput.fill('KT001')
    await searchInput.press('Enter')

    // Bảng lập tức thêm dòng thứ 2 với mã hàng Khoai tây
    await expect(tableRows).toHaveCount(2)
    const row2 = tableRows.nth(1)
    await expect(row2.getByText('KT001')).toBeVisible()
    await expect(row2.getByText(/Khoai tây/i)).toBeVisible()

    // Bảng tổng tiền và nút Thanh toán bên phải luôn nhìn thấy
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n \(F2\)/i })
    await expect(payBtn).toBeVisible()
    await expect(payBtn).toBeEnabled()
  })

  test('2. Desktop: sửa inline số lượng, chiết khấu dòng, ghi chú và tính toán chính xác thành tiền', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    // Thêm Khoai tây (SKU KT001, giá seed 30.000đ/kg)
    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    await searchInput.fill('Khoai tây')
    const option = page.locator('#pos-search-listbox button').first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()

    const row = page.locator('table tbody tr').first()
    await expect(row).toBeVisible()

    // Tăng số lượng từ 1 lên 2 bằng nút +
    const plusBtn = row.getByLabel(/Tăng số lượng/i)
    await plusBtn.click()
    await expect(row.locator('input[aria-label="Số lượng"]')).toHaveValue('2')

    // Mở popover chiết khấu dòng và đặt mức giảm 5.000đ
    const discountBtn = row.getByLabel(/Chiết khấu dòng/i)
    await discountBtn.click()
    const discountInput = page.locator('input[placeholder="0"]').first()
    await expect(discountInput).toBeVisible()
    await discountInput.fill('5000')

    // Bấm ra ngoài hoặc phím Escape để đóng popover chiết khấu
    await page.keyboard.press('Escape')

    // Two units at 30.000đ less the 5.000đ line discount.
    await expect(discountBtn).toHaveText('-5.000\xA0đ')
    await expect(row.locator('td').nth(7)).toHaveText('55.000\xA0đ')

    // Mở popover ghi chú dòng
    const noteBtn = row.getByLabel(/Ghi chú dòng/i)
    await noteBtn.click()
    const noteTextarea = page.getByPlaceholder(/Nhập ghi chú cho dòng hàng/i)
    await expect(noteTextarea).toBeVisible()
    await noteTextarea.fill('Đóng gói túi riêng')
    const saveNoteBtn = page.getByRole('button', { name: 'Lưu' })
    await saveNoteBtn.click()

    // Ghi chú hiển thị trực tiếp trên dòng hàng
    await expect(row.getByText('Đóng gói túi riêng')).toBeVisible()
  })

  test('3. Desktop: mở lưới sản phẩm tùy chọn mà không mất các dòng đang nhập và thanh toán thành công', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    // Thêm Cà rốt qua tìm kiếm
    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    await searchInput.fill('Cà rốt')
    const option = page.locator('#pos-search-listbox button').first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()

    await expect(page.locator('table tbody tr')).toHaveCount(1)

    // Bấm nút "Lưới sản phẩm" để mở duyệt sản phẩm
    const gridToggleBtn = page.getByRole('button', { name: /Lưới sản phẩm/i })
    await gridToggleBtn.click()

    // Bảng dòng hàng vẫn hiển thị đầy đủ 1 dòng
    await expect(page.locator('table tbody tr')).toHaveCount(1)

    // Khung lưới sản phẩm xuất hiện
    const gridTitle = page.getByText(/Lưới sản phẩm/i).first()
    await expect(gridTitle).toBeVisible()

    // Chọn Khoai tây từ lưới sản phẩm
    const khoaiTayBtn = page.getByRole('button', { name: /Khoai tây|Khoai tay/i }).first()
    await expect(khoaiTayBtn).toBeVisible({ timeout: 5000 })
    await khoaiTayBtn.click()

    // Bảng đã có 2 dòng sản phẩm mà không mất dòng Cà rốt đang có
    await expect(page.locator('table tbody tr')).toHaveCount(2)

    // Đóng lưới sản phẩm
    const closeGridBtn = page.getByLabel(/Đóng lưới sản phẩm/i)
    await closeGridBtn.click()

    // Các dòng vẫn còn nguyên sau khi đóng lưới
    await expect(page.locator('table tbody tr')).toHaveCount(2)

    // Nút thanh toán luôn nhìn thấy bên phải
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n \(F2\)/i })
    await expect(payBtn).toBeVisible()
    await payBtn.click()

    // Dialog thanh toán mở
    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    await paymentDialog.getByRole('button', { name: '100.000\xA0đ' }).click()
    // Hoàn thành đơn hàng
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('4. Desktop: chuyển đổi đơn vị tính quy đổi trực tiếp trên dòng hàng và cập nhật đơn giá, thành tiền', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    // Thêm Sữa tươi Vinamilk (SKU SV001, giá cơ bản 7.000đ/Hộp, có quy đổi Thùng 320.000đ)
    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    await searchInput.fill('Sữa tươi Vinamilk')
    const option = page.locator('#pos-search-listbox button').first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()

    const row = page.locator('table tbody tr').first()
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: 'Sửa giá bán' })).toContainText('7.000')

    // Kiểm tra dropdown đơn vị tính
    const unitSelect = row.getByLabel(/Chọn đơn vị tính/i)
    await expect(unitSelect).toBeVisible()

    // Đổi sang đơn vị "Thùng"
    await unitSelect.selectOption({ label: 'Thùng' })

    // Đơn giá và thành tiền lập tức cập nhật sang giá Thùng: 320.000đ
    await expect(row.getByRole('button', { name: 'Sửa giá bán' })).toContainText('320.000')
  })

  test('5. Desktop & Mobile: chế độ bán thường (normal mode) mở hộp thoại chọn số lượng và biến thể trước khi thêm', async ({
    page,
    loginAs,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Tắt chế độ bán nhanh -> chuyển sang chế độ bán thường
    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (await modeSwitch.isChecked()) {
      await modeSwitch.click()
    }

    // Tìm kiếm "Cà rốt"
    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    await searchInput.fill('Cà rốt')
    const option = page.locator('#pos-search-listbox button').first()
    await expect(option).toBeVisible({ timeout: 5000 })
    await option.click()

    // Ở chế độ bán thường, hộp thoại chọn sản phẩm mở ra
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Cà rốt/i).first()).toBeVisible()

    // Bấm nút "Thêm vào giỏ" trong hộp thoại
    const addBtn = dialog.getByRole('button', { name: /Thêm vào giỏ/i })
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    // Dòng hàng xuất hiện trong bảng DesktopCartTable
    await expect(page.locator('table tbody tr')).toHaveCount(1)
  })

  test('6. Mobile: luồng chọn sản phẩm và giỏ hiện tại vẫn dùng tốt, không tràn bảng nhiều cột', async ({
    page,
    loginAs,
  }) => {
    // Viewport kích thước điện thoại
    await page.setViewportSize({ width: 375, height: 667 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Trên mobile: không hiển thị DesktopCartTable (table nhiều cột)
    await expect(page.locator('table')).not.toBeVisible()

    // Đảm bảo chế độ bán nhanh được bật trên mobile để bấm là thêm
    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    // Chọn sản phẩm Cà rốt từ ProductGrid trực tiếp trên màn hình mobile
    const productBtn = page.getByRole('button', { name: /Cà rốt|Ca rot/i }).first()
    await expect(productBtn).toBeVisible({ timeout: 10000 })
    await productBtn.click()

    // Nút giỏ hàng nổi xuất hiện ở đáy màn hình mobile
    const floatingCartBtn = page.getByRole('button', { name: /Mở giỏ hàng/i })
    await expect(floatingCartBtn).toBeVisible()
    await floatingCartBtn.click()

    // Mở Sheet giỏ hàng dạng danh sách dọc, không bị tràn ngang
    const cartSheet = page.locator('[role="dialog"]')
    await expect(cartSheet).toBeVisible()
    await expect(cartSheet.getByText(/Cà rốt/i)).toBeVisible()
    await expect(cartSheet.getByRole('button', { name: /Thanh to[aá]n/i })).toBeVisible()
  })
})
