# Requirements Inventory

## Functional Requirements

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

## NonFunctional Requirements

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

## Additional Requirements

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

## UX Design Requirements

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

## FR Coverage Map

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
