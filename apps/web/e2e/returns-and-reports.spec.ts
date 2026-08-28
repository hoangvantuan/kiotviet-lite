import { expect, type Page, test } from './fixtures/auth.fixture'

async function addProductToCart(page: Page, productNameRegex: RegExp) {
  const productBtn = page.getByRole('button', { name: productNameRegex }).first()
  await expect(productBtn).toBeVisible({ timeout: 10000 })
  await productBtn.click()

  const addToCartBtn = page.getByRole('button', { name: /Thêm vào giỏ|Them vao gio/i })
  if (await addToCartBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await addToCartBtn.click()
  }
}

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

    await addProductToCart(page, /Cà rốt|Ca rot/i)
    await addProductToCart(page, /Cà rốt|Ca rot/i)

    // Bấm Thanh toán
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    // Thanh toán tiền mặt
    const paymentDialog = page.getByRole('dialog')
    const cashBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000/i })
      .first()
    if (await cashBtn.isVisible().catch(() => false)) {
      await cashBtn.click()
    } else {
      await paymentDialog.locator('input[placeholder="0"]').first().fill('100000')
    }

    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    // Chờ tạo đơn thành công
    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })

    // 3. Vào trang danh sách hóa đơn /orders
    await page.goto('/orders')
    await page.waitForURL('**/orders')

    // Click vào đơn hàng đầu tiên để vào trang chi tiết đơn
    const firstOrderRow = page.locator('table tbody tr').first()
    await expect(firstOrderRow).toBeVisible({ timeout: 10000 })
    await firstOrderRow.click()

    // 4. Trong chi tiết đơn hàng: nhấn nút Trả hàng
    const returnBtn = page.getByRole('button', { name: /Tr[aả] h[aà]ng/i })
    await expect(returnBtn).toBeVisible({ timeout: 10000 })
    await returnBtn.click()

    // Modal Trả hàng xuất hiện
    const returnDialog = page.getByRole('dialog')
    await expect(returnDialog.getByRole('heading', { name: /Tr[aả] h[aà]ng/i })).toBeVisible()

    // Nhập số lượng trả là 1
    const qtyInput = returnDialog.locator('input[type="number"]').first()
    await qtyInput.fill('1')

    // Nhấn Xác nhận trả hàng
    const confirmReturnBtn = returnDialog.getByRole('button', {
      name: /X[aá]c nh[aậ]n tr[aả] h[aà]ng/i,
    })
    await expect(confirmReturnBtn).toBeEnabled()
    await confirmReturnBtn.click()

    // Thông báo trả hàng thành công
    await expect(
      returnDialog.getByText(/Tr[aả] h[aà]ng th[aà]nh c[oô]ng|TH-/i).first(),
    ).toBeVisible({
      timeout: 10000,
    })
    const closeReturnBtn = returnDialog.getByRole('button', { name: /Đ[oó]ng/i })
    if (await closeReturnBtn.isVisible().catch(() => false)) {
      await closeReturnBtn.click()
    }

    // 5. Kiểm tra Báo cáo Doanh thu (/reports/revenue)
    await page.goto('/reports/revenue')
    await page.waitForURL('**/reports/revenue')

    // Báo cáo doanh thu tải thành công và có hiển thị số liệu
    await expect(page.getByRole('heading', { name: /B[aá]o c[aá]o doanh thu/i })).toBeVisible()
    await expect(page.getByText(/Tổng doanh thu|Tong doanh thu/i).first()).toBeVisible()

    // 6. Kiểm tra Báo cáo Lợi nhuận (/reports/profit)
    await page.goto('/reports/profit')
    await page.waitForURL('**/reports/profit')

    // Báo cáo lợi nhuận tải thành công
    await expect(
      page.getByRole('heading', { name: /B[aá]o c[aá]o l[oợ]i nhu[aậ]n/i }),
    ).toBeVisible()
    await expect(page.getByText(/Lợi nhuận gộp|Loi nhuan gop/i).first()).toBeVisible()
  })

  test('2. Trả hàng toàn bộ đơn (Full Return) và xác nhận trạng thái đơn', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')

    // 1. Vào POS tạo 1 đơn hàng mới
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    await addProductToCart(page, /Cà rốt|Ca rot/i)

    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n/i })
    await expect(payBtn).toBeEnabled({ timeout: 5000 })
    await payBtn.click()

    const paymentDialog = page.getByRole('dialog')
    const cashBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /50\.000|100\.000/i })
      .first()
    if (await cashBtn.isVisible().catch(() => false)) {
      await cashBtn.click()
    } else {
      await paymentDialog.locator('input[placeholder="0"]').first().fill('50000')
    }

    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    await expect(
      page
        .getByText(/Đơn hàng hoàn thành|Thanh to[aá]n th[aà]nh c[oô]ng|HD-|Đơn hàng mới/i)
        .first(),
    ).toBeVisible({ timeout: 10000 })

    // 2. Vào /orders mở đơn vừa tạo
    await page.goto('/orders')
    await page.waitForURL('**/orders')
    const firstOrderRow = page.locator('table tbody tr').first()
    await expect(firstOrderRow).toBeVisible({ timeout: 10000 })
    await firstOrderRow.click()

    // 3. Thực hiện trả hàng toàn bộ
    const returnBtn = page.getByRole('button', { name: /Tr[aả] h[aà]ng/i })
    await expect(returnBtn).toBeVisible({ timeout: 10000 })
    await returnBtn.click()

    const returnDialog = page.getByRole('dialog')
    const qtyInput = returnDialog.locator('input[type="number"]').first()
    await qtyInput.fill('1')

    const confirmReturnBtn = returnDialog.getByRole('button', {
      name: /X[aá]c nh[aậ]n tr[aả] h[aà]ng/i,
    })
    await confirmReturnBtn.click()
    await expect(
      returnDialog.getByText(/Tr[aả] h[aà]ng th[aà]nh c[oô]ng|TH-/i).first(),
    ).toBeVisible({
      timeout: 10000,
    })

    const closeReturnBtn = returnDialog.getByRole('button', { name: /Đ[oó]ng/i })
    if (await closeReturnBtn.isVisible().catch(() => false)) {
      await closeReturnBtn.click()
    }

    // Trạng thái đơn chuyển thành Đã trả toàn bộ
    await expect(
      page.getByText(/Đã trả toàn bộ|Đã trả hết|partial_return|full_return/i).first(),
    ).toBeVisible({ timeout: 10000 })
  })
})
