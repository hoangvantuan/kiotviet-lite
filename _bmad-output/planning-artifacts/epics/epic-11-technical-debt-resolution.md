# Epic 11: Technical Debt Resolution (Preparation Sprint)

**Mục tiêu:** Giải quyết nợ kỹ thuật tích luỹ từ MVP trước khi deploy production và bắt đầu Phase 2. Chia 3 đợt theo mức ưu tiên: Critical (blocking production), Security Hardening, Performance & Quality.

**TDs covered:** TD1-TD30
**Thứ tự:** Chạy sau MVP complete, trước Phase 2.
**Nguồn:** MVP Retro 2026-05-05 + Deferred Work document

---

## Story 11.1: Production-Ready Critical Fixes

As a **chủ cửa hàng**,
I want hệ thống đủ an toàn và ổn định để deploy production,
So that khách hàng có thể sử dụng mà không gặp lỗi bảo mật hay crash.

**Acceptance Criteria:**

**Given** API server đang chạy
**When** auth endpoint nhận >5 requests/phút từ cùng IP
**Then** trả 429 Too Many Requests, block 1 phút
**And** register endpoint rate limit 3/hour/IP

**Given** API server nhận SIGTERM
**When** graceful shutdown kích hoạt
**Then** pino.final flush logs, connection pool drain, pending requests hoàn tất (timeout 10s), exit 0
**And** không mất log entry nào

**Given** web app (port 5173) gọi API (port 3000)
**When** request cross-origin
**Then** CORS headers đúng (Access-Control-Allow-Origin, Methods, Headers)
**And** security headers: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security

**Given** toàn bộ JSX files trong apps/web
**When** developer chạy app
**Then** tất cả text hiển thị tiếng Việt CÓ DẤU đầy đủ
**And** không còn ASCII-only Vietnamese trong bất kỳ component nào

**Given** code push lên main branch
**When** GitHub Actions CI pipeline chạy
**Then** lint + type-check + unit tests + build pass
**And** deploy tự động staging (hoặc manual trigger production)

**Given** mobile drawer navigation mở (≤767px)
**When** user tab focus
**Then** focus bị trap trong drawer, không escape ra ngoài
**And** khi đóng drawer, focus trả về hamburger button

**Given** bottom tab bar trên màn hình ≤375px
**When** render navigation
**Then** hiển thị tối đa 5 tabs (POS, SP, Đơn, Nợ, Thêm)
**And** "Thêm" mở menu gom các items còn lại

**Scope:** TD1, TD2, TD3, TD4, TD5, TD17, TD18

---

## Story 11.2: Security Hardening

As a **chủ cửa hàng**,
I want hệ thống bảo vệ khỏi replay attacks, CSRF, và token theft,
So that dữ liệu kinh doanh an toàn khi hệ thống public.

**Acceptance Criteria:**

**Given** webhook outbound gửi request
**When** server ký HMAC
**Then** header bao gồm timestamp (±5 phút tolerance) + nonce (UUID, dùng 1 lần)
**And** receiver verify cả HMAC + timestamp freshness + nonce uniqueness

**Given** refresh token đã bị sử dụng 1 lần
**When** cùng refresh token được dùng lại (reuse attempt)
**Then** revoke toàn bộ token family của user
**And** force re-login tất cả sessions

**Given** form submit sensitive action (POST/PUT/DELETE)
**When** request không có valid CSRF token
**Then** trả 403 Forbidden
**And** SameSite=Strict trên session cookie

**Given** .env file chứa JWT_SECRET
**When** server khởi động
**Then** validate: length ≥ 32 chars, TTL parse valid (15m, 7d format)
**And** reject startup nếu invalid, log error rõ ràng

**Given** user login/logout thành công
**When** sự kiện xảy ra
**Then** insert audit_log: action=login|logout, user_id, ip, user_agent, timestamp
**And** audit log không cho phép sửa/xóa

**Given** webhook outbound target URL
**When** URL trỏ tới private IP range (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
**Then** block request, log warning "SSRF attempt blocked"
**And** chỉ cho phép public HTTPS URLs

**Given** crypto parseKey nhận hex string
**When** string chứa invalid hex chars (non [0-9a-fA-F])
**Then** throw explicit error "Invalid hex in encryption key"
**And** không silent skip chars

**Given** retry mechanism với backoff
**When** tính delay cho attempt N
**Then** delay = min(baseDelay \* 4^attempt, 60_000ms)
**And** max cap 60 giây bất kể maxAttempts

**Given** route `/api/orders` accessible
**When** user có role Staff với permission `orders.view`
**Then** xem được danh sách đơn hàng
**And** `pos.sell` không bao gồm `orders.view` nữa (tách permission)

**Given** POST /api/notifications/emit với context field
**When** context object > 10KB hoặc nested > 3 levels
**Then** trả 422 validation error "context too large"
**And** Zod refine enforce size/depth limit

**Scope:** TD6, TD7, TD8, TD9, TD10, TD19, TD20, TD21, TD22, TD23

---

## Story 11.3: Performance & Quality Polish

As a **chủ cửa hàng**,
I want app nhanh, dễ dùng, và accessible cho mọi thiết bị,
So that nhân viên thao tác hiệu quả hơn và ít lỗi hơn.

**Acceptance Criteria:**

**Given** getOrderReturns service và POS search
**When** query returns/products
**Then** không có N+1 queries (dùng JOIN thay vì loop query)
**And** POS variant barcode search ≤ 2 queries (thay vì 5 round-trips)

**Given** 2 concurrent category updates đổi parent
**When** cả hai có sortOrder trùng
**Then** DB unique constraint (parent_id, sort_order) prevent duplicate
**And** retry logic hoặc UPDATE CASE WHEN bulk

**Given** notification_deliveries table
**When** records older than 90 ngày
**Then** cron job purge hàng ngày (retain 90 days configurable)
**And** log count deleted

**Given** CartItem buttons, CategoryFilter chips, scanner button
**When** render trên mobile (≤767px)
**Then** touch targets ≥ 44x44px
**And** CartItem stepper ≥ 44px (hiện 28px), CategoryFilter chips ≥ 44px (hiện 32px)

**Given** PosSearchBar component
**When** user type và suggestions hiện
**Then** input có role="combobox", aria-expanded, aria-controls
**And** suggestion list có role="listbox", mỗi item role="option"
**And** aria-activedescendant track item đang highlight

**Given** thanh toán POS kết hợp (combined)
**When** lưu đơn hàng
**Then** cashAmount và transferAmount persist vào DB (2 cột mới trong orders table)
**And** tra lại chi tiết thanh toán khi xem hóa đơn

**Given** StatusBadge và PaymentStatusBadge
**When** cần render badge trạng thái
**Then** dùng 1 shared component (extract từ duplicate code)
**And** order-list.tsx và order-detail-view.tsx import cùng component

**Given** CreateCategoryDiscountDialog và EditCategoryDiscountDialog
**When** form validation
**Then** dùng zodResolver (thay manual validation)
**And** remove duplicate logic, delegate cho Zod schema

**Given** searchProductsForPos service
**When** map variant data
**Then** dùng shared helper function (extract từ duplicate)
**And** không còn inline mapping logic lặp

**Given** trả hàng sản phẩm có unit conversion
**When** tạo phiếu trả
**Then** document design limitation "unitConversionId not stored in order_items"
**And** thêm TODO comment + note trong deferred-work cho Phase 2

**Given** category name input
**When** user nhập "Cà phê" (multiple spaces)
**Then** collapse thành "Cà phê" (single space) trước khi save
**And** unique check normalize whitespace

**Given** notification service catch blocks (6 chỗ)
**When** exception xảy ra
**Then** log error với full context (không swallow silently)
**And** audit trail maintained cho DB connection pool issues

**Scope:** TD11-TD16, TD24-TD30
