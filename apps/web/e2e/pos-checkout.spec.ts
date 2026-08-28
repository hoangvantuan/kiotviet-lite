import { expect, type Page, test } from './fixtures/auth.fixture'

/**
 * Trợ giúp thêm sản phẩm vào giỏ POS
 */
async function addProductToCart(page: Page, productNameRegex: RegExp) {
  const productBtn = page.getByRole('button', { name: productNameRegex }).first()
  await expect(productBtn).toBeVisible({ timeout: 10000 })
  await productBtn.click()

  // Nếu có dialog chọn số lượng / biến thể thì bấm Thêm vào giỏ
  const addToCartBtn = page.getByRole('button', { name: /Thêm vào giỏ|Them vao gio/i })
  if (await addToCartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addToCartBtn.click()
  }
}

test.describe('Kiểm thử E2E: POS Bán hàng (Tiền mặt, Chuyển khoản, Ghi nợ & PIN Override)', () => {
  test('1. Bán hàng thanh toán bằng Tiền mặt (Cash)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn sản phẩm Cà rốt trên giao diện ProductGrid
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Bấm nút Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    // Modal Thanh toán xuất hiện
    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()

    // Click nút mệnh giá tiền mặt bên trong dialog thanh toán
    const denominationBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000|200\.000/i })
      .first()
    if (await denominationBtn.isVisible().catch(() => false)) {
      await denominationBtn.click()
    } else {
      const cashInput = paymentDialog.locator('input[placeholder="0"]').first()
      await cashInput.fill('100000')
    }

    // Nhấn nút Hoàn thành
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Xác nhận xuất hiện dialog hoàn thành đơn hàng
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })

    // Đóng dialog hoặc bấm Đơn hàng mới
    const newOrderBtn = page
      .getByRole('button', { name: /Đơn hàng mới|Đ[oơ]n m[oớ]i|Đ[oó]ng/i })
      .first()
    if (await newOrderBtn.isVisible().catch(() => false)) {
      await newOrderBtn.click()
    }
  })

  test('2. Bán hàng thanh toán bằng Chuyển khoản (Bank Transfer)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn sản phẩm Khoai tây
    await addProductToCart(page, /Khoai tây|Khoai tay/i)

    // Bấm nút Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    // Chọn tab Chuyển khoản trong modal
    const paymentDialog = page.getByRole('dialog')
    const transferTab = paymentDialog.getByRole('button', { name: /Chuy[eể]n kho[aả]n/i })
    await transferTab.click()
    await expect(
      paymentDialog.getByText(/Đã nhận chuyển khoản|Da nhan chuyen khoan/i),
    ).toBeVisible()

    // Nhấn Hoàn thành
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled()
    await completeBtn.click()

    // Đơn thanh toán thành công
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })

    const newOrderBtn = page
      .getByRole('button', { name: /Đơn hàng mới|Đ[oơ]n m[oớ]i|Đ[oó]ng/i })
      .first()
    if (await newOrderBtn.isVisible().catch(() => false)) {
      await newOrderBtn.click()
    }
  })

  test('3. Bán hàng Ghi nợ trong hạn mức (Debt within limit)', async ({ page, loginAs }) => {
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn khách hàng có hạn mức nợ 5.000.000đ: "Bùi Thanh Hà"
    const customerSelectBtn = page.getByRole('button', { name: /Kh[aá]ch l[eẻ]/i })
    await customerSelectBtn.click()

    const searchCustomerInput = page.getByPlaceholder(/T[iì]m t[eê]n/i)
    await searchCustomerInput.fill('Bùi Thanh Hà')
    const customerOption = page.getByText(/Bùi Thanh Hà|Bui Thanh Ha/i).first()
    await expect(customerOption).toBeVisible({ timeout: 5000 })
    await customerOption.click()

    // Đã chọn khách hàng Bùi Thanh Hà
    await expect(page.getByText(/Bùi Thanh Hà|Bui Thanh Ha/i).first()).toBeVisible()

    // Chọn 1 sản phẩm Cà rốt (giá 25.000đ)
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Mở modal thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    // Chọn tab Ghi nợ
    const paymentDialog = page.getByRole('dialog')
    const debtTab = paymentDialog.getByRole('button', { name: /Ghi n[oợ]/i })
    await expect(debtTab).toBeVisible()
    await debtTab.click()

    // Đợi tải thông tin công nợ xong
    await expect(paymentDialog.getByText(/Phần ghi nợ/i)).toBeVisible({ timeout: 10000 })

    // Không vượt hạn mức -> Nút Hoàn thành khả dụng
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Hoàn thành đơn ghi nợ
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })

    const newOrderBtn = page
      .getByRole('button', { name: /Đơn hàng mới|Đ[oơ]n m[oớ]i|Đ[oó]ng/i })
      .first()
    if (await newOrderBtn.isVisible().catch(() => false)) {
      await newOrderBtn.click()
    }
  })

  test('4. Bán hàng Ghi nợ vượt hạn mức và Xác thực PIN Override', async ({ page, loginAs }) => {
    // Đăng nhập bằng chủ cửa hàng (owner) có mã PIN: 111111
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    // Chọn khách hàng Bùi Thanh Hà (hạn mức 5.000.000đ)
    const customerSelectBtn = page.getByRole('button', { name: /Kh[aá]ch l[eẻ]/i })
    await customerSelectBtn.click()
    const searchCustomerInput = page.getByPlaceholder(/T[iì]m t[eê]n/i)
    await searchCustomerInput.fill('Bùi Thanh Hà')
    await page
      .getByText(/Bùi Thanh Hà|Bui Thanh Ha/i)
      .first()
      .click()

    // Thêm sản phẩm Cá hồi phi lê (350.000đ) 16 lần để tổng tiền đạt 5.600.000đ > hạn mức 5.000.000đ
    for (let i = 0; i < 16; i++) {
      await addProductToCart(page, /Cá hồi phi lê|Ca hoi phi le/i)
    }

    // Mở modal thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    // Chọn tab Ghi nợ
    const paymentDialog = page.getByRole('dialog')
    const debtTab = paymentDialog.getByRole('button', { name: /Ghi n[oợ]/i })
    await debtTab.click()

    // Chờ tải thông tin công nợ và kiểm tra cảnh báo vượt hạn mức xuất hiện
    const warningText = paymentDialog.getByText(/Vượt hạn mức công nợ/i)
    await expect(warningText).toBeVisible({ timeout: 15000 })

    // Nút Hoàn thành bị vô hiệu hóa khi chưa có PIN
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeDisabled()

    // Bấm nút Nhập PIN để vượt hạn mức
    const pinOverrideBtn = paymentDialog.getByRole('button', { name: /Nhập PIN để vượt hạn mức/i })
    await pinOverrideBtn.click()

    // Modal PIN xuất hiện
    const pinDialog = page.getByRole('dialog').filter({ hasText: /Xác thực PIN|Nhập mã PIN/i })
    await expect(pinDialog).toBeVisible({ timeout: 5000 })

    // Nhập PIN của chủ cửa hàng: 111111 qua OTP input
    const otpInput = pinDialog.locator('input').first()
    if (await otpInput.isVisible().catch(() => false)) {
      await otpInput.focus()
      await otpInput.pressSequentially('111111', { delay: 80 })
    } else {
      await page.keyboard.type('111111', { delay: 80 })
    }

    // Xác thực PIN thành công và cho phép vượt hạn mức
    await expect(paymentDialog.getByText(/Đã xác thực PIN, cho phép vượt hạn mức/i)).toBeVisible({
      timeout: 10000,
    })

    // Nút Hoàn thành đã được bật sau khi xác thực PIN
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Đơn tạo thành công
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })
  })
})
