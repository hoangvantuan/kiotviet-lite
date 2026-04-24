# Epic 8: Báo cáo & Dashboard

Chủ cửa hàng nắm tình hình kinh doanh trong 30 giây: dashboard tổng quan, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/giá, export CSV/Excel.

## Story 8.1: Dashboard tổng quan

As a chủ cửa hàng,
I want xem dashboard tổng quan với chỉ số kinh doanh, biểu đồ, cảnh báo,
So that nắm được tình hình cửa hàng trong 30 giây.

**Acceptance Criteria:**

**Given** chủ cửa hàng mở trang Dashboard
**When** trang load xong
**Then** hiển thị 4 DashboardMetricCard: Doanh thu, Lợi nhuận, Số đơn hàng, Giá trị trung bình/đơn
**And** mỗi card: label, value (font-mono lớn), trend so kỳ trước (↑ xanh / ↓ đỏ, %), sparkline 7 ngày
**And** layout 2 cột mobile, 4 cột desktop
**And** 4 state: loading (skeleton), data, empty, error

**Given** dashboard hiển thị dữ liệu
**When** chọn khoảng thời gian (hôm nay / tuần / tháng / năm)
**Then** tất cả metric cards và biểu đồ cập nhật theo khoảng đã chọn
**And** trend so sánh với kỳ trước tương ứng

**Given** dashboard đã load
**When** nhìn section biểu đồ
**Then** hiển thị bar chart doanh thu 7 ngày gần nhất
**And** hover/tap cột → tooltip hiện doanh thu chính xác + số đơn

**Given** có sản phẩm tồn kho dưới định mức
**When** dashboard hiển thị "Cảnh báo tồn kho"
**Then** liệt kê tối đa 5 SP: tên, tồn hiện tại, định mức, badge trạng thái
**And** bấm "Xem tất cả" → chuyển trang báo cáo tồn kho

**Given** có KH nợ quá 30 ngày
**When** dashboard hiển thị "Nợ quá hạn"
**Then** liệt kê KH: tên, tổng nợ, số ngày quá hạn lâu nhất

**Given** cửa hàng có đơn hàng trong kỳ
**When** dashboard hiển thị "Top 5 bán chạy"
**Then** liệt kê 5 SP bán nhiều nhất: tên, SL, doanh thu, % tổng

---

## Story 8.2: Báo cáo chi tiết & Export

As a chủ cửa hàng,
I want xem báo cáo chi tiết doanh thu, lợi nhuận, tồn kho, giá và export ra file,
So that phân tích kinh doanh sâu hơn và lưu trữ dữ liệu.

**Acceptance Criteria:**

**Given** chủ cửa hàng mở Báo cáo doanh thu
**When** chọn tab "Theo thời gian"
**Then** hiển thị bảng doanh thu theo ngày/tuần/tháng: ngày, số đơn, doanh thu, so sánh kỳ trước
**And** tab "Theo SP" → tên SP, SL, doanh thu, % tổng
**And** tab "Theo KH" → tên KH, số đơn, doanh thu, nợ hiện tại
**And** tab "Theo nhân viên" → tên NV, số đơn, doanh thu
**And** tất cả tab hỗ trợ filter khoảng ngày

**Given** chủ cửa hàng mở Báo cáo lợi nhuận
**When** trang hiển thị
**Then** phần tổng: tổng doanh thu, tổng giá vốn, lợi nhuận gộp, margin %
**And** chi tiết theo SP: tên, SL, doanh thu, giá vốn, lợi nhuận, margin %
**And** SP lỗ highlight đỏ

**Given** chủ cửa hàng mở Báo cáo tồn kho
**When** trang hiển thị
**Then** tab "Tồn hiện tại": tên SP, SL tồn, giá vốn BQ, giá trị tồn, tổng giá trị
**And** tab "Cần nhập": SP có tồn ≤ định mức, SL cần nhập = định mức - tồn
**And** tab "Hàng chậm bán": SP không có đơn > 30 ngày, ngày bán cuối cùng

**Given** chủ cửa hàng mở Báo cáo giá
**When** trang hiển thị
**Then** tab "Đơn sửa giá": đơn có price_override, hiện giá gốc, giá đã sửa, người sửa, chênh lệch
**And** tab "So sánh bảng giá": bảng pivot SP × bảng giá, margin %, cell đỏ nếu margin < 0
**And** tab "Lịch sử giá nhập": theo SP, ngày nhập, NCC, giá nhập, WAC sau nhập

**Given** đang xem bất kỳ danh sách nào (SP, KH, đơn hàng, công nợ, báo cáo)
**When** bấm nút "Export"
**Then** dropdown chọn: CSV hoặc Excel (.xlsx)
**And** file chứa đúng dữ liệu đang hiển thị (đã áp filter), tên file: {loại}_{YYYYMMDD}.csv/xlsx
**And** cột số tiền format integer trong file, header tiếng Việt có dấu

**Given** báo cáo có 500 SP
**When** export Excel
**Then** hoàn thành trong < 5 giây
**And** header bold, cột số tiền format number trong Excel

---
