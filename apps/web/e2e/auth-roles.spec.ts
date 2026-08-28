import { expect, test } from './fixtures/auth.fixture'

test.describe('Kiểm thử E2E: Đăng nhập và Phân quyền hiển thị Menu theo Vai trò', () => {
  test('1. Chủ cửa hàng (Owner): Đăng nhập thành công và thấy toàn bộ danh mục menu', async ({
    page,
    loginAs,
  }) => {
    await loginAs('owner')

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Danh sách menu mà Owner có quyền thấy (sử dụng regex chấp nhận cả có dấu và không dấu)
    const expectedOwnerMenuPatterns = [
      /Tổng quan|Tong quan/i,
      /Bán hàng|Ban hang/i,
      /Hóa đơn|Hoa don/i,
      /Hàng hóa|Hang hoa/i,
      /Danh mục|Danh muc/i,
      /Khách hàng|Khach hang/i,
      /Phiếu thu|Phieu thu/i,
      /Bảng giá|Bang gia/i,
      /Nhà cung cấp|Nha cung cap/i,
      /Phiếu nhập kho|Phieu nhap kho/i,
      /Phiếu chi NCC|Phieu chi NCC/i,
      /Kiểm kho|Kiem kho/i,
      /Dashboard/i,
      /Doanh thu/i,
      /Lợi nhuận|Loi nhuan/i,
      /Tồn kho|Ton kho/i,
      /Giá|Gia/i,
      /Công nợ|Cong no/i,
      /Cài đặt|Cai dat/i,
    ]

    for (const pattern of expectedOwnerMenuPatterns) {
      await expect(sidebar.getByText(pattern).first()).toBeVisible()
    }
  })

  test('2. Quản lý (Manager): Đăng nhập thành công và thấy các menu quản lý và báo cáo', async ({
    page,
    loginAs,
  }) => {
    await loginAs('manager')

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    const expectedManagerMenuPatterns = [
      /Tổng quan|Tong quan/i,
      /Bán hàng|Ban hang/i,
      /Hóa đơn|Hoa don/i,
      /Hàng hóa|Hang hoa/i,
      /Danh mục|Danh muc/i,
      /Khách hàng|Khach hang/i,
      /Phiếu thu|Phieu thu/i,
      /Bảng giá|Bang gia/i,
      /Nhà cung cấp|Nha cung cap/i,
      /Phiếu nhập kho|Phieu nhap kho/i,
      /Phiếu chi NCC|Phieu chi NCC/i,
      /Kiểm kho|Kiem kho/i,
      /Dashboard/i,
      /Doanh thu/i,
      /Lợi nhuận|Loi nhuan/i,
      /Tồn kho|Ton kho/i,
      /Giá|Gia/i,
      /Công nợ|Cong no/i,
      /Cài đặt|Cai dat/i,
    ]

    for (const pattern of expectedManagerMenuPatterns) {
      await expect(sidebar.getByText(pattern).first()).toBeVisible()
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
    const allowedStaffMenuPatterns = [
      /Tổng quan|Tong quan/i,
      /Bán hàng|Ban hang/i,
      /Hóa đơn|Hoa don/i,
      /Cài đặt|Cai dat/i,
    ]
    for (const pattern of allowedStaffMenuPatterns) {
      await expect(sidebar.getByText(pattern).first()).toBeVisible()
    }

    // Staff không được thấy các menu quản lý hàng hóa, đối tác và báo cáo
    const hiddenStaffMenuPatterns = [
      /Hàng hóa|Hang hoa/i,
      /Danh mục|Danh muc/i,
      /Khách hàng|Khach hang/i,
      /Phiếu thu|Phieu thu/i,
      /Bảng giá|Bang gia/i,
      /Nhà cung cấp|Nha cung cap/i,
      /Phiếu nhập kho|Phieu nhap kho/i,
      /Phiếu chi NCC|Phieu chi NCC/i,
      /Kiểm kho|Kiem kho/i,
      /Dashboard/i,
      /Doanh thu/i,
      /Lợi nhuận|Loi nhuan/i,
      /Tồn kho|Ton kho/i,
      /Giá|Gia/i,
      /Công nợ|Cong no/i,
    ]

    for (const pattern of hiddenStaffMenuPatterns) {
      await expect(sidebar.getByText(pattern)).not.toBeVisible()
    }
  })
})
