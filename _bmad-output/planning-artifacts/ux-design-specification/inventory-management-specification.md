# Inventory Management Specification

Liên quan FR8-FR12 (Nhập hàng, Kiểm kho, NCC). Bổ sung từ Implementation Readiness Report 2026-04-24.

## Mục tiêu

UX cho 4 luồng chính: tạo phiếu nhập kho, kiểm kho, quản lý NCC, lịch sử nhập hàng. Hiện tại chỉ có import-error-handling.md (error states), thiếu toàn bộ flow chính.

## 1. Tạo Phiếu Nhập Kho (FR8)

### Entry Point
Menu "Nhập hàng" (/inventory/import) hoặc nút "Tạo phiếu nhập" trên trang Nhập hàng.

### Layout

**Header:**
- Mã phiếu: PN-YYYYMMDD-XXXX (auto-gen)
- NCC: [Search NCC] hoặc [Thêm NCC mới] (inline form nhanh)
- Ngày nhập: Date picker, default hôm nay

**Danh sách SP (scrollable):**
- Thêm SP: Search bar (tên/SKU/barcode) hoặc quét barcode camera
- Mỗi dòng: Tên SP, Đơn vị, SL nhập (stepper), Đơn giá nhập, CK dòng (%), Thành tiền
- Swipe left (mobile) hoặc icon X để xóa dòng
- Desktop: table layout. Mobile: card layout

**Footer:**
- Tổng tiền hàng
- Chiết khấu tổng phiếu: input % hoặc VNĐ
- Tổng thanh toán
- Trạng thái thanh toán: dropdown [Đã trả / Chưa trả / Trả 1 phần]
  - Nếu "Trả 1 phần": input số tiền đã trả
- Nút [Hủy] [Lưu nhập]

### Sau khi lưu
- Toast success "Đã tạo phiếu nhập PN-..."
- Auto cập nhật: tồn kho SP, giá vốn BQ gia quyền
- Hiển thị WAC mới: "Giá vốn BQ: XX,XXX → YY,YYY (+Z%)"
- CTA: [Xem phiếu] [Tạo phiếu mới]

## 2. Kiểm Kho (FR10)

### Entry Point
Menu "Nhập hàng" > tab "Kiểm kho" (/inventory/check)

### Bước 1: Chọn SP kiểm
- Tùy chọn: "Kiểm tất cả" hoặc "Kiểm theo danh mục" (dropdown)
- Danh sách SP hiển thị: Tên, SKU, Tồn hệ thống

### Bước 2: Nhập SL thực tế

**Desktop:** Table với input column "SL thực tế"
- Mỗi dòng: Tên SP, Tồn hệ thống, SL thực tế [input], Chênh lệch (auto-calc)
- Chênh lệch dương (+): text xanh lá
- Chênh lệch âm (-): text đỏ
- Chênh lệch = 0: text xám

**Mobile:** Card view, mỗi card 1 SP
- Tên SP, Tồn hệ thống, Input SL thực tế (stepper), Chênh lệch

### Bước 3: Xác nhận
- Summary: "X SP tăng, Y SP giảm, Z SP không đổi"
- Dialog xác nhận: "Điều chỉnh tồn kho cho N sản phẩm? Thao tác này không thể hoàn tác."
- Nút [Hủy] [Xác nhận kiểm kho]

### Sau xác nhận
- Auto điều chỉnh tồn kho
- Tạo inventory_adjustment log
- Toast success "Kiểm kho hoàn tất. N sản phẩm đã điều chỉnh."
- Chuyển về trang lịch sử kiểm kho

## 3. Quản lý NCC (FR11)

### Entry Point
Menu "Nhập hàng" > tab "NCC" (/inventory?tab=suppliers)

### CRUD Form
- Tên NCC (bắt buộc)
- SĐT, Email, Địa chỉ
- Công nợ NCC (read-only, tự tính từ phiếu nhập chưa trả)
- Nút [Hủy] [Lưu]

### List View
- Desktop: Table (Tên, SĐT, Công nợ, Số phiếu nhập, Hành động)
- Mobile: Card (Tên, SĐT, Công nợ)
- Search by tên/SĐT
- Delete: chỉ khi không có phiếu nhập nào liên kết

## 4. WAC Display (FR6, FR9)

Sau mỗi phiếu nhập, trang chi tiết SP hiển thị:
- Giá vốn BQ mới (font-bold)
- Tooltip: "= (Tồn cũ × Giá vốn cũ + SL nhập × Giá nhập) / (Tồn cũ + SL nhập)"
- Lịch sử giá vốn: mini chart (sparkline) hoặc list 5 lần thay đổi gần nhất

## 5. Lịch sử Nhập Hàng (FR12)

### Entry Point
/inventory?tab=history

### Layout
- Desktop: Table (Mã phiếu, Ngày nhập, NCC, Số SP, Tổng tiền, Trạng thái TT)
- Mobile: Card list
- Filter: Khoảng ngày, NCC, Trạng thái thanh toán
- Tap row → Chi tiết phiếu nhập (read-only)

## Components

| Component | Mô tả |
|-----------|-------|
| PurchaseOrderForm | Form tạo phiếu nhập kho |
| PurchaseOrderItemRow | Dòng SP trong phiếu nhập |
| StockCheckTable | Table kiểm kho (desktop) |
| StockCheckCard | Card kiểm kho (mobile) |
| SupplierForm | Form CRUD NCC |
| SupplierList | Danh sách NCC |
| ImportHistoryTable | Lịch sử nhập hàng |
| WACDisplay | Hiển thị giá vốn BQ + tooltip |

## Phím tắt (Desktop)

| Phím | Hành động |
|------|-----------|
| Ctrl+N | Tạo phiếu nhập mới |
| Ctrl+S | Lưu phiếu nhập |
| Enter | Thêm SP vừa search vào phiếu |
