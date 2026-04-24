# Epic 7: Hóa đơn & In ấn

Nhân viên xem/lọc/in lại hóa đơn. Owner xử lý trả hàng. In thermal 58/80mm (ESC/POS) + A4/A5. Tùy chỉnh mẫu in.

## Story 7.1: Danh sách & Chi tiết hóa đơn

As a nhân viên bán hàng,
I want xem danh sách hóa đơn với bộ lọc đầy đủ và xem chi tiết từng hóa đơn,
So that có thể tra cứu nhanh thông tin đơn hàng, lịch sử thanh toán và in lại khi cần.

**Acceptance Criteria:**

**Given** nhân viên mở trang Hóa đơn
**When** trang load xong
**Then** hiển thị danh sách hóa đơn dạng table (desktop) hoặc card list (mobile) với: mã HĐ (HD-YYYYMMDD-XXXX), ngày tạo, tên KH, tổng tiền, đã trả, còn nợ, trạng thái, người tạo
**And** mặc định hiển thị hóa đơn hôm nay, sắp xếp mới nhất trước

**Given** nhân viên cần tìm hóa đơn cụ thể
**When** sử dụng bộ lọc
**Then** hỗ trợ lọc theo: khoảng ngày (hôm nay/tuần/tháng/tùy chọn), trạng thái, KH (search tên/SĐT), phương thức thanh toán, trạng thái nợ
**And** các filter kết hợp AND, kết quả cập nhật ngay

**Given** nhân viên bấm vào hóa đơn
**When** trang chi tiết mở
**Then** hiển thị: thông tin KH, danh sách SP (tên, SL, đơn giá, CK, thành tiền), tổng cộng, CK tổng đơn
**And** phần thanh toán: phương thức, số tiền mỗi phương thức, tiền thừa
**And** nếu KH có nợ: nợ cũ trước đơn, nợ phát sinh, tổng nợ sau đơn

**Given** hóa đơn có trạng thái "có nợ" và KH đã trả nợ 1 phần
**When** xem chi tiết
**Then** hiển thị "Lịch sử trả nợ": ngày trả, số tiền, phương thức, mã phiếu thu
**And** còn nợ = nợ ban đầu - Σ đã trả

**Given** nhân viên đang xem chi tiết hóa đơn
**When** bấm "In lại"
**Then** in theo mẫu đã cấu hình, có dòng "BẢN IN LẠI" ở header

**Given** danh sách hóa đơn trên mobile
**When** xem danh sách
**Then** hiển thị dạng card: mã HĐ + ngày, tên KH, tổng tiền + trạng thái
**And** tap card → mở chi tiết

---

## Story 7.2: Trả hàng

As a manager/owner,
I want xử lý trả hàng từ hóa đơn gốc với hoàn tiền hoặc giảm nợ tương ứng,
So that hoàn trả chính xác cho khách và tồn kho luôn đúng.

**Acceptance Criteria:**

**Given** manager đang xem chi tiết hóa đơn đã hoàn thành
**When** bấm "Trả hàng"
**Then** hiển thị dialog với danh sách SP từ HĐ gốc: tên, SL đã mua, ô nhập SL trả (≤ SL đã mua), dropdown lý do trả
**And** SL trả mặc định = 0, phải nhập > 0 ít nhất 1 dòng
**And** nhân viên (role=staff) không thấy nút "Trả hàng"

**Given** manager chọn trả 2 sản phẩm A (SL 3) và B (SL 1)
**When** xác nhận trả hàng
**Then** tồn kho tự động cộng lại: SP A +3, SP B +1
**And** doanh thu giảm = tổng tiền các dòng trả
**And** nếu KH đã trả tiền → tạo bút toán hoàn tiền (refund)
**And** nếu KH còn nợ → giảm nợ KH tương ứng

**Given** hóa đơn đã trả hàng 1 phần trước đó
**When** bấm "Trả hàng" lần nữa
**Then** SL trả tối đa = SL đã mua - SL đã trả trước đó
**And** hiển thị rõ "Đã trả: X" bên cạnh mỗi dòng SP

**Given** trả hàng thành công
**When** xem lại chi tiết hóa đơn
**Then** hiển thị section "Lịch sử trả hàng": ngày trả, SP trả, SL, lý do, người xử lý
**And** trạng thái hóa đơn đổi thành "Đã trả 1 phần" hoặc "Đã trả toàn bộ"

## Story 7.3: In hóa đơn Thermal & A4

As a nhân viên bán hàng,
I want in hóa đơn bằng máy in nhiệt hoặc giấy A4/A5,
So that cung cấp hóa đơn chuyên nghiệp cho khách hàng.

**Acceptance Criteria:**

**Given** máy tính kết nối thermal printer qua Web Serial API
**When** nhân viên in hóa đơn
**Then** gửi lệnh ESC/POS binary: init → logo → tên cửa hàng + slogan → mã HĐ + ngày → danh sách SP → tổng cộng → thanh toán → nợ cũ/mới (nếu bật) → ghi chú → cut paper
**And** thermal 80mm: bố cục rộng hơn, thêm cột CK

**Given** thermal printer không kết nối được (chưa pair hoặc lỗi)
**When** nhân viên in hóa đơn
**Then** fallback: CSS @media print + window.print()
**And** toast cảnh báo "Máy in nhiệt không kết nối, đang in qua trình duyệt"

**Given** khách buôn cần hóa đơn A4
**When** nhân viên chọn "In A4/A5"
**Then** render HTML với CSS @media print: header, thông tin KH, bảng SP đầy đủ, tổng bằng số + bằng chữ, khu vực ký tên
**And** gọi window.print()

**Given** hệ thống đang offline
**When** nhân viên in hóa đơn
**Then** in thermal và A4/A5 vẫn hoạt động vì render phía client
**And** logo đã cache trong Service Worker

## Story 7.4: Cài đặt mẫu in

As a chủ cửa hàng,
I want tùy chỉnh mẫu in hóa đơn với logo, slogan và các trường hiển thị,
So that hóa đơn phản ánh thương hiệu cửa hàng.

**Acceptance Criteria:**

**Given** chủ cửa hàng mở Cài đặt > Mẫu in
**When** tùy chỉnh template
**Then** có thể: upload logo (≤2MB, jpg/png), nhập slogan, bật/tắt: nợ cũ, nợ mới, giá vốn, CK, ghi chú cuối, tên KH, SĐT KH, SKU
**And** chọn khổ giấy mặc định: 58mm, 80mm, A4, A5
**And** cài đặt lưu vào bảng print_settings theo store_id

**Given** đang ở trang Cài đặt mẫu in
**When** thay đổi bất kỳ trường nào
**Then** preview realtime bên phải hiển thị mẫu in đã cập nhật
**And** preview hiển thị dữ liệu mẫu (đơn hàng giả) để dễ hình dung

**Given** cửa hàng chưa có cài đặt mẫu in
**When** mở trang Cài đặt > Mẫu in lần đầu
**Then** tạo bản ghi print_settings với giá trị mặc định: thermal 58mm, không logo, footer "Cảm ơn quý khách!"

---
