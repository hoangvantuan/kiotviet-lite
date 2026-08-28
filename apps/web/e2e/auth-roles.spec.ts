import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Đăng nhập và Phân quyền hiển thị Menu theo Vai trò', () => {
  test('1. Chủ cửa hàng (Owner): Đăng nhập thành công và thấy toàn bộ danh mục menu', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Danh sách menu mà Owner có quyền thấy
    const expectedOwnerMenus = [
      'Tổng quan',
      'Bán hàng',
      'Hóa đơn',
      'Hàng hóa',
      'Danh mục',
      'Khách hàng',
      'Phiếu thu',
      'Bảng giá',
      'Nhà cung cấp',
      'Phiếu nhập kho',
      'Phiếu chi NCC',
      'Kiểm kho',
      'Dashboard',
      'Doanh thu',
      'Lợi nhuận',
      'Tồn kho',
      'Giá',
      'Công nợ',
      'Cài đặt',
    ]

    for (const menuName of expectedOwnerMenus) {
      await expect(sidebar.getByText(menuName, { exact: true })).toBeVisible()
    }
  })

  test('2. Quản lý (Manager): Đăng nhập thành công và thấy các menu quản lý và báo cáo', async ({
    page,
    loginAs,
  }) => {
    await loginAs('manager')

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    const expectedManagerMenus = [
      'Tổng quan',
      'Bán hàng',
      'Hóa đơn',
      'Hàng hóa',
      'Danh mục',
      'Khách hàng',
      'Phiếu thu',
      'Bảng giá',
      'Nhà cung cấp',
      'Phiếu nhập kho',
      'Phiếu chi NCC',
      'Kiểm kho',
      'Dashboard',
      'Doanh thu',
      'Lợi nhuận',
      'Tồn kho',
      'Giá',
      'Công nợ',
      'Cài đặt',
    ]

    for (const menuName of expectedManagerMenus) {
      await expect(sidebar.getByText(menuName, { exact: true })).toBeVisible()
    }
  })

  test('3. Nhân viên thu ngân (Staff): Đăng nhập thành công, chỉ thấy menu được phân quyền', async ({
    page,
    loginAs,
  }) => {
    await loginAs('staff')

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Staff chỉ được thấy các menu: Tổng quan, Bán hàng, Hóa đơn, Cài đặt
    const allowedStaffMenus = ['Tổng quan', 'Bán hàng', 'Hóa đơn', 'Cài đặt']
    for (const menuName of allowedStaffMenus) {
      await expect(sidebar.getByText(menuName, { exact: true })).toBeVisible()
    }

    // Staff không được thấy các menu quản lý nâng cao và báo cáo
    const hiddenStaffMenus = [
      'Hàng hóa',
      'Danh mục',
      'Khách hàng',
      'Phiếu thu',
      'Bảng giá',
      'Nhà cung cấp',
      'Phiếu nhập kho',
      'Phiếu chi NCC',
      'Kiểm kho',
      'Dashboard',
      'Doanh thu',
      'Lợi nhuận',
      'Tồn kho',
      'Giá',
      'Công nợ',
    ]

    for (const menuName of hiddenStaffMenus) {
      await expect(sidebar.getByText(menuName, { exact: true })).not.toBeVisible()
    }
  })
})
