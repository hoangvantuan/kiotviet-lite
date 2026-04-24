# Epic 9: Bán hàng không gián đoạn, Offline & PWA

Nhân viên bán hàng khi mất mạng: vẫn tạo đơn, vẫn in hóa đơn, vẫn phục vụ khách. Đơn hàng tự động đồng bộ khi có mạng lại. Chủ cửa hàng không mất giao dịch nào.

> **Lưu ý kỹ thuật:** Epic này wrap toàn bộ hệ thống (Epic 1-8) với PGlite offline database + Service Worker. Toàn bộ schema từ Epic 1-8 phải finalized trước khi implement Epic 9.

## PGlite Schema Migration Strategy

Khi server schema thay đổi (thêm column, thêm table, đổi type), PGlite trên client cũng phải cập nhật. Chiến lược migration:

**Version Tracking:**
- PGlite lưu bảng `schema_version` (version INT, applied_at TIMESTAMP, description TEXT)
- Mỗi lần app load: so sánh PGlite schema_version với server expected version qua API `GET /api/v1/schema/version`

**Migration Execution:**
- N��u PGlite version < server version: chạy migration scripts tuần tự (version N → N+1 → N+2...)
- Migration scripts nằm tại `packages/shared/src/migrations/pglite/` đánh số tương ứng server migrations
- Mỗi migration có paired Vitest test: tạo PGlite tại version N, chạy migration, assert schema N+1

**Ba loại thay ��ổi:**
1. **Additive** (thêm column/table): An toàn, chạy migration tự động
2. **Transform** (rename/change type): Chạy data migration background, hiện progress
3. **Destructive** (drop column/table): Yêu cầu full re-sync

**Re-sync Fallback:**
- Nếu migration fail hoặc version gap > 3: xóa PGlite, chạy lại full initial sync
- Hiện progress bar (ước lượng < 30s cho 5.000 SP + 2.000 KH)
- Đơn pending sync KHÔNG bị mất (lưu riêng trong `offline_orders` table, không bị xóa khi re-sync)

## Conflict Resolution Rationale

| Dữ liệu | Chiến lược | Lý do |
|----------|-----------|-------|
| Đơn hàng (giá, SL, CK) | **Client wins** | Đơn đã tạo = cam kết với KH. Nhân viên đã giao hàng, in hóa đơn. Không thể hủy sau khi KH đã nhận |
| Tồn kho | **Server wins** | Nhiều thiết bị (máy tính, tablet) ghi đồng thời. Server là nguồn chân lý duy nhất. Tồn kho âm là trạng thái tạm thời chấp nhận được (xem Negative Stock Handling) |
| SP, Giá, KH, Settings | **Server wins** | Chỉ Owner/Manager sửa trên server. Offline clients chỉ đọc, không sửa |

## Story 9.1: App hoạt động đầy đủ khi mất mạng

As a nhân viên bán hàng,
I want ứng dụng POS hoạt động hoàn toàn khi mất internet,
So that không bao giờ phải dừng bán hàng vì mất mạng.

**Acceptance Criteria:**

**Given** nhân viên mở ứng dụng lần đầu tiên (có internet)
**When** đăng nhập thành công
**Then** hệ thống khởi tạo PGlite database trong browser (persist trên IndexedDB)
**And** tạo schema mirror từ Drizzle server: products, variants, categories, customers, customer_groups, price_lists, price_list_items, settings, units
**And** tạo bảng `schema_version` với version hiện tại
**And** chạy initial sync: download toàn bộ dữ liệu từ server về PGlite
**And** lưu watermark `last_synced_at`

**Given** initial sync đang chạy với 5.000 SP + 2.000 KH
**When** sync hoàn thành
**Then** hiển thị progress bar với % hoàn thành
**And** tổng thời gian sync < 30 giây trên 4G
**And** nếu bị gián đoạn → retry tự động, không duplicate

**Given** Service Worker đã cài đặt bằng Workbox
**When** nhân viên mở app
**Then** Workbox precache: app shell (HTML, JS, CSS), static assets (icons, fonts, logo)
**And** runtime cache: API responses với StaleWhileRevalidate
**And** app load đư���c khi offline

**Given** server schema đã thay đổi (version mới hơn PGlite)
**When** app load và phát hiện version mismatch
**Then** chạy PGlite migration scripts tuần t��
**And** nếu migration thành công → cập nhật schema_version, tiếp tục dùng bình thường
**And** nếu migration fail hoặc gap > 3 → full re-sync (xóa data cũ, giữ đơn pending, download lại)
**And** hiện toast: "Đang cập nhật dữ liệu..." với progress bar

**Given** mạng đang ho���t động bình thường
**When** quan sát OfflineIndicator trên top bar
**Then** indicator ẩn (default = online)

**Given** mạng bị mất
**When** trạng thái chuyển sang offline
**Then** OfflineIndicator hiển thị icon cloud-off màu neutral-400
**And** POS vẫn hoạt động: tìm SP từ PGlite (< 200ms), hiển thị giá từ PGlite, tạo đơn lưu PGlite

**Given** m���ng có lại và có đơn pending
**When** trạng thái chuyển sang syncing
**Then** OfflineIndicator hiển thị icon cloud-sync xoay màu primary-500
**And** sau sync xong → indicator ẩn lại

**Given** sync gặp lỗi, retry 3 lần thất bại
**When** hiển thị trạng thái lỗi
**Then** OfflineIndicator hiển thị icon cloud-alert màu warning-500
**And** tap icon → chi tiết lỗi + nút "Thử lại"

**Given** PGlite đã có dữ liệu
**When** nhân viên tìm SP offline
**Then** query chạy trực tiếp PGlite bằng Drizzle ORM
**And** autocomplete hoàn thành < 200ms với ≤ 10.000 SP

## Story 9.2: Đơn hàng offline tự động đồng bộ khi có mạng

As a chủ cửa hàng,
I want đơn hàng offline t��� động đồng bộ lên server khi có mạng mà không mất d�� liệu,
So that tồn kho, doanh thu, công nợ trên server luôn đúng dù nhân viên bán offline.

**Acceptance Criteria:**

**Given** nhân viên tạo đơn hàng khi offline
**When** đơn hàng được lưu
**Then** lưu vào PGlite với: sync_status = 'pending', client_id = UUID v7, created_at = timestamp local
**And** đầy đủ: items, quantities, prices, customer_id, payment_method, discounts

**Given** mạng có lại và có 15 đơn pending
**When** Background Sync API trigger
**Then** batch push đơn hàng lên server theo thứ tự created_at
**And** mỗi đơn: server validate giá, tồn kho, hạn mức nợ
**And** valid → insert PostgreSQL → trả server_id + sync_status = 'synced'
**And** PGlite cập nhật: gán server_id, đổi sync_status = 'synced'

**Given** đơn offline có giá = 85k nhưng server đã cập nhật giá = 90k
**When** server validate
**Then** client wins cho đơn hàng → giữ giá 85k (xem Conflict Resolution Rationale)
**And** server lưu đơn với giá 85k, ghi flag price_at_sale = true

**Given** đơn offline bán 10 SP A, tồn kho server = 7
**When** server xử lý sync
**Then** server wins cho tồn kho → cho phép đơn, tồn kho = 7 - 10 = -3
**And** server tạo `inventory_alert` type = 'negative_after_sync'
**And** tạo notification cho owner: "Tồn kho SP A bị âm (-3) sau đồng bộ offline. Cần nhập thêm hoặc kiểm kho."
**And** Dashboard hiển thị alert trong "Cảnh b��o tồn kho"
**And** PGlite nhận giá trị tồn kho âm (-3) ở incremental sync kế tiếp
**And** tự tạo gợi ý nhập hàng trong báo cáo "Cần nhập"

**Given** sync 1 đơn riêng lẻ bị lỗi (network error hoặc server 5xx)
**When** retry logic kích hoạt
**Then** exponential backoff: lần 1 sau 2s, lần 2 sau 8s, lần 3 sau 32s (base=2, multiplier=4, max=3)
**And** sau 3 lần fail: đánh dấu sync_status = 'error', chuyển sang đơn tiếp theo trong batch
**And** đơn error KHÔNG block các đơn khác
**And** đơn error retry ở sync cycle tiếp theo (lần online kế hoặc retry thủ công)
**And** sau 24h liên tục error: hiển thị banner persistent "X đơn hàng chưa đồng bộ được. Kiểm tra kết nối mạng."

**Given** server có dữ liệu mới (SP, giá, KH mới)
**When** app online và chạy incremental sync
**Then** client gửi `last_synced_at` → server trả records có `updated_at > last_synced_at`
**And** PGlite upsert dữ liệu mới
**And** cập nhật watermark

**Given** sync ≤ 100 đơn offline
**When** batch push chạy
**Then** hoàn thành trong < 30 giây (NF16)
**And** không mất đơn nào (NF15) — đơn lỗi đánh dấu sync_status = 'error', retry sau
**And** đơn lỗi không block các đơn khác

**Given** nhân viên đang sử dụng app
**When** xem trạng thái sync
**Then** hiển thị: số đơn pending sync, thời gian sync gần nhất
**And** pending > 0 → badge số trên OfflineIndicator

**Given** ứng dụng chưa cài đặt
**When** truy cập lần đầu trên Chrome/Edge
**Then** hiển thị PWA install prompt
**And** manifest.json: name = "KiotViet Lite", short_name = "KVLite", start_url = "/", display = "standalone", theme_color = "#2563EB", icons (192px + 512px)
**And** sau cài đặt → app mở fullscreen, icon trên home screen
