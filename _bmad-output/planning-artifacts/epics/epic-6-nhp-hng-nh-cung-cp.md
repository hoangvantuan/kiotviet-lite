# Epic 6: Nhập hàng & Nhà cung cấp

Owner tạo phiếu nhập kho, kiểm kho, quản lý NCC, giá vốn BQ gia quyền tự cập nhật, lịch sử nhập hàng.

## Story 6.1: Quản lý NCC & Phiếu nhập kho

As a chủ cửa hàng,
I want quản lý nhà cung cấp và tạo phiếu nhập kho với đầy đủ thông tin sản phẩm, giá, chiết khấu,
So that tồn kho và giá vốn bình quân gia quyền luôn chính xác sau mỗi lần nhập hàng.

**Acceptance Criteria:**

**Given** chủ cửa hàng đang ở trang Nhà cung cấp
**When** bấm "Thêm NCC" và nhập tên, SĐT, địa chỉ, email
**Then** hệ thống tạo NCC mới với công nợ NCC = 0
**And** NCC hiển thị trong danh sách, hỗ trợ sửa và xoá (soft delete)

**Given** chủ cửa hàng đang tạo phiếu nhập kho
**When** chọn NCC từ dropdown và thêm sản phẩm bằng quét barcode hoặc tìm tên/SKU
**Then** sản phẩm hiển thị trong danh sách phiếu nhập với các cột: tên, SKU, SL, đơn giá nhập, chiết khấu dòng, thành tiền

**Given** phiếu nhập có 3 sản phẩm với SL và đơn giá khác nhau
**When** nhập chiết khấu dòng (% hoặc cố định) cho sản phẩm A và chiết khấu tổng phiếu 5%
**Then** thành tiền dòng A = (SL × đơn giá) - chiết khấu dòng
**And** tổng phiếu = Σ thành tiền các dòng - chiết khấu tổng

**Given** phiếu nhập đã điền đầy đủ thông tin
**When** chọn trạng thái thanh toán "Thanh toán 1 phần" và nhập số tiền đã trả
**Then** công nợ NCC tăng thêm = tổng phiếu - số tiền đã trả

**Given** phiếu nhập 500 viên gạch men giá 78k, tồn kho hiện tại 200 viên giá vốn 70k
**When** chủ cửa hàng xác nhận phiếu nhập
**Then** tồn kho tăng từ 200 → 700
**And** giá vốn BQ = (200 × 70.000 + 500 × 78.000) / 700 = 75.714đ (integer)

**Given** sản phẩm có biến thể
**When** thêm biến thể vào phiếu nhập
**Then** mỗi biến thể nhập SL, đơn giá, chiết khấu riêng
**And** WAC và tồn kho cập nhật riêng cho từng biến thể

**Given** bảng suppliers trong database
**When** tạo bản ghi mới
**Then** bảng có: id (UUID v7), store_id, name, phone, address, email, debt (integer VNĐ), created_at, updated_at, deleted_at
**And** bảng purchase_orders: id, store_id, supplier_id, code (auto-gen PN-YYYYMMDD-XXXX), total_amount, discount_total, payment_status, paid_amount, note, created_by, created_at, updated_at
**And** bảng purchase_order_items: id, purchase_order_id, product_id, variant_id, quantity, unit_price, discount_amount, discount_type, line_total

---

## Story 6.2: Kiểm kho & Lịch sử nhập hàng

As a chủ cửa hàng,
I want tạo phiếu kiểm kho để điều chỉnh tồn kho theo thực tế và xem lịch sử nhập hàng,
So that tồn kho luôn chính xác và có thể truy vết mọi biến động giá nhập.

**Acceptance Criteria:**

**Given** chủ cửa hàng mở trang Kiểm kho
**When** bấm "Tạo phiếu kiểm kho" và chọn sản phẩm từ danh sách
**Then** hệ thống hiển thị bảng: tên SP, SKU, tồn kho hệ thống (system_qty), ô nhập SL thực tế (actual_qty), cột chênh lệch (diff = actual - system)
**And** chênh lệch dương hiển thị xanh (+), âm hiển thị đỏ (-)

**Given** phiếu kiểm kho có 5 sản phẩm, 3 SP có chênh lệch
**When** chủ cửa hàng bấm "Xác nhận kiểm kho"
**Then** dialog xác nhận liệt kê các SP có chênh lệch
**And** sau xác nhận, tồn kho cập nhật: stock = actual_qty
**And** tạo stock_check_log cho mỗi SP: product_id, variant_id, system_qty, actual_qty, diff, adjusted_by, adjusted_at

**Given** sản phẩm bị điều chỉnh giảm xuống dưới định mức
**When** kiểm kho xác nhận hoàn tất
**Then** sản phẩm hiển thị cảnh báo tồn kho thấp

**Given** bảng stock_check_logs trong database
**When** lưu phiếu kiểm kho
**Then** bảng stock_checks: id, store_id, code (KK-YYYYMMDD-XXXX), status (draft/confirmed), note, created_by, confirmed_at, created_at

**Given** chủ cửa hàng mở trang Lịch sử nhập hàng
**When** trang hiển thị danh sách phiếu nhập
**Then** mỗi phiếu hiện: mã phiếu, ngày, NCC, tổng tiền, trạng thái thanh toán
**And** hỗ trợ lọc theo: NCC, khoảng ngày, trạng thái thanh toán
**And** bấm vào phiếu → chi tiết từng dòng SP với giá nhập, SL, chiết khấu, giá vốn BQ sau lần nhập

**Given** sản phẩm có 3 lần nhập hàng trong 6 tháng
**When** xem lịch sử nhập hàng lọc theo sản phẩm
**Then** hiển thị bảng: ngày nhập, NCC, SL, đơn giá nhập, giá vốn BQ sau nhập
**And** sắp xếp theo ngày mới nhất trước

**Given** phiếu kiểm kho đã confirmed
**When** chủ cửa hàng cố sửa phiếu
**Then** block sửa đổi, hiển thị "Phiếu đã xác nhận, không thể chỉnh sửa"

---
