# Epic List

## Epic 1: Khởi tạo dự án & Quản trị cửa hàng
Owner đăng ký cửa hàng, đăng nhập, quản lý nhân viên, phân quyền 3 vai trò. Nền tảng monorepo, design tokens, base components, auth system.
**FRs:** FR65, FR66, FR67
**ARs:** AR1-AR14, AR20-AR22, AR24, AR27-AR29
**UX-DRs:** UX-DR1-5, UX-DR14-17, UX-DR20

## Epic 2: Quản lý Hàng hóa
Owner tạo/sửa/xoá sản phẩm, biến thể (2 thuộc tính), danh mục 2 cấp, đơn vị quy đổi, theo dõi tồn kho, cảnh báo hết hàng, giá vốn BQ gia quyền.
**FRs:** FR1, FR2, FR3, FR4, FR5, FR6, FR7
**UX-DRs:** UX-DR17, UX-DR21

## Epic 3: Bán hàng (POS) — Luồng bán lẻ
Nhân viên bán hàng cho khách vãng lai: tìm SP autocomplete, quét barcode camera, grid sản phẩm, giỏ hàng, chiết khấu, thanh toán tiền mặt/CK/QR, đa tab (5), phím tắt, auto mở đơn mới.
**FRs:** FR26, FR27, FR29, FR30 (trừ ghi nợ), FR32, FR33, FR34, FR35
**UX-DRs:** UX-DR6, UX-DR7, UX-DR13, UX-DR19

## Epic 4: Khách hàng & Hệ thống Đơn giá
Owner quản lý KH + nhóm KH, tạo bảng giá chain formula, 6 tầng ưu tiên, cascade, so sánh giá. POS tự áp giá đúng khi chọn KH, hiển thị nguồn giá. Tạo KH nhanh từ POS.
**FRs:** FR13-FR25, FR28, FR40-FR45
**UX-DRs:** UX-DR8, UX-DR10

## Epic 5: Quản lý Công nợ
Nhân viên ghi nợ toàn bộ/1 phần khi bán hàng, hệ thống kiểm tra hạn mức + PIN override. Phiếu thu FIFO, phiếu chi NCC, điều chỉnh nợ, cảnh báo nợ quá hạn.
**FRs:** FR31, FR52-FR58, FR30 (phần ghi nợ)
**UX-DRs:** UX-DR10, UX-DR18
**Stories:** 5.1 (Ghi nợ POS), 5.2 (Phiếu thu FIFO), 5.3 (Phiếu chi NCC), 5.4 (Điều chỉnh nợ), 5.5 (Cảnh báo & BC công nợ)

## Epic 6: Nhập hàng & Nhà cung cấp
Owner tạo phiếu nhập kho, kiểm kho, quản lý NCC, giá vốn BQ gia quyền tự cập nhật, lịch sử nhập hàng.
**FRs:** FR8, FR9, FR10, FR11, FR12

## Epic 7: Hóa đơn & In ấn
Nhân viên xem/lọc/in lại hóa đơn. Owner xử lý trả hàng. In thermal 58/80mm (ESC/POS) + A4/A5. Tùy chỉnh mẫu in (logo, slogan, ẩn/hiện trường).
**FRs:** FR46, FR47, FR48, FR49, FR50, FR51
**ARs:** AR23
**UX-DRs:** UX-DR11

## Epic 8: Báo cáo & Dashboard
Chủ cửa hàng nắm tình hình kinh doanh trong 30 giây: dashboard tổng quan, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/giá, export CSV/Excel.
**FRs:** FR59, FR60, FR61, FR62, FR63, FR64
**UX-DRs:** UX-DR12

## Epic 9: Offline & PWA
Toàn bộ POS hoạt động offline với PGlite. Service Worker cache app shell. Background Sync đồng bộ đơn hàng. Conflict resolution server/client wins. PWA installable.
**FRs:** FR36, FR37, FR38, FR39
**NFRs:** NF14, NF15, NF16
**ARs:** AR15-AR18
**UX-DRs:** UX-DR9

---
