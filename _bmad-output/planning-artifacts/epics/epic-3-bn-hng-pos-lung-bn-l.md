# Epic 3: Bán hàng (POS) — Luồng bán lẻ

> **Phụ thuộc:** Epic 3 tập trung vào bán hàng cho khách vãng lai (không chọn KH). Chọn khách hàng trên POS và áp dụng hệ thống giá 6 tầng sẽ implement trong **Story 4.5** (Epic 4). Ghi nợ trên POS (F4) sẽ implement trong **Story 5.1** (Epic 5).

Nhân viên bán hàng cho khách vãng lai: tìm SP autocomplete, quét barcode camera, grid sản phẩm, giỏ hàng, chiết khấu, thanh toán tiền mặt/CK/QR, đa tab (5), phím tắt, auto mở đơn mới.

## Story 3.1: Giao diện POS & Tìm kiếm sản phẩm

As a nhân viên bán hàng,
I want giao diện POS nhanh, tìm sản phẩm tức thì bằng tên/mã vạch/lưới,
So that tôi phục vụ khách nhanh chóng mà không cần nhớ giá hay mã sản phẩm.

**Acceptance Criteria:**

**Given** nhân viên (bất kỳ role) đã đăng nhập
**When** vào trang Bán hàng (`/pos`)
**Then** hiển thị layout POS fullscreen responsive:
- **Desktop (≥1024px)**: trái = vùng sản phẩm (search bar + ProductGrid + danh mục filter), phải = CartPanel (chiếm 380px cố định)
- **Tablet (768-1023px)**: tương tự desktop nhưng CartPanel thu hẹp 320px
- **Mobile (<768px)**: full screen ProductGrid, CartPanel hiển thị dạng bottom sheet kéo lên, badge số lượng item trên nút giỏ hàng
**And** Sidebar và BottomTabBar ẩn hoàn toàn, chỉ có icon quay về menu góc trái trên

**Given** POS đang mở, chưa chọn khách hàng
**When** xem khu vực khách hàng trên POS
**Then** hiển thị placeholder "Khách vãng lai" với nút "Chọn KH" disabled, tooltip "Chức năng chọn KH sẽ kích hoạt trong Epic 4 (Story 4.5)"

**Given** POS đang mở
**When** gõ vào thanh tìm kiếm sản phẩm
**Then** autocomplete dropdown hiển thị kết quả trong ≤200ms (tìm theo tên, SKU, barcode)
**And** mỗi kết quả hiển thị: ảnh thumbnail, tên, giá bán, tồn kho
**And** nhấn Enter hoặc click kết quả → thêm 1 unit vào giỏ hàng ngay lập tức
**And** search bar tự động focus khi mở POS và sau mỗi lần thêm sản phẩm

**Given** POS đang mở ở chế độ hiển thị lưới
**When** xem ProductGrid
**Then** hiển thị sản phẩm dạng card: ảnh, tên (tối đa 2 dòng, ellipsis), giá bán
**And** số cột responsive: mobile 3 cột, tablet 4 cột, desktop 5-6 cột
**And** filter theo danh mục bằng tab/chip bar ngang phía trên grid
**And** sản phẩm hết hàng (tồn kho = 0, track_inventory = true) hiển thị overlay mờ + text "Hết hàng"

**Given** thiết bị có camera (mobile/tablet)
**When** nhấn icon barcode scanner trên thanh tìm kiếm
**Then** mở camera quét barcode bằng html5-qrcode
**And** nhận diện barcode → tìm sản phẩm có barcode khớp → thêm vào giỏ hàng tự động
**And** không tìm thấy → Toast warning "Không tìm thấy sản phẩm với mã [barcode]"
**And** camera tự đóng sau khi quét thành công, có nút đóng thủ công

**Given** POS hỗ trợ 2 chế độ bán hàng
**When** chuyển đổi giữa chế độ
**Then** **Chế độ quét nhanh (Quick Scan)**: search bar auto-focus, mỗi lần quét/enter → thêm 1 qty vào giỏ, không hiển thị dialog chọn biến thể (chọn biến thể mặc định hoặc hiện dialog nhanh)
**And** **Chế độ thường (Normal)**: nhấn card sản phẩm → mở dialog chi tiết: chọn biến thể (nếu có), chọn đơn vị, nhập số lượng, ghi chú → nhấn "Thêm vào giỏ"
**And** toggle chuyển chế độ hiển thị rõ ràng trên header POS, persist trong localStorage

**Given** sản phẩm có biến thể
**When** nhấn vào sản phẩm trên ProductGrid (chế độ thường)
**Then** hiển thị dialog chọn biến thể: hiển thị thuộc tính dạng chip (VD: Đỏ | Xanh | Vàng, S | M | L)
**And** chọn tổ hợp → hiển thị giá bán + tồn kho của biến thể đó
**And** nhấn "Thêm" → thêm đúng biến thể đã chọn vào giỏ

---

## Story 3.2: Giỏ hàng & Quản lý đơn hàng

As a nhân viên bán hàng,
I want quản lý giỏ hàng linh hoạt và làm việc song song nhiều đơn,
So that tôi phục vụ nhiều khách cùng lúc mà không mất đơn nào.

**Acceptance Criteria:**

**Given** đã thêm sản phẩm vào giỏ hàng
**When** xem CartPanel
**Then** hiển thị danh sách line item: tên sản phẩm (+ tên biến thể nếu có), đơn giá, số lượng (có nút +/- và input trực tiếp), thành tiền, nút xoá (icon thùng rác)
**And** phía dưới hiển thị: tổng số lượng, tổng tiền hàng, chiết khấu đơn hàng, tổng thanh toán
**And** trên mobile (bottom sheet): hiển thị tóm tắt (X sản phẩm — Tổng: Y VND), kéo lên để xem chi tiết đầy đủ

**Given** line item đang trong giỏ hàng
**When** nhấn vào dòng sản phẩm hoặc icon chiết khấu
**Then** mở inline edit cho phép: sửa số lượng, nhập chiết khấu dòng (chọn % hoặc VND cố định), ghi chú cho dòng
**And** chiết khấu dòng: nếu % → tính trên đơn giá × số lượng, nếu VND → trừ trực tiếp
**And** thành tiền = (đơn giá × số lượng) − chiết khấu dòng
**And** chiết khấu không được vượt quá thành tiền (không âm)

**Given** giỏ hàng có ít nhất 1 item
**When** nhấn vào vùng chiết khấu đơn hàng
**Then** mở popover nhập chiết khấu toàn đơn: chọn % hoặc VND cố định
**And** chiết khấu đơn áp dụng SAU chiết khấu dòng: tổng thanh toán = Σ thành tiền các dòng − chiết khấu đơn
**And** chiết khấu đơn không được vượt quá tổng tiền hàng

**Given** POS hỗ trợ 5 tab đơn hàng
**When** xem header CartPanel
**Then** hiển thị 5 tab (Tab 1-5), tab active highlight, mỗi tab hiển thị số item (VD: "Tab 1 (3)")
**And** nhấn tab khác → chuyển sang giỏ hàng của tab đó, dữ liệu tab cũ giữ nguyên
**And** tab trống hiển thị "+" hoặc text mờ
**And** bảng `orders`: `id`, `store_id`, `order_number` (auto: `HD-YYMMDD-XXXX`), `customer_id`, `user_id`, `subtotal`, `discount_type`, `discount_value`, `discount_amount`, `total`, `payment_method`, `payment_status`, `note`, `status`, `created_at`, `updated_at`
**And** bảng `order_items`: `id`, `order_id`, `product_id`, `variant_id`, `product_name`, `variant_name`, `unit`, `unit_price`, `quantity`, `discount_type`, `discount_value`, `discount_amount`, `line_total`, `note`

**Given** nhân viên sửa số lượng sản phẩm có `track_inventory = true`
**When** nhập số lượng > tồn kho hiện tại
**Then** hiển thị cảnh báo "Tồn kho chỉ còn X [đơn vị]" dưới dòng sản phẩm (text vàng)
**And** vẫn cho phép bán (cảnh báo, không block) — tồn kho có thể âm

**Given** giỏ hàng có sản phẩm
**When** nhấn nút "Huỷ đơn" hoặc icon xoá toàn bộ
**Then** hiển thị dialog xác nhận "Bạn có chắc muốn huỷ đơn hàng này?"
**And** xác nhận → xoá toàn bộ item trong tab hiện tại, reset về trạng thái trống

---

## Story 3.3: Thanh toán & Hoàn thành đơn hàng

As a nhân viên bán hàng,
I want thanh toán đơn hàng bằng nhiều phương thức và hoàn thành nhanh chóng,
So that tôi xử lý giao dịch linh hoạt, chính xác và bắt đầu phục vụ khách tiếp theo ngay.

**Acceptance Criteria:**

**Given** giỏ hàng có ≥1 item và tổng thanh toán > 0
**When** nhấn nút "Thanh toán" (hoặc phím tắt F2)
**Then** mở `PaymentDialog` hiển thị: tổng thanh toán (font lớn, đậm), 4 phương thức: Tiền mặt, Chuyển khoản, QR Code, Kết hợp
**And** mặc định chọn Tiền mặt
**And** nếu giỏ hàng trống hoặc tổng = 0 → nút thanh toán disabled

**Given** PaymentDialog mở, chọn "Tiền mặt"
**When** nhập số tiền khách đưa
**Then** tự động tính và hiển thị tiền thừa = tiền khách đưa − tổng thanh toán
**And** hiển thị các mệnh giá gợi ý (nút nhanh): số tiền chẵn gần nhất lớn hơn tổng (VD: tổng 47.000 → gợi ý 50.000, 100.000, 200.000, 500.000)
**And** nếu tiền khách đưa < tổng → hiển thị "Còn thiếu X" (đỏ), không cho hoàn thành

**Given** PaymentDialog mở, chọn "Chuyển khoản"
**When** xác nhận thanh toán
**Then** ghi nhận đơn hàng với `payment_method = 'transfer'`
**And** không yêu cầu nhập số tiền (mặc định = tổng thanh toán)

**Given** PaymentDialog mở, chọn "Kết hợp"
**When** nhập phần tiền mặt và phần chuyển khoản
**Then** tổng 2 phần phải ≥ tổng thanh toán, hiển thị tiền thừa nếu vượt
**And** ghi nhận `payment_method = 'combined'` kèm chi tiết phần tiền mặt + chuyển khoản

**Given** nhân viên nhấn "Hoàn thành" trong PaymentDialog
**When** thanh toán thành công
**Then** tạo record trong bảng `orders` (status = 'completed') và `order_items`
**And** nếu sản phẩm có `track_inventory = true` → trừ tồn kho tương ứng (theo đơn vị quy đổi nếu có)
**And** hiển thị màn hình hoá đơn tóm tắt: mã đơn, danh sách sản phẩm, tổng tiền, phương thức thanh toán, tiền thừa (nếu có)
**And** 2 nút: "In hoá đơn" và "Đơn hàng mới" (hoặc tự động mở đơn mới sau 3 giây)
**And** tab hiện tại reset về trống, sẵn sàng cho đơn tiếp theo

**Given** POS đang mở
**When** sử dụng phím tắt
**Then** các phím tắt hoạt động:
- `F2` → mở PaymentDialog
- `F4` → disabled, tooltip "Ghi nợ sẽ kích hoạt sau Epic 5 (Story 5.1)"
- `F5` → mở đơn hàng mới (tab trống tiếp theo)
- `Esc` → đóng dialog/popover đang mở
- `Ctrl+F` → focus vào ô tìm kiếm sản phẩm
- `↑↓` → navigate trong danh sách autocomplete
- `Enter` → chọn item đang highlight trong autocomplete, hoặc xác nhận dialog
**And** hover icon "?" góc phải dưới → hiển thị tooltip danh sách phím tắt

**Given** nhân viên đang bán hàng trên POS
**When** muốn kiểm tra tồn kho nhanh
**Then** nhấn vào sản phẩm trong giỏ hàng hoặc kết quả tìm kiếm → popover hiển thị: tồn kho hiện tại, tồn kho theo biến thể (nếu có), định mức tối thiểu, trạng thái
**And** thông tin tồn kho realtime (query lại database)

**Given** đơn hàng vừa hoàn thành, sản phẩm trừ kho xuống dưới `min_stock`
**When** hệ thống kiểm tra tồn kho sau khi trừ
**Then** badge chuông cảnh báo trên Header tăng số đếm
**And** nếu tồn kho = 0 → sản phẩm trên ProductGrid chuyển sang trạng thái "Hết hàng" ngay lập tức

---
