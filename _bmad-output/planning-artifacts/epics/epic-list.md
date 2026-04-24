# Epic List

## Epic 1: Khởi tạo dự án & Quản trị cửa hàng
Owner đăng ký cửa hàng, đăng nhập, quản lý nhân viên, phân quyền 3 vai trò. Nền tảng monorepo, design tokens, base components, auth system. CI/CD pipeline.
**FRs:** FR65, FR66, FR67
**ARs:** AR1-AR14, AR20-AR22, AR24, AR27-AR29
**UX-DRs:** UX-DR1-5, UX-DR14-17, UX-DR20
**Stories:** 1.1 (Monorepo+DB+DS), 1.2 (Đăng ký+Đăng nhập), 1.3 (Layout+Nav), 1.4 (NV+Phân quyền), 1.5 (CI/CD)

## Epic 2: Quản lý Hàng hóa
Owner tạo/sửa/xoá sản phẩm, biến thể (2 thuộc tính), danh mục 2 cấp, đơn vị quy đổi, theo dõi tồn kho, cảnh báo hết hàng, giá vốn BQ gia quyền.
**FRs:** FR1, FR2, FR3, FR4, FR5, FR6, FR7
**UX-DRs:** UX-DR17, UX-DR21

## Epic 3: Bán hàng (POS) — Luồng bán lẻ
Nhân viên bán hàng cho khách vãng lai: tìm SP autocomplete, quét barcode camera, grid sản phẩm, giỏ hàng, chiết khấu, thanh toán tiền mặt/CK/QR, đa tab (5), phím tắt, auto mở đơn mới.
> Phụ thuộc Epic 4 (chọn KH + giá 6 tầng) và Epic 5 (ghi nợ F4).
**FRs:** FR26, FR27, FR29, FR30 (trừ ghi nợ), FR32, FR33, FR34, FR35
**UX-DRs:** UX-DR6, UX-DR7, UX-DR13, UX-DR19

## Epic 4: Khách hàng & Hệ thống Đơn giá
Owner quản lý KH + nhóm KH, tạo bảng giá chain formula, 6 tầng ưu tiên, cascade, so sánh giá. POS tự áp giá đúng khi chọn KH, hiển thị nguồn giá. Tạo KH nhanh từ POS.
**FRs:** FR13-FR25, FR28, FR40-FR45
**UX-DRs:** UX-DR8, UX-DR10
**Stories:** 4.1 (KH+Nhóm KH), 4.2 (Chi tiết KH), 4.3 (Bảng giá Direct & Formula), 4.3b (Chain+Clone+Import), 4.3c (So sánh bảng giá), 4.4 (Giá riêng KH + Giá SL), 4.4b (CK danh mục + Kiểm soát sửa giá), 4.5 (6 tầng giá POS)

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
**Stories:** 7.1 (Danh sách+Chi tiết HĐ), 7.2 (Trả hàng), 7.3 (In Thermal & A4), 7.4 (Cài đặt mẫu in)

## Epic 8: Báo cáo & Dashboard
Chủ cửa hàng nắm tình hình kinh doanh trong 30 giây: dashboard tổng quan, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/giá, export CSV/Excel.
**FRs:** FR59, FR60, FR61, FR62, FR63, FR64
**UX-DRs:** UX-DR12

## Epic 9: Bán hàng không gián đoạn, Offline & PWA
Toàn bộ POS hoạt động offline với PGlite. Service Worker cache app shell. Background Sync đồng bộ đơn hàng. Conflict resolution server/client wins. PGlite schema migration. PWA installable.
**FRs:** FR36, FR37, FR38, FR39
**NFRs:** NF14, NF15, NF16
**ARs:** AR15-AR18
**UX-DRs:** UX-DR9
**Stories:** 9.1 (App offline đầy đủ), 9.2 (Đơn hàng offline tự đồng bộ)

## Epic 10: Cảnh báo & Giám sát cửa hàng
Chủ cửa hàng nhận cảnh báo tức thì qua Telegram/webhook khi có sự kiện nghiệp vụ quan trọng. Dev có structured log JSON để debug và giám sát hệ thống. Notification Service route event tới transport theo rule, hỗ trợ throttle, retry, dead-letter.
**FRs:** (không có FR trực tiếp, requirements từ ADR observability-and-notifications.md)
**NFRs:** NF13
**ARs:** AR30-AR39
**Stories:** 10.1 (Structured Logging Backend), 10.2 (Notification Service Core), 10.3 (Webhook & Telegram + Bảo mật), 10.4 (7 Event nghiệp vụ MVP), 10.5 (Frontend Outbox Notification)

---
