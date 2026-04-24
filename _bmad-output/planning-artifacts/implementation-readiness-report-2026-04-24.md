---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
filesIncluded:
  prd:
    - prd/index.md
    - prd/executive-summary.md
    - prd/project-classification.md
    - prd/product-scope.md
    - prd/project-scoping-phased-development.md
    - prd/functional-requirements.md
    - prd/non-functional-requirements.md
    - prd/web-app-specific-requirements.md
    - prd/user-journeys.md
    - prd/success-criteria.md
  architecture:
    - architecture/index.md
    - architecture/project-context-analysis.md
    - architecture/starter-template-evaluation.md
    - architecture/core-architectural-decisions.md
    - architecture/project-structure-boundaries.md
    - architecture/implementation-patterns-consistency-rules.md
    - architecture/observability-and-notifications.md
    - architecture/architecture-validation-results.md
  epics:
    - epics/index.md
    - epics/overview.md
    - epics/epic-list.md
    - epics/execution-order.md
    - epics/requirements-inventory.md
    - epics/epic-1-khi-to-d-n-qun-tr-ca-hng.md
    - epics/epic-2-qun-l-hng-ha.md
    - epics/epic-3-bn-hng-pos-lung-bn-l.md
    - epics/epic-4-khch-hng-h-thng-n-gi.md
    - epics/epic-5-qun-l-cng-n.md
    - epics/epic-6-nhp-hng-nh-cung-cp.md
    - epics/epic-7-ha-n-in-n.md
    - epics/epic-8-bo-co-dashboard.md
    - epics/epic-9-offline-pwa.md
  ux:
    - ux-design-specification/index.md
    - ux-design-specification/executive-summary.md
    - ux-design-specification/desired-emotional-response.md
    - ux-design-specification/design-direction-decision.md
    - ux-design-specification/ux-pattern-analysis-inspiration.md
    - ux-design-specification/design-system-foundation.md
    - ux-design-specification/visual-design-foundation.md
    - ux-design-specification/core-user-experience.md
    - ux-design-specification/user-journey-flows.md
    - ux-design-specification/responsive-design-accessibility.md
    - ux-design-specification/component-strategy.md
    - ux-design-specification/ux-consistency-patterns.md
    - ux-design-specification/ph-lc.md
    - ux-design-specification/sync-conflict-dialog.md
    - ux-design-specification/return-dialog-specification.md
    - ux-design-specification/import-error-handling.md
    - ux-design-specification/export-ui-specification.md
    - ux-design-specification/audit-log-viewer.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-24
**Project:** kiotviet-lite

## PRD Analysis

### Functional Requirements (67 FRs)

**Quản lý Hàng hóa (FR1-FR7)**
- FR1: CRUD sản phẩm (tên, SKU auto-gen, barcode, danh mục, đơn vị, giá gốc, giá bán lẻ, mô tả, 1 ảnh, trạng thái)
- FR2: Biến thể SP tối đa 2 thuộc tính, mỗi thuộc tính ≤20 giá trị, mỗi biến thể có SKU/barcode/giá/tồn kho riêng
- FR3: Đơn vị quy đổi (VD: 1 thùng = 24 lon) với hệ số và giá riêng
- FR4: Danh mục 2 cấp (cha→con), kéo-thả sắp xếp
- FR5: Bật/tắt theo dõi tồn kho, đặt định mức tối thiểu
- FR6: Tự tính giá vốn bình quân gia quyền từ phiếu nhập
- FR7: Cảnh báo (badge đỏ + thông báo) khi SP dưới định mức tồn

**Nhập hàng & NCC (FR8-FR12)**
- FR8: Phiếu nhập kho (NCC, DS SP, SL, đơn giá, CK, trạng thái thanh toán)
- FR9: Auto cập nhật giá vốn BQ gia quyền + tồn kho sau nhập
- FR10: Phiếu kiểm kho (chọn SP → nhập SL thực → chênh lệch → xác nhận → điều chỉnh + log)
- FR11: CRUD NCC (tên, SĐT, địa chỉ, email, công nợ)
- FR12: Lịch sử nhập hàng (giá, SL, NCC, giá vốn BQ)

**Quản lý Đơn giá (FR13-FR25)**
- FR13: Nhiều bảng giá song song, gán nhóm KH
- FR14: 5 cách thiết lập bảng giá (trực tiếp, công thức giá nền, chain formula, clone, import Excel)
- FR15: Chống vòng lặp chain formula
- FR16: Làm tròn giá (100đ/500đ/1.000đ/10.000đ) + ngày hiệu lực
- FR17: Giá riêng KH (ưu tiên cao nhất, override)
- FR18: Giá theo SL (tối đa 5 bậc/SP)
- FR19: CK danh mục (KH/nhóm, danh mục/toàn bộ, %/cố định, SL tối thiểu, hiệu lực)
- FR20: 6 tầng ưu tiên giá trên POS
- FR21: POS hiển thị nguồn giá
- FR22: Quyền sửa giá, PIN khi dưới vốn, block giá=0, lưu original_price
- FR23: Cascade khi giá gốc thay đổi (real-time/xác nhận/tự động)
- FR24: So sánh bảng giá + margin, cảnh báo bán dưới vốn
- FR25: Chiến lược khi giá nhập thay đổi (thủ công/cảnh báo/tự động)

**Bán hàng POS (FR26-FR35)**
- FR26: Thêm SP (quét barcode camera/máy quét, gõ tên autocomplete, grid ảnh)
- FR27: 2 chế độ (bán nhanh, bán thường)
- FR28: Chọn KH → auto áp bảng giá nhóm
- FR29: CK theo dòng + tổng đơn (%/cố định)
- FR30: Thanh toán đa phương thức (tiền mặt, chuyển khoản, QR, kết hợp, ghi nợ)
- FR31: Kiểm tra hạn mức nợ, block + PIN override, trả 1 phần + nợ còn lại
- FR32: Tối đa 5 tab đơn hàng đồng thời
- FR33: Tra tồn kho + giá nhập gần nhất từ POS
- FR34: Phím tắt (Enter, F2, F4, Esc)
- FR35: Sau thanh toán: auto in, trừ tồn, cập nhật công nợ, mở đơn mới

**Bán hàng Offline (FR36-FR39)**
- FR36: Toàn bộ luồng bán hàng offline
- FR37: Cache local (IndexedDB/PGlite) SP, KH, bảng giá
- FR38: Đơn offline sync_status=pending, tự đồng bộ
- FR39: Conflict: server wins (tồn kho), client wins (đơn hàng), cảnh báo tồn kho âm

**Quản lý Khách hàng (FR40-FR45)**
- FR40: CRUD KH (tên, SĐT unique, email, địa chỉ, MST, ghi chú, hạn mức nợ riêng)
- FR41: Nhóm KH + bảng giá mặc định + hạn mức nợ mặc định
- FR42: KH thuộc 1 nhóm, đổi nhóm → đổi giá, hạn mức KH override nhóm
- FR43: Auto tính tổng mua, số lần mua, nợ hiện tại
- FR44: Chi tiết KH (tab Đơn hàng, Công nợ, Thống kê)
- FR45: Tạo KH nhanh từ POS (tên + SĐT)

**Quản lý Hóa đơn (FR46-FR51)**
- FR46: Danh sách HĐ (mã HD-YYYYMMDD-XXXX, ngày, KH, tổng, đã trả, còn nợ, trạng thái, người tạo)
- FR47: Lọc HĐ (ngày, trạng thái, KH, phương thức, nợ)
- FR48: Chi tiết HĐ + in lại
- FR49: Trả hàng (chọn SP + SL + lý do → cộng tồn, giảm DT, hoàn tiền/giảm nợ)
- FR50: 2 mẫu in (thermal 58/80mm, A4/A5 cho bán buôn)
- FR51: Tùy chỉnh mẫu in (logo, slogan, ẩn/hiện thông tin)

**Quản lý Công nợ (FR52-FR58)**
- FR52: Ghi nợ toàn bộ/1 phần tích hợp POS
- FR53: Kiểm tra hạn mức, block, PIN override
- FR54: Phiếu thu (FIFO hoặc chọn HĐ cụ thể)
- FR55: Điều chỉnh nợ thủ công (xoá nợ xấu, sửa sai + lý do)
- FR56: Phiếu chi trả nợ NCC
- FR57: Cảnh báo nợ (≥80% hạn mức, vượt hạn mức, quá hạn 30/60/90 ngày)
- FR58: Báo cáo công nợ (phải thu, chi tiết KH, phân nhóm thời gian, phải trả, sổ quỹ)

**Báo cáo (FR59-FR64)**
- FR59: Dashboard (DT, LN, số đơn, biểu đồ 7 ngày, cảnh báo, top 5 SP)
- FR60: Báo cáo DT (ngày/tuần/tháng, theo SP/KH/NV)
- FR61: Báo cáo LN (tổng, theo SP)
- FR62: Báo cáo tồn kho (hiện tại + giá trị, cần nhập, chậm bán >30 ngày)
- FR63: Báo cáo giá (đơn sửa giá, so sánh bảng giá, lịch sử giá nhập)
- FR64: Export CSV/Excel mọi danh sách

**Quyền hạn & Quản trị (FR65-FR67)**
- FR65: 3 vai trò (Owner, Manager, Staff) + ma trận quyền
- FR66: Owner quản lý nhân viên + cài đặt cửa hàng
- FR67: PIN xác thực cho thao tác nhạy cảm

### Non-Functional Requirements (19 NFRs)

**Performance (NF1-NF4)**
- NF1: Autocomplete < 200ms (≤10.000 SP, Android mid-range)
- NF2: Tạo + lưu đơn < 500ms
- NF3: Tải trang < 2s (4G)
- NF4: POS giỏ hàng ≥ 30fps

**Security (NF5-NF9)**
- NF5: TLS 1.2+
- NF6: Hash password bcrypt/argon2 + salt
- NF7: JWT + refresh token rotation
- NF8: PIN hash + rate-limit (5 sai → khoá 15 phút)
- NF9: Audit log không xoá được (sửa giá, điều chỉnh nợ, override)

**Scalability (NF10-NF13)**
- NF10: ≤ 10.000 SP/cửa hàng
- NF11: ≤ 5.000 KH/cửa hàng
- NF12: ≤ 5 NV đồng thời
- NF13: Database backup tự động hàng ngày

**Offline & Sync (NF14-NF16)**
- NF14: 100% POS offline
- NF15: Đồng bộ tự động, không mất đơn
- NF16: Sync ≤ 100 đơn < 30s

**Compatibility (NF17-NF19)**
- NF17: Mobile ≥ 375px, tablet, desktop
- NF18: In thermal 58/80mm (ESC/POS) + A4/A5
- NF19: Camera barcode Chrome Android + Safari iOS

### Additional Requirements (từ Web App Spec + User Journeys)

**Web App Platform:**
- SPA + PWA installable
- Browser: Chrome ≥90, Safari ≥15, Firefox ≥90, Edge ≥90
- Service Worker cache shell + assets tĩnh
- IndexedDB/PGlite cho data offline
- Background Sync API
- FCP < 1.5s, TTI < 3s, bundle < 300KB gzipped

**Business Constraints:**
- Đăng ký → bán hàng đầu tiên ≤ 5 phút
- Không cần real-time (polling đủ), WebSocket chỉ cho v2+ đa chi nhánh
- Timeline MVP: 8-12 tuần, 1-2 dev + 1 designer part-time
- Freemium model, giá < KiotViet 50%

**Risk Mitigations:**
- Conflict resolution đơn giản (không edit đơn offline)
- Virtual scrolling + lazy load cho 10.000+ SP
- Import data từ KiotViet (v1.1)

### PRD Completeness Assessment

**Điểm mạnh:**
- FR đánh số rõ ràng (FR1-FR67), dễ truy vết
- NFR có chỉ số đo lường cụ thể
- User journeys minh họa 4 luồng chính, khớp với FR
- Phân phase rõ (MVP vs Post-MVP vs Vision)
- Risk mitigation có strategy cụ thể

**Điểm cần lưu ý:**
- FR14 đề cập import Excel bảng giá nhưng Project Scoping xếp import Excel vào v1.1 (Post-MVP). Cần xác nhận: import Excel bảng giá có trong MVP hay không?
- Không có FR riêng cho đăng ký/đăng nhập/quản lý session. FR65-67 đề cập vai trò + quyền nhưng không mô tả luồng auth cụ thể
- Không có FR cho cài đặt cửa hàng (tên, SĐT, logo, mẫu in mặc định) dù FR66 đề cập "cài đặt cửa hàng"
- Không có FR cho import dữ liệu ban đầu (Journey 1 đề cập import 200 SP từ Excel nhưng import Excel nằm ở v1.1)
- NF13 (backup tự động) không rõ cách thực hiện trong kiến trúc offline-first

## Epic Coverage Validation

### Coverage Matrix

| FR | Mô tả | Epic | Status |
|----|-------|------|--------|
| FR1 | CRUD sản phẩm | Epic 2 | ✓ |
| FR2 | Biến thể SP | Epic 2 | ✓ |
| FR3 | Đơn vị quy đổi | Epic 2 | ✓ |
| FR4 | Danh mục 2 cấp | Epic 2 | ✓ |
| FR5 | Theo dõi tồn kho | Epic 2 | ✓ |
| FR6 | Giá vốn BQ gia quyền | Epic 2 | ✓ |
| FR7 | Cảnh báo tồn kho thấp | Epic 2 | ✓ |
| FR8 | Phiếu nhập kho | Epic 6 | ✓ |
| FR9 | Cập nhật giá vốn + tồn kho sau nhập | Epic 6 | ✓ |
| FR10 | Kiểm kho | Epic 6 | ✓ |
| FR11 | Quản lý NCC | Epic 6 | ✓ |
| FR12 | Lịch sử nhập hàng | Epic 6 | ✓ |
| FR13 | Nhiều bảng giá song song | Epic 4 | ✓ |
| FR14 | 5 cách thiết lập bảng giá | Epic 4 | ✓ |
| FR15 | Chống vòng lặp chain formula | Epic 4 | ✓ |
| FR16 | Làm tròn + ngày hiệu lực | Epic 4 | ✓ |
| FR17 | Giá riêng KH | Epic 4 | ✓ |
| FR18 | Giá theo SL (5 bậc) | Epic 4 | ✓ |
| FR19 | CK danh mục | Epic 4 | ✓ |
| FR20 | 6 tầng ưu tiên POS | Epic 4 | ✓ |
| FR21 | Hiển thị nguồn giá | Epic 4 | ✓ |
| FR22 | Sửa giá (quyền, PIN, audit) | Epic 4 | ✓ |
| FR23 | Cascade giá | Epic 4 | ✓ |
| FR24 | So sánh bảng giá | Epic 4 | ✓ |
| FR25 | Chiến lược khi giá nhập đổi | Epic 4 | ✓ |
| FR26 | Thêm SP (barcode/tên/grid) | Epic 3 | ✓ |
| FR27 | 2 chế độ bán | Epic 3 | ✓ |
| FR28 | Chọn KH → auto bảng giá | Epic 4 | ✓ |
| FR29 | CK theo dòng/tổng | Epic 3 | ✓ |
| FR30 | Thanh toán đa phương thức + ghi nợ | Epic 3 + Epic 5 | ✓ |
| FR31 | Hạn mức nợ + PIN override | Epic 5 | ✓ |
| FR32 | 5 tab đồng thời | Epic 3 | ✓ |
| FR33 | Tra tồn kho nhanh từ POS | Epic 3 | ✓ |
| FR34 | Phím tắt POS | Epic 3 | ✓ |
| FR35 | Auto sau thanh toán | Epic 3 | ✓ |
| FR36 | Bán hàng offline | Epic 9 | ✓ |
| FR37 | Cache local PGlite | Epic 9 | ✓ |
| FR38 | Đơn offline auto sync | Epic 9 | ✓ |
| FR39 | Conflict resolution | Epic 9 | ✓ |
| FR40 | CRUD KH | Epic 4 | ✓ |
| FR41 | Nhóm KH + bảng giá MĐ | Epic 4 | ✓ |
| FR42 | KH thuộc 1 nhóm, override | Epic 4 | ✓ |
| FR43 | Auto tính tổng mua/nợ | Epic 4 | ✓ |
| FR44 | Chi tiết KH (3 tabs) | Epic 4 | ✓ |
| FR45 | Tạo KH nhanh từ POS | Epic 4 | ✓ |
| FR46 | Danh sách HĐ | Epic 7 | ✓ |
| FR47 | Lọc HĐ | Epic 7 | ✓ |
| FR48 | Chi tiết + in lại HĐ | Epic 7 | ✓ |
| FR49 | Trả hàng | Epic 7 | ✓ |
| FR50 | 2 mẫu in | Epic 7 | ✓ |
| FR51 | Tùy chỉnh mẫu in | Epic 7 | ✓ |
| FR52 | Ghi nợ toàn bộ/1 phần | Epic 5 | ✓ |
| FR53 | Kiểm tra hạn mức + PIN | Epic 5 | ✓ |
| FR54 | Phiếu thu FIFO | Epic 5 | ✓ |
| FR55 | Điều chỉnh nợ thủ công | Epic 5 (Story 5.4) | ✓ |
| FR56 | Phiếu chi trả nợ NCC | Epic 5 (Story 5.3) | ✓ |
| FR57 | Cảnh báo nợ | Epic 5 (Story 5.5) | ✓ |
| FR58 | Báo cáo công nợ | Epic 5 (Story 5.5) | ✓ |
| FR59 | Dashboard tổng quan | Epic 8 | ✓ |
| FR60 | BC doanh thu | Epic 8 | ✓ |
| FR61 | BC lợi nhuận | Epic 8 | ✓ |
| FR62 | BC tồn kho | Epic 8 | ✓ |
| FR63 | BC giá | Epic 8 | ✓ |
| FR64 | Export CSV/Excel | Epic 8 | ✓ |
| FR65 | 3 vai trò + quyền | Epic 1 | ✓ |
| FR66 | Quản lý NV + cài đặt | Epic 1 | ✓ |
| FR67 | PIN xác thực | Epic 1 | ✓ |

### Missing Requirements

Không có FR nào bị thiếu trong epic coverage map. Tuy nhiên có một số yêu cầu ngầm định chưa được FR hóa rõ ràng:

1. **Luồng đăng ký/đăng nhập:** Epic 1 Story 1.2 bao phủ nhưng PRD không có FR riêng cho auth flow (đăng ký bằng SĐT, đăng nhập, quên mật khẩu, session management)
2. **Cài đặt cửa hàng:** FR66 đề cập "cài đặt cửa hàng" nhưng không chi tiết: tên, SĐT, logo, mẫu in mặc định, múi giờ, đơn vị tiền tệ
3. **Import dữ liệu ban đầu:** User Journey 1 nói import 200 SP từ Excel nhưng PRD xếp import Excel ở v1.1 (Post-MVP). Mâu thuẫn giữa Journey 1 (MVP experience) và scope

### Coverage Statistics

- Tổng FR trong PRD: **67**
- FR covered trong epics: **67**
- Tỷ lệ coverage: **100%**
- Additional Requirements (Architecture): **29 AR** (covered qua các epic)
- Additional Requirements (UX Design): **21 UX-DR** (covered qua các epic)

## UX Alignment Assessment

### UX Document Status

**Found:** 18 files sharded trong `ux-design-specification/`, bao gồm index, executive summary, design system, component strategy, responsive design, user journeys, và 5 file spec bổ sung mới (sync-conflict-dialog, return-dialog, import-error-handling, export-ui, audit-log-viewer).

### UX ↔ PRD Alignment

**Well-Aligned:**
- POS Responsive Layout (FR26-35): Breakpoints 375/768/1024 khớp PRD Web App Spec
- Offline Functionality (FR36-39): sync-conflict-dialog.md spec 5-state OfflineIndicator rất chi tiết
- Price Source Badges (FR20-21): PriceSourceBadge component spec có color-coding
- Debt Summary (FR52-58): DebtSummaryCard component defined
- Keyboard Shortcuts (FR34): ph-lc.md liệt kê đủ POS shortcuts

**Gaps:**

| # | Issue | FR liên quan | Mức độ |
|---|-------|-------------|--------|
| 1 | **Dashboard UX hoàn toàn thiếu.** FR59 yêu cầu dashboard chi tiết nhưng UX chỉ có DashboardMetricCard skeleton, không có layout/chart spec | FR59 | CRITICAL |
| 2 | **Inventory Management UI thiếu.** FR8-12 (phiếu nhập, kiểm kho, NCC) không có UX spec | FR8-FR12 | CRITICAL |
| 3 | **Thermal Printer UX thiếu flow.** FR50-51 có InvoicePrintTemplate layout nhưng thiếu: print dialog, device selection, error handling, fallback UX | FR50-FR51 | HIGH |
| 4 | **6-Tier Pricing thiếu giải thích.** PriceSourceBadge chỉ list 4 màu example, thiếu tooltip/help cho 6 tầng | FR20-FR21 | HIGH |
| 5 | **Customer Management UX thiếu.** FR40-45 chỉ có CustomerSelect, thiếu form, nhóm KH, thống kê KH | FR40-FR45 | MEDIUM |
| 6 | **Debt Management thiếu chi tiết.** FR52-58 chỉ có DebtSummaryCard, thiếu: receipt form, manual adjustment, supplier payment, aging report | FR52-FR58 | MEDIUM |
| 7 | **Audit Log Viewer cô lập.** File tồn tại nhưng không reference trong index.md hay main UX narrative | FR65-FR67 | MEDIUM |

### UX ↔ Architecture Alignment

**Well-Aligned:**
- Component Library: UX Radix UI + Tailwind ↔ Architecture shadcn/ui + Tailwind 4.2.x (khớp)
- Offline DB: UX PGlite cache ↔ Architecture PGlite 0.4.x + Drizzle ORM (khớp)
- State Management: UX Zustand + TanStack Query ↔ Architecture Zustand 5.0.x + TanStack Query 5.99.x (khớp)
- Barcode: UX camera scan ↔ Architecture html5-qrcode (khớp)
- Performance: cả hai có cùng target autocomplete <200ms, tạo đơn <500ms

**Misalignments:**

| # | Issue | Files liên quan | Mức độ |
|---|-------|----------------|--------|
| 1 | **Thermal Printing: UX vs Architecture strategy mismatch.** UX nói "fallback generate image", Architecture nói "Web Serial/WebUSB → ESC/POS binary". Không spec permission flow cho Web Serial | component-strategy.md vs core-architectural-decisions.md | CRITICAL |
| 2 | **Dashboard aggregation logic không rõ.** Architecture có routes/reports.ts nhưng không detail aggregation server vs client, caching strategy | FR59 vs core-architectural-decisions.md | HIGH |
| 3 | **Export background job thiếu architecture.** UX export-ui-specification.md yêu cầu progress bar >5000 rows, Architecture không spec job queue/notification | export-ui-specification.md vs core-architectural-decisions.md | HIGH |
| 4 | **Sync Conflict Components thiếu trong inventory.** sync-conflict-dialog.md yêu cầu 4 components mới (SyncQueuePanel, ConflictDialog, ManualMergeEditor, StockNegativeDialog) không trong component-strategy.md | sync-conflict-dialog.md vs component-strategy.md | MEDIUM |
| 5 | **PIN Verification Offline UX thiếu.** Architecture spec PIN hash PGlite, nhưng UX không spec: PIN dialog, error feedback, lockout banner (5 sai → khóa 15 phút) | NF8 vs core-user-experience.md | MEDIUM |
| 6 | **Print Template Customization thiếu data model.** FR51 tùy chỉnh mẫu in, UX có spec nhưng Architecture không chi tiết: print_settings schema, storage (PGlite vs PostgreSQL), API endpoint | FR51 | MEDIUM |
| 7 | **Breakpoint naming không nhất quán.** UX dùng px (375/768/1024), Architecture/Tailwind dùng sm/md/lg/xl (640/768/1024/1280) | responsive-design-accessibility.md vs tailwind config | LOW |
| 8 | **Export History Route chưa map.** export-ui-spec nói /bao-cao/lich-su-export nhưng Architecture routing không list | export-ui-specification.md | LOW |

### Warnings Tổng hợp

**CRITICAL (3 vấn đề cần giải quyết trước khi dev):**
1. Dashboard UX spec hoàn toàn thiếu. Cần tạo layout, chart types, refresh strategy
2. Thermal printer permission flow và fallback strategy cần thống nhất giữa UX và Architecture
3. Inventory Management (phiếu nhập, kiểm kho) cần UX spec

**HIGH (3 vấn đề nên giải quyết trong Sprint 1):**
4. 6-tier pricing education pattern cho nhân viên mới
5. Export background job architecture (job queue, progress, notification)
6. Print template customization data model + editor UX

**MEDIUM (6 vấn đề giải quyết dần):**
7. PIN dialog component spec (offline verification + lockout UX)
8. Sync conflict component inventory cập nhật
9. Customer management UX forms chi tiết
10. Debt FIFO allocation preview visual
11. Keyboard shortcuts đầy đủ cho tất cả modules
12. Audit log viewer integration vào navigation

## Epic Quality Review

### Execution Order

Thứ tự thực thi khác thứ tự đánh số (đã document rõ trong execution-order.md):
Epic 1 → Epic 2 → **Epic 4** → **Epic 3** → Epic 5 → Epic 6 → Epic 7 → Epic 8 → Epic 9

### Epic-by-Epic Assessment

#### Epic 1: Khởi tạo dự án & Quản trị cửa hàng
- **User Value:** ✓ OK. Đăng ký, đăng nhập, quản lý NV, phân quyền
- **Independence:** ✓ OK. Đứng một mình
- **Story Quality:** Story 1.1 scope quá lớn (3 parallel lanes). Story 1.2-1.4 tốt
- **Violations:** 🟡 Story 1.1 nên tách. 🟡 Thiếu CI/CD story

#### Epic 2: Quản lý Hàng hóa
- **User Value:** ✓ OK. CRUD SP, biến thể, danh mục, tồn kho
- **Independence:** ✓ OK. Chỉ cần Epic 1
- **Story Quality:** ✓ Tốt. 4 stories đúng thứ tự, AC chi tiết
- **Violations:** Không có

#### Epic 3: Bán hàng POS, Luồng bán lẻ
- **User Value:** ✓ OK. POS mobile-first
- **Independence:** ❌ Phụ thuộc Epic 4 (đã mitigate bằng execution order)
- **Story Quality:** Story 3.1 thiếu customer selection flow. Story 3.3 có F4 ghi nợ phụ thuộc Epic 5
- **Violations:** 🔴 Forward dep Epic 4 (mitigated). 🟠 Story 3.3 F4 forward dep. 🟠 Story 3.1 thiếu customer

#### Epic 4: Khách hàng & Hệ thống Đơn giá
- **User Value:** ✓ OK. KH, nhóm KH, bảng giá, 6 tầng
- **Independence:** ✓ OK. Cần Epic 1 + Epic 2
- **Story Quality:** Story 4.3 (19 AC, 5 pricing methods) và Story 4.4 (3 pricing features) quá lớn
- **Violations:** 🟠 Story 4.3 nên tách 2-3 stories. 🟠 Story 4.4 nên tách 2 stories

#### Epic 5: Quản lý Công nợ
- **User Value:** ✓ OK. Ghi nợ, phiếu thu FIFO, cảnh báo
- **Independence:** ✓ OK. Cần Epic 3 + Epic 4
- **Story Quality:** ✓ Tốt. 5 stories, AC chi tiết
- **Violations:** 🟡 Story 5.3 NCC dependency với Epic 6 chưa nêu rõ

#### Epic 6: Nhập hàng & NCC
- **User Value:** ✓ OK. Phiếu nhập, kiểm kho, WAC
- **Independence:** ✓ OK. Cần Epic 2
- **Story Quality:** ✓ Tốt. WAC formula chính xác
- **Violations:** Không có

#### Epic 7: Hóa đơn & In ấn
- **User Value:** ⚠️ Title chưa rõ user value
- **Independence:** ✓ OK. Cần Epic 3
- **Story Quality:** Story 7.2 gộp trả hàng + in ấn (2 chức năng khác nhau). Cài đặt mẫu in chưa có story riêng
- **Violations:** 🟠 Story 7.2 nên tách. 🟠 Forward dep cài đặt mẫu in

#### Epic 8: Báo cáo & Dashboard
- **User Value:** ✓ OK. Dashboard 30 giây nắm tình hình
- **Independence:** ✓ OK. Cần data từ tất cả epic trước
- **Story Quality:** ✓ OK
- **Violations:** 🟡 Duplicate báo cáo công nợ với Epic 5 Story 5.5

#### Epic 9: Offline & PWA
- **User Value:** ❌ Technical epic. Title "Offline & PWA" là infrastructure
- **Independence:** ❌ Phụ thuộc toàn bộ schema Epic 1-8 finalized
- **Story Quality:** 🔴 CRITICAL
  - Story 9.1: Thiếu PGlite schema migration strategy (breaking changes khi thêm/xoá column)
  - Story 9.2: Conflict policy không justify rõ (client wins giá, server wins tồn kho). Cho phép tồn kho âm sau sync
  - Retry logic cho đơn pending sync không chi tiết
- **Violations:**
  - 🔴 PGlite schema migration strategy hoàn toàn thiếu
  - 🔴 Conflict resolution policy cần justification
  - 🔴 Tồn kho âm sau sync: validate server hay accept+warn?
  - 🟠 Stories quá technical, thiếu user context

### Tổng hợp Violations

| Severity | Count | Chi tiết |
|----------|-------|---------|
| 🔴 Critical | 4 | Epic 3 forward dep (mitigated); Epic 9: schema migration, conflict policy, negative stock |
| 🟠 Major | 7 | Story 4.3/4.4 quá lớn; Story 3.3 F4 dep; Story 3.1 thiếu customer; Story 7.2 gộp; Story 7.2 print settings; Epic 9 technical |
| 🟡 Minor | 5 | Story 1.1 lớn; thiếu CI/CD; Story 5.3 NCC; duplicate BC công nợ; Story 4.1 trigger |

### Best Practices Compliance

| Tiêu chí | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 |
|-----------|----|----|----|----|----|----|----|----|-----|
| User value | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ | ✓ | ❌ |
| Independence | ✓ | ✓ | ⚠️* | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ |
| Story sizing | ⚠️ | ✓ | ✓ | ❌ | ✓ | ✓ | ❌ | ✓ | ⚠️ |
| No forward dep | ✓ | ✓ | ❌ | ✓ | ✓ | ✓ | ❌ | ✓ | ❌ |
| DB timing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ |
| Clear AC | ✓ | ✓ | ⚠️ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ |
| FR traceability | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

*Epic 3 mitigated bằng execution order (Epic 4 trước Epic 3)

### Khuyến nghị

**Trước khi dev (CRITICAL):**
1. Epic 9: Bổ sung PGlite migration strategy, justify conflict policy, xử lý tồn kho âm
2. Epic 3: Ghi rõ dependency Epic 4 trong file epic

**Nên làm (MAJOR):**
3. Tách Story 4.3 thành 2-3 stories nhỏ hơn
4. Tách Story 4.4 thành 2 stories
5. Tách Story 7.2 (trả hàng vs in ấn)
6. Tách F4 ghi nợ từ Story 3.3 sang Epic 5
7. Thêm CI/CD story vào Epic 1

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** ⚠️

Nền tảng planning tốt: PRD chi tiết (67 FR, 19 NFR), FR coverage 100%, execution order hợp lý. Tuy nhiên có **6 vấn đề CRITICAL** cần giải quyết trước khi bắt đầu implementation, tập trung ở 2 khu vực: **Epic 9 (Offline)** và **UX Alignment gaps**.

### Điểm mạnh

- PRD structured rõ ràng, FR đánh số dễ truy vết (FR1-FR67)
- NFR có chỉ số đo lường cụ thể (autocomplete <200ms, đơn hàng <500ms)
- FR Coverage Map 100%: tất cả 67 FR đều mapped vào epic/story cụ thể
- Execution order đã xử lý đúng dependency (Epic 4 trước Epic 3)
- Architecture decisions chi tiết (29 AR), tech stack rõ ràng
- Epic 2, 5, 6 chất lượng tốt, AC chi tiết, story sizing hợp lý
- User journeys minh họa 4 luồng chính, khớp với FR

### Critical Issues Requiring Immediate Action

| # | Vấn đề | Nguồn | Hành động cần thiết |
|---|--------|-------|---------------------|
| 1 | **Epic 9: PGlite schema migration thiếu.** Không có strategy cho breaking changes khi thêm/xoá column giữa các phiên bản | Epic Quality | Bổ sung migration strategy: version tracking, schema diff, auto-migrate |
| 2 | **Epic 9: Conflict resolution chưa justify.** "Client wins đơn hàng, server wins tồn kho" nhưng không giải thích tại sao. Tồn kho âm sau sync là design problem | Epic Quality | Document rationale rõ ràng. Quyết định: validate server-side trước insert hay accept+cảnh báo? |
| 3 | **Dashboard UX hoàn toàn thiếu.** FR59 yêu cầu dashboard chi tiết nhưng UX chỉ có DashboardMetricCard skeleton | UX Alignment | Tạo Dashboard UX spec: layout, chart types, data refresh, alert placement |
| 4 | **Thermal printer UX ↔ Architecture mismatch.** UX nói "fallback image", Architecture nói "Web Serial/WebUSB". Thiếu permission flow | UX Alignment | Thống nhất strategy, spec permission dialog, define fallback UX |
| 5 | **Inventory Management UI thiếu.** FR8-12 (phiếu nhập, kiểm kho, NCC) không có UX spec nào | UX Alignment | Tạo UX journeys cho inventory: PO creation, stock check, WAC display |
| 6 | **Epic 9 là technical epic.** Thiếu user value rõ ràng, stories quá technical | Epic Quality | Reframe stories theo user value: "NV bán hàng khi mất mạng" thay vì "Setup PGlite" |

### Recommended Next Steps

**Phase 1: Fix Critical (1-2 ngày)**
1. Bổ sung PGlite migration strategy + conflict resolution rationale vào Epic 9
2. Tạo Dashboard UX spec (layout, charts, alerts)
3. Thống nhất Thermal Printer UX ↔ Architecture
4. Tạo Inventory Management UX journeys

**Phase 2: Fix Major (2-3 ngày)**
5. Tách Story 4.3 thành 2-3 stories (pricing methods quá phức tạp cho 1 story)
6. Tách Story 4.4 thành 2 stories
7. Tách Story 7.2 (trả hàng vs in ấn)
8. Tách F4 ghi nợ từ Story 3.3, chuyển vào Epic 5
9. Thêm CI/CD story vào Epic 1
10. Ghi dependency Epic 4 vào Epic 3 file

**Phase 3: Fix Minor (khi sprint chạy)**
11. Tách Story 1.1 (3 parallel lanes) thành stories nhỏ hơn
12. Phân chia báo cáo công nợ giữa Epic 5 và Epic 8
13. Bổ sung PIN dialog, offline lockout UX
14. Cập nhật component inventory (sync/export components)
15. Map breakpoints px ↔ Tailwind class

### Thống kê tổng hợp

| Dimension | Status | Score |
|-----------|--------|-------|
| PRD Completeness | ✅ Tốt | 67 FR + 19 NFR đầy đủ |
| FR Coverage | ✅ Tốt | 100% (67/67) |
| UX Alignment | ⚠️ Cần bổ sung | 3 CRITICAL + 3 HIGH gaps |
| Epic Quality | ⚠️ Cần sửa | 4 CRITICAL + 7 MAJOR violations |
| Architecture Alignment | ✓ Khá tốt | 2 mismatches cần fix |
| Execution Order | ✅ Tốt | Dependency đã xử lý đúng |

### Final Note

Assessment phát hiện **28 vấn đề** chia thành 4 lĩnh vực (PRD Analysis, Epic Coverage, UX Alignment, Epic Quality). Trong đó **6 CRITICAL** cần giải quyết trước implementation, **10 MAJOR** nên giải quyết trong Sprint 1, và **12 MINOR** có thể xử lý dần.

Nền tảng planning **vững chắc**: PRD rõ ràng, FR coverage 100%, architecture chi tiết. Các vấn đề phát hiện chủ yếu ở **Epic 9 (Offline)** và **UX gaps** cho một số màn hình. Với 1-2 ngày fix critical issues, dự án sẵn sàng bắt đầu implementation từ Epic 1.

**Assessor:** BMAD Implementation Readiness Checker
**Date:** 2026-04-24
**Project:** kiotviet-lite
