# Epic 9: Offline & PWA

Toàn bộ POS hoạt động offline với PGlite. Service Worker cache app shell. Background Sync đồng bộ đơn hàng. Conflict resolution server/client wins. PWA installable.

## Story 9.1: PGlite offline database & Service Worker

As a nhân viên bán hàng,
I want ứng dụng POS hoạt động hoàn toàn khi mất internet,
So that không bao giờ phải dừng bán hàng vì mất mạng.

**Acceptance Criteria:**

**Given** nhân viên mở ứng dụng lần đầu tiên (có internet)
**When** đăng nhập thành công
**Then** hệ thống khởi tạo PGlite database trong browser (persist trên IndexedDB)
**And** tạo schema mirror từ Drizzle server: products, variants, categories, customers, customer_groups, price_lists, price_list_items, settings, units
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
**And** app load được khi offline

**Given** mạng đang hoạt động bình thường
**When** quan sát OfflineIndicator trên top bar
**Then** indicator ẩn (default = online)

**Given** mạng bị mất
**When** trạng thái chuyển sang offline
**Then** OfflineIndicator hiển thị icon cloud-off màu neutral-400
**And** POS vẫn hoạt động: tìm SP từ PGlite (< 200ms), hiển thị giá từ PGlite, tạo đơn lưu PGlite

**Given** mạng có lại và có đơn pending
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

---

## Story 9.2: Sync engine & Conflict resolution

As a chủ cửa hàng,
I want đơn hàng offline tự động đồng bộ lên server khi có mạng mà không mất dữ liệu,
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
**Then** client wins cho đơn hàng → giữ giá 85k
**And** server lưu đơn với giá 85k, ghi flag price_at_sale = true

**Given** đơn offline bán 10 SP A, tồn kho server = 7
**When** server xử lý sync
**Then** server wins cho tồn kho → cho phép đơn, tồn kho = 7 - 10 = -3
**And** tạo alert cho owner: "Tồn kho SP A bị âm (-3) sau đồng bộ offline"
**And** alert hiển thị trên dashboard + notification

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
