# Epic 4: Khách hàng & Hệ thống Đơn giá

Owner quản lý KH + nhóm KH, tạo bảng giá chain formula, 6 tầng ưu tiên, cascade, so sánh giá. POS tự áp giá đúng khi chọn KH, hiển thị nguồn giá. Tạo KH nhanh từ POS.

## Story 4.1: Quản lý khách hàng & Nhóm khách hàng

As a chủ cửa hàng,
I want quản lý danh sách khách hàng và phân nhóm khách hàng với bảng giá mặc định,
So that áp dụng chính sách giá và công nợ phù hợp cho từng nhóm.

**Acceptance Criteria:**

**Given** database chưa có bảng customers và customer_groups
**When** chạy migration
**Then** tạo bảng customer_groups (id, name, default_price_list_id FK, debt_limit, created_at, updated_at)
**And** tạo bảng customers (id, name, phone UNIQUE, email, address, tax_id, notes, debt_limit, group_id FK nullable, total_purchased, purchase_count, current_debt, created_at, updated_at)
**And** cột debt_limit ở customers ghi NULL nghĩa là dùng debt_limit của group, có giá trị nghĩa là override group

**Given** đang ở trang Quản lý khách hàng
**When** nhấn "Thêm khách hàng" và nhập name + phone (bắt buộc), email, address, tax_id, notes, chọn nhóm KH, nhập debt_limit riêng (tuỳ chọn)
**Then** lưu customer mới vào DB
**And** nếu phone đã tồn tại → hiển thị lỗi "Số điện thoại đã được sử dụng"
**And** nếu chọn nhóm KH → gán group_id, customer kế thừa default_price_list_id và debt_limit của nhóm

**Given** đang ở trang Quản lý khách hàng
**When** nhấn sửa một khách hàng và thay đổi group_id sang nhóm khác
**Then** cập nhật group_id mới
**And** bảng giá áp dụng chuyển sang default_price_list_id của nhóm mới
**And** debt_limit kế thừa nhóm mới (trừ khi customer có debt_limit riêng)

**Given** đang ở trang Quản lý nhóm khách hàng
**When** tạo nhóm mới với name, chọn default_price_list_id từ danh sách bảng giá, nhập debt_limit
**Then** lưu customer_group vào DB
**And** tất cả customer thuộc nhóm này tự động áp dụng bảng giá và hạn mức nợ của nhóm (trừ customer có override riêng)

**Given** danh sách khách hàng có nhiều bản ghi
**When** nhập từ khoá vào ô tìm kiếm
**Then** lọc realtime theo name HOẶC phone chứa từ khoá (case-insensitive)
**And** hỗ trợ lọc thêm theo nhóm KH từ dropdown

**Given** đang ở màn hình POS, chưa chọn khách hàng
**When** nhấn "Thêm KH mới" trên POS
**Then** hiển thị form tạo nhanh chỉ gồm 2 trường: name (bắt buộc) + phone (bắt buộc)
**And** lưu thành công → tự động gán customer vừa tạo vào đơn hàng hiện tại
**And** không rời khỏi màn hình POS

**Given** một customer đang có đơn hàng hoặc công nợ
**When** nhấn xoá customer đó
**Then** hiển thị cảnh báo "Khách hàng có dữ liệu liên quan, không thể xoá"
**And** không cho phép xoá (soft delete)

---

## Story 4.2: Trang chi tiết khách hàng

As a chủ cửa hàng,
I want xem toàn bộ lịch sử mua hàng, công nợ và thống kê của một khách hàng trong một trang,
So that đánh giá khách hàng và ra quyết định chính sách phù hợp.

**Acceptance Criteria:**

**Given** đang ở danh sách khách hàng
**When** nhấn vào tên một khách hàng
**Then** mở trang chi tiết hiển thị header gồm: name, phone, email, nhóm KH, tổng mua (total_purchased), số lần mua (purchase_count), nợ hiện tại (current_debt), hạn mức nợ (debt_limit hiệu lực)
**And** bên dưới header có 3 tab: Đơn hàng, Công nợ, Thống kê

**Given** đang ở tab Đơn hàng của trang chi tiết KH
**When** mở tab
**Then** hiển thị danh sách đơn hàng của khách, mỗi dòng gồm: mã đơn, ngày, tổng tiền, trạng thái
**And** có bộ lọc theo khoảng ngày (date range picker) và theo trạng thái (dropdown)
**And** sắp xếp mặc định theo ngày mới nhất

**Given** đang ở tab Công nợ của trang chi tiết KH
**When** mở tab
**Then** hiển thị current_debt, debt_limit hiệu lực, phần trăm sử dụng
**And** danh sách các khoản nợ chi tiết: mã đơn gốc, ngày phát sinh, số tiền nợ ban đầu, số tiền đã trả, số tiền còn lại
**And** sắp xếp theo ngày phát sinh cũ nhất trước (phục vụ logic FIFO)

**Given** đang ở tab Thống kê của trang chi tiết KH
**When** mở tab
**Then** hiển thị "Top 10 sản phẩm mua nhiều nhất" dạng bảng: tên SP, số lượng đã mua, tổng tiền
**And** hiển thị "Doanh số theo tháng" dạng biểu đồ cột cho 12 tháng gần nhất

**Given** một đơn hàng mới hoàn thành cho khách hàng X
**When** đơn hàng được lưu
**Then** total_purchased của X tăng thêm tổng tiền đơn
**And** purchase_count của X tăng thêm 1

**Given** đang ở tab Thống kê
**When** khách hàng chưa có đơn hàng nào
**Then** hiển thị trạng thái trống "Chưa có dữ liệu mua hàng"

---

## Story 4.3: Bảng giá Direct & Formula

As a chủ cửa hàng,
I want tạo bảng giá bằng phương pháp nhập trực tiếp hoặc công thức, có ngày hiệu lực và quy tắc làm tròn,
So that thiết lập giá bán cho từng nhóm khách hàng theo chiến lược kinh doanh.

**Acceptance Criteria:**

**Given** database chưa có bảng price_lists
**When** chạy migration
**Then** tạo bảng price_lists (id, name, description, method ENUM, base_price_list_id FK nullable, formula_type, formula_value, rounding_rule ENUM, effective_from DATE, effective_to DATE, is_active, created_at, updated_at)
**And** tạo bảng price_list_items (id, price_list_id FK, product_id FK, price, UNIQUE(price_list_id, product_id))

**Given** đang ở trang Quản lý bảng giá
**When** tạo bảng giá mới với method = "direct"
**Then** hiển thị danh sách sản phẩm, cho phép nhập giá trực tiếp cho từng sản phẩm
**And** lưu từng price_list_item với giá đã nhập

**Given** đang tạo bảng giá với method = "formula"
**When** chọn bảng giá gốc, chọn formula_type (% tăng/giảm hoặc +/- số tiền cố định), nhập formula_value
**Then** hệ thống tính giá cho toàn bộ sản phẩm = giá gốc áp dụng formula
**And** áp dụng rounding_rule đã chọn (ví dụ: ceil_thousand → 45.200 → 46.000)
**And** cho phép override giá từng sản phẩm riêng lẻ sau khi tính

**Given** bảng giá có effective_from và effective_to
**When** ngày hiện tại nằm ngoài khoảng này
**Then** bảng giá tồn tại nhưng is_active hiệu lực = false, không áp dụng vào tính giá trên POS
**When** ngày hiện tại nằm trong khoảng
**Then** bảng giá is_active hiệu lực = true và tham gia vào hệ thống giá

**Given** đang ở trang Quản lý bảng giá
**When** xem danh sách bảng giá
**Then** hiển thị: tên, method, bảng giá gốc (nếu formula/chain), ngày hiệu lực, trạng thái active
**And** có filter theo method và trạng thái

## Story 4.3b: Chain Formula, Clone & Import bảng giá

As a chủ cửa hàng,
I want tạo bảng giá nối chuỗi từ bảng giá khác, sao chép hoặc import từ CSV,
So that tiết kiệm thời gian thiết lập nhiều bảng giá phức tạp.

**Acceptance Criteria:**

**Given** đang tạo bảng giá với method = "chain"
**When** chọn base_price_list_id tạo thành vòng lặp (A → B → C → A)
**Then** hệ thống phát hiện cycle
**And** hiển thị lỗi "Phát hiện vòng lặp tham chiếu: A → B → C → A. Vui lòng chọn bảng giá gốc khác"
**And** không cho phép lưu

**Given** đang tạo bảng giá với method = "clone"
**When** chọn bảng giá nguồn
**Then** sao chép toàn bộ price_list_items từ bảng nguồn sang bảng mới
**And** bảng mới độc lập, chỉnh sửa không ảnh hưởng bảng nguồn

**Given** đang tạo bảng giá với method = "import"
**When** upload file CSV với format: product_code, price
**Then** hệ thống map product_code → product_id, tạo price_list_items tương ứng
**And** nếu product_code không tồn tại → ghi vào danh sách lỗi, bỏ qua dòng đó, tiếp tục import

## Story 4.3c: So sánh bảng giá

As a chủ cửa hàng,
I want so sánh 2 bảng giá cạnh nhau để thấy chênh lệch và margin,
So that ra quyết định điều chỉnh giá hợp lý dựa trên dữ liệu cụ thể.

**Acceptance Criteria:**

**Given** đang ở trang Quản lý bảng giá, có ≥2 bảng giá
**When** chọn chức năng "So sánh bảng giá" và chọn 2 bảng giá
**Then** hiển thị bảng so sánh: tên SP, giá bảng A, giá bảng B, chênh lệch (số tiền và %), margin (nếu có giá vốn)
**And** highlight dòng có chênh lệch > 10%

**Given** đang xem bảng so sánh
**When** sản phẩm có giá bảng B thấp hơn giá vốn WAC
**Then** hiển thị cảnh báo đỏ "Dưới vốn" tại dòng đó
**And** có thể filter chỉ hiện "SP dưới vốn"

**Given** đang xem bảng so sánh
**When** muốn export kết quả
**Then** nút "Xuất CSV" download file so sánh với đầy đủ cột

---

## Story 4.4: Giá riêng khách hàng & Giá theo số lượng

As a chủ cửa hàng,
I want thiết lập giá riêng cho khách hàng VIP và giá theo số lượng mua,
So that có chính sách giá linh hoạt phù hợp từng đối tượng và khuyến khích mua số lượng lớn.

**Acceptance Criteria:**

**Given** database chưa có bảng customer_prices, volume_prices
**When** chạy migration
**Then** tạo bảng customer_prices (id, customer_id FK, product_id FK, price, created_at, updated_at, UNIQUE(customer_id, product_id))
**And** tạo bảng volume_prices (id, product_id FK, min_qty, price, UNIQUE(product_id, min_qty))

**Given** đang ở trang chi tiết khách hàng hoặc trang quản lý giá riêng
**When** thêm giá riêng cho khách hàng X, sản phẩm Y với giá Z
**Then** lưu vào customer_prices
**And** giá này có ưu tiên CAO NHẤT (tầng 1) trong hệ thống 6 tầng, override tất cả bảng giá khác

**Given** đang ở trang quản lý sản phẩm hoặc trang giá theo số lượng
**When** thiết lập volume pricing cho sản phẩm Y với các tier: (từ 1: 50.000đ), (từ 10: 45.000đ), (từ 50: 40.000đ), (từ 100: 35.000đ), (từ 200: 30.000đ)
**Then** lưu tối đa 5 tiers vào volume_prices
**And** khi thêm tier thứ 6 → hiển thị lỗi "Tối đa 5 mức giá theo số lượng cho mỗi sản phẩm"
**And** min_qty phải tăng dần, giá phải giảm dần → validate khi lưu

## Story 4.4b: Chiết khấu danh mục & Kiểm soát sửa giá

As a chủ cửa hàng,
I want thiết lập chiết khấu theo danh mục và kiểm soát quyền sửa giá của nhân viên,
So that giá luôn đúng chính sách và không bị sửa trái phép.

**Acceptance Criteria:**

**Given** database chưa có bảng category_discounts
**When** chạy migration
**Then** tạo bảng category_discounts (id, category_id FK, customer_id FK nullable, customer_group_id FK nullable, discount_type ENUM, discount_value, min_qty, effective_from DATE, effective_to DATE, created_at, updated_at)

**Given** đang ở trang chiết khấu danh mục
**When** tạo chiết khấu cho category, áp dụng cho nhóm KH, loại %, giá trị, min_qty, ngày hiệu lực
**Then** lưu category_discount
**And** trên POS: KH thuộc nhóm mua ≥ min_qty SP thuộc danh mục trong khoảng hiệu lực → được giảm giá

**Given** nhân viên không có quyền sửa giá (permission edit_price = false)
**When** cố gắng chỉnh giá trên POS
**Then** chặn thao tác, hiển thị "Bạn không có quyền chỉnh giá"

**Given** nhân viên có quyền sửa giá
**When** chỉnh giá trên POS xuống DƯỚI giá vốn
**Then** hiển thị popup yêu cầu nhập PIN chủ cửa hàng
**And** PIN đúng → cho phép, ghi audit log (user_id, product_id, old_price, new_price, timestamp, order_id)
**And** PIN sai → từ chối, giữ nguyên giá cũ

**Given** nhân viên có quyền sửa giá
**When** chỉnh giá trên POS thành 0
**Then** chặn hoàn toàn, hiển thị "Không được phép bán giá 0đ"
**And** không hiển thị popup PIN, không cho phép override

**Given** nhân viên chỉnh giá thành công (trên hoặc bằng giá vốn)
**When** lưu thay đổi giá
**Then** ghi audit log gồm: user_id, product_id, old_price, new_price, timestamp, order_id
**And** audit log chỉ đọc, không cho phép sửa/xoá

---

## Story 4.5: Tích hợp 6 tầng giá vào POS

As a nhân viên bán hàng,
I want hệ thống tự động áp dụng đúng giá theo 6 tầng ưu tiên khi chọn khách hàng và sản phẩm,
So that không cần nhớ giá, bán đúng chính sách, tránh sai sót.

**Acceptance Criteria:**

**Given** pricing engine nằm trong packages/shared, đã có đầy đủ dữ liệu giá
**When** thêm sản phẩm vào đơn trên POS với khách hàng đã chọn
**Then** pricing engine tính giá theo thứ tự ưu tiên: (1) giá riêng KH → (2) CK danh mục → (3) giá chỉnh tay → (4) giá theo SL → (5) bảng giá nhóm KH → (6) giá bán lẻ
**And** dừng ở tầng đầu tiên tìm thấy giá hợp lệ

**Given** sản phẩm đang hiển thị trên dòng đơn hàng POS
**When** giá đã được xác định bởi pricing engine
**Then** hiển thị PriceSourceBadge bên cạnh giá, nội dung badge tương ứng tầng: "Giá riêng KH" / "CK danh mục" / "Giá chỉnh tay" / "Giá SL" / "BG [tên bảng giá]" / "Giá lẻ"
**And** badge có màu phân biệt cho mỗi tầng

**Given** đơn hàng chưa chọn khách hàng
**When** chọn khách hàng từ dropdown/search trên POS
**Then** tất cả sản phẩm đã có trong đơn tự động tính lại giá theo pricing engine với context khách hàng mới
**And** PriceSourceBadge cập nhật tương ứng
**And** tổng đơn hàng tính lại

**Given** khách hàng đang được chọn trên POS
**When** thay đổi số lượng sản phẩm vượt ngưỡng volume tier
**Then** giá tự động chuyển sang tier mới nếu volume_prices có ưu tiên cao hơn tầng hiện tại
**And** PriceSourceBadge đổi thành "Giá SL"

**Given** chủ cửa hàng đang ở Cài đặt > Chính sách giá
**When** chọn cascade mode cho bảng giá formula/chain
**Then** có 3 tuỳ chọn: (a) Realtime — giá gốc thay đổi → giá phụ thuộc đổi ngay lập tức, (b) Xác nhận — hiển thị danh sách ảnh hưởng, chờ xác nhận, (c) Tự động theo lịch
**And** lưu lựa chọn vào settings

**Given** chủ cửa hàng đang ở Cài đặt > Chính sách giá
**When** chọn price change strategy
**Then** có 3 tuỳ chọn: (a) Thủ công, (b) Cảnh báo — hệ thống gợi ý khi giá vốn thay đổi, (c) Tự động — giá bán tự điều chỉnh theo formula
**And** lưu lựa chọn vào settings

**Given** pricing engine nhận product_id, customer_id (nullable), quantity
**When** không có customer_id
**Then** bỏ qua tầng 1, 2, 5
**And** chỉ xét tầng 3 (manual edit) → tầng 4 (volume) → tầng 6 (giá lẻ)

**Given** PriceSourceBadge hiển thị trên dòng sản phẩm
**When** nhân viên nhấn vào badge
**Then** hiển thị tooltip chi tiết: giá ở từng tầng (nếu có), tầng nào đang áp dụng (highlight), lý do các tầng khác bị bỏ qua

---
