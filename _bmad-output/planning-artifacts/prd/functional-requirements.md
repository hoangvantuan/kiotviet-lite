# Functional Requirements

## Quản lý Hàng hóa

- FR1: Chủ cửa hàng có thể tạo, sửa, xoá sản phẩm với thông tin: tên, SKU (auto-gen), barcode, danh mục, đơn vị tính, giá gốc, giá bán lẻ, mô tả, hình ảnh (1 ảnh), trạng thái (đang bán/ngừng bán)
- FR2: Chủ cửa hàng có thể tạo biến thể sản phẩm với tối đa 2 thuộc tính (VD: Màu + Size), mỗi thuộc tính tối đa 20 giá trị, mỗi biến thể có SKU, barcode, giá, tồn kho riêng
- FR3: Chủ cửa hàng có thể tạo đơn vị quy đổi cho sản phẩm (VD: 1 thùng = 24 lon) với hệ số quy đổi và giá riêng theo đơn vị
- FR4: Chủ cửa hàng có thể tạo danh mục sản phẩm tối đa 2 cấp (cha → con), sắp xếp thứ tự hiển thị bằng kéo-thả
- FR5: Chủ cửa hàng có thể bật/tắt theo dõi tồn kho cho từng sản phẩm và đặt định mức tồn tối thiểu
- FR6: Hệ thống tự tính giá vốn bình quân gia quyền từ phiếu nhập hàng
- FR7: Hệ thống hiển thị cảnh báo (badge đỏ + thông báo) khi sản phẩm dưới định mức tồn tối thiểu

## Nhập hàng & Nhà cung cấp

- FR8: Chủ cửa hàng có thể tạo phiếu nhập kho với: NCC, danh sách SP (quét barcode hoặc tìm tên), SL, đơn giá nhập, chiết khấu (% hoặc cố định, theo dòng hoặc tổng), trạng thái thanh toán
- FR9: Hệ thống tự cập nhật giá vốn bình quân gia quyền và tồn kho sau mỗi phiếu nhập
- FR10: Chủ cửa hàng có thể tạo phiếu kiểm kho: chọn SP → nhập SL thực tế → hệ thống tính chênh lệch → xác nhận → tự điều chỉnh tồn kho + tạo log
- FR11: Chủ cửa hàng có thể quản lý NCC (tên, SĐT, địa chỉ, email, công nợ NCC)
- FR12: Hệ thống lưu lịch sử mọi lần nhập hàng (giá nhập, SL, NCC, giá vốn BQ sau nhập)

## Quản lý Đơn giá

- FR13: Chủ cửa hàng có thể tạo nhiều bảng giá song song, mỗi bảng giá gán cho 1 nhóm KH
- FR14: Bảng giá hỗ trợ 5 cách thiết lập: nhập giá trực tiếp, công thức từ giá nền (giá gốc/bán lẻ/giá vốn ± %), công thức kế thừa từ bảng giá khác (chain formula), nhân bản (clone), import Excel
- FR15: Hệ thống chống vòng lặp chain formula (A → B → C → A) khi lưu bảng giá
- FR16: Bảng giá hỗ trợ làm tròn (100đ/500đ/1.000đ/10.000đ, hướng lên/xuống/gần nhất) và ngày hiệu lực
- FR17: Chủ cửa hàng có thể đặt giá riêng cho từng KH cụ thể trên từng SP (ưu tiên cao nhất, override mọi bảng giá)
- FR18: Chủ cửa hàng có thể thiết lập giá theo SL (tối đa 5 bậc/SP, VD: 1-9 cái = 85k, 10-49 = 80k, ≥50 = 75k)
- FR19: Chủ cửa hàng có thể tạo CK danh mục (discount rules): cho KH cụ thể hoặc nhóm KH, theo danh mục hoặc toàn bộ SP, % hoặc cố định, có SL tối thiểu và ngày hiệu lực
- FR20: POS áp giá theo hệ thống 6 tầng ưu tiên: (1) giá riêng KH → (2) CK danh mục → (3) sửa tay → (4) giá theo SL → (5) bảng giá nhóm KH → (6) giá bán lẻ
- FR21: POS hiển thị nguồn giá cạnh mỗi dòng SP ("Giá riêng KH", "Giá theo SL", "Giá ĐL C1", v.v.)
- FR22: Nhân viên có quyền `can_edit_price` có thể sửa giá trên đơn. Sửa giá dưới giá vốn cần PIN chủ cửa hàng. Sửa giá = 0 bị block. Hệ thống lưu `original_price` + `price_override = true`
- FR23: Chủ cửa hàng có thể chọn chế độ cascade khi giá gốc thay đổi: real-time (mặc định), xác nhận (preview trước), hoặc tự động
- FR24: Chủ cửa hàng có thể xem so sánh nhiều bảng giá song song với margin % so với giá vốn, cảnh báo SP bán dưới vốn
- FR25: Chủ cửa hàng có thể chọn chiến lược khi giá nhập thay đổi: thủ công (mặc định), cảnh báo (khi thay đổi > 5%), hoặc tự động (bảng giá công thức từ giá vốn)

## Bán hàng (POS)

- FR26: Nhân viên có thể thêm SP vào đơn bằng: quét barcode (camera hoặc máy quét), gõ tên/mã SP (autocomplete), hoặc chọn từ grid ảnh
- FR27: POS hỗ trợ 2 chế độ: bán nhanh (quét = tự thêm + tăng SL) và bán thường (chọn từ grid)
- FR28: Nhân viên có thể chọn KH (tìm theo tên/SĐT) hoặc bỏ qua (khách lẻ). Chọn KH → hệ thống tự áp bảng giá theo nhóm
- FR29: Nhân viên có thể áp chiết khấu: theo dòng (% hoặc cố định) và theo tổng đơn (% hoặc cố định)
- FR30: Nhân viên có thể thanh toán bằng: tiền mặt (nhập số tiền → tính thừa), chuyển khoản, QR Code, kết hợp nhiều phương thức, hoặc ghi nợ
- FR31: Khi ghi nợ, hệ thống kiểm tra hạn mức: `nợ hiện tại + nợ mới ≤ hạn mức`. Vượt → block + cần PIN chủ cửa hàng override. Hỗ trợ trả 1 phần + ghi nợ phần còn lại
- FR32: POS hỗ trợ mở tối đa 5 tab đơn hàng đồng thời
- FR33: Nhân viên có thể tra tồn kho nhanh và xem giá nhập gần nhất trực tiếp từ POS
- FR34: POS hỗ trợ phím tắt: Enter (thêm SP), F2 (thanh toán), F4 (ghi nợ), Esc (hủy)
- FR35: Sau thanh toán, hệ thống tự: in hóa đơn (tùy chọn), trừ tồn kho, cập nhật công nợ KH, mở đơn mới

## Bán hàng Offline

- FR36: Toàn bộ luồng bán hàng (thêm SP, thanh toán, in hóa đơn) hoạt động khi không có internet
- FR37: Dữ liệu SP, KH, bảng giá được cache local (IndexedDB/PGlite)
- FR38: Đơn hàng offline đánh dấu `sync_status = pending`, tự đồng bộ khi có mạng
- FR39: Conflict resolution: server wins (tồn kho), client wins (đơn hàng). Tồn kho âm sau sync → cảnh báo

## Quản lý Khách hàng

- FR40: Chủ cửa hàng có thể quản lý KH: tên (bắt buộc), SĐT (bắt buộc, unique), email, địa chỉ, MST, ghi chú, hạn mức nợ riêng
- FR41: Chủ cửa hàng có thể tạo nhóm KH, mỗi nhóm gắn bảng giá mặc định và hạn mức nợ mặc định
- FR42: Mỗi KH thuộc đúng 1 nhóm. Thay đổi nhóm → tự đổi bảng giá. Hạn mức KH override hạn mức nhóm
- FR43: Hệ thống tự tính: tổng đã mua, số lần mua, nợ hiện tại
- FR44: Trang chi tiết KH hiển thị: tab Đơn hàng (lọc theo ngày, trạng thái), tab Công nợ, tab Thống kê (SP mua nhiều nhất, tháng mua nhiều nhất)
- FR45: Nhân viên có thể tạo KH mới nhanh từ POS (chỉ cần tên + SĐT)

## Quản lý Hóa đơn

- FR46: Hệ thống hiển thị danh sách hóa đơn với: mã (auto-gen HD-YYYYMMDD-XXXX), ngày, KH, tổng tiền, đã trả, còn nợ, trạng thái, người tạo
- FR47: Hỗ trợ lọc hóa đơn theo: ngày (hôm nay/tuần/tháng/tùy chọn), trạng thái, KH, phương thức thanh toán, trạng thái nợ
- FR48: Nhân viên có thể xem chi tiết hóa đơn (SP, KH, thanh toán, lịch sử trả nợ) và in lại
- FR49: Manager/Owner có thể tạo phiếu trả hàng từ hóa đơn gốc: chọn SP + SL trả + lý do → hệ thống tự cộng tồn kho, giảm doanh thu, hoàn tiền hoặc giảm nợ
- FR50: Hệ thống hỗ trợ 2 mẫu in: thermal (58mm/80mm) và A4/A5 (cho bán buôn, có bảng SP, tổng bằng chữ, ký tên)
- FR51: Chủ cửa hàng có thể tùy chỉnh mẫu in: logo, slogan, thông tin hiển thị, ẩn/hiện nợ cũ/mới/giá vốn/CK, ghi chú cuối

## Quản lý Công nợ

- FR52: Nhân viên có thể ghi nợ toàn bộ hoặc 1 phần khi bán hàng (tích hợp trực tiếp trong POS)
- FR53: Hệ thống kiểm tra hạn mức nợ trước khi ghi nợ. Vượt hạn mức → block. Owner override bằng PIN
- FR54: Nhân viên có thể tạo phiếu thu (thu nợ KH): tìm KH → xem tổng nợ + DS hóa đơn nợ → nhập số tiền → phân bổ tự động FIFO hoặc chọn hóa đơn cụ thể
- FR55: Owner có thể điều chỉnh nợ thủ công (xoá nợ xấu, sửa sai): nhập số nợ mới + lý do → tạo phiếu điều chỉnh
- FR56: Chủ cửa hàng có thể tạo phiếu chi để trả nợ NCC
- FR57: Hệ thống cảnh báo: KH sắp đạt hạn mức (≥ 80%), KH vượt hạn mức (block đơn), nợ quá hạn (30/60/90 ngày, cấu hình được)
- FR58: Báo cáo công nợ: tổng hợp phải thu, chi tiết theo KH, phân nhóm theo thời gian (0-30, 31-60, 61-90, >90 ngày), tổng hợp phải trả, sổ quỹ

## Báo cáo

- FR59: Dashboard tổng quan: doanh thu, lợi nhuận, số đơn (hôm nay/tuần/tháng/năm), biểu đồ 7 ngày, cảnh báo tồn kho + nợ quá hạn, top 5 SP bán chạy
- FR60: Báo cáo doanh thu: theo ngày/tuần/tháng, theo SP, theo KH, theo nhân viên
- FR61: Báo cáo lợi nhuận: tổng (doanh thu - giá vốn), theo SP
- FR62: Báo cáo tồn kho: tồn hiện tại + giá trị, SP cần nhập (dưới mức), hàng chậm bán (>30 ngày)
- FR63: Báo cáo giá: đơn hàng có sửa giá, so sánh bảng giá + margin, lịch sử giá nhập
- FR64: Tất cả danh sách (SP, KH, đơn hàng, công nợ) hỗ trợ export CSV/Excel

## Quyền hạn & Quản trị

- FR65: Hệ thống hỗ trợ 3 vai trò: Owner, Manager, Staff với ma trận quyền chi tiết (xem bảng permissions trong tài liệu gốc)
- FR66: Owner có thể quản lý nhân viên (tạo, sửa, vô hiệu hóa) và cài đặt cửa hàng
- FR67: Hệ thống hỗ trợ xác thực bằng PIN cho các thao tác nhạy cảm (sửa giá dưới vốn, override hạn mức nợ)
