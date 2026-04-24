# Epic 2: Quản lý Hàng hóa

Owner tạo/sửa/xoá sản phẩm, biến thể (2 thuộc tính), danh mục 2 cấp, đơn vị quy đổi, theo dõi tồn kho, cảnh báo hết hàng, giá vốn BQ gia quyền.

## Story 2.1: Quản lý danh mục sản phẩm

As a Manager/Owner,
I want tổ chức sản phẩm theo danh mục 2 cấp,
So that khách hàng và nhân viên dễ dàng tìm đúng sản phẩm khi bán hàng.

**Acceptance Criteria:**

**Given** Owner/Manager đã đăng nhập
**When** vào trang Hàng hóa > Danh mục
**Then** hiển thị `CategoryTree` dạng cây: danh mục cha ở cấp 1, danh mục con ở cấp 2 (indent + icon expand/collapse)
**And** bảng `categories` có cấu trúc: `id`, `store_id`, `name`, `parent_id` (nullable), `sort_order`, `created_at`, `updated_at`
**And** `parent_id = null` → danh mục cấp 1, `parent_id = <id cấp 1>` → danh mục cấp 2
**And** không cho phép tạo cấp 3 (danh mục con của cấp 2)

**Given** trang danh mục đang mở
**When** nhấn "Thêm danh mục" và điền tên (bắt buộc, 1-100 ký tự)
**Then** tạo danh mục cấp 1 mới, hiển thị ngay trong cây không cần reload
**And** nếu chọn "Danh mục cha" từ dropdown → tạo thành danh mục cấp 2 thuộc cha đó

**Given** danh mục đã tồn tại
**When** nhấn icon Edit trên danh mục
**Then** mở inline edit hoặc dialog cho phép sửa tên, đổi danh mục cha (cấp 2 có thể chuyển sang cha khác)
**And** không cho phép chuyển danh mục cấp 1 (đang có con) thành cấp 2

**Given** danh sách danh mục hiển thị
**When** kéo-thả (drag-drop) danh mục
**Then** cập nhật `sort_order` trong database, thứ tự mới được lưu ngay
**And** chỉ cho drag-drop trong cùng cấp (cấp 1 với cấp 1, cấp 2 trong cùng cha)
**And** trên mobile, thay drag-drop bằng nút mũi tên lên/xuống

**Given** Owner muốn xoá danh mục
**When** nhấn icon Xoá trên danh mục
**Then** nếu danh mục có sản phẩm → hiển thị dialog cảnh báo "Danh mục đang chứa X sản phẩm, không thể xoá"
**And** nếu danh mục cấp 1 có danh mục con → không cho xoá, thông báo "Vui lòng xoá danh mục con trước"
**And** nếu danh mục trống → xoá thành công, Toast success

**Given** cửa hàng chưa có danh mục nào
**When** vào trang danh mục
**Then** hiển thị empty state: icon thư mục, text "Chưa có danh mục nào", mô tả "Tạo danh mục để phân loại sản phẩm", nút "Thêm danh mục đầu tiên"

---

## Story 2.2: CRUD sản phẩm cơ bản

As a Manager/Owner,
I want thêm, sửa, xoá, tìm kiếm sản phẩm,
So that tôi quản lý được toàn bộ danh mục hàng hoá của cửa hàng.

**Acceptance Criteria:**

**Given** Owner/Manager đã đăng nhập
**When** vào Hàng hóa > Sản phẩm > nhấn "Thêm sản phẩm"
**Then** mở form tạo sản phẩm với các trường: tên sản phẩm (bắt buộc, 1-255 ký tự), mã SKU (tự động sinh theo format `SP-XXXXXX`, cho phép sửa, unique trong store), barcode (tuỳ chọn, unique trong store), danh mục (chọn từ CategoryTree, tuỳ chọn), giá bán (bắt buộc, ≥0, format VND), giá vốn (tuỳ chọn, ≥0), đơn vị tính (mặc định "Cái"), hình ảnh (upload ≤5MB, jpg/png/webp, tối đa 1 ảnh), trạng thái (Đang bán / Ngừng bán, mặc định Đang bán)
**And** bảng `products`: `id`, `store_id`, `name`, `sku`, `barcode`, `category_id`, `selling_price`, `cost_price`, `unit`, `image_url`, `status`, `has_variants`, `track_inventory`, `min_stock`, `created_at`, `updated_at`

**Given** form tạo sản phẩm đang mở
**When** không điền tên sản phẩm hoặc giá bán rồi nhấn Lưu
**Then** hiển thị lỗi validation inline dưới field bắt buộc, nút Lưu không submit
**And** trường giá bán chỉ chấp nhận số, tự động format dấu chấm phân cách hàng nghìn (VD: 150.000)

**Given** sản phẩm đã tạo thành công
**When** vào trang danh sách sản phẩm
**Then** hiển thị bảng responsive: ảnh thumbnail (40x40), tên, SKU, danh mục, giá bán (format VND), tồn kho, trạng thái (badge màu)
**And** phân trang 20 sản phẩm/trang, hiển thị tổng số sản phẩm
**And** trên mobile chuyển sang dạng card list (ảnh trái, info phải)

**Given** danh sách sản phẩm đang hiển thị
**When** gõ vào ô tìm kiếm
**Then** tìm theo tên, SKU hoặc barcode, kết quả cập nhật sau khi ngừng gõ 300ms (debounce)
**And** filter theo: danh mục (dropdown tree), trạng thái (Đang bán / Ngừng bán / Tất cả), tồn kho (Còn hàng / Hết hàng / Dưới định mức)
**And** các filter kết hợp được với nhau (AND logic)

**Given** form tạo sản phẩm đang mở và `track_inventory = true`
**When** điền field "Tồn kho ban đầu" (optional, default = 0, chỉ hiện khi bật theo dõi tồn kho)
**Then** sau khi lưu, `current_stock` = giá trị nhập, tạo `inventory_transaction` loại `initial_stock`
**And** nếu sản phẩm có biến thể → cho phép set tồn kho riêng từng biến thể
**And** nếu `track_inventory = false` → field tồn kho ban đầu ẩn đi

**Given** Owner muốn sửa sản phẩm
**When** nhấn vào tên sản phẩm hoặc icon Edit
**Then** mở trang chi tiết / form edit pre-filled toàn bộ dữ liệu hiện tại
**And** lưu thành công → Toast success, quay về danh sách, dữ liệu cập nhật

**Given** Owner muốn xoá sản phẩm
**When** nhấn icon Xoá
**Then** hiển thị dialog xác nhận "Bạn có chắc muốn xoá sản phẩm [tên]?"
**And** xoá sản phẩm theo soft delete: set `deleted_at = NOW()`, ẩn khỏi danh sách nhưng giữ trong lịch sử đơn hàng
**And** Owner có thể xem "Sản phẩm đã xoá" và khôi phục (set `deleted_at = NULL`)

---

## Story 2.3: Biến thể sản phẩm

As a Manager/Owner,
I want tạo biến thể cho sản phẩm theo thuộc tính như Màu sắc và Kích cỡ,
So that tôi quản lý riêng giá, tồn kho, mã vạch cho từng phiên bản sản phẩm.

**Acceptance Criteria:**

**Given** đang tạo hoặc sửa sản phẩm
**When** bật toggle "Sản phẩm có biến thể"
**Then** hiển thị `VariantEditor` component: cho phép thêm tối đa 2 thuộc tính (VD: "Màu sắc", "Kích cỡ")
**And** mỗi thuộc tính cho phép nhập tối đa 20 giá trị (VD: Đỏ, Xanh, Vàng)
**And** khi bật biến thể, ẩn trường giá bán / giá vốn / barcode ở level sản phẩm (quản lý ở level biến thể)
**And** field `has_variants` trong bảng `products` chuyển thành `true`

**Given** đã nhập thuộc tính và giá trị
**When** hệ thống generate biến thể
**Then** tự động tạo tổ hợp tất cả giá trị (VD: 3 màu × 3 size = 9 biến thể)
**And** hiển thị bảng biến thể với các cột: tên biến thể (auto: "Đỏ - L"), SKU (auto-gen từ SKU cha + suffix), barcode (trống, tuỳ chọn), giá bán (bắt buộc, mặc định = giá cha cũ), giá vốn, tồn kho
**And** bảng `product_variants`: `id`, `product_id`, `sku`, `barcode`, `attribute_1_name`, `attribute_1_value`, `attribute_2_name`, `attribute_2_value`, `selling_price`, `cost_price`, `stock_quantity`, `status`, `created_at`, `updated_at`

**Given** bảng biến thể đang hiển thị
**When** sửa giá bán của 1 biến thể
**Then** chỉ cập nhật biến thể đó, không ảnh hưởng biến thể khác
**And** cho phép sửa hàng loạt: checkbox chọn nhiều biến thể → "Đặt giá bán" → áp dụng cùng giá

**Given** sản phẩm đang có biến thể
**When** thêm 1 giá trị thuộc tính mới (VD: thêm màu "Trắng")
**Then** tự động generate thêm biến thể mới cho giá trị đó
**And** biến thể cũ không bị ảnh hưởng, giữ nguyên dữ liệu

**Given** sản phẩm đang có biến thể, một số biến thể đã có trong đơn hàng
**When** xoá 1 giá trị thuộc tính (VD: bỏ màu "Đỏ")
**Then** hiển thị dialog cảnh báo "X biến thể sẽ bị xoá. Biến thể đã có đơn hàng sẽ chuyển sang ngừng bán."
**And** xác nhận → biến thể có đơn: soft delete, biến thể không đơn: hard delete

**Given** sản phẩm có biến thể đang hiển thị trong danh sách sản phẩm
**When** xem cột tồn kho
**Then** hiển thị tổng tồn kho tất cả biến thể
**And** nhấn vào dòng sản phẩm → trang chi tiết hiển thị bảng biến thể đầy đủ

---

## Story 2.4: Đơn vị quy đổi & Tồn kho

As a Manager/Owner,
I want thiết lập đơn vị quy đổi, theo dõi tồn kho và nhận cảnh báo hết hàng,
So that tôi biết chính xác còn bao nhiêu hàng và kịp thời nhập thêm.

**Acceptance Criteria:**

**Given** đang chỉnh sửa sản phẩm
**When** nhấn "Thêm đơn vị quy đổi"
**Then** mở form: đơn vị quy đổi (VD: "Thùng"), hệ số quy đổi (VD: 24 — nghĩa là 1 Thùng = 24 Cái), giá bán theo đơn vị quy đổi (tự tính = giá gốc × hệ số, cho phép sửa)
**And** bảng `unit_conversions`: `id`, `product_id`, `from_unit`, `to_unit`, `conversion_factor`, `selling_price`, `created_at`
**And** mỗi sản phẩm tối đa 3 đơn vị quy đổi

**Given** sản phẩm có đơn vị quy đổi
**When** bán hàng trên POS và chọn đơn vị "Thùng"
**Then** giá bán hiển thị đúng giá theo đơn vị quy đổi
**And** tồn kho trừ đúng số lượng quy đổi (bán 1 Thùng → trừ 24 Cái trong kho)

**Given** đang tạo/sửa sản phẩm
**When** bật toggle "Theo dõi tồn kho"
**Then** hiển thị thêm trường: tồn kho hiện tại (mặc định 0), định mức tồn kho tối thiểu (mặc định 0)
**And** `track_inventory = true` trong bảng `products`
**And** nếu tắt toggle → tồn kho hiển thị "∞" (không giới hạn), không trừ kho khi bán

**Given** sản phẩm có `track_inventory = true` và `min_stock > 0`
**When** tồn kho hiện tại ≤ `min_stock`
**Then** sản phẩm hiển thị badge "Sắp hết" (màu vàng nếu ≤ min_stock, đỏ nếu = 0) trong danh sách sản phẩm
**And** biểu tượng chuông trên Header hiển thị số đếm sản phẩm dưới định mức
**And** nhấn chuông → mở panel liệt kê tên sản phẩm + tồn kho hiện tại + định mức

**Given** danh sách sản phẩm đang hiển thị
**When** xem cột giá vốn
**Then** hiển thị giá vốn bình quân gia quyền (WAC)
**And** WAC = (tổng giá trị tồn kho cũ + giá trị nhập mới) / (số lượng cũ + số lượng mới)
**And** WAC tự động cập nhật khi có phiếu nhập kho mới

**Given** sản phẩm có biến thể và bật theo dõi tồn kho
**When** xem tồn kho
**Then** tồn kho quản lý ở cấp biến thể (mỗi biến thể có `stock_quantity` riêng)
**And** tồn kho hiển thị ở cấp sản phẩm = tổng tất cả biến thể
**And** cảnh báo hết hàng áp dụng cho từng biến thể riêng lẻ

---
