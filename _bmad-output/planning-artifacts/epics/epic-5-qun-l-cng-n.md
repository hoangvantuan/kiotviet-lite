# Epic 5: Quản lý Công nợ

Nhân viên ghi nợ toàn bộ/1 phần khi bán hàng, hệ thống kiểm tra hạn mức + PIN override. Phiếu thu FIFO, phiếu chi NCC, điều chỉnh nợ, cảnh báo nợ quá hạn.

## Story 5.1: Ghi nợ trong POS & Kiểm tra hạn mức

As a nhân viên bán hàng,
I want ghi nợ cho khách hàng ngay trên POS với kiểm tra hạn mức tự động,
So that bán hàng ghi nợ nhanh chóng mà vẫn kiểm soát được rủi ro công nợ.

**Acceptance Criteria:**

**Given** đang ở màn hình thanh toán trên POS, đã chọn khách hàng
**When** chọn phương thức thanh toán
**Then** hiển thị thêm phương thức "Ghi nợ" bên cạnh Tiền mặt, Chuyển khoản, v.v.
**And** nếu chưa chọn khách hàng → ẩn hoặc disable phương thức "Ghi nợ" với tooltip "Vui lòng chọn khách hàng để ghi nợ"

**Given** đơn hàng tổng 500.000đ, đã chọn khách hàng
**When** nhân viên chọn thanh toán hỗn hợp: Tiền mặt 300.000đ + Ghi nợ 200.000đ
**Then** hệ thống ghi nhận payment: 300.000đ tiền mặt + 200.000đ nợ
**And** tạo bản ghi debt (order_id, customer_id, amount = 200.000, paid = 0, remaining = 200.000, created_at)
**And** cập nhật customer.current_debt += 200.000đ

**Given** khách hàng có current_debt = 800.000đ, debt_limit = 1.000.000đ
**When** nhân viên ghi nợ thêm 150.000đ (tổng nợ mới = 950.000đ, chưa vượt)
**Then** cho phép ghi nợ bình thường
**And** DebtSummaryCard trên POS hiển thị: nợ hiện tại 800.000đ → nợ sau giao dịch 950.000đ / hạn mức 1.000.000đ

**Given** khách hàng có current_debt = 900.000đ, debt_limit = 1.000.000đ
**When** nhân viên ghi nợ thêm 200.000đ (tổng nợ mới = 1.100.000đ, VƯỢT hạn mức)
**Then** chặn giao dịch, hiển thị "Vượt hạn mức công nợ. Nợ hiện tại: 900.000đ. Hạn mức: 1.000.000đ. Nợ thêm tối đa: 100.000đ"
**And** hiển thị nút "Nhập PIN để vượt hạn mức"

**Given** popup yêu cầu PIN vượt hạn mức đang hiển thị
**When** nhập PIN chủ cửa hàng đúng
**Then** cho phép ghi nợ vượt hạn mức
**And** ghi audit log: user_id, customer_id, amount, debt_before, debt_after, override_by (owner), timestamp
**When** nhập PIN sai
**Then** hiển thị "PIN không đúng", giữ nguyên chặn

**Given** đã chọn khách hàng trên POS
**When** hiển thị màn hình thanh toán
**Then** DebtSummaryCard hiển thị: tên KH, nợ hiện tại, hạn mức nợ, phần trăm sử dụng, thanh progress bar (xanh <80%, vàng 80-99%, đỏ ≥100%)

**Given** khách hàng có debt_limit = 0 hoặc NULL (không có hạn mức)
**When** nhân viên chọn ghi nợ
**Then** cho phép ghi nợ không giới hạn
**And** DebtSummaryCard hiển thị "Không giới hạn"

---

## Story 5.2: Phiếu thu & Phân bổ FIFO

As a chủ cửa hàng,
I want tạo phiếu thu tiền từ khách hàng và phân bổ tự động theo FIFO vào các hoá đơn nợ cũ nhất,
So that theo dõi chính xác từng khoản nợ đã thu và còn lại.

**Acceptance Criteria:**

**Given** database chưa có bảng receipts và receipt_allocations
**When** chạy migration
**Then** tạo bảng receipts (id, customer_id FK, amount, note, created_by FK, created_at)
**And** tạo bảng receipt_allocations (id, receipt_id FK, debt_id FK, amount, created_at)
**And** tổng receipt_allocations.amount cho mỗi receipt = receipt.amount

**Given** đang ở trang Phiếu thu
**When** tìm kiếm khách hàng (theo tên hoặc phone)
**Then** hiển thị danh sách khách hàng matching, kèm current_debt
**When** chọn một khách hàng
**Then** hiển thị danh sách các khoản nợ còn lại (remaining > 0), sắp xếp theo created_at ASC (cũ nhất trước)

**Given** đã chọn khách hàng có 3 khoản nợ: A (100.000đ), B (200.000đ), C (150.000đ)
**When** nhập số tiền thu = 250.000đ và chọn phân bổ FIFO (mặc định)
**Then** preview hiển thị: A trả hết 100.000đ (còn 0), B trả 150.000đ (còn 50.000đ), C không thay đổi
**And** tổng phân bổ = 250.000đ = số tiền thu

**Given** đã chọn khách hàng có 3 khoản nợ
**When** nhập số tiền thu = 250.000đ và chọn phân bổ THỦ CÔNG
**Then** cho phép nhân viên tick chọn khoản nợ cụ thể và nhập số tiền cho từng khoản
**And** validate: tổng phân bổ phải = số tiền thu, mỗi khoản phân bổ ≤ remaining

**Given** preview phân bổ đã hiển thị
**When** nhấn "Xác nhận thu tiền"
**Then** tạo receipt + receipt_allocations trong DB
**And** cập nhật debt.paid += allocated_amount, debt.remaining -= allocated_amount cho từng khoản
**And** cập nhật customer.current_debt -= receipt.amount
**And** nếu debt.remaining = 0 → đánh dấu khoản nợ đã tất toán

**Given** phiếu thu vừa tạo thành công
**When** nhấn "In phiếu thu"
**Then** hiển thị bản in gồm: tên cửa hàng, tên KH, ngày thu, số tiền, chi tiết phân bổ, người thu, nợ còn lại

**Given** nhập số tiền thu lớn hơn tổng nợ còn lại
**When** nhấn xác nhận
**Then** hiển thị cảnh báo "Số tiền thu lớn hơn tổng nợ còn lại. Vui lòng kiểm tra lại"
**And** không cho phép lưu

---

## Story 5.3: Phiếu chi trả nợ NCC

As a chủ cửa hàng,
I want tạo phiếu chi để thanh toán nợ cho nhà cung cấp,
So that kiểm soát được công nợ phải trả và lịch sử thanh toán NCC.

**Acceptance Criteria:**

**Given** database chưa có bảng supplier_payments
**When** chạy migration
**Then** tạo bảng supplier_payments (id, store_id, supplier_id FK, amount, note, created_by FK, created_at)

**Given** đang ở trang Phiếu chi
**When** chọn nhà cung cấp, nhập số tiền thanh toán và ghi chú
**Then** lưu supplier_payment vào DB
**And** cập nhật số nợ phải trả cho nhà cung cấp tương ứng
**And** chỉ chủ cửa hàng (owner) mới có quyền tạo phiếu chi

**Given** phiếu chi đã tạo
**When** xem danh sách phiếu chi
**Then** hiển thị: NCC, số tiền, ghi chú, người tạo, ngày tạo
**And** lọc theo NCC, khoảng ngày

---

## Story 5.4: Điều chỉnh nợ thủ công

As a chủ cửa hàng,
I want điều chỉnh nợ khách hàng thủ công khi cần (xoá nợ xấu, sửa sai),
So that công nợ phản ánh đúng thực tế và có audit trail cho mọi thay đổi.

**Acceptance Criteria:**

**Given** database chưa có bảng debt_adjustments
**When** chạy migration
**Then** tạo bảng debt_adjustments (id, store_id, customer_id FK, old_amount, new_amount, reason, adjusted_by FK, created_at)
**And** debt_adjustments chỉ cho phép INSERT (append-only), không UPDATE/DELETE (DB constraint)

**Given** chủ cửa hàng đang ở trang chi tiết khách hàng, tab Công nợ
**When** nhấn "Điều chỉnh nợ" và nhập: số nợ mới (new_amount) + lý do bắt buộc (reason)
**Then** lưu debt_adjustment (old_amount = current_debt, new_amount, reason, adjusted_by = owner)
**And** cập nhật customer.current_debt = new_amount
**And** chỉ chủ cửa hàng mới có quyền điều chỉnh nợ
**And** nếu reason để trống → hiển thị lỗi validation

**Given** đã có điều chỉnh nợ
**When** xem lịch sử điều chỉnh trên tab Công nợ của KH
**Then** hiển thị: ngày, nợ cũ, nợ mới, lý do, người điều chỉnh — không cho sửa/xoá

---

## Story 5.5: Cảnh báo nợ & Báo cáo công nợ

As a chủ cửa hàng,
I want nhận cảnh báo khi khách hàng sắp/vượt hạn mức nợ hoặc nợ quá hạn, và xem báo cáo tổng hợp công nợ,
So that chủ động kiểm soát rủi ro tín dụng và nắm toàn cảnh công nợ.

**Acceptance Criteria:**

**Given** cấu hình cảnh báo nợ: mức cảnh báo 80%, ngưỡng quá hạn 30/60/90 ngày (configurable trong Settings)
**When** khách hàng có current_debt ≥ 80% × debt_limit
**Then** hiển thị cảnh báo vàng "Nợ sắp đạt hạn mức" trên danh sách KH và chi tiết KH
**When** khách hàng có current_debt ≥ 100% × debt_limit
**Then** hiển thị cảnh báo đỏ "Đã vượt hạn mức công nợ" và chặn ghi nợ trên POS (trừ PIN override)

**Given** khoản nợ đã quá hạn
**When** quá hạn 30 ngày
**Then** badge "Quá hạn 30 ngày" màu vàng
**When** quá hạn 60 ngày
**Then** badge "Quá hạn 60 ngày" màu cam
**When** quá hạn 90 ngày
**Then** badge "Quá hạn 90 ngày" màu đỏ + notification cho chủ cửa hàng

**Given** đang ở trang Báo cáo > Công nợ
**When** chọn "Báo cáo tuổi nợ" (aging report)
**Then** hiển thị bảng nhóm theo khách hàng: Tên KH, Tổng nợ, 0-30 ngày, 31-60 ngày, 61-90 ngày, >90 ngày
**And** dòng tổng cộng ở cuối bảng

**Given** đang ở trang Báo cáo > Công nợ
**When** chọn "Tổng hợp công nợ"
**Then** hiển thị 3 section: (a) Phải thu — tổng nợ KH, (b) Phải trả — tổng nợ NCC, (c) Sổ quỹ — tổng thu - tổng chi theo khoảng thời gian
**And** hỗ trợ lọc theo khoảng ngày, xuất CSV

**Given** chủ cửa hàng đang ở Settings > Cảnh báo công nợ
**When** thay đổi ngưỡng cảnh báo
**Then** lưu giá trị mới vào settings, áp dụng ngay cho tất cả khách hàng

---
