import { expect, test } from './fixtures/auth.fixture'

/**
 * GL-07, POS-09: bán hàng cân ký số lẻ tại POS rồi in hóa đơn (ADR-0015).
 * Seed bật "Bán số lẻ" cho Nấm rơm (NR001, 45.000đ/kg); Cà rốt (RC001) không bật.
 */
test.describe('Kiểm thử E2E: bán số lẻ hàng cân ký (GL-07, POS-09)', () => {
  test('bán 1,255 kg Nấm rơm ra 56.475đ, hóa đơn in đúng số lẻ', async ({ page, loginAs }) => {
    // Chụp nội dung mẫu A4 lúc gọi window.print thay vì mở hộp thoại in thật
    await page.addInitScript(() => {
      const w = window as unknown as { __printed: string[] }
      w.__printed = []
      window.print = () => {
        w.__printed.push(document.getElementById('print-invoice-a4')?.textContent ?? '')
        window.dispatchEvent(new Event('afterprint'))
      }
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginAs('owner')
    await page.goto('/pos')
    await page.waitForURL('**/pos')

    const modeSwitch = page.getByLabel(/Chế độ bán nhanh/i)
    if (!(await modeSwitch.isChecked())) {
      await modeSwitch.click()
    }

    const searchInput = page.getByPlaceholder(/Tìm theo tên, mã hàng hoặc mã vạch/i)
    const rows = page.locator('table tbody tr')

    // Hàng không bật cờ: gõ số lẻ bị trả về số cũ
    await searchInput.fill('RC001')
    await searchInput.press('Enter')
    await expect(rows).toHaveCount(1)
    const carrotQty = rows.first().locator('input[aria-label="Số lượng"]')
    await carrotQty.fill('1,5')
    await carrotQty.press('Enter')
    await expect(carrotQty).toHaveValue('1')
    await rows
      .first()
      .getByLabel(/Xoá sản phẩm/i)
      .click()
    await expect(rows).toHaveCount(0)

    // Hàng cân ký: nhận "1,255" kiểu Việt Nam, thành tiền làm tròn về đồng
    await searchInput.fill('NR001')
    await searchInput.press('Enter')
    await expect(rows).toHaveCount(1)
    const row = rows.first()
    await expect(row.getByText(/Nấm rơm/i)).toBeVisible()
    const qtyInput = row.locator('input[aria-label="Số lượng"]')
    await qtyInput.fill('1,255')
    await qtyInput.press('Enter')
    await expect(qtyInput).toHaveValue('1,255')
    await expect(row.getByText('56.475', { exact: false }).first()).toBeVisible()

    // Thanh toán tiền mặt
    const payBtn = page.getByRole('button', { name: /Thanh to[aá]n \(F2\)/i })
    await expect(payBtn).toBeEnabled()
    await payBtn.click()
    const paymentDialog = page.getByRole('dialog')
    await expect(paymentDialog.getByRole('heading', { name: /Thanh to[aá]n/i })).toBeVisible()
    await expect(paymentDialog.getByText(/56\.475/).first()).toBeVisible()
    const denominationBtn = paymentDialog
      .locator('button')
      .filter({ hasText: /100\.000|200\.000|500\.000/i })
      .first()
    if (await denominationBtn.isVisible().catch(() => false)) {
      await denominationBtn.click()
    } else {
      await paymentDialog.locator('input[placeholder="0"]').first().fill('100000')
    }
    const completeBtn = paymentDialog.getByRole('button', { name: /Hoàn thành|Hoan thanh/i })
    await expect(completeBtn).toBeEnabled({ timeout: 5000 })
    await completeBtn.click()

    const completion = page.getByRole('dialog')
    await expect(completion.getByRole('button', { name: /In hoá đơn/i })).toBeVisible({
      timeout: 10000,
    })

    // In A4 qua trình duyệt
    await completion.getByRole('button', { name: 'Tùy chọn in' }).click()
    await page.getByRole('menuitem', { name: 'In A4' }).click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed))
      .toHaveLength(1)
    const [printed] = await page.evaluate(
      () => (window as unknown as { __printed: string[] }).__printed,
    )
    expect(printed).toContain('Nấm rơm')
    expect(printed).toContain('1,255')
    expect(printed).toContain('56.475')
    expect(printed).not.toContain('1.255')
  })
})
