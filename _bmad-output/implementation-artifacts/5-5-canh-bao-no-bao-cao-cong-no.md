# Story 5.5: Cảnh báo nợ & Báo cáo công nợ

Status: ready-for-dev

## Story

As a chủ cửa hàng,
I want nhận cảnh báo khi khách hàng sắp/vượt hạn mức nợ hoặc nợ quá hạn, và xem báo cáo tổng hợp công nợ,
so that chủ động kiểm soát rủi ro tín dụng và nắm toàn cảnh công nợ.

## Acceptance Criteria (BDD)

### AC1: Schema mở rộng bảng `stores` + migration

**Given** bảng `stores` hiện có (Story 1.1) gồm: id, name, address, phone, logoUrl, createdAt, updatedAt

**When** chạy migration mới của story 5.5

**Then** thêm 2 cột vào bảng `stores`:

| Column                | Type      | Ràng buộc                      |
| --------------------- | --------- | ------------------------------ |
| `debt_warning_percent`| `integer` | NOT NULL, DEFAULT 80           |
| `debt_overdue_days`   | `varchar(50)` | NOT NULL, DEFAULT '30,60,90' |

**And** `debt_warning_percent` là ngưỡng % cảnh báo nợ sắp đạt hạn mức (mặc định 80%, tức current_debt >= 80% * debt_limit thì cảnh báo vàng)
**And** `debt_overdue_days` là danh sách ngày quá hạn phân cách bởi dấu phẩy (mặc định 30,60,90). Dùng để hiển thị badge + nhóm aging report.
**And** KHÔNG tạo bảng riêng. Mở rộng `stores` vì settings này gắn chặt 1:1 với store.

### AC2: Cập nhật StoreSettings + update schema

**Given** `storeSettingsSchema` hiện có trong `packages/shared/src/schema/store-settings.ts`

**When** Story 5.5 triển khai

**Then** mở rộng `storeSettingsSchema` thêm 2 field:
- `debtWarningPercent`: `z.number().int()` (trả về từ API)
- `debtOverdueDays`: `z.string()` (trả về từ API, VD "30,60,90")

**And** mở rộng `updateStoreSchema` thêm 2 field optional:
- `debtWarningPercent`: `z.number().int().min(1).max(100).optional()` (1-100%)
- `debtOverdueDays`: `z.string().regex(/^\d{1,3}(,\d{1,3}){0,4}$/).optional()` (1-5 giá trị, mỗi giá trị 1-999 ngày)

**And** cập nhật `toStoreSettings` mapper trong `apps/api/src/services/store.service.ts` thêm 2 field mới
**And** cập nhật `updateStore` service xử lý 2 field mới (ghi vào `stores` table)
**And** audit log khi thay đổi settings nợ: `store.updated` (reuse action hiện có), changes ghi rõ field nào thay đổi

### AC3: UI Settings > Cảnh báo công nợ

**Given** trang Settings hiện có 3 tab: Cửa hàng, Nhân viên, Lịch sử hoạt động

**When** Story 5.5 triển khai

**Then** thêm tab "Công nợ" vào Settings page (permission: `store.manage`, CHỈ Owner/Manager)

**And** tab "Công nợ" (`SettingsDebtPage`) gồm:

1. **Ngưỡng cảnh báo hạn mức** (`debtWarningPercent`):
   - Label: "Cảnh báo khi nợ đạt (%) hạn mức"
   - Input number, min 1, max 100, default 80
   - Helper: "Khách hàng nợ >= X% hạn mức sẽ hiển thị cảnh báo vàng"
   - Hiển thị preview: "Ví dụ: Hạn mức 1.000.000₫, cảnh báo khi nợ >= 800.000₫"

2. **Ngưỡng quá hạn** (`debtOverdueDays`):
   - Label: "Mốc cảnh báo quá hạn (ngày)"
   - 3 input fields, mỗi field là number (readonly count = 3 mốc)
   - Default: 30, 60, 90
   - Helper: "Khoản nợ quá hạn sẽ hiển thị badge theo các mốc này"

3. **Nút "Lưu thay đổi"** (variant primary, disabled khi form pristine hoặc đang submit)

- Form dùng React Hook Form + zodResolver
- Submit gọi `PATCH /api/v1/store` (endpoint hiện có, mở rộng schema)
- Toast thành công: "Đã cập nhật cài đặt công nợ"
- Invalidate query `['store']`

### AC4: Badge quá hạn trên từng khoản nợ (CustomerDebtsTab)

**Given** `CustomerDebtsTab` hiện hiển thị bảng chi tiết khoản nợ với cột: Mã đơn, Ngày phát sinh, Nợ ban đầu, Đã trả, Còn lại

**When** Story 5.5 triển khai

**Then** thêm cột "Tình trạng" vào bảng chi tiết khoản nợ:

- Nếu `remaining > 0` VÀ `daysSinceCreated <= overdueDays[0]` (VD <=30): Badge "Trong hạn" màu xanh (green)
- Nếu `remaining > 0` VÀ `daysSinceCreated > overdueDays[0]` VÀ `<= overdueDays[1]`: Badge "Quá hạn X ngày" màu vàng (yellow)
- Nếu `remaining > 0` VÀ `daysSinceCreated > overdueDays[1]` VÀ `<= overdueDays[2]`: Badge "Quá hạn X ngày" màu cam (orange)
- Nếu `remaining > 0` VÀ `daysSinceCreated > overdueDays[2]`: Badge "Quá hạn X ngày" màu đỏ (red)
- Nếu `remaining === 0`: Badge "Đã tất toán" màu xám

**And** `daysSinceCreated = Math.floor((Date.now() - new Date(debt.date).getTime()) / 86400000)`
**And** `overdueDays` đọc từ store settings (qua `useStoreQuery` hook hiện có)
**And** KHÔNG call API mới. Tính toán badge phía client từ `debt.date` + store settings.

### AC5: Cảnh báo nợ trên danh sách khách hàng

**Given** trang danh sách khách hàng (`CustomersPage`) hiện hiển thị: tên, phone, nhóm, tổng mua, nợ hiện tại

**When** khách hàng có `currentDebt > 0` VÀ `debtLimit > 0`

**Then** cột "Nợ hiện tại" hiển thị kèm icon cảnh báo:
- `currentDebt >= 100% * debtLimit`: icon AlertTriangle màu đỏ + tooltip "Đã vượt hạn mức công nợ"
- `currentDebt >= warningPercent% * debtLimit`: icon AlertTriangle màu vàng + tooltip "Nợ sắp đạt hạn mức ({usagePercent}%)"
- Dưới ngưỡng: không icon

**And** `warningPercent` đọc từ store settings (query đã có từ settings feature)
**And** KHÔNG cần API mới. Frontend tính từ customer data + store settings.

### AC6: API Báo cáo tuổi nợ (GET /api/v1/reports/debt-aging)

**Given** Owner/Manager muốn xem báo cáo aging report

**When** gọi `GET /api/v1/reports/debt-aging?from=2026-01-01&to=2026-05-04`

**Then** API validate qua `debtAgingQuerySchema`:
- `from`: `z.string().datetime().optional()` (mặc định 90 ngày trước)
- `to`: `z.string().datetime().optional()` (mặc định now)

**And** service `getDebtAgingReport({ db, storeId, query })`:
1. Lấy `debt_overdue_days` từ `stores` table → parse thành array `[30, 60, 90]`
2. Query `debts` WHERE `store_id = storeId AND remaining > 0` (chỉ nợ chưa tất toán)
3. LEFT JOIN `customers` lấy `name`, `phone`, `debt_limit`
4. GROUP BY `customer_id`
5. Tính aging buckets dựa trên `debts.created_at`:
   - Bucket 1: 0-30 ngày (sum remaining)
   - Bucket 2: 31-60 ngày
   - Bucket 3: 61-90 ngày
   - Bucket 4: >90 ngày
   - (dynamic theo `debt_overdue_days` config)
6. Sort: tổng nợ DESC

**And** response:
```json
{
  "data": {
    "rows": [
      {
        "customerId": "uuid",
        "customerName": "Nguyễn Văn A",
        "customerPhone": "0901234567",
        "debtLimit": 1000000,
        "totalDebt": 750000,
        "buckets": [300000, 200000, 150000, 100000]
      }
    ],
    "totals": {
      "totalDebt": 750000,
      "buckets": [300000, 200000, 150000, 100000]
    },
    "bucketLabels": ["0-30 ngày", "31-60 ngày", "61-90 ngày", ">90 ngày"]
  }
}
```

**And** permission: `customers.manage` (Owner + Manager)

### AC7: API Báo cáo tổng hợp công nợ (GET /api/v1/reports/debt-summary)

**Given** Owner/Manager muốn xem tổng hợp: phải thu, phải trả, sổ quỹ

**When** gọi `GET /api/v1/reports/debt-summary?from=2026-01-01&to=2026-05-04`

**Then** API validate qua `debtSummaryQuerySchema`:
- `from`: `z.string().datetime().optional()` (mặc định 30 ngày trước)
- `to`: `z.string().datetime().optional()` (mặc định now)

**And** service `getDebtSummaryReport({ db, storeId, query })`:

1. **Phải thu (KH):**
   - Tổng `customers.current_debt` WHERE `store_id AND current_debt > 0 AND deleted_at IS NULL`
   - Số KH còn nợ
   - Tổng phiếu thu trong khoảng thời gian: SUM `receipts.amount` WHERE `store_id AND created_at BETWEEN from AND to`
   - Số phiếu thu

2. **Phải trả (NCC):**
   - Tổng `suppliers.current_debt` WHERE `store_id AND current_debt > 0 AND deleted_at IS NULL`
   - Số NCC còn nợ
   - Tổng phiếu chi trong khoảng thời gian: SUM `supplier_payments.amount` WHERE `store_id AND created_at BETWEEN from AND to`
   - Số phiếu chi

3. **Sổ quỹ** (trong khoảng thời gian):
   - Tổng thu = SUM receipts.amount
   - Tổng chi = SUM supplier_payments.amount
   - Chênh lệch = Tổng thu - Tổng chi

**And** response:
```json
{
  "data": {
    "receivable": {
      "totalDebt": 5000000,
      "customerCount": 12,
      "totalCollected": 2000000,
      "receiptCount": 8
    },
    "payable": {
      "totalDebt": 3000000,
      "supplierCount": 5,
      "totalPaid": 1500000,
      "paymentCount": 4
    },
    "cashFlow": {
      "totalIn": 2000000,
      "totalOut": 1500000,
      "net": 500000
    },
    "period": { "from": "2026-01-01T00:00:00Z", "to": "2026-05-04T23:59:59Z" }
  }
}
```

**And** permission: `reports.view` (Owner + Manager, theo router `requirePermissionGuard('reports.view')` hiện có)

### AC8: API xuất CSV (GET /api/v1/reports/debt-aging/csv, /debt-summary/csv)

**Given** Owner/Manager muốn xuất báo cáo

**When** gọi `GET /api/v1/reports/debt-aging/csv?from=...&to=...`

**Then** server trả `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="bao-cao-tuoi-no-2026-05-04.csv"` + BOM `﻿` (Excel mở UTF-8 đúng)

**And** CSV aging report header: `Khách hàng,Điện thoại,Hạn mức,Tổng nợ,{bucket_labels dynamic}` VD: `0-30 ngày,31-60 ngày,61-90 ngày,>90 ngày`
**And** CSV summary report: 3 section (Phải thu, Phải trả, Sổ quỹ) ngăn cách bằng dòng trống

**And** permission: cùng AC6/AC7

### AC9: UI Báo cáo > Công nợ

**Given** `ReportsPage` hiện là EmptyState placeholder

**When** Story 5.5 triển khai

**Then** thay thế `ReportsPage` bằng trang báo cáo thực có tabs:

1. **Tab "Tuổi nợ"** (default):
   - Date range picker: preset (Hôm nay, 7 ngày, 30 ngày, 90 ngày, Tuỳ chỉnh)
   - Bảng aging report:
     - Cột: Khách hàng, Điện thoại, Hạn mức, Tổng nợ, {dynamic bucket columns}, % sử dụng hạn mức
     - Dòng tổng cộng cuối bảng (bold)
     - Click vào tên KH → navigate `/customers/{id}` (tab Công nợ)
   - Nút "Xuất CSV" (gọi endpoint CSV, download file)
   - Empty state khi không có dữ liệu: "Không có khoản nợ chưa tất toán"

2. **Tab "Tổng hợp"**:
   - Date range picker (cùng component, sync state)
   - 3 card summary:
     - Card "Phải thu" (icon ArrowDownLeft, color blue): tổng nợ KH, số KH nợ, tổng đã thu, số phiếu thu
     - Card "Phải trả" (icon ArrowUpRight, color orange): tổng nợ NCC, số NCC nợ, tổng đã trả, số phiếu chi
     - Card "Sổ quỹ" (icon Wallet, color green): tổng thu, tổng chi, chênh lệch (xanh nếu dương, đỏ nếu âm)
   - Nút "Xuất CSV"
   - Empty state: "Chưa có dữ liệu công nợ trong khoảng thời gian này"

**And** tạo feature folder `apps/web/src/features/reports/` với:
- `reports-api.ts` (API client)
- `hooks/use-reports.ts` (TanStack Query hooks)
- `components/DebtAgingReport.tsx`
- `components/DebtSummaryReport.tsx`
- `components/DateRangePicker.tsx` (reusable, nếu chưa có)
- `components/ReportCard.tsx`

### AC10: Settings tab "Công nợ" hiển thị chính xác

**Given** Owner/Manager đang ở Settings

**When** click tab "Công nợ"

**Then** form load giá trị hiện tại từ store settings API
**And** thay đổi giá trị → nút "Lưu thay đổi" enable
**And** submit → toast "Đã cập nhật cài đặt công nợ" → áp dụng ngay (invalidate store query)
**And** sau khi lưu, CustomerDebtsTab và danh sách KH dùng ngưỡng mới ngay lập tức

### AC11: Routes mount + middleware

**Given** Hono router hiện mount nhiều route

**When** thêm route báo cáo

**Then** tạo `apps/api/src/routes/reports.routes.ts`:
- Factory `createReportsRoutes({ db })`
- Middleware: `requireAuth` + `requirePermission('reports.view')`
- `GET /debt-aging` → `getDebtAgingReport` (query params: from, to)
- `GET /debt-aging/csv` → `getDebtAgingCsv`
- `GET /debt-summary` → `getDebtSummaryReport` (query params: from, to)
- `GET /debt-summary/csv` → `getDebtSummaryCsv`

**And** mount vào `apps/api/src/index.ts`:
```typescript
app.route('/api/v1/reports', createReportsRoutes({ db }))
```

### AC12: Frontend routes

**Given** router hiện có `/reports` route trỏ đến `ReportsPage` placeholder

**When** Story 5.5 triển khai

**Then** KHÔNG thay đổi route `/reports`. Chỉ thay nội dung `ReportsPage` từ EmptyState thành component thực.
**And** thêm route con cho Settings: `/settings/debt` → `SettingsDebtPage`
**And** thêm tab "Công nợ" vào `SETTINGS_TABS` array (sau "Cửa hàng")

### AC13: Tests

**Given** Story 5.5 cần test coverage tương đương story trước

**When** dev viết tests

**Then** tạo:

**1. Unit test schema** `packages/shared/src/schema/debt-report-management.test.ts`:
- `debtAgingQuerySchema`: valid default, custom from/to
- `debtSummaryQuerySchema`: valid default, custom range
- `updateStoreSchema` mở rộng: debtWarningPercent valid (1-100), invalid (0, 101, float), debtOverdueDays valid ("30,60,90"), invalid ("abc", "1000")
- Tối thiểu 12 case

**2. Integration test** `apps/api/src/__tests__/reports.integration.test.ts`:
- Setup: createTestStore, createTestCustomer (có nợ khác nhau), createTestSupplier (có nợ), tạo debts, receipts, supplier_payments
- GET `/api/v1/reports/debt-aging`:
  - Trả đúng aging buckets cho KH có nợ ở nhiều mốc thời gian
  - Multi-tenant: store A không thấy nợ store B
  - Không có nợ → rows rỗng, totals = 0
  - Permission: Staff → 403
- GET `/api/v1/reports/debt-aging/csv`:
  - Content-Type đúng
  - BOM UTF-8 ở đầu
  - Header + data đúng format
- GET `/api/v1/reports/debt-summary`:
  - Phải thu tổng đúng
  - Phải trả tổng đúng
  - Sổ quỹ net = thu - chi
  - Lọc theo khoảng ngày đúng
  - Multi-tenant
- GET `/api/v1/reports/debt-summary/csv`:
  - Format đúng
- PATCH `/api/v1/store` (mở rộng):
  - Update debtWarningPercent → persist + response có field mới
  - Update debtOverdueDays → persist
  - Invalid percent (0, 101) → 400
  - Invalid overdueDays → 400
- Tối thiểu 18 case

## Tasks / Subtasks

- [ ] **Task 1: DB schema + migration** (AC: 1)
  - [ ] Sửa `packages/shared/src/schema/stores.ts`: thêm 2 cột `debtWarningPercent` integer default 80, `debtOverdueDays` varchar(50) default '30,60,90'
  - [ ] Export trong `packages/shared/src/schema/index.ts` (nếu cần)
  - [ ] Chạy `pnpm --filter @kiotviet-lite/api db:generate` để sinh migration
  - [ ] Verify migration ALTER TABLE đúng

- [ ] **Task 2: Shared schema + types** (AC: 2, 6, 7, 8)
  - [ ] Sửa `packages/shared/src/schema/store-settings.ts`:
    - [ ] Thêm `debtWarningPercent`, `debtOverdueDays` vào `storeSettingsSchema`
    - [ ] Thêm `debtWarningPercent`, `debtOverdueDays` optional vào `updateStoreSchema`
  - [ ] Tạo `packages/shared/src/schema/debt-report-management.ts`:
    - [ ] `debtAgingQuerySchema`, `debtSummaryQuerySchema`
    - [ ] `debtAgingReportSchema`, `debtSummaryReportSchema`
    - [ ] Export types
  - [ ] Export trong `packages/shared/src/schema/index.ts`

- [ ] **Task 3: Backend store service mở rộng** (AC: 2)
  - [ ] Sửa `apps/api/src/services/store.service.ts`:
    - [ ] `toStoreSettings`: thêm `debtWarningPercent`, `debtOverdueDays`
    - [ ] `updateStore`: xử lý 2 field mới trong updates + audit diff

- [ ] **Task 4: Backend reports service** (AC: 6, 7, 8)
  - [ ] Tạo `apps/api/src/services/reports.service.ts`:
    - [ ] `getDebtAgingReport({ db, storeId, query })`:
      - [ ] Lấy store config cho overdueDays
      - [ ] Query debts WHERE remaining > 0, JOIN customers
      - [ ] Tính aging buckets bằng SQL CASE WHEN hoặc app-level grouping
      - [ ] GROUP BY customer, sort tổng nợ DESC
    - [ ] `getDebtSummaryReport({ db, storeId, query })`:
      - [ ] 3 query song song: SUM customers.currentDebt, SUM suppliers.currentDebt, SUM receipts + supplier_payments trong range
    - [ ] `getDebtAgingCsv(...)`: format CSV với BOM
    - [ ] `getDebtSummaryCsv(...)`: format CSV 3 sections

- [ ] **Task 5: Backend reports route** (AC: 11)
  - [ ] Tạo `apps/api/src/routes/reports.routes.ts`:
    - [ ] Factory `createReportsRoutes({ db })`
    - [ ] Middleware `requireAuth` + `requirePermission('reports.view')`
    - [ ] 4 endpoints: GET debt-aging, GET debt-aging/csv, GET debt-summary, GET debt-summary/csv
  - [ ] Mount vào `apps/api/src/index.ts`

- [ ] **Task 6: Frontend settings debt page** (AC: 3, 10, 12)
  - [ ] Tạo `apps/web/src/pages/settings-debt-page.tsx` (SettingsDebtPage):
    - [ ] Form: debtWarningPercent (number input), debtOverdueDays (3 number inputs)
    - [ ] RHF + zodResolver, load current values from store query
    - [ ] Submit → PATCH /api/v1/store → toast + invalidate
  - [ ] Sửa `apps/web/src/pages/settings-page.tsx`:
    - [ ] Thêm tab "Công nợ" vào SETTINGS_TABS (value: 'debt', path: '/settings/debt', permission: 'store.manage')
  - [ ] Sửa `apps/web/src/router.tsx`:
    - [ ] Import SettingsDebtPage
    - [ ] Thêm settingsDebtRoute dưới settingsRoute (path: 'debt', permission: 'store.manage')
    - [ ] Thêm vào settingsRoute.addChildren

- [ ] **Task 7: Frontend reports feature** (AC: 9)
  - [ ] Tạo `apps/web/src/features/reports/reports-api.ts`:
    - [ ] `getDebtAgingReport(query)`, `getDebtSummaryReport(query)`, `downloadDebtAgingCsv(query)`, `downloadDebtSummaryCsv(query)`
  - [ ] Tạo `apps/web/src/features/reports/hooks/use-reports.ts`:
    - [ ] `useDebtAgingReport(query)`, `useDebtSummaryReport(query)`
  - [ ] Tạo `apps/web/src/features/reports/components/DebtAgingReport.tsx`:
    - [ ] Bảng aging: KH, phone, hạn mức, tổng nợ, buckets, % sử dụng
    - [ ] Dòng tổng cộng
    - [ ] Click tên KH → navigate customer detail
    - [ ] Nút xuất CSV
  - [ ] Tạo `apps/web/src/features/reports/components/DebtSummaryReport.tsx`:
    - [ ] 3 cards: Phải thu, Phải trả, Sổ quỹ
    - [ ] Nút xuất CSV
  - [ ] Tạo `apps/web/src/features/reports/components/DateRangePicker.tsx` (hoặc reuse nếu đã có):
    - [ ] Presets: Hôm nay, 7 ngày, 30 ngày, 90 ngày, Tuỳ chỉnh
    - [ ] from/to date inputs

- [ ] **Task 8: Cập nhật ReportsPage** (AC: 9)
  - [ ] Sửa `apps/web/src/pages/reports-page.tsx`:
    - [ ] Thay EmptyState bằng layout có 2 tabs: "Tuổi nợ" + "Tổng hợp"
    - [ ] Tab "Tuổi nợ" render `<DebtAgingReport />`
    - [ ] Tab "Tổng hợp" render `<DebtSummaryReport />`
    - [ ] Shared DateRangePicker sync giữa 2 tabs

- [ ] **Task 9: Badge quá hạn trên CustomerDebtsTab** (AC: 4)
  - [ ] Sửa `apps/web/src/features/customers/components/CustomerDebtsTab.tsx`:
    - [ ] Import `useStoreQuery` từ settings feature
    - [ ] Thêm cột "Tình trạng" vào bảng chi tiết khoản nợ
    - [ ] Tạo helper `getDebtStatusBadge(debtDate, remaining, overdueDays)`
    - [ ] Render badge theo logic AC4

- [ ] **Task 10: Cảnh báo nợ trên danh sách KH** (AC: 5)
  - [ ] Tìm component hiển thị danh sách KH (CustomersPage hoặc component con)
  - [ ] Thêm icon cảnh báo bên cạnh cột nợ hiện tại
  - [ ] Import `useStoreQuery` để lấy `debtWarningPercent`
  - [ ] Logic: if currentDebt >= debtLimit → red, elif >= warningPercent% → yellow

- [ ] **Task 11: Tests** (AC: 13)
  - [ ] `packages/shared/src/schema/debt-report-management.test.ts` (12+ case)
  - [ ] `apps/api/src/__tests__/reports.integration.test.ts` (18+ case)

- [ ] **Task 12: Typecheck + lint + full test suite** (AC: tất cả)
  - [ ] `pnpm typecheck` pass 4 workspace
  - [ ] `vitest run` full suite pass (trừ flaky pre-existing)

- [ ] **Task 13: Manual smoke test**
  - [ ] Settings > Công nợ: thay đổi ngưỡng → lưu → toast
  - [ ] Danh sách KH: icon cảnh báo hiển thị đúng theo ngưỡng mới
  - [ ] Chi tiết KH > tab Công nợ: badge quá hạn hiển thị đúng
  - [ ] Báo cáo > Tuổi nợ: bảng đúng, tổng đúng, CSV tải được
  - [ ] Báo cáo > Tổng hợp: 3 card đúng, CSV tải được

## Dev Notes

### Architecture alignment

- **Stack**: Backend Hono 4.x + Drizzle ORM + PostgreSQL. Frontend React 19 + TanStack Router + TanStack Query 5 + shadcn/ui + Tailwind 4. Shared `@kiotviet-lite/shared` cho Zod + Drizzle.
- **Multi-tenant**: mọi query filter `store_id`. Service nhận `actor.storeId`.
- **Currency**: integer VND, `bigint` mode 'number'.
- **Reports**: feature folder mới `features/reports/`. Route `/reports` đã tồn tại trong router, chỉ thay nội dung.

### Files cần TẠO

**Shared (`packages/shared/src/schema/`):**
- `debt-report-management.ts` (Zod schemas + types cho report APIs)
- `debt-report-management.test.ts`

**Backend (`apps/api/src/`):**
- `services/reports.service.ts`
- `routes/reports.routes.ts`
- `__tests__/reports.integration.test.ts`
- `db/migrations/XXXX_*.sql` (auto-generated)

**Frontend (`apps/web/src/`):**
- `features/reports/reports-api.ts`
- `features/reports/hooks/use-reports.ts`
- `features/reports/components/DebtAgingReport.tsx`
- `features/reports/components/DebtSummaryReport.tsx`
- `features/reports/components/DateRangePicker.tsx`
- `features/reports/components/ReportCard.tsx`
- `pages/settings-debt-page.tsx`

### Files cần SỬA

- `packages/shared/src/schema/stores.ts`: thêm 2 cột
- `packages/shared/src/schema/store-settings.ts`: mở rộng schemas
- `packages/shared/src/schema/index.ts`: export schema mới
- `apps/api/src/services/store.service.ts`: mở rộng toStoreSettings + updateStore
- `apps/api/src/index.ts`: mount reports route
- `apps/web/src/pages/reports-page.tsx`: thay EmptyState bằng component thực
- `apps/web/src/pages/settings-page.tsx`: thêm tab "Công nợ"
- `apps/web/src/router.tsx`: thêm settingsDebtRoute
- `apps/web/src/features/customers/components/CustomerDebtsTab.tsx`: thêm cột "Tình trạng"
- `apps/web/src/features/settings/use-store-settings.ts`: (có thể cần mở rộng nếu chưa expose debtWarningPercent)

### KHÔNG đụng (scope boundary)

- KHÔNG tạo bảng mới cho settings (dùng cột trên stores)
- KHÔNG đụng `debts`, `receipts`, `supplier_payments`, `debt_adjustments` table schema (chỉ query đọc)
- KHÔNG đụng POS flow hay PaymentDialog
- KHÔNG đụng notification service (cảnh báo nợ ở UI level, không push notification)
- KHÔNG implement real-time notification cho quá hạn (out of scope, dùng badge tĩnh)
- KHÔNG đụng `customers` table schema (chỉ đọc currentDebt, debtLimit)

### Coupling với các story khác

**Story 5.1 (Ghi nợ POS), đã done:**
- 5.5 đọc `customers.currentDebt` + `customers.debtLimit` để hiển thị cảnh báo trên list
- DebtProgressBar trong CustomerDebtsTab đã có warning/danger variant. 5.5 cần đọc `debtWarningPercent` từ settings thay vì hardcode 80%

**Story 5.2 (Phiếu thu FIFO), đã done:**
- 5.5 đọc `receipts.amount` trong khoảng thời gian để tính tổng thu cho Sổ quỹ

**Story 5.3 (Phiếu chi NCC), đã done:**
- 5.5 đọc `supplier_payments.amount` trong khoảng thời gian để tính tổng chi
- 5.5 đọc `suppliers.currentDebt` để tính tổng phải trả NCC

**Story 5.4 (Điều chỉnh nợ), đã done:**
- Không overlap trực tiếp. Điều chỉnh nợ thay đổi currentDebt, reports đọc currentDebt.

### Lưu ý từ review Story 5.2/5.3/5.4 (rút kinh nghiệm)

1. **[PATTERN] Reuse store query**: Frontend đã có `useStoreQuery` trong `features/settings/use-store-settings.ts`. KHÔNG tạo hook mới cho store settings. Import reuse.
2. **[PATTERN] Date range**: date-fns cho calculations, ISO 8601 format cho API params.
3. **[PATTERN] CSV export**: Server trả stream CSV. Client trigger download bằng `<a href download>` hoặc `URL.createObjectURL`.
4. **[SF] Tiếng Việt đầy đủ dấu**: triple-check mọi label, header CSV, toast.
5. **[SF] Integer arithmetic**: amounts là integer VND. SUM trả bigint, cast về number.
6. **[PATTERN] Empty state**: dùng `<EmptyState>` component đã có.
7. **[PATTERN] Permission**: reports.view cho Owner + Manager. Settings store.manage cho Owner + Manager.
8. **[PATTERN] Tab navigation**: xem `SettingsPage` (SETTINGS_TABS array) + `OrdersPage` cho tab pattern.
9. **[CRIT] Dynamic bucket labels**: aging buckets phải dynamic theo `debtOverdueDays` config, KHÔNG hardcode 30/60/90.
10. **[CRIT] SQL aging calculation**: dùng `EXTRACT(EPOCH FROM NOW() - debts.created_at) / 86400` hoặc `DATE_PART('day', NOW() - debts.created_at)` để tính số ngày. KHÔNG fetch tất cả debts rồi tính phía app (performance).

### Permission matrix (story này)

| Permission        | Owner | Manager | Staff | Resource                     |
| ----------------- | ----- | ------- | ----- | ---------------------------- |
| `reports.view`    | ✅    | ✅      | ❌    | GET aging, summary, CSV      |
| `customers.manage`| ✅    | ✅      | ❌    | Xem badge cảnh báo trên list |
| `store.manage`    | ✅    | ✅      | ❌    | Settings > Công nợ           |

KHÔNG tạo permission mới.

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG hardcode 80% hay 30/60/90 ngày. Đọc từ store settings.
- KHÔNG fetch all debts rồi group phía client cho reports (dùng SQL aggregate)
- KHÔNG tạo bảng riêng cho store settings (dùng cột trên stores)
- KHÔNG bypass `storeId` filter (multi-tenant)
- KHÔNG dùng floating point cho amount
- KHÔNG dùng `any` hay `@ts-ignore`
- KHÔNG import cross-feature (reports code KHÔNG import từ features/customers trực tiếp, dùng shared)
- KHÔNG tạo CSS custom (Tailwind + shadcn/ui)
- KHÔNG bỏ BOM khi export CSV (Excel cần BOM để đọc UTF-8)
- KHÔNG tạo endpoint sửa/xoá debt data (reports chỉ ĐỌC)
- KHÔNG cache báo cáo phía server (data thay đổi thường xuyên, TanStack Query cache phía client đủ)

### Project Structure Notes

- Feature folder mới: `features/reports/` (components, hooks, api)
- Settings page mới: `pages/settings-debt-page.tsx`
- Backend service + route mới: `services/reports.service.ts`, `routes/reports.routes.ts`
- Shared schemas: `packages/shared/src/schema/debt-report-management.ts`
- Sửa stores.ts (Drizzle table) và store-settings.ts (Zod) thêm columns

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-qun-l-cng-n.md#Story 5.5]
- [Source: _bmad-output/implementation-artifacts/5-4-dieu-chinh-no-thu-cong.md] (previous story, patterns)
- [Source: packages/shared/src/schema/stores.ts] (table cần ALTER)
- [Source: packages/shared/src/schema/store-settings.ts] (schema cần mở rộng)
- [Source: packages/shared/src/schema/debts.ts] (table reference cho aging query)
- [Source: packages/shared/src/schema/customers.ts] (currentDebt, debtLimit columns)
- [Source: packages/shared/src/schema/receipts.ts] (SUM amount cho tổng thu)
- [Source: packages/shared/src/schema/supplier-payments.ts] (SUM amount cho tổng chi)
- [Source: packages/shared/src/schema/suppliers.ts] (currentDebt column cho phải trả)
- [Source: apps/api/src/services/store.service.ts] (toStoreSettings, updateStore pattern)
- [Source: apps/api/src/index.ts] (mount pattern)
- [Source: apps/web/src/pages/reports-page.tsx] (placeholder cần thay)
- [Source: apps/web/src/pages/settings-page.tsx] (SETTINGS_TABS pattern)
- [Source: apps/web/src/router.tsx] (route registration)
- [Source: apps/web/src/features/customers/components/CustomerDebtsTab.tsx] (DebtProgressBar, badge pattern)
- [Source: apps/web/src/features/settings/use-store-settings.ts] (useStoreQuery reuse)
- [Source: apps/web/src/features/settings/store-settings-api.ts] (API client pattern)
- [Source: apps/web/src/lib/currency.ts] (formatVnd frontend)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
