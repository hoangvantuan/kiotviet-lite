---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# kiotviet-lite - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for kiotviet-lite, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Quản lý Hàng hóa (FR1-FR7):**

- FR1: Chủ cửa hàng có thể tạo, sửa, xoá sản phẩm với thông tin: tên, SKU (auto-gen), barcode, danh mục, đơn vị tính, giá gốc, giá bán lẻ, mô tả, hình ảnh (1 ảnh), trạng thái (đang bán/ngừng bán)
- FR2: Chủ cửa hàng có thể tạo biến thể sản phẩm với tối đa 2 thuộc tính (VD: Màu + Size), mỗi thuộc tính tối đa 20 giá trị, mỗi biến thể có SKU, barcode, giá, tồn kho riêng
- FR3: Chủ cửa hàng có thể tạo đơn vị quy đổi cho sản phẩm (VD: 1 thùng = 24 lon) với hệ số quy đổi và giá riêng theo đơn vị
- FR4: Chủ cửa hàng có thể tạo danh mục sản phẩm tối đa 2 cấp (cha → con), sắp xếp thứ tự hiển thị bằng kéo-thả
- FR5: Chủ cửa hàng có thể bật/tắt theo dõi tồn kho cho từng sản phẩm và đặt định mức tồn tối thiểu
- FR6: Hệ thống tự tính giá vốn bình quân gia quyền từ phiếu nhập hàng
- FR7: Hệ thống hiển thị cảnh báo (badge đỏ + thông báo) khi sản phẩm dưới định mức tồn tối thiểu

**Nhập hàng & Nhà cung cấp (FR8-FR12):**

- FR8: Chủ cửa hàng có thể tạo phiếu nhập kho với: NCC, danh sách SP (quét barcode hoặc tìm tên), SL, đơn giá nhập, chiết khấu (% hoặc cố định, theo dòng hoặc tổng), trạng thái thanh toán
- FR9: Hệ thống tự cập nhật giá vốn bình quân gia quyền và tồn kho sau mỗi phiếu nhập
- FR10: Chủ cửa hàng có thể tạo phiếu kiểm kho: chọn SP → nhập SL thực tế → hệ thống tính chênh lệch → xác nhận → tự điều chỉnh tồn kho + tạo log
- FR11: Chủ cửa hàng có thể quản lý NCC (tên, SĐT, địa chỉ, email, công nợ NCC)
- FR12: Hệ thống lưu lịch sử mọi lần nhập hàng (giá nhập, SL, NCC, giá vốn BQ sau nhập)

**Quản lý Đơn giá (FR13-FR25):**

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

**Bán hàng — POS (FR26-FR35):**

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

**Bán hàng Offline (FR36-FR39):**

- FR36: Toàn bộ luồng bán hàng (thêm SP, thanh toán, in hóa đơn) hoạt động khi không có internet
- FR37: Dữ liệu SP, KH, bảng giá được cache local (IndexedDB/PGlite)
- FR38: Đơn hàng offline đánh dấu `sync_status = pending`, tự đồng bộ khi có mạng
- FR39: Conflict resolution: server wins (tồn kho), client wins (đơn hàng). Tồn kho âm sau sync → cảnh báo

**Quản lý Khách hàng (FR40-FR45):**

- FR40: Chủ cửa hàng có thể quản lý KH: tên (bắt buộc), SĐT (bắt buộc, unique), email, địa chỉ, MST, ghi chú, hạn mức nợ riêng
- FR41: Chủ cửa hàng có thể tạo nhóm KH, mỗi nhóm gắn bảng giá mặc định và hạn mức nợ mặc định
- FR42: Mỗi KH thuộc đúng 1 nhóm. Thay đổi nhóm → tự đổi bảng giá. Hạn mức KH override hạn mức nhóm
- FR43: Hệ thống tự tính: tổng đã mua, số lần mua, nợ hiện tại
- FR44: Trang chi tiết KH hiển thị: tab Đơn hàng (lọc theo ngày, trạng thái), tab Công nợ, tab Thống kê (SP mua nhiều nhất, tháng mua nhiều nhất)
- FR45: Nhân viên có thể tạo KH mới nhanh từ POS (chỉ cần tên + SĐT)

**Quản lý Hóa đơn (FR46-FR51):**

- FR46: Hệ thống hiển thị danh sách hóa đơn với: mã (auto-gen HD-YYYYMMDD-XXXX), ngày, KH, tổng tiền, đã trả, còn nợ, trạng thái, người tạo
- FR47: Hỗ trợ lọc hóa đơn theo: ngày (hôm nay/tuần/tháng/tùy chọn), trạng thái, KH, phương thức thanh toán, trạng thái nợ
- FR48: Nhân viên có thể xem chi tiết hóa đơn (SP, KH, thanh toán, lịch sử trả nợ) và in lại
- FR49: Manager/Owner có thể tạo phiếu trả hàng từ hóa đơn gốc: chọn SP + SL trả + lý do → hệ thống tự cộng tồn kho, giảm doanh thu, hoàn tiền hoặc giảm nợ
- FR50: Hệ thống hỗ trợ 2 mẫu in: thermal (58mm/80mm) và A4/A5 (cho bán buôn, có bảng SP, tổng bằng chữ, ký tên)
- FR51: Chủ cửa hàng có thể tùy chỉnh mẫu in: logo, slogan, thông tin hiển thị, ẩn/hiện nợ cũ/mới/giá vốn/CK, ghi chú cuối

**Quản lý Công nợ (FR52-FR58):**

- FR52: Nhân viên có thể ghi nợ toàn bộ hoặc 1 phần khi bán hàng (tích hợp trực tiếp trong POS)
- FR53: Hệ thống kiểm tra hạn mức nợ trước khi ghi nợ. Vượt hạn mức → block. Owner override bằng PIN
- FR54: Nhân viên có thể tạo phiếu thu (thu nợ KH): tìm KH → xem tổng nợ + DS hóa đơn nợ → nhập số tiền → phân bổ tự động FIFO hoặc chọn hóa đơn cụ thể
- FR55: Owner có thể điều chỉnh nợ thủ công (xoá nợ xấu, sửa sai): nhập số nợ mới + lý do → tạo phiếu điều chỉnh
- FR56: Chủ cửa hàng có thể tạo phiếu chi để trả nợ NCC
- FR57: Hệ thống cảnh báo: KH sắp đạt hạn mức (≥ 80%), KH vượt hạn mức (block đơn), nợ quá hạn (30/60/90 ngày, cấu hình được)
- FR58: Báo cáo công nợ: tổng hợp phải thu, chi tiết theo KH, phân nhóm theo thời gian (0-30, 31-60, 61-90, >90 ngày), tổng hợp phải trả, sổ quỹ

**Báo cáo (FR59-FR64):**

- FR59: Dashboard tổng quan: doanh thu, lợi nhuận, số đơn (hôm nay/tuần/tháng/năm), biểu đồ 7 ngày, cảnh báo tồn kho + nợ quá hạn, top 5 SP bán chạy
- FR60: Báo cáo doanh thu: theo ngày/tuần/tháng, theo SP, theo KH, theo nhân viên
- FR61: Báo cáo lợi nhuận: tổng (doanh thu - giá vốn), theo SP
- FR62: Báo cáo tồn kho: tồn hiện tại + giá trị, SP cần nhập (dưới mức), hàng chậm bán (>30 ngày)
- FR63: Báo cáo giá: đơn hàng có sửa giá, so sánh bảng giá + margin, lịch sử giá nhập
- FR64: Tất cả danh sách (SP, KH, đơn hàng, công nợ) hỗ trợ export CSV/Excel

**Quyền hạn & Quản trị (FR65-FR67):**

- FR65: Hệ thống hỗ trợ 3 vai trò: Owner, Manager, Staff với ma trận quyền chi tiết
- FR66: Owner có thể quản lý nhân viên (tạo, sửa, vô hiệu hóa) và cài đặt cửa hàng
- FR67: Hệ thống hỗ trợ xác thực bằng PIN cho các thao tác nhạy cảm (sửa giá dưới vốn, override hạn mức nợ)

### NonFunctional Requirements

**Performance (NF1-NF4):**

- NF1: Tìm sản phẩm (autocomplete) hoàn thành trong < 200ms với ≤ 10.000 sản phẩm, đo trên thiết bị Android mid-range
- NF2: Tạo và lưu đơn hàng hoàn thành trong < 500ms (local + sync)
- NF3: Tải trang bất kỳ hoàn thành trong < 2 giây trên kết nối 4G
- NF4: POS giỏ hàng render mượt ≥ 30fps khi thao tác thêm/xoá/sửa SP

**Security (NF5-NF9):**

- NF5: Mã hoá dữ liệu truyền tải bằng TLS 1.2+
- NF6: Hash password bằng bcrypt/argon2 với salt
- NF7: Authentication bằng JWT với refresh token rotation
- NF8: PIN owner không lưu plaintext, hash + rate-limit (5 lần sai → khoá 15 phút)
- NF9: Tất cả thao tác sửa giá, điều chỉnh nợ, override hạn mức tạo audit log không xoá được

**Scalability (NF10-NF13):**

- NF10: Hỗ trợ ≤ 10.000 sản phẩm/cửa hàng trong MVP
- NF11: Hỗ trợ ≤ 5.000 khách hàng/cửa hàng trong MVP
- NF12: Hỗ trợ ≤ 5 nhân viên bán cùng lúc trên 1 cửa hàng không conflict
- NF13: Database backup tự động hàng ngày

**Offline & Sync (NF14-NF16):**

- NF14: 100% chức năng bán hàng (POS, tạo đơn, in hóa đơn) hoạt động offline
- NF15: Đồng bộ tự động khi có mạng, không mất đơn hàng
- NF16: Thời gian sync ≤ 100 đơn hàng offline trong < 30 giây

**Compatibility (NF17-NF19):**

- NF17: Hoạt động trên mobile ≥ 375px, tablet, desktop
- NF18: Hỗ trợ in ấn: thermal printer 58mm/80mm (ESC/POS protocol), A4/A5
- NF19: Camera quét barcode hoạt động trên Chrome Android và Safari iOS

### Additional Requirements

**Từ Architecture Document:**

- AR1: Khởi tạo monorepo pnpm workspaces với 3 packages: `apps/web` (Vite + React 19 SPA/PWA), `apps/api` (Hono 4.12 backend), `packages/shared` (Zod schemas, types, utils)
- AR2: TypeScript strict mode, ESM only, Node.js ≥ 22 LTS, pnpm ≥ 9.x
- AR3: Database server PostgreSQL ≥ 16 với Drizzle ORM 0.45.x, PGlite 0.4.x cho offline browser DB
- AR4: Zod schemas dùng chung client/server cho validation — define trong `packages/shared`
- AR5: UUID v7 cho primary key (sortable by time, distributed/offline friendly)
- AR6: Soft delete cho business entities (đơn hàng, KH, SP), timestamps `created_at` + `updated_at` trên mọi table
- AR7: Drizzle schema transform camelCase JSON ↔ snake_case DB (`.camelCase()`)
- AR8: Authentication bằng Better Auth 1.6.x — JWT access (15min) + refresh token rotation (7 ngày), Argon2id password hash
- AR9: Multi-tenancy: `store_id` trong JWT, mọi query filter theo `store_id`, middleware auto-inject
- AR10: Audit log append-only table — action, entity_type, entity_id, old_value, new_value, user_id, created_at — không cho phép xóa/sửa (DB constraint)
- AR11: API REST resource-based, Hono + @hono/zod-openapi cho OpenAPI docs
- AR12: API response format chuẩn hóa: `{ data, meta }` (success), `{ error: { code, message, details } }` (error)
- AR13: Error codes chuẩn hóa: VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), PIN_REQUIRED (403), NOT_FOUND (404), CONFLICT (409), BUSINESS_RULE_VIOLATION (422), RATE_LIMITED (429), INTERNAL_ERROR (500)
- AR14: Rate limiting: auth 5 req/min/IP, PIN 5 attempts + 15min lockout, general 100 req/min/user, sync 10 req/min/user
- AR15: Sync protocol: client tạo đơn offline (PGlite, sync_status=pending, client_id=UUID) → Background Sync API → batch push → server validate (giá, tồn, hạn mức) → insert PostgreSQL → trả sync_status=synced + server_id
- AR16: Conflict resolution: server wins (tồn kho, SP, KH, bảng giá, settings), client wins (đơn hàng)
- AR17: Initial sync download toàn bộ (products, customers, price_lists, settings) → PGlite persistent (IndexedDB) → incremental sync dùng `updated_at` watermark
- AR18: Service Worker: Workbox precache app shell + static assets, runtime cache API responses, Background Sync offline orders
- AR19: Frontend state: Zustand (cart, UI, offline status), TanStack Query (server data cache + refetch), PGlite (offline reads trực tiếp bằng Drizzle)
- AR20: Routing: TanStack Router, file-based routes
- AR21: Styling: Tailwind CSS 4.2.x + shadcn/ui, React Hook Form + Zod cho forms
- AR22: Barcode: html5-qrcode, Virtual scroll: @tanstack/react-virtual, Icons: Lucide React
- AR23: Printing: thermal (Web Serial API / WebUSB → ESC/POS binary), A4/A5 (CSS @media print + window.print()), fallback print image nếu không kết nối được thermal
- AR24: Infrastructure: Vercel/CF Pages (SPA), Railway/Fly.io (API container), Neon PostgreSQL (serverless), Cloudflare R2 (images), GitHub Actions CI/CD, Sentry monitoring
- AR25: Pricing engine (6-tier) và debt allocator (FIFO) là pure functions trong `packages/shared/src/utils/` — chạy được cả client và server
- AR26: Feature-based code organization (by feature, not by type), co-located tests
- AR27: Naming conventions: DB snake_case số nhiều, API kebab-case, JSON camelCase, components PascalCase, hooks use-*.ts, constants UPPER_SNAKE_CASE
- AR28: Currency lưu integer (VNĐ, không thập phân), tính toán integer arithmetic, format `Intl.NumberFormat('vi-VN')`
- AR29: Date: `timestamptz` (UTC) trong DB, ISO 8601 API, `date-fns` cho UI format locale vi-VN

### UX Design Requirements

- UX-DR1: Triển khai hệ thống design tokens qua `tailwind.config.js` — colors (primary #2563EB, success #16A34A, warning #F59E0B, error #DC2626, neutral scale), spacing (base 4px: 4/8/12/16/20/24/32/40), breakpoints (375/768/1024/1280px)
- UX-DR2: Triển khai hệ thống typography — font stack Inter + Noto Sans (body) + JetBrains Mono (số tiền, mã), type scale 12-36px với weight/line-height cụ thể. Số tiền luôn `font-mono font-semibold`, format VNĐ dấu chấm nghìn
- UX-DR3: Tạo component Button với 4 variants (primary, secondary, ghost, destructive) và 3 sizes (sm, md, lg) sử dụng CVA (class-variance-authority). Touch target ≥ 44px mobile. Mỗi trang chỉ 1 Primary button
- UX-DR4: Tạo component Input với prefix (icon), suffix (đơn vị "đ"), error state (border đỏ + message dưới). Số tiền auto-format khi blur, `inputmode="decimal"` cho mobile
- UX-DR5: Wrap Radix UI primitives thành project components: Dialog/Modal (bottom sheet mobile, centered desktop), Toast (4 types, max 1 hiện tại), Tabs (scrollable mobile), Select (search-enabled), Tooltip, Dropdown
- UX-DR6: Tạo component POSProductGrid — grid responsive (3 col mobile, 4 tablet, 5-6 desktop), mỗi card hiện ảnh 1:1 + tên truncate + giá mono bold. Tap = thêm 1, long-press = chọn SL/biến thể. States: default, out-of-stock (xám + badge "Hết hàng"), loading (skeleton)
- UX-DR7: Tạo component POSCart — bottom sheet kéo lên (mobile), panel phải (tablet/desktop). Items hiện tên, SL stepper ±, đơn giá, thành tiền, badge nguồn giá. Swipe hoặc X để xóa. States: empty, has-items, checkout-mode
- UX-DR8: Tạo component PriceSourceBadge — pill shape, text-xs, font-medium. Mỗi nguồn giá 1 màu: "Giá riêng KH" (blue), "Giá ĐL C1" (purple), "Giá theo SL" (green), "Giá bán lẻ" (gray). Padding 2px 6px
- UX-DR9: Tạo component OfflineIndicator — 4 states: online (hidden), offline (icon cloud-off neutral-400), syncing (cloud-sync spinning primary-500), sync error (cloud-alert warning-500 + tap xem chi tiết). Vị trí trên top bar
- UX-DR10: Tạo component DebtSummaryCard — tổng nợ font lớn (đỏ nếu > hạn mức), hạn mức, % đã dùng, progress bar. 3 color states: trong hạn mức (xanh), ≥80% (vàng), vượt (đỏ). Tap xem chi tiết HĐ nợ
- UX-DR11: Tạo component InvoicePrintTemplate — 3 variants: thermal 58mm (logo nhỏ, compress table, font 8-10pt), thermal 80mm (logo, table, nợ cũ/mới), A4 (full header, bảng SP đầy đủ, tổng bằng chữ, ký tên). Render phía client (offline OK)
- UX-DR12: Tạo component DashboardMetricCard — label, value (font lớn mono), trend ↑↓, sparkline 7 ngày. States: loading (skeleton), data, empty, error. Layout 2 col mobile, 4 col desktop
- UX-DR13: Triển khai responsive POS layout — Mobile: grid SP trên + giỏ hàng bottom sheet + search sticky top + camera scan button. Tablet: 2 cột (SP 60%, giỏ 40%). Desktop: sidebar + 2 cột rộng + KH info trên giỏ
- UX-DR14: Triển khai navigation pattern — Mobile: bottom tab bar 5 tabs (POS, SP, Đơn, Nợ, Thêm). Tablet: bottom tab hoặc sidebar (user chọn). Desktop: sidebar cố định. Back button top-left trên detail pages. Breadcrumb desktop only
- UX-DR15: Triển khai feedback patterns — Toast success (xanh lá, auto 3s), error (đỏ, persist cần dismiss, kèm gợi ý sửa), warning (banner vàng + action button), info (xanh dương, auto 4s). Loading: skeleton shimmer cho content, spinner chỉ cho button đang xử lý
- UX-DR16: Triển khai form patterns — validate on blur, error message dưới field text-sm đỏ, 1 cột mobile / 2 cột desktop, label trên input, required `*` đỏ, group section heading
- UX-DR17: Triển khai empty states cho mỗi danh sách — illustration line art + heading ("Chưa có sản phẩm nào") + mô tả ngắn + CTA button ("Thêm sản phẩm")
- UX-DR18: Triển khai confirmation patterns 4 mức — inline toggle (nhẹ: bật/tắt tồn kho), bottom sheet 2 nút (trung bình: ghi nợ, trả hàng), dialog gõ lại tên (nặng: xóa SP, xóa bảng giá), PIN Owner (nhạy cảm: sửa giá dưới vốn, override hạn mức)
- UX-DR19: Triển khai keyboard shortcuts POS — Enter (thêm SP), F2 (thanh toán), F4 (ghi nợ), F5 (tab mới), Esc (hủy), Ctrl+F (focus search), ↑↓ (navigate). Hiển thị shortcut hints trên desktop
- UX-DR20: Triển khai accessibility WCAG 2.1 AA — contrast ≥ 4.5:1, keyboard tab focus + visible ring 2px, ARIA labels, touch target ≥ 44px, font min 14px rem-based, `prefers-reduced-motion` respect, `lang="vi"`, focus management (modal trap, return focus, page nav → heading)
- UX-DR21: Triển khai responsive tables — table đầy đủ trên desktop (sort/filter), card list trên mobile (swipe actions), horizontal scroll tablet nếu cần

### FR Coverage Map

- FR1: Epic 2 — CRUD sản phẩm
- FR2: Epic 2 — Biến thể sản phẩm
- FR3: Epic 2 — Đơn vị quy đổi
- FR4: Epic 2 — Danh mục 2 cấp
- FR5: Epic 2 — Theo dõi tồn kho + định mức tối thiểu
- FR6: Epic 2 — Giá vốn bình quân gia quyền
- FR7: Epic 2 — Cảnh báo tồn kho thấp
- FR8: Epic 6 — Phiếu nhập kho
- FR9: Epic 6 — Cập nhật giá vốn BQ + tồn kho sau nhập
- FR10: Epic 6 — Kiểm kho
- FR11: Epic 6 — Quản lý NCC
- FR12: Epic 6 — Lịch sử nhập hàng
- FR13: Epic 4 — Nhiều bảng giá song song
- FR14: Epic 4 — 5 cách thiết lập bảng giá (chain formula)
- FR15: Epic 4 — Chống vòng lặp chain formula
- FR16: Epic 4 — Làm tròn + ngày hiệu lực
- FR17: Epic 4 — Giá riêng KH
- FR18: Epic 4 — Giá theo SL (5 bậc)
- FR19: Epic 4 — CK danh mục
- FR20: Epic 4 — 6 tầng ưu tiên trên POS
- FR21: Epic 4 — Hiển thị nguồn giá trên POS
- FR22: Epic 4 — Sửa giá (quyền, PIN, audit)
- FR23: Epic 4 — Cascade giá
- FR24: Epic 4 — So sánh bảng giá
- FR25: Epic 4 — Chiến lược khi giá nhập thay đổi
- FR26: Epic 3 — Thêm SP vào đơn (barcode/tên/grid)
- FR27: Epic 3 — 2 chế độ bán (nhanh/thường)
- FR28: Epic 4 — Chọn KH trên POS → auto bảng giá
- FR29: Epic 3 — Chiết khấu theo dòng/tổng
- FR30: Epic 3 (tiền mặt/CK/QR/kết hợp) + Epic 5 (ghi nợ)
- FR31: Epic 5 — Ghi nợ + kiểm tra hạn mức + PIN override
- FR32: Epic 3 — 5 tab đơn hàng đồng thời
- FR33: Epic 3 — Tra tồn kho nhanh từ POS
- FR34: Epic 3 — Phím tắt POS
- FR35: Epic 3 — Sau thanh toán auto (in, trừ tồn, mở đơn mới)
- FR36: Epic 9 — Bán hàng offline hoàn toàn
- FR37: Epic 9 — Cache local PGlite
- FR38: Epic 9 — Đơn offline sync_status=pending, auto sync
- FR39: Epic 9 — Conflict resolution (server/client wins)
- FR40: Epic 4 — Quản lý KH (tên, SĐT, email, hạn mức nợ)
- FR41: Epic 4 — Nhóm KH + bảng giá mặc định
- FR42: Epic 4 — KH thuộc 1 nhóm, đổi nhóm = đổi giá
- FR43: Epic 4 — Tự tính tổng mua, số lần, nợ hiện tại
- FR44: Epic 4 — Chi tiết KH (tab Đơn hàng, Công nợ, Thống kê)
- FR45: Epic 4 — Tạo KH nhanh từ POS
- FR46: Epic 7 — Danh sách hóa đơn
- FR47: Epic 7 — Lọc hóa đơn
- FR48: Epic 7 — Chi tiết + in lại hóa đơn
- FR49: Epic 7 — Trả hàng
- FR50: Epic 7 — 2 mẫu in (thermal + A4)
- FR51: Epic 7 — Tùy chỉnh mẫu in
- FR52: Epic 5 — Ghi nợ toàn bộ/1 phần trong POS
- FR53: Epic 5 — Kiểm tra hạn mức + PIN override
- FR54: Epic 5 — Phiếu thu (FIFO hoặc chọn HĐ)
- FR55: Epic 5 (Story 5.4) — Điều chỉnh nợ thủ công
- FR56: Epic 5 (Story 5.3) — Phiếu chi trả nợ NCC
- FR57: Epic 5 (Story 5.5) — Cảnh báo nợ (≥80%, vượt, quá hạn)
- FR58: Epic 5 (Story 5.5) — Báo cáo công nợ (phân nhóm thời gian)
- FR59: Epic 8 — Dashboard tổng quan
- FR60: Epic 8 — Báo cáo doanh thu
- FR61: Epic 8 — Báo cáo lợi nhuận
- FR62: Epic 8 — Báo cáo tồn kho
- FR63: Epic 8 — Báo cáo giá
- FR64: Epic 8 — Export CSV/Excel
- FR65: Epic 1 — 3 vai trò (Owner/Manager/Staff)
- FR66: Epic 1 — Quản lý nhân viên + cài đặt cửa hàng
- FR67: Epic 1 — Xác thực PIN cho thao tác nhạy cảm

## Execution Order

> **Lưu ý:** Thứ tự thực thi KHÁC thứ tự đánh số. Epic 4 (KH & Giá) phải hoàn thành TRƯỚC Epic 3 (POS) vì POS cần customers + pricing system để hoạt động đúng.

| Thứ tự | Epic | Lý do |
|---|---|---|
| 1 | Epic 1: Khởi tạo & Quản trị | Nền tảng monorepo, auth, roles — prerequisite cho tất cả |
| 2 | Epic 2: Hàng h��a | Products — prerequisite cho POS và pricing |
| 3 | **Epic 4: KH & Đơn giá** | Customers + pricing system — prerequisite cho POS áp giá đúng |
| 4 | **Epic 3: POS** | Giờ có đủ products, customers, pricing → POS hoạt động đầy đủ |
| 5 | Epic 5: Công nợ | Ghi nợ, phiếu thu/chi — mở rộng POS payment |
| 6 | Epic 6: Nhập hàng & NCC | Phiếu nhập, kiểm kho — độc lập |
| 7 | Epic 7: Hóa đơn & In ấn | Cần orders từ Epic 3 |
| 8 | Epic 8: Báo cáo | Cần data từ tất cả modules trước |
| 9 | Epic 9: Offline & PWA | Wrap toàn bộ hệ thống với PGlite + sync |

## Epic List

### Epic 1: Khởi tạo dự án & Quản trị cửa hàng
Owner đăng ký cửa hàng, đăng nhập, quản lý nhân viên, phân quyền 3 vai trò. Nền tảng monorepo, design tokens, base components, auth system.
**FRs:** FR65, FR66, FR67
**ARs:** AR1-AR14, AR20-AR22, AR24, AR27-AR29
**UX-DRs:** UX-DR1-5, UX-DR14-17, UX-DR20

### Epic 2: Quản lý Hàng hóa
Owner tạo/sửa/xoá sản phẩm, biến thể (2 thuộc tính), danh mục 2 cấp, đơn vị quy đổi, theo dõi tồn kho, cảnh báo hết hàng, giá vốn BQ gia quyền.
**FRs:** FR1, FR2, FR3, FR4, FR5, FR6, FR7
**UX-DRs:** UX-DR17, UX-DR21

### Epic 3: Bán hàng (POS) — Luồng bán lẻ
Nhân viên bán hàng cho khách vãng lai: tìm SP autocomplete, quét barcode camera, grid sản phẩm, giỏ hàng, chiết khấu, thanh toán tiền mặt/CK/QR, đa tab (5), phím tắt, auto mở đơn mới.
**FRs:** FR26, FR27, FR29, FR30 (trừ ghi nợ), FR32, FR33, FR34, FR35
**UX-DRs:** UX-DR6, UX-DR7, UX-DR13, UX-DR19

### Epic 4: Khách hàng & Hệ thống Đơn giá
Owner quản lý KH + nhóm KH, tạo bảng giá chain formula, 6 tầng ưu tiên, cascade, so sánh giá. POS tự áp giá đúng khi chọn KH, hiển thị nguồn giá. Tạo KH nhanh từ POS.
**FRs:** FR13-FR25, FR28, FR40-FR45
**UX-DRs:** UX-DR8, UX-DR10

### Epic 5: Quản lý Công nợ
Nhân viên ghi nợ toàn bộ/1 phần khi bán hàng, hệ thống kiểm tra hạn mức + PIN override. Phiếu thu FIFO, phiếu chi NCC, điều chỉnh nợ, cảnh báo nợ quá hạn.
**FRs:** FR31, FR52-FR58, FR30 (phần ghi nợ)
**UX-DRs:** UX-DR10, UX-DR18
**Stories:** 5.1 (Ghi nợ POS), 5.2 (Phiếu thu FIFO), 5.3 (Phiếu chi NCC), 5.4 (Điều chỉnh nợ), 5.5 (Cảnh báo & BC công nợ)

### Epic 6: Nhập hàng & Nhà cung cấp
Owner tạo phiếu nhập kho, kiểm kho, quản lý NCC, giá vốn BQ gia quyền tự cập nhật, lịch sử nhập hàng.
**FRs:** FR8, FR9, FR10, FR11, FR12

### Epic 7: Hóa đơn & In ấn
Nhân viên xem/lọc/in lại hóa đơn. Owner xử lý trả hàng. In thermal 58/80mm (ESC/POS) + A4/A5. Tùy chỉnh mẫu in (logo, slogan, ẩn/hiện trường).
**FRs:** FR46, FR47, FR48, FR49, FR50, FR51
**ARs:** AR23
**UX-DRs:** UX-DR11

### Epic 8: Báo cáo & Dashboard
Chủ cửa hàng nắm tình hình kinh doanh trong 30 giây: dashboard tổng quan, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/giá, export CSV/Excel.
**FRs:** FR59, FR60, FR61, FR62, FR63, FR64
**UX-DRs:** UX-DR12

### Epic 9: Offline & PWA
Toàn bộ POS hoạt động offline với PGlite. Service Worker cache app shell. Background Sync đồng bộ đơn hàng. Conflict resolution server/client wins. PWA installable.
**FRs:** FR36, FR37, FR38, FR39
**NFRs:** NF14, NF15, NF16
**ARs:** AR15-AR18
**UX-DRs:** UX-DR9

---

## Epic 1: Khởi tạo dự án & Quản trị cửa hàng

Owner đăng ký cửa hàng, đăng nhập, quản lý nhân viên, phân quyền 3 vai trò. Nền tảng monorepo, design tokens, base components, auth system.

### Story 1.1: Khởi tạo monorepo, database, design system cơ bản

As a developer,
I want một monorepo hoàn chỉnh với database, design system và dev server chạy được,
So that toàn bộ team có nền tảng thống nhất để phát triển các tính năng tiếp theo.

> **Parallel Work Lanes:** Story này gồm 3 luồng có thể triển khai song song:
> - **Lane A:** Monorepo + PostgreSQL + Drizzle + PGlite (infra + data layer)
> - **Lane B:** Tailwind + Design tokens + 6 base components (UI layer)
> - **Lane C:** ESLint + Prettier + TypeScript strict + Vitest (quality layer)
>
> Lane B và C chỉ cần Lane A hoàn thành cấu trúc thư mục cơ bản, không cần database chạy.

**Acceptance Criteria:**

**Given** developer clone repo về máy lần đầu
**When** chạy `pnpm install && pnpm dev`
**Then** dev server khởi động thành công trong ≤30 giây với cả 3 workspace: `apps/web` (Vite 8 + React 19), `apps/api` (Hono), `packages/shared`
**And** không có lỗi TypeScript hay lint error nào

**Given** monorepo đã cài đặt
**When** kiểm tra cấu trúc thư mục
**Then** tồn tại đúng 3 workspace: `apps/web`, `apps/api`, `packages/shared`
**And** `packages/shared` export được types, constants, utils dùng chung cho cả web và api
**And** path alias `@shared/*` hoạt động trong cả web và api

**Given** PostgreSQL đang chạy
**When** chạy `pnpm db:migrate`
**Then** Drizzle ORM tạo thành công schema ban đầu (bảng `users`, `stores`, migration history)
**And** file migration được lưu trong `apps/api/src/db/migrations`
**And** `pnpm db:studio` mở được Drizzle Studio để inspect database

**Given** dev server đang chạy
**When** truy cập `apps/web` trên trình duyệt
**Then** Tailwind CSS 4 hoạt động, shadcn/ui đã cấu hình
**And** design tokens được định nghĩa trong CSS variables: `--color-primary`, `--color-secondary`, `--color-destructive`, `--color-muted`, `--radius`, `--font-sans`

**Given** design system đã cấu hình
**When** import các base component
**Then** 6 component cơ bản sẵn sàng sử dụng: `Button` (4 variants: default/secondary/outline/destructive, 3 sizes: sm/md/lg), `Input`, `Dialog`, `Toast`, `Tabs`, `Select`
**And** mỗi component có TypeScript props đầy đủ

**Given** PostgreSQL schema đã tạo thành công
**When** khởi tạo PGlite trong browser (hoặc test environment)
**Then** PGlite tạo được schema tương đương từ Drizzle shared schemas (`packages/shared/src/schema/`)
**And** cùng 1 Drizzle schema definition dùng cho cả PostgreSQL server và PGlite client (DRY)
**And** `pnpm test:pglite` chạy test tạo PGlite instance + insert/query record thành công
**And** document rõ cách client và server schemas đồng bộ khi thêm table/column mới

**Given** developer muốn kiểm tra code quality
**When** chạy `pnpm lint` và `pnpm typecheck`
**Then** ESLint + Prettier chạy trên toàn monorepo không lỗi
**And** TypeScript strict mode bật cho tất cả workspace
**And** `pnpm test` chạy được Vitest (dù chưa có test case nào)

**Given** developer hoàn thành Story 1.1
**When** muốn bắt đầu implement Story 1.2 (Đăng ký & Đăng nhập)
**Then** có thể tạo React component mới trong `apps/web`, import types từ `@shared/*`, dev server hot-reload
**And** có thể tạo API route mới trong `apps/api`, query database qua Drizzle, trả JSON response
**And** toàn bộ TypeScript strict mode pass, không lỗi

---

### Story 1.2: Đăng ký cửa hàng & Đăng nhập

As a chủ cửa hàng,
I want đăng ký tài khoản bằng số điện thoại và đăng nhập an toàn,
So that tôi có cửa hàng riêng trên hệ thống và chỉ người được phép mới truy cập được.

**Acceptance Criteria:**

**Given** người dùng mới truy cập hệ thống lần đầu
**When** vào trang đăng ký và điền: tên cửa hàng (bắt buộc, 2-100 ký tự), số điện thoại (bắt buộc, format VN 10 số), mật khẩu (bắt buộc, ≥8 ký tự), tên chủ cửa hàng (bắt buộc)
**Then** hệ thống tạo 1 record trong bảng `users` (role = `owner`) và 1 record trong bảng `stores`
**And** user được liên kết với store qua `store_id`
**And** tự động đăng nhập và redirect về trang chủ

**Given** số điện thoại đã được đăng ký
**When** người dùng khác đăng ký với cùng số điện thoại
**Then** hiển thị lỗi "Số điện thoại đã được sử dụng" ngay dưới field input
**And** không tạo record mới nào trong database

**Given** Better Auth đã cấu hình trên `apps/api`
**When** người dùng đăng nhập đúng số điện thoại + mật khẩu
**Then** server trả về JWT access token (expire 15 phút) và refresh token (expire 7 ngày)
**And** access token chứa: `userId`, `storeId`, `role`
**And** token được lưu trong httpOnly cookie (không localStorage)

**Given** access token đã hết hạn
**When** client gửi request đến API
**Then** middleware tự động dùng refresh token để lấy access token mới
**And** request ban đầu được retry tự động, user không bị gián đoạn
**And** nếu refresh token cũng hết hạn, redirect về trang đăng nhập

**Given** người dùng chưa đăng nhập
**When** truy cập bất kỳ route nào ngoài `/login` và `/register`
**Then** TanStack Router redirect về `/login`
**And** sau khi đăng nhập thành công, redirect về URL ban đầu user muốn vào

**Given** người dùng đã đăng nhập
**When** nhấn "Đăng xuất"
**Then** xoá JWT cookie cả access và refresh token
**And** redirect về `/login`
**And** mọi request API tiếp theo trả về 401

**Given** người dùng điền form đăng ký
**When** nhập số điện thoại sai format (không đủ 10 số, chứa chữ cái)
**Then** hiển thị lỗi validation inline dưới field
**And** nút "Đăng ký" bị disable cho đến khi tất cả field hợp lệ

**Given** server trả về lỗi bất kỳ (500, network error)
**When** đang submit form đăng ký hoặc đăng nhập
**Then** hiển thị Toast lỗi với message rõ ràng (không hiển thị stack trace)
**And** form giữ nguyên dữ liệu user đã nhập, không reset

---

### Story 1.3: Layout ứng dụng & Navigation

As a người dùng,
I want giao diện nhất quán trên mọi thiết bị với navigation rõ ràng,
So that tôi thao tác nhanh dù dùng điện thoại, tablet hay máy tính.

**Acceptance Criteria:**

**Given** người dùng đã đăng nhập, màn hình ≥1024px (desktop)
**When** trang load xong
**Then** hiển thị `AppLayout` gồm: `Sidebar` bên trái (240px, có thể collapse về 64px icon-only), `Header` trên cùng (tên cửa hàng, avatar, nút đăng xuất), vùng content chính bên phải
**And** Sidebar chứa menu: Tổng quan, Bán hàng (POS), Hàng hóa, Báo cáo, Cài đặt — mỗi mục có icon + text
**And** menu item active được highlight bằng `--color-primary`

**Given** người dùng đã đăng nhập, màn hình <768px (mobile)
**When** trang load xong
**Then** Sidebar ẩn đi, thay bằng `BottomTabBar` cố định phía dưới (5 tab tương ứng 5 menu)
**And** Header rút gọn chỉ hiển thị tên cửa hàng và icon menu hamburger
**And** nhấn hamburger mở Sidebar dạng overlay drawer từ trái, nhấn ngoài hoặc swipe trái để đóng

**Given** người dùng đang dùng tablet (768px-1023px)
**When** trang load xong
**Then** Sidebar collapse mặc định về icon-only (64px)
**And** hover hoặc nhấn icon menu → expand ra full Sidebar overlay
**And** BottomTabBar ẩn

**Given** route hiện tại là `/pos`
**When** kiểm tra layout
**Then** POS screen chiếm toàn bộ viewport, ẩn Sidebar và BottomTabBar để tối đa diện tích bán hàng
**And** có nút icon nhỏ góc trái trên để quay về menu chính

**Given** component con bất kỳ throw JavaScript error
**When** error xảy ra trong runtime
**Then** `ErrorBoundary` bắt lỗi, hiển thị UI fallback thân thiện: icon lỗi, message "Đã xảy ra lỗi", nút "Thử lại" (reload component) và nút "Về trang chủ"
**And** error được log ra console kèm component stack trace
**And** phần còn lại của app không bị crash

**Given** Toast system đã tích hợp
**When** action thành công (tạo/sửa/xoá) hoặc lỗi xảy ra
**Then** Toast hiển thị góc trên phải (desktop) hoặc trên cùng full-width (mobile)
**And** 4 loại: success (xanh lá), error (đỏ), warning (vàng), info (xanh dương)
**And** tự đóng sau 3 giây (success/info) hoặc 5 giây (error/warning), có nút đóng thủ công

**Given** một trang có danh sách nhưng chưa có dữ liệu nào
**When** trang load xong
**Then** hiển thị empty state: illustration/icon, tiêu đề mô tả (VD: "Chưa có sản phẩm nào"), mô tả ngắn, nút CTA chính (VD: "Thêm sản phẩm đầu tiên")
**And** mỗi trang danh sách có empty state riêng phù hợp ngữ cảnh

**Given** app đã render xong
**When** kiểm tra accessibility
**Then** tất cả interactive element có thể navigate bằng Tab, focus ring visible (2px `--color-primary`)
**And** color contrast ratio ≥4.5:1 cho text, ≥3:1 cho UI component (WCAG 2.1 AA)
**And** mọi icon button có `aria-label`, mọi form field có `label` liên kết

---

### Story 1.4: Quản lý nhân viên & Phân quyền

As a chủ cửa hàng (Owner),
I want quản lý nhân viên, phân quyền và thiết lập mã PIN,
So that mỗi người chỉ truy cập đúng chức năng được phép và tôi theo dõi được ai làm gì.

**Acceptance Criteria:**

**Given** Owner đã đăng nhập
**When** vào trang Cài đặt > Nhân viên > nhấn "Thêm nhân viên"
**Then** mở form tạo nhân viên: tên (bắt buộc), số điện thoại (bắt buộc, unique trong store), role (chọn 1 trong 3: Owner/Manager/Staff), mã PIN (bắt buộc, đúng 6 số)
**And** tạo thành công → record mới trong bảng `users` liên kết đúng `store_id`, Toast success, danh sách cập nhật
**And** mã PIN được hash (bcrypt) trước khi lưu, không bao giờ trả về plaintext qua API

**Given** danh sách nhân viên hiển thị
**When** Owner xem danh sách
**Then** bảng responsive hiển thị: tên, số điện thoại, vai trò (badge màu: Owner=tím, Manager=xanh, Staff=xám), trạng thái (hoạt động/khoá), ngày tạo
**And** có ô tìm kiếm theo tên/SĐT, filter theo role
**And** trên mobile, bảng chuyển sang dạng card list

**Given** hệ thống phân quyền 3 roles
**When** kiểm tra ma trận quyền
**Then** quyền được phân như sau:

| Chức năng | Owner | Manager | Staff |
|---|---|---|---|
| Quản lý nhân viên | ✅ | ❌ | ❌ |
| Cài đặt cửa hàng | ✅ | ❌ | ❌ |
| Xem báo cáo | ✅ | ✅ | ❌ |
| Quản lý hàng hóa | ✅ | ✅ | ❌ |
| Bán hàng (POS) | ✅ | ✅ | ✅ |
| Xem lịch sử bán hàng | ✅ | ✅ | Chỉ đơn của mình |

**And** API middleware kiểm tra role trước mỗi request, trả 403 nếu không đủ quyền
**And** UI ẩn menu/nút mà user không có quyền truy cập

**Given** nhân viên đã có mã PIN
**When** nhân viên nhập PIN 6 số tại màn hình xác thực
**Then** hệ thống so khớp PIN hash trong ≤200ms
**And** đúng → cho phép thao tác, sai → hiển thị "Mã PIN không đúng", sau 5 lần sai liên tiếp → khoá 15 phút
**And** PIN dùng cho: xác nhận thao tác nhạy cảm (sửa giá dưới vốn, override hạn mức nợ)

**Given** Owner muốn sửa thông tin nhân viên
**When** nhấn icon Edit trên dòng nhân viên
**Then** mở form pre-filled với dữ liệu hiện tại, cho phép sửa: tên, role, trạng thái, reset PIN
**And** không cho phép sửa số điện thoại (hiển thị disabled)
**And** Owner không thể hạ role của chính mình xuống dưới Owner
**And** lưu thành công → ghi 1 record vào bảng `audit_logs` (who, action, target, timestamp, changes JSON)

**Given** Owner muốn khoá nhân viên
**When** nhấn nút "Khoá" và xác nhận trong dialog
**Then** nhân viên chuyển trạng thái "Khoá", không thể đăng nhập hay xác thực PIN
**And** nếu nhân viên đang online → session bị invalidate ngay lập tức
**And** audit log ghi nhận hành động khoá

**Given** Owner vào trang Cài đặt > Cửa hàng
**When** trang load xong
**Then** hiển thị form cài đặt cửa hàng: tên cửa hàng, địa chỉ, số điện thoại, logo (upload ảnh ≤2MB, jpg/png)
**And** lưu thành công → Toast success, header cập nhật tên mới ngay

**Given** hệ thống audit log
**When** Owner vào Cài đặt > Lịch sử hoạt động
**Then** hiển thị bảng `audit_logs`: thời gian, người thực hiện, hành động, chi tiết thay đổi
**And** filter theo người thực hiện, loại hành động, khoảng thời gian
**And** phân trang 20 record/trang
**And** audit_logs là append-only, không cho phép sửa/xoá (DB constraint)

---

## Epic 2: Quản lý Hàng hóa

Owner tạo/sửa/xoá sản phẩm, biến thể (2 thuộc tính), danh mục 2 cấp, đơn vị quy đổi, theo dõi tồn kho, cảnh báo hết hàng, giá vốn BQ gia quyền.

### Story 2.1: Quản lý danh mục sản phẩm

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

### Story 2.2: CRUD sản phẩm cơ bản

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

### Story 2.3: Biến thể sản phẩm

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

### Story 2.4: Đơn vị quy đổi & Tồn kho

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

## Epic 3: Bán hàng (POS) — Luồng bán lẻ

Nhân viên bán hàng cho khách vãng lai: tìm SP autocomplete, quét barcode camera, grid sản phẩm, giỏ hàng, chiết khấu, thanh toán tiền mặt/CK/QR, đa tab (5), phím tắt, auto mở đơn mới.

### Story 3.1: Giao diện POS & Tìm kiếm sản phẩm

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

### Story 3.2: Giỏ hàng & Quản lý đơn hàng

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

### Story 3.3: Thanh toán & Hoàn thành đơn hàng

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
- `F4` → mở dialog ghi nợ (khi có Epic 5)
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

## Epic 4: Khách hàng & Hệ thống Đơn giá

Owner quản lý KH + nhóm KH, tạo bảng giá chain formula, 6 tầng ưu tiên, cascade, so sánh giá. POS tự áp giá đúng khi chọn KH, hiển thị nguồn giá. Tạo KH nhanh từ POS.

### Story 4.1: Quản lý khách hàng & Nhóm khách hàng

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

### Story 4.2: Trang chi tiết khách hàng

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

### Story 4.3: Bảng giá & Chain Formula

As a chủ cửa hàng,
I want tạo nhiều bảng giá bằng nhiều phương pháp khác nhau, có ngày hiệu lực và quy tắc làm tròn,
So that linh hoạt thiết lập giá bán cho từng nhóm khách hàng theo chiến lược kinh doanh.

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

**Given** đang tạo bảng giá với method = "chain"
**When** chọn base_price_list_id tạo thành vòng lặp (A → B → C → A)
**Then** hệ thống phát hiện cycle
**And** hiển thị lỗi "Phát hiện vòng lặp tham chiếu: A → B → C → A. Vui lòng chọn bảng giá gốc khác"
**And** không cho phép lưu

**Given** bảng giá có effective_from và effective_to
**When** ngày hiện tại nằm ngoài khoảng này
**Then** bảng giá tồn tại nhưng is_active hiệu lực = false, không áp dụng vào tính giá trên POS
**When** ngày hiện tại nằm trong khoảng
**Then** bảng giá is_active hiệu lực = true và tham gia vào hệ thống giá

**Given** đang tạo bảng giá với method = "clone"
**When** chọn bảng giá nguồn
**Then** sao chép toàn bộ price_list_items từ bảng nguồn sang bảng mới
**And** bảng mới độc lập, chỉnh sửa không ảnh hưởng bảng nguồn

**Given** đang tạo bảng giá với method = "import"
**When** upload file CSV với format: product_code, price
**Then** hệ thống map product_code → product_id, tạo price_list_items tương ứng
**And** nếu product_code không tồn tại → ghi vào danh sách lỗi, bỏ qua dòng đó, tiếp tục import

**Given** đang ở trang Quản lý bảng giá, có ≥2 bảng giá
**When** chọn chức năng "So sánh bảng giá" và chọn 2 bảng giá
**Then** hiển thị bảng so sánh: tên SP, giá bảng A, giá bảng B, chênh lệch (số tiền và %), margin (nếu có giá vốn)
**And** highlight dòng có chênh lệch > 10%

---

### Story 4.4: Giá riêng khách hàng, Giá theo số lượng & Chiết khấu danh mục

As a chủ cửa hàng,
I want thiết lập giá riêng cho khách hàng VIP, giá theo số lượng mua và chiết khấu theo danh mục sản phẩm,
So that có chính sách giá linh hoạt phù hợp từng đối tượng và khuyến khích mua số lượng lớn.

**Acceptance Criteria:**

**Given** database chưa có bảng customer_prices, volume_prices, category_discounts
**When** chạy migration
**Then** tạo bảng customer_prices (id, customer_id FK, product_id FK, price, created_at, updated_at, UNIQUE(customer_id, product_id))
**And** tạo bảng volume_prices (id, product_id FK, min_qty, price, UNIQUE(product_id, min_qty)) — tối đa 5 tiers per product
**And** tạo bảng category_discounts (id, category_id FK, customer_id FK nullable, customer_group_id FK nullable, discount_type ENUM, discount_value, min_qty, effective_from DATE, effective_to DATE, created_at, updated_at)

**Given** đang ở trang chi tiết khách hàng hoặc trang quản lý giá riêng
**When** thêm giá riêng cho khách hàng X, sản phẩm Y với giá Z
**Then** lưu vào customer_prices
**And** giá này có ưu tiên CAO NHẤT (tầng 1) trong hệ thống 6 tầng, override tất cả bảng giá khác

**Given** đang ở trang quản lý sản phẩm hoặc trang giá theo số lượng
**When** thiết lập volume pricing cho sản phẩm Y với các tier: (từ 1: 50.000đ), (từ 10: 45.000đ), (từ 50: 40.000đ), (từ 100: 35.000đ), (từ 200: 30.000đ)
**Then** lưu tối đa 5 tiers vào volume_prices
**And** khi thêm tier thứ 6 → hiển thị lỗi "Tối đa 5 mức giá theo số lượng cho mỗi sản phẩm"
**And** min_qty phải tăng dần, giá phải giảm dần → validate khi lưu

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

### Story 4.5: Tích hợp 6 tầng giá vào POS

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

## Epic 5: Quản lý Công nợ

Nhân viên ghi nợ toàn bộ/1 phần khi bán hàng, hệ thống kiểm tra hạn mức + PIN override. Phiếu thu FIFO, phiếu chi NCC, điều chỉnh nợ, cảnh báo nợ quá hạn.

### Story 5.1: Ghi nợ trong POS & Kiểm tra hạn mức

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

### Story 5.2: Phiếu thu & Phân bổ FIFO

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

### Story 5.3: Phiếu chi trả nợ NCC

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

### Story 5.4: Điều chỉnh nợ thủ công

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

### Story 5.5: Cảnh báo nợ & Báo cáo công nợ

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

## Epic 6: Nhập hàng & Nhà cung cấp

Owner tạo phiếu nhập kho, kiểm kho, quản lý NCC, giá vốn BQ gia quyền tự cập nhật, lịch sử nhập hàng.

### Story 6.1: Quản lý NCC & Phiếu nhập kho

As a chủ cửa hàng,
I want quản lý nhà cung cấp và tạo phiếu nhập kho với đầy đủ thông tin sản phẩm, giá, chiết khấu,
So that tồn kho và giá vốn bình quân gia quyền luôn chính xác sau mỗi lần nhập hàng.

**Acceptance Criteria:**

**Given** chủ cửa hàng đang ở trang Nhà cung cấp
**When** bấm "Thêm NCC" và nhập tên, SĐT, địa chỉ, email
**Then** hệ thống tạo NCC mới với công nợ NCC = 0
**And** NCC hiển thị trong danh sách, hỗ trợ sửa và xoá (soft delete)

**Given** chủ cửa hàng đang tạo phiếu nhập kho
**When** chọn NCC từ dropdown và thêm sản phẩm bằng quét barcode hoặc tìm tên/SKU
**Then** sản phẩm hiển thị trong danh sách phiếu nhập với các cột: tên, SKU, SL, đơn giá nhập, chiết khấu dòng, thành tiền

**Given** phiếu nhập có 3 sản phẩm với SL và đơn giá khác nhau
**When** nhập chiết khấu dòng (% hoặc cố định) cho sản phẩm A và chiết khấu tổng phiếu 5%
**Then** thành tiền dòng A = (SL × đơn giá) - chiết khấu dòng
**And** tổng phiếu = Σ thành tiền các dòng - chiết khấu tổng

**Given** phiếu nhập đã điền đầy đủ thông tin
**When** chọn trạng thái thanh toán "Thanh toán 1 phần" và nhập số tiền đã trả
**Then** công nợ NCC tăng thêm = tổng phiếu - số tiền đã trả

**Given** phiếu nhập 500 viên gạch men giá 78k, tồn kho hiện tại 200 viên giá vốn 70k
**When** chủ cửa hàng xác nhận phiếu nhập
**Then** tồn kho tăng từ 200 → 700
**And** giá vốn BQ = (200 × 70.000 + 500 × 78.000) / 700 = 75.714đ (integer)

**Given** sản phẩm có biến thể
**When** thêm biến thể vào phiếu nhập
**Then** mỗi biến thể nhập SL, đơn giá, chiết khấu riêng
**And** WAC và tồn kho cập nhật riêng cho từng biến thể

**Given** bảng suppliers trong database
**When** tạo bản ghi mới
**Then** bảng có: id (UUID v7), store_id, name, phone, address, email, debt (integer VNĐ), created_at, updated_at, deleted_at
**And** bảng purchase_orders: id, store_id, supplier_id, code (auto-gen PN-YYYYMMDD-XXXX), total_amount, discount_total, payment_status, paid_amount, note, created_by, created_at, updated_at
**And** bảng purchase_order_items: id, purchase_order_id, product_id, variant_id, quantity, unit_price, discount_amount, discount_type, line_total

---

### Story 6.2: Kiểm kho & Lịch sử nhập hàng

As a chủ cửa hàng,
I want tạo phiếu kiểm kho để điều chỉnh tồn kho theo thực tế và xem lịch sử nhập hàng,
So that tồn kho luôn chính xác và có thể truy vết mọi biến động giá nhập.

**Acceptance Criteria:**

**Given** chủ cửa hàng mở trang Kiểm kho
**When** bấm "Tạo phiếu kiểm kho" và chọn sản phẩm từ danh sách
**Then** hệ thống hiển thị bảng: tên SP, SKU, tồn kho hệ thống (system_qty), ô nhập SL thực tế (actual_qty), cột chênh lệch (diff = actual - system)
**And** chênh lệch dương hiển thị xanh (+), âm hiển thị đỏ (-)

**Given** phiếu kiểm kho có 5 sản phẩm, 3 SP có chênh lệch
**When** chủ cửa hàng bấm "Xác nhận kiểm kho"
**Then** dialog xác nhận liệt kê các SP có chênh lệch
**And** sau xác nhận, tồn kho cập nhật: stock = actual_qty
**And** tạo stock_check_log cho mỗi SP: product_id, variant_id, system_qty, actual_qty, diff, adjusted_by, adjusted_at

**Given** sản phẩm bị điều chỉnh giảm xuống dưới định mức
**When** kiểm kho xác nhận hoàn tất
**Then** sản phẩm hiển thị cảnh báo tồn kho thấp

**Given** bảng stock_check_logs trong database
**When** lưu phiếu kiểm kho
**Then** bảng stock_checks: id, store_id, code (KK-YYYYMMDD-XXXX), status (draft/confirmed), note, created_by, confirmed_at, created_at

**Given** chủ cửa hàng mở trang Lịch sử nhập hàng
**When** trang hiển thị danh sách phiếu nhập
**Then** mỗi phiếu hiện: mã phiếu, ngày, NCC, tổng tiền, trạng thái thanh toán
**And** hỗ trợ lọc theo: NCC, khoảng ngày, trạng thái thanh toán
**And** bấm vào phiếu → chi tiết từng dòng SP với giá nhập, SL, chiết khấu, giá vốn BQ sau lần nhập

**Given** sản phẩm có 3 lần nhập hàng trong 6 tháng
**When** xem lịch sử nhập hàng lọc theo sản phẩm
**Then** hiển thị bảng: ngày nhập, NCC, SL, đơn giá nhập, giá vốn BQ sau nhập
**And** sắp xếp theo ngày mới nhất trước

**Given** phiếu kiểm kho đã confirmed
**When** chủ cửa hàng cố sửa phiếu
**Then** block sửa đổi, hiển thị "Phiếu đã xác nhận, không thể chỉnh sửa"

---

## Epic 7: Hóa đơn & In ấn

Nhân viên xem/lọc/in lại hóa đơn. Owner xử lý trả hàng. In thermal 58/80mm (ESC/POS) + A4/A5. Tùy chỉnh mẫu in.

### Story 7.1: Danh sách & Chi tiết hóa đơn

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

### Story 7.2: Trả hàng & In ấn

As a manager/owner,
I want xử lý trả hàng từ hóa đơn gốc và in hóa đơn bằng nhiều định dạng,
So that hoàn trả chính xác cho khách và cung cấp hóa đơn chuyên nghiệp.

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

**Given** máy tính kết nối thermal printer qua Web Serial API hoặc WebUSB
**When** nhân viên in hóa đơn
**Then** gửi lệnh ESC/POS binary: init → logo → tên cửa hàng + slogan → mã HĐ + ngày → danh sách SP → tổng cộng → thanh toán → nợ cũ/mới (nếu bật) → ghi chú → cut paper
**And** thermal 80mm: bố cục rộng hơn, thêm cột CK

**Given** thermal printer không kết nối được
**When** nhân viên in hóa đơn
**Then** fallback: render thành ảnh → mở hộp thoại in trình duyệt
**And** toast cảnh báo "Đang dùng chế độ in ảnh"

**Given** khách buôn cần hóa đơn A4
**When** nhân viên chọn "In A4/A5"
**Then** render HTML với CSS @media print: header, thông tin KH, bảng SP đầy đủ, tổng bằng số + bằng chữ, khu vực ký tên
**And** gọi window.print()

**Given** chủ cửa hàng mở Cài đặt mẫu in
**When** tùy chỉnh template
**Then** có thể: upload logo, nhập slogan, bật/tắt: nợ cũ, nợ mới, giá vốn, CK, ghi chú cuối
**And** preview realtime
**And** cài đặt lưu theo store_id

**Given** hệ thống đang offline
**When** nhân viên in hóa đơn
**Then** in thermal và A4/A5 vẫn hoạt động vì render phía client
**And** logo đã cache trong Service Worker

---

## Epic 8: Báo cáo & Dashboard

Chủ cửa hàng nắm tình hình kinh doanh trong 30 giây: dashboard tổng quan, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/giá, export CSV/Excel.

### Story 8.1: Dashboard tổng quan

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

### Story 8.2: Báo cáo chi tiết & Export

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

## Epic 9: Offline & PWA

Toàn bộ POS hoạt động offline với PGlite. Service Worker cache app shell. Background Sync đồng bộ đơn hàng. Conflict resolution server/client wins. PWA installable.

### Story 9.1: PGlite offline database & Service Worker

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

### Story 9.2: Sync engine & Conflict resolution

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
