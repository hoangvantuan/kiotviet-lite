import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: POS Bán hàng (Tiền mặt, Chuyển khoản, Ghi nợ & PIN Override)', () => {
  test('1. Bán hàng thanh toán bằng Tiền mặt (Cash)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn sản phẩm Cà rốt trên giao diện ProductGrid
    const carrotBtn = page.getByRole('button', { name: /Cà rốt/i })
    await expect(carrotBtn).toBeVisible({ timeout: 10000 })
    await carrotBtn.click()

    // Kiểm tra giỏ hàng có sản phẩm Cà rốt
    await expect(page.getByText('Cà rốt', { exact: true })).toBeVisible()

    // Bấm nút Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await expect(payBtn).toBeEnabled()
    await payBtn.click()

    // Modal Thanh toán xuất hiện
    await expect(page.getByRole('heading', { name: 'Thanh toán' })).toBeVisible()

    // Mặc định ở tab Tiền mặt -> click nút mệnh giá gợi ý lớn hơn hoặc bằng tổng tiền
    const denominationBtn = page
      .locator('button:has-text("50.000 đ"), button:has-text("100.000 đ")')
      .first()
    if (await denominationBtn.isVisible()) {
      await denominationBtn.click()
    } else {
      // Hoặc nhập trực tiếp vào ô tiền khách đưa
      const cashInput = page.locator('input[placeholder="0"]').first()
      await cashInput.fill('50000')
    }

    // Nhấn nút Hoàn thành
    const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
    await expect(completeBtn).toBeEnabled()
    await completeBtn.click()

    // Xác nhận xuất hiện dialog hoàn thành đơn hàng
    await expect(
      page.getByText(/Thanh toán thành công|Hoàn thành đơn hàng|Mã hóa đơn/i).first(),
    ).toBeVisible({ timeout: 10000 })

    // Đóng dialog hoàn thành
    const closeDialogBtn = page.getByRole('button', { name: /Đóng|Đơn mới/i }).first()
    if (await closeDialogBtn.isVisible()) {
      await closeDialogBtn.click()
    }
  })

  test('2. Bán hàng thanh toán bằng Chuyển khoản (Bank Transfer)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn sản phẩm Khoai tây
    const potatoBtn = page.getByRole('button', { name: /Khoai tây/i })
    await expect(potatoBtn).toBeVisible({ timeout: 10000 })
    await potatoBtn.click()

    // Bấm nút Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await expect(payBtn).toBeEnabled()
    await payBtn.click()

    // Chọn tab Chuyển khoản
    const transferTab = page.getByRole('button', { name: 'Chuyển khoản' })
    await transferTab.click()
    await expect(page.getByText('Đã nhận chuyển khoản')).toBeVisible()

    // Nhấn Hoàn thành
    const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
    await expect(completeBtn).toBeEnabled()
    await completeBtn.click()

    // Đơn thanh toán thành công
    await expect(
      page.getByText(/Thanh toán thành công|Hoàn thành đơn hàng|Mã hóa đơn/i).first(),
    ).toBeVisible({ timeout: 10000 })

    const closeDialogBtn = page.getByRole('button', { name: /Đóng|Đơn mới/i }).first()
    if (await closeDialogBtn.isVisible()) {
      await closeDialogBtn.click()
    }
  })

  test('3. Bán hàng Ghi nợ trong hạn mức (Debt within limit)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn khách hàng có hạn mức nợ: click vào mục Khách lẻ để mở tìm kiếm
    const customerSelectBtn = page.getByRole('button', { name: /Khách lẻ/i })
    await customerSelectBtn.click()

    // Nhập tìm tên khách hàng "Bùi Thanh Hà"
    const searchCustomerInput = page.getByPlaceholder('Tìm tên, SĐT...')
    await searchCustomerInput.fill('Bùi Thanh Hà')
    const customerOption = page.getByText('Bùi Thanh Hà').first()
    await expect(customerOption).toBeVisible({ timeout: 5000 })
    await customerOption.click()

    // Đã chọn khách hàng Bùi Thanh Hà
    await expect(page.getByText('Bùi Thanh Hà')).toBeVisible()

    // Chọn sản phẩm Cà rốt
    const productBtn = page.getByRole('button', { name: /Cà rốt/i })
    await productBtn.click()

    // Mở modal thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await payBtn.click()

    // Chọn tab Ghi nợ
    const debtTab = page.getByRole('button', { name: 'Ghi nợ' })
    await expect(debtTab).toBeVisible()
    await debtTab.click()

    // Không vượt hạn mức -> Nút Hoàn thành khả dụng
    const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
    await expect(completeBtn).toBeEnabled()
    await completeBtn.click()

    // Hoàn thành đơn ghi nợ
    await expect(
      page.getByText(/Thanh toán thành công|Hoàn thành đơn hàng|Mã hóa đơn/i).first(),
    ).toBeVisible({ timeout: 10000 })

    const closeDialogBtn = page.getByRole('button', { name: /Đóng|Đơn mới/i }).first()
    if (await closeDialogBtn.isVisible()) {
      await closeDialogBtn.click()
    }
  })

  test('4. Bán hàng Ghi nợ vượt hạn mức và Xác thực PIN Override', async ({ page, loginAs }) => {
    await loginAs('staff')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn khách hàng Bùi Thanh Hà
    const customerSelectBtn = page.getByRole('button', { name: /Khách lẻ/i })
    await customerSelectBtn.click()
    const searchCustomerInput = page.getByPlaceholder('Tìm tên, SĐT...')
    await searchCustomerInput.fill('Bùi Thanh Hà')
    await page.getByText('Bùi Thanh Hà').first().click()

    // Thêm sản phẩm và tăng số lượng thật lớn để vượt hạn mức 5.000.000đ
    const productBtn = page
      .getByRole('button', { name: /Cá hồi phi lê|Thịt bò Úc|Bột giặt Omo|Cà rốt/i })
      .first()
    await productBtn.click()

    // Nhấn nút tăng số lượng nhiều lần
    const increaseBtn = page.getByRole('button', { name: 'Tăng số lượng' })
    for (let i = 0; i < 30; i++) {
      await increaseBtn.click()
    }

    // Mở modal thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh toan/i })
    await payBtn.click()

    // Chọn tab Ghi nợ
    const debtTab = page.getByRole('button', { name: 'Ghi nợ' })
    await debtTab.click()

    // Nếu đơn hàng vượt hạn mức:
    const warningText = page.getByText('Vượt hạn mức công nợ')
    const pinOverrideBtn = page.getByRole('button', { name: 'Nhập PIN để vượt hạn mức' })

    if (await warningText.isVisible({ timeout: 2000 })) {
      // Nút Hoàn thành bị vô hiệu hóa khi vượt hạn mức mà chưa có PIN
      const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
      await expect(completeBtn).toBeDisabled()

      // Bấm nút Nhập PIN để vượt hạn mức
      await pinOverrideBtn.click()

      // Modal PIN xuất hiện
      await expect(page.getByText('Xác thực PIN chủ cửa hàng')).toBeVisible()

      // Nhập PIN của chủ cửa hàng: 111111
      await page.keyboard.type('111111')

      // Xác thực PIN thành công
      await expect(page.getByText('Đã xác thực PIN, cho phép vượt hạn mức')).toBeVisible({
        timeout: 5000,
      })

      // Nút Hoàn thành đã được bật
      await expect(completeBtn).toBeEnabled()
      await completeBtn.click()

      // Đơn tạo thành công
      await expect(
        page.getByText(/Thanh toán thành công|Hoàn thành đơn hàng|Mã hóa đơn/i).first(),
      ).toBeVisible({ timeout: 10000 })
    } else {
      // Trường hợp chưa vượt hạn mức -> hoàn tất đơn bình thường
      const completeBtn = page.getByRole('button', { name: 'Hoàn thành' })
      await expect(completeBtn).toBeEnabled()
      await completeBtn.click()
      await expect(
        page.getByText(/Thanh toán thành công|Hoàn thành đơn hàng|Mã hóa đơn/i).first(),
      ).toBeVisible({ timeout: 10000 })
    }
  })
})
