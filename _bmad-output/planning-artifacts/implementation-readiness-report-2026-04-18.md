---
date: 2026-04-18
project: kiotviet-lite
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  - prd.md
  - architecture.md
  - epics.md
  - ux-design-specification.md
documentsMissing: []
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-18
**Project:** kiotviet-lite

## 1. Document Discovery

### Tài liệu tìm thấy

| Loại tài liệu | File | Kích thước | Cập nhật | Trạng thái |
|---|---|---|---|---|
| PRD | prd.md | 32,293 bytes | 18/04/2026 | ✅ Có |
| Architecture | architecture.md | 47,294 bytes | 18/04/2026 | ✅ Có |
| Epics & Stories | epics.md | 103,558 bytes | 18/04/2026 | ✅ Có |
| UX Design | ux-design-specification.md | 46,324 bytes | 18/04/2026 | ✅ Có |

### Trạng thái
- Không có trùng lặp (mỗi loại 1 file duy nhất)
- Không thiếu tài liệu — đủ 4/4 loại bắt buộc
- Thư mục `docs/` (project knowledge) trống

## 2. PRD Analysis

### Functional Requirements (67 FRs)

#### Quản lý Hàng hóa (FR1-FR7)
- **FR1:** CRUD sản phẩm (tên, SKU auto-gen, barcode, danh mục, đơn vị, giá gốc, giá bán lẻ, mô tả, 1 ảnh, trạng thái)
- **FR2:** Biến thể sản phẩm — tối đa 2 thuộc tính, 20 giá trị/thuộc tính, mỗi biến thể có SKU/barcode/giá/tồn kho riêng
- **FR3:** Đơn vị quy đổi (VD: 1 thùng = 24 lon) với hệ số và giá riêng theo đơn vị
- **FR4:** Danh mục 2 cấp (cha → con), sắp xếp kéo-thả
- **FR5:** Bật/tắt theo dõi tồn kho + định mức tồn tối thiểu
- **FR6:** Tự tính giá vốn bình quân gia quyền từ phiếu nhập
- **FR7:** Cảnh báo (badge đỏ + thông báo) khi dưới định mức tồn

#### Nhập hàng & NCC (FR8-FR12)
- **FR8:** Phiếu nhập kho (NCC, DS SP barcode/tìm tên, SL, đơn giá, CK theo dòng/tổng, trạng thái thanh toán)
- **FR9:** Tự cập nhật giá vốn BQ gia quyền + tồn kho sau nhập
- **FR10:** Phiếu kiểm kho: chọn SP → nhập SL thực tế → tính chênh lệch → xác nhận → điều chỉnh + log
- **FR11:** CRUD NCC (tên, SĐT, địa chỉ, email, công nợ)
- **FR12:** Lịch sử nhập hàng (giá nhập, SL, NCC, giá vốn BQ sau nhập)

#### Quản lý Đơn giá (FR13-FR25)
- **FR13:** Nhiều bảng giá song song, gán theo nhóm KH
- **FR14:** 5 cách thiết lập bảng giá (nhập trực tiếp, công thức giá nền, chain formula, clone, import Excel)
- **FR15:** Chống vòng lặp chain formula (A → B → C → A)
- **FR16:** Làm tròn (100đ/500đ/1.000đ/10.000đ, hướng lên/xuống/gần nhất) + ngày hiệu lực
- **FR17:** Giá riêng KH trên từng SP (ưu tiên cao nhất)
- **FR18:** Giá theo SL (tối đa 5 bậc/SP)
- **FR19:** CK danh mục (KH/nhóm KH, danh mục/toàn bộ, %/cố định, SL tối thiểu, ngày hiệu lực)
- **FR20:** 6 tầng ưu tiên giá: giá riêng KH → CK danh mục → sửa tay → giá theo SL → bảng giá nhóm KH → giá bán lẻ
- **FR21:** Hiển thị nguồn giá trên POS
- **FR22:** Quyền sửa giá: can_edit_price, dưới giá vốn cần PIN, giá=0 block, lưu original_price + override flag
- **FR23:** Cascade mode khi giá gốc thay đổi (real-time/xác nhận/tự động)
- **FR24:** So sánh nhiều bảng giá song song + margin + cảnh báo dưới vốn
- **FR25:** Chiến lược khi giá nhập thay đổi (thủ công/cảnh báo >5%/tự động)

#### Bán hàng POS (FR26-FR35)
- **FR26:** Thêm SP bằng quét barcode (camera/máy quét), gõ tên/mã (autocomplete), chọn từ grid ảnh
- **FR27:** 2 chế độ: bán nhanh (quét = tự thêm + tăng SL) và bán thường (grid)
- **FR28:** Chọn KH (tìm tên/SĐT) hoặc bỏ qua → tự áp bảng giá
- **FR29:** CK theo dòng (%/cố định) và theo tổng đơn
- **FR30:** Thanh toán: tiền mặt (tính thừa), chuyển khoản, QR, kết hợp, ghi nợ
- **FR31:** Kiểm tra hạn mức nợ. Vượt → block + PIN override. Hỗ trợ trả 1 phần + ghi nợ
- **FR32:** Tối đa 5 tab đơn đồng thời
- **FR33:** Tra tồn kho + giá nhập gần nhất từ POS
- **FR34:** Phím tắt: Enter, F2, F4, Esc
- **FR35:** Sau thanh toán: in HĐ, trừ tồn, cập nhật nợ, mở đơn mới

#### Bán hàng Offline (FR36-FR39)
- **FR36:** Toàn bộ luồng bán hàng hoạt động offline
- **FR37:** Cache local SP, KH, bảng giá (IndexedDB/PGlite)
- **FR38:** Đơn offline = pending sync, tự đồng bộ khi có mạng
- **FR39:** Conflict: server wins (tồn kho), client wins (đơn hàng). Tồn kho âm → cảnh báo

#### Quản lý Khách hàng (FR40-FR45)
- **FR40:** CRUD KH (tên bắt buộc, SĐT unique bắt buộc, email, địa chỉ, MST, ghi chú, hạn mức nợ riêng)
- **FR41:** Nhóm KH với bảng giá + hạn mức nợ mặc định
- **FR42:** KH thuộc 1 nhóm. Đổi nhóm → đổi bảng giá. Hạn mức KH override nhóm
- **FR43:** Tự tính tổng đã mua, số lần mua, nợ hiện tại
- **FR44:** Chi tiết KH: tab Đơn hàng, tab Công nợ, tab Thống kê
- **FR45:** Tạo KH nhanh từ POS (tên + SĐT)

#### Quản lý Hóa đơn (FR46-FR51)
- **FR46:** DS hóa đơn (mã HD-YYYYMMDD-XXXX, ngày, KH, tổng, đã trả, còn nợ, trạng thái, người tạo)
- **FR47:** Lọc theo ngày/trạng thái/KH/PTTT/trạng thái nợ
- **FR48:** Xem chi tiết + in lại
- **FR49:** Trả hàng từ HĐ gốc: chọn SP+SL+lý do → cộng tồn, giảm DT, hoàn tiền/giảm nợ
- **FR50:** 2 mẫu in: thermal 58/80mm + A4/A5 (bảng SP, tổng chữ, ký tên)
- **FR51:** Tùy chỉnh mẫu in (logo, slogan, ẩn/hiện nợ/giá vốn/CK, ghi chú)

#### Quản lý Công nợ (FR52-FR58)
- **FR52:** Ghi nợ toàn bộ/1 phần tích hợp trong POS
- **FR53:** Kiểm tra hạn mức, vượt → block, PIN override
- **FR54:** Phiếu thu: tìm KH → xem nợ + DS HĐ → nhập tiền → FIFO hoặc chọn HĐ cụ thể
- **FR55:** Điều chỉnh nợ thủ công (xoá nợ xấu, sửa sai) + phiếu điều chỉnh
- **FR56:** Phiếu chi trả nợ NCC
- **FR57:** Cảnh báo: ≥80% hạn mức, vượt hạn mức, nợ quá hạn 30/60/90 ngày
- **FR58:** Báo cáo công nợ: tổng hợp phải thu, chi tiết KH, phân nhóm thời gian, phải trả, sổ quỹ

#### Báo cáo (FR59-FR64)
- **FR59:** Dashboard tổng quan (DT, LN, số đơn, biểu đồ 7 ngày, cảnh báo, top 5 SP)
- **FR60:** BC doanh thu (ngày/tuần/tháng, theo SP/KH/NV)
- **FR61:** BC lợi nhuận (tổng + theo SP)
- **FR62:** BC tồn kho (tồn hiện tại + giá trị, SP cần nhập, hàng chậm bán >30 ngày)
- **FR63:** BC giá (đơn sửa giá, so sánh bảng giá, lịch sử giá nhập)
- **FR64:** Export CSV/Excel cho tất cả danh sách

#### Quyền hạn & Quản trị (FR65-FR67)
- **FR65:** 3 vai trò: Owner, Manager, Staff + ma trận quyền chi tiết
- **FR66:** Owner quản lý NV + cài đặt cửa hàng
- **FR67:** PIN xác thực cho thao tác nhạy cảm

**Tổng FR: 67**

### Non-Functional Requirements (19 NFRs)

#### Performance (NF1-NF4)
- **NF1:** Autocomplete SP < 200ms (≤10.000 SP, Android mid-range)
- **NF2:** Tạo/lưu đơn hàng < 500ms
- **NF3:** Tải trang < 2s (4G)
- **NF4:** POS giỏ hàng ≥ 30fps

#### Security (NF5-NF9)
- **NF5:** TLS 1.2+
- **NF6:** Hash password bcrypt/argon2 + salt
- **NF7:** JWT + refresh token rotation
- **NF8:** PIN hash + rate-limit (5 sai → khoá 15 phút)
- **NF9:** Audit log không xoá cho sửa giá/điều chỉnh nợ/override

#### Scalability (NF10-NF13)
- **NF10:** ≤ 10.000 SP/cửa hàng
- **NF11:** ≤ 5.000 KH/cửa hàng
- **NF12:** ≤ 5 NV bán cùng lúc
- **NF13:** Database backup tự động hàng ngày

#### Offline & Sync (NF14-NF16)
- **NF14:** 100% chức năng POS offline
- **NF15:** Đồng bộ tự động, không mất đơn
- **NF16:** Sync ≤ 100 đơn offline < 30s

#### Compatibility (NF17-NF19)
- **NF17:** Responsive ≥ 375px
- **NF18:** In thermal 58/80mm (ESC/POS) + A4/A5
- **NF19:** Camera barcode trên Chrome Android + Safari iOS

**Tổng NFR: 19**

### Additional Requirements

#### Constraints & Assumptions
- Target: Hộ kinh doanh nhỏ VN (1-5 NV)
- Mô hình: bán buôn + bán lẻ
- Tech: PWA/SPA, offline-first (IndexedDB/PGlite)
- Browser: Chrome ≥90, Safari ≥15, Firefox ≥90, Edge ≥90
- Bundle initial < 300KB gzipped (code splitting)
- FCP < 1.5s, TTI < 3s (4G)
- Real-time: polling/long-polling đủ (WebSocket cho v2+)
- Timeline MVP: 8-12 tuần, 1-2 FSD + 1 designer PT

#### Business Constraints
- Freemium model, giá < KiotViet 50%+
- 5 phút từ đăng ký → bán hàng đầu tiên
- Minh bạch giá, export dữ liệu bất kỳ lúc nào

### PRD Completeness Assessment

**Điểm mạnh:**
- PRD rất chi tiết — 67 FR đánh số rõ ràng, dễ truy vết
- NFR cụ thể với metrics đo lường được
- 4 User Journeys phong phú, bao phủ 4 persona/scenario chính
- Success criteria rõ ràng (user/business/technical)
- Risk mitigation có chiến lược cụ thể
- Phân pha rõ ràng (MVP → Growth → Vision)

**Điểm cần lưu ý:**
- FR14 nhắc import Excel cho bảng giá nhưng import Excel nằm trong post-MVP — cần làm rõ scope
- FR65 tham chiếu "bảng permissions trong tài liệu gốc" — cần verify bảng này tồn tại ở Architecture
- Scope rất lớn cho 8-12 tuần (67 FR, 7 module) — risk chính

## 3. Epic Coverage Validation

### Coverage Statistics

| Chỉ số | Giá trị |
|---|---|
| Tổng FR trong PRD | 67 |
| FR được cover trong epics | **67** |
| Coverage | **100%** |
| Tổng Epics | 9 |
| Tổng Stories | 24 |

### Epic Structure

| Epic | Tên | Stories | FRs Cover |
|---|---|---|---|
| Epic 1 | Khởi tạo dự án & Quản trị cửa hàng | 4 (1.1-1.4) | FR65-FR67 |
| Epic 2 | Quản lý Hàng hóa | 4 (2.1-2.4) | FR1-FR7 |
| Epic 3 | Bán hàng (POS) — Luồng bán lẻ | 3 (3.1-3.3) | FR26-FR27, FR29-FR30 (partial), FR32-FR35 |
| Epic 4 | Khách hàng & Hệ thống Đơn giá | 5 (4.1-4.5) | FR13-FR25, FR28, FR40-FR45 |
| Epic 5 | Quản lý Công nợ | 3 (5.1-5.3) | FR30 (ghi nợ), FR31, FR52-FR58 |
| Epic 6 | Nhập hàng & Nhà cung cấp | 2 (6.1-6.2) | FR8-FR12 |
| Epic 7 | Hóa đơn & In ấn | 2 (7.1-7.2) | FR46-FR51 |
| Epic 8 | Báo cáo & Dashboard | 2 (8.1-8.2) | FR59-FR64 |
| Epic 9 | Offline & PWA | 2 (9.1-9.2) | FR36-FR39 |

### FR Coverage Map (FR1-FR67)

- **FR1-FR7:** Epic 2 — Quản lý Hàng hóa ✅
- **FR8-FR12:** Epic 6 — Nhập hàng & NCC ✅
- **FR13-FR25:** Epic 4 — Khách hàng & Đơn giá ✅
- **FR26-FR27:** Epic 3 — POS ✅
- **FR28:** Epic 4 — Chọn KH trên POS → auto bảng giá ✅
- **FR29:** Epic 3 — CK theo dòng/tổng ✅
- **FR30:** Epic 3 (tiền mặt/CK/QR/kết hợp) + Epic 5 (ghi nợ) ✅
- **FR31:** Epic 5 — Ghi nợ + hạn mức + PIN ✅
- **FR32-FR35:** Epic 3 — POS ✅
- **FR36-FR39:** Epic 9 — Offline & PWA ✅
- **FR40-FR45:** Epic 4 — Khách hàng ✅
- **FR46-FR51:** Epic 7 — Hóa đơn & In ấn ✅
- **FR52-FR58:** Epic 5 — Công nợ ✅
- **FR59-FR64:** Epic 8 — Báo cáo ✅
- **FR65-FR67:** Epic 1 — Quản trị ✅

### Missing Requirements

**Không có FR nào bị thiếu.** Tất cả 67 FRs đều được map vào ít nhất 1 epic/story.

### NFR Coverage trong Epics

- **NF14-NF16 (Offline):** Cover trực tiếp trong Epic 9
- **NF1-NF13, NF17-NF19:** Cross-cutting concerns — xử lý ở tầng architecture, không map riêng vào epic (phù hợp)

### Lưu ý

- FR30 (thanh toán) bị chia giữa Epic 3 và Epic 5 — cần đảm bảo story acceptance criteria rõ ràng ranh giới
- FR28 (chọn KH trên POS) nằm ở Epic 4 thay vì Epic 3 — hợp lý vì liên quan đến hệ thống giá

## 4. UX Alignment Assessment

### UX Document Status

✅ **Tìm thấy:** `ux-design-specification.md` (46,324 bytes) — tài liệu đầy đủ bao gồm: Executive Summary, Core UX, Visual Design, Design System, User Journeys, Components, Responsive Design, Accessibility.

### UX ↔ PRD Alignment

| Khu vực | FRs | UX Coverage | Đánh giá |
|---|---|---|---|
| Hàng hóa | FR1-FR7 | ProductGrid, ProductForm, category browsing, out-of-stock indicator | ✅ Strong |
| Nhập hàng | FR8-FR12 | Journey 3, auto-update cascade pricing | ✅ Moderate |
| Đơn giá | FR13-FR25 | PriceSourceBadge, ChainFormulaEditor, CascadePreview, 6-tier visual | ✅ Excellent |
| POS | FR26-FR35 | BarcodeScanner, multi-input, payment dialog, keyboard shortcuts | ✅ Excellent |
| Offline | FR36-FR39 | OfflineIndicator (icon-based), pending order yellow dot | ✅ Strong |
| Khách hàng | FR40-FR45 | CustomerSelect, CustomerDetail tabs, quick-add from POS | ✅ Good |
| Hóa đơn | FR46-FR51 | InvoicePrintTemplate 3 variants, PrintSettings | ✅ Strong |
| Công nợ | FR52-FR58 | DebtSummaryCard, Journey 4, FIFO allocation, PIN override | ✅ Excellent |
| Báo cáo | FR59-FR64 | DashboardMetricCard, sparklines, chart components | ✅ Good |
| Quyền hạn | FR65-FR67 | Permission matrix, PinDialog, progressive disclosure | ✅ Good |

### UX ↔ Architecture Alignment

| Quyết định | UX | Architecture | Aligned? |
|---|---|---|---|
| Design system | Tailwind + Radix | Tailwind 4.2 + shadcn/ui (Radix underneath) | ✅ |
| Mobile-first | ≥375px, 4 breakpoints | Vite responsive, same breakpoints | ✅ |
| Offline | Icon-based, no popup | PGlite + Service Worker + Zustand offlineStore | ✅ |
| Printing | Template component, 3 variants | Zod config engine, Web Serial/USB | ✅ |
| Barcode | Camera continuous scan | html5-qrcode library | ✅ |
| Forms | React Hook Form | Shared Zod schemas + RHF | ✅ |
| State | Cart, UI, offline | Zustand stores + TanStack Query | ✅ |

**Không có mâu thuẫn** giữa UX và Architecture.

### Gaps phát hiện

#### 🔴 High

| Gap | FRs | Mô tả |
|---|---|---|
| Export UI thiếu | FR59-64 | Báo cáo không có UI cho export CSV/Excel — nút ở đâu, format nào, download flow |

#### 🟡 Medium

| Gap | FRs | Mô tả |
|---|---|---|
| Import error handling | FR8-12 | Preview import có nhưng thiếu error states, row-level validation feedback |
| Sync conflict dialog | FR36-39 | Architecture có conflict resolution nhưng UX không hiện gì cho user khi sync fail |
| Return dialog fields | FR46-51 | ReturnDialog component tồn tại nhưng thiếu chi tiết fields nào editable |
| Audit log viewer | FR65-67 | Architecture có audit table nhưng UX không có viewer cho Owner/Manager |

#### 🟢 Low

| Gap | FRs | Mô tả |
|---|---|---|
| Payment history timeline | FR40-45 | Tab Thống kê của KH chưa chi tiết |
| Sync queue visibility | FR36-39 | User không inspect được pending orders |
| Permission change flow | FR65-67 | Flow Owner cấp quyền cho NV chưa có |

### Tổng kết UX Alignment

- **Tổng thể:** UX Spec rất tốt, bao phủ 9/10 khu vực chức năng ở mức Good-Excellent
- **Điểm mạnh:** POS flow, pricing engine, debt management, offline indicator, responsive design, component naming khớp Architecture
- **Cần bổ sung:** 1 gap High (export UI), 4 gaps Medium (import error, sync conflict, return dialog, audit viewer)
- **Mâu thuẫn:** Không có — UX và Architecture hoàn toàn aligned về tech decisions

## 5. Epic Quality Review

### Tổng quan: 9 Epics, 24 Stories

| Tiêu chí | Trạng thái | Ghi chú |
|---|---|---|
| User-centric titles | ✅ | Tất cả stories mô tả user outcome, không phải technical task |
| AC format (BDD) | ✅ | Given/When/Then nhất quán, testable, có error cases |
| Architecture clarity | ✅ | Tech stack explicit (Drizzle, PGlite, Better Auth, Zod) |
| DB tables incremental | ✅ | Tables tạo khi cần, không upfront |
| Epic independence | 🟠 | Epic 3 cần data từ Epic 4 cho pricing |
| Forward dependencies | 🔴 | Epic 3 dùng customer_id nhưng customers ở Epic 4 |
| Story sizing | 🔴 | Story 5.3 có 30 AC (3+ features); Story 1.1 có 6 subsystems |
| Greenfield readiness | 🟠 | Story 1.1 không verify developer có thể chạy Story 1.2 |
| Sync edge cases | 🟠 | Thiếu conflict scenarios chi tiết |

### 🔴 Critical Violations

#### CV1: Forward Dependency — Epic 3 phụ thuộc Epic 4

**Vấn đề:** Story 3.3 (Thanh toán) tham chiếu `customer_id` và ghi nợ (Epic 5), nhưng customer management (FR28, FR40-45) nằm ở Epic 4 — sau Epic 3. POS không thể áp giá theo nhóm KH nếu chưa có KH.

**Khuyến nghị:** Đưa Story 4.1 (KH) và 4.3 (bảng giá) lên TRƯỚC Epic 3. Hoặc Epic 3 chỉ dùng giá bán lẻ mặc định, pricing tiers thêm sau khi Epic 4 xong.

#### CV2: Story 1.1 thiếu PGlite schema

**Vấn đề:** Story 1.1 chỉ setup PostgreSQL schema (`pnpm db:migrate`), không tạo PGlite schema cho browser. Story 9.1 (PGlite offline) nằm ở Epic 9 cuối cùng — quá muộn.

**Khuyến nghị:** Story 1.1 phải include PGlite schema export/generation + test initialization.

#### CV3: Story 5.3 quá lớn (30 AC, 3+ features)

**Vấn đề:** Gộp 3 tính năng riêng biệt:
- FR56: Phiếu chi NCC
- FR55: Điều chỉnh nợ thủ công
- FR57-58: Cảnh báo + Báo cáo công nợ

**Khuyến nghị:** Tách thành 3 stories: 5.3a (phiếu chi NCC), 5.3b (điều chỉnh nợ), 5.3c (cảnh báo + báo cáo).

#### CV4: Story 2.2 thiếu AC set tồn kho ban đầu

**Vấn đề:** CRUD sản phẩm không có AC cho việc nhập tồn kho ban đầu khi tạo SP. User tạo SP → tồn kho = 0 mà không có cách nhập.

**Khuyến nghị:** Thêm AC: "Khi tạo SP mới, có field 'Tồn kho ban đầu' (optional, default=0)."

#### CV5: Story 1.1 quá lớn (18 AC, 6 subsystems)

**Vấn đề:** Gộp monorepo + PostgreSQL + Tailwind + 6 components + ESLint/Prettier + Vitest vào 1 story.

**Khuyến nghị:** Tách thành: 1.1a (Monorepo + DB), 1.1b (Design System + Components), 1.1c (Linting + Testing). Hoặc giữ nguyên nhưng note parallel work lanes.

### 🟠 Major Issues

| # | Issue | Story | Mô tả |
|---|---|---|---|
| M1 | Developer usability AC | 1.1 | Không verify developer có thể implement Story 1.2 sau khi hoàn thành |
| M2 | Security test AC | 1.2 | Token expiration (15 phút, 7 ngày) không có test scenario |
| M3 | Pricing integration timing | 4.3-4.5 | 6-tầng giá chỉ tích hợp POS ở Story 4.5, nhưng Epic 3 đã assume prices đúng |
| M4 | Initial inventory | 2.4 | Cách set tồn kho ban đầu không rõ (FR5 vs CRUD flow) |
| M5 | PIN edge cases | 1.4 | Thiếu AC: reset counter sau lockout, UI show/hide, owner reset staff PIN |
| M6 | Sync conflict matrix | 9.2 | Thiếu: orphaned product ref, duplicate sync, corrupted IndexedDB |

### 🟡 Minor Concerns

| # | Issue | Story | Mô tả |
|---|---|---|---|
| m1 | Customer select in POS | 3.2 | Chọn KH nên ở giỏ hàng (3.2) không phải thanh toán (3.3) |
| m2 | Soft delete SP | 2.2 | AC nói "xoá" nhưng Architecture rule AR6 yêu cầu soft delete — chưa explicit |
| m3 | Corrupted local data | 9.1 | Không có AC xử lý IndexedDB corrupted hoặc PGlite schema stale |
| m4 | Customer group validation | 4.1 | Thiếu AC: KH bắt buộc thuộc 1 nhóm, không xoá nhóm có KH |
| m5 | Invoice template persistence | 7.2 | Thiếu AC: template mới áp cho HĐ cũ hay chỉ mới |

### Điểm mạnh

1. **User value rõ ràng:** Tất cả 24 stories mô tả user outcome, không phải technical tasks
2. **BDD format nhất quán:** Given/When/Then cho hầu hết AC, testable
3. **Error handling có:** Các story cover error cases (duplicate phone, vượt hạn mức, v.v.)
4. **Architecture explicit:** Tech stack reference (Drizzle 0.45.x, PGlite 0.4.x, Better Auth) trong stories
5. **DB incremental:** Tables tạo theo story, không dump upfront — phù hợp greenfield

## 6. Summary & Recommendations

### Overall Readiness Status

## 🟡 NEEDS WORK — Epics cần sửa structural issues trước khi code

### Scorecard

| Tài liệu | Trạng thái | Chất lượng | Readiness |
|---|---|---|---|
| PRD | ✅ Có | ⭐⭐⭐⭐⭐ Xuất sắc — 67 FR, 19 NFR, 4 journeys, success criteria rõ | ✅ Ready |
| Architecture | ✅ Có | ⭐⭐⭐⭐⭐ Xuất sắc — tech stack, patterns, structure, naming conventions | ✅ Ready |
| UX Design | ✅ Có | ⭐⭐⭐⭐ Rất tốt — 1 gap high, 4 gaps medium, không mâu thuẫn | ✅ Ready (minor fixes) |
| Epics & Stories | ✅ Có | ⭐⭐⭐ Khá — 100% FR coverage, BDD format tốt, NHƯNG 5 critical violations | 🟡 Needs Work |

### Đánh giá tổng thể

**Nền tảng tốt:** PRD, Architecture, UX Design đều chất lượng cao — chi tiết, nhất quán, aligned với nhau. Đây là bộ tài liệu planning rất tốt cho MVP 7 module. FR coverage 100% (67/67 FRs đều map vào epics).

**Tuy nhiên, Epics & Stories có 5 vấn đề cấu trúc cần sửa trước khi bắt đầu code:**

1. **Forward dependency** giữa Epic 3 (POS) và Epic 4 (KH & Giá) — POS không hoạt động đúng nếu chưa có customers
2. **Story 1.1 thiếu PGlite** — offline-first là core requirement nhưng PGlite setup nằm ở Epic 9 cuối cùng
3. **Story 5.3 quá lớn** — gộp 3 features (phiếu chi, điều chỉnh nợ, cảnh báo) vào 1 story
4. **Story 2.2 thiếu initial inventory** — user tạo SP xong không set được tồn kho ban đầu
5. **Story 1.1 quá lớn** — 6 subsystems trong 1 story, khó track progress

### Tổng hợp Issues

| Mức độ | Số lượng | Nguồn |
|---|---|---|
| 🔴 Critical | 5 | Epic Quality Review: CV1-CV5 |
| 🟠 Major | 6 | Epic Quality: M1-M6 |
| 🟡 Medium | 5 | UX Alignment: 4 gaps + 1 high export UI |
| 🟢 Minor/Low | 8 | Epic Quality: m1-m5 + UX: 3 low gaps |
| **Tổng** | **24 issues** | |

### Critical Issues — Phải sửa TRƯỚC khi code

| # | Issue | Hành động cụ thể | Ưu tiên |
|---|---|---|---|
| 1 | Epic 3 ↔ 4 forward dependency | Đưa Story 4.1 (KH) + 4.3 (bảng giá) lên trước Epic 3, HOẶC Epic 3 chỉ dùng giá bán lẻ | 🔴 P0 |
| 2 | PGlite setup quá muộn | Thêm PGlite schema + init test vào Story 1.1 | 🔴 P0 |
| 3 | Story 5.3 oversize | Tách: 5.3a (phiếu chi NCC), 5.3b (điều chỉnh nợ), 5.3c (cảnh báo + BC) | 🔴 P0 |
| 4 | Initial inventory missing | Thêm AC "Tồn kho ban đầu" vào Story 2.2 | 🔴 P0 |
| 5 | Story 1.1 oversize | Tách hoặc add parallel work lanes | 🟠 P1 |

### Recommended Next Steps

1. **🔴 Ngay lập tức:** Sửa 5 critical violations trong epics.md — đặc biệt reorder Epic 3/4 và tách Story 5.3
2. **🟠 Trước sprint 1:** Bổ sung 6 major issue ACs (developer usability, security test, PIN edge cases, sync conflict matrix)
3. **🟡 Trước khi implement module liên quan:** Bổ sung export UI vào UX spec, thêm sync conflict dialog, return dialog details
4. **Sau khi sửa:** Chạy lại `/bmad-check-implementation-readiness` để verify

### Final Note

Đánh giá này phát hiện **24 issues** chia thành 4 mức: 5 critical, 6 major, 5 medium, 8 minor/low. PRD và Architecture đã sẵn sàng. UX cần minor fixes. **Bottleneck chính là Epics & Stories** — cần sửa structural issues (reorder epics, tách stories lớn, bổ sung ACs thiếu) trước khi bắt đầu implementation.

Tin tốt: **không có issue nào đòi hỏi viết lại từ đầu**. Tất cả đều là sửa/bổ sung trên nền hiện tại.

---

**Report generated:** 2026-04-18
**Assessed by:** BMAD Implementation Readiness Checker
**Documents reviewed:** prd.md, architecture.md, epics.md, ux-design-specification.md
