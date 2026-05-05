# Story 8.2: Báo cáo chi tiết & Export

Status: ready-for-dev

## Story

As a chủ cửa hàng,
I want xem báo cáo chi tiết doanh thu, lợi nhuận, tồn kho, giá và export ra file,
So that phân tích kinh doanh sâu hơn và lưu trữ dữ liệu.

## Acceptance Criteria (BDD)

### AC1: Backend API Báo cáo doanh thu (4 tabs)

**Given** Owner/Manager gọi `GET /api/v1/reports/revenue?tab=time|product|customer|employee&from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month`

**When** server xử lý request

**Then** response trả về theo từng tab:

**Tab "time" (Theo thời gian):**

```json
{
  "data": {
    "rows": [
      {
        "date": "2026-05-01",
        "label": "01/05",
        "orderCount": 12,
        "revenue": 3600000,
        "previousRevenue": 3200000,
        "trend": 12.5
      }
    ],
    "summary": { "totalOrders": 45, "totalRevenue": 15200000, "avgDaily": 2171429 }
  }
}
```

**Tab "product" (Theo SP):**

```json
{
  "data": {
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP A",
        "sku": "SKU001",
        "quantity": 25,
        "revenue": 5000000,
        "percentage": 32.89
      }
    ],
    "summary": { "totalProducts": 15, "totalQuantity": 120, "totalRevenue": 15200000 }
  }
}
```

**Tab "customer" (Theo KH):**

```json
{
  "data": {
    "rows": [
      {
        "customerId": "uuid",
        "customerName": "KH A",
        "phone": "0901234567",
        "orderCount": 5,
        "revenue": 3000000,
        "currentDebt": 500000
      }
    ],
    "summary": { "totalCustomers": 8, "totalRevenue": 15200000 }
  }
}
```

**Tab "employee" (Theo nhân viên):**

```json
{
  "data": {
    "rows": [
      {
        "userId": "uuid",
        "userName": "NV A",
        "orderCount": 20,
        "revenue": 8000000,
        "percentage": 52.63
      }
    ],
    "summary": { "totalEmployees": 3, "totalRevenue": 15200000 }
  }
}
```

**And** `tab` mặc định `time`. `groupBy` chỉ áp dụng cho tab `time`, mặc định `day`
**And** `from`/`to` filter theo `orders.createdAt`. Mặc định: from = 30 ngày trước, to = hôm nay
**And** chỉ tính orders có `status = 'completed'`
**And** rows sắp theo revenue DESC (trừ tab time: sắp theo date ASC)
**And** tab customer: `currentDebt` = SUM(debts.remaining) WHERE remaining > 0
**And** mọi query filter theo `store_id` (multi-tenant)
**And** permission: `reports.view`
**And** Validation qua Zod schema trong `packages/shared`

### AC2: Backend API Báo cáo lợi nhuận

**Given** Owner/Manager gọi `GET /api/v1/reports/profit?from=YYYY-MM-DD&to=YYYY-MM-DD`

**When** server xử lý request

**Then** response:

```json
{
  "data": {
    "summary": {
      "totalRevenue": 15200000,
      "totalCogs": 10640000,
      "grossProfit": 4560000,
      "marginPercent": 30.0
    },
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP A",
        "sku": "SKU001",
        "quantity": 25,
        "revenue": 5000000,
        "cogs": 3500000,
        "profit": 1500000,
        "marginPercent": 30.0,
        "isLoss": false
      }
    ]
  }
}
```

**And** `cogs` = SUM(`products.costPrice * order_items.quantity`) cho orders completed trong khoảng
**And** `isLoss` = true khi profit < 0 (SP lỗ)
**And** rows sắp theo profit DESC
**And** filter store_id, from/to (mặc định 30 ngày)

### AC3: Backend API Báo cáo tồn kho (3 tabs)

**Given** Owner/Manager gọi `GET /api/v1/reports/inventory?tab=current|reorder|slow`

**When** server xử lý request

**Then** response theo tab:

**Tab "current" (Tồn hiện tại):**

```json
{
  "data": {
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP A",
        "sku": "SKU001",
        "currentStock": 50,
        "costPrice": 200000,
        "stockValue": 10000000
      }
    ],
    "summary": { "totalProducts": 30, "totalStockValue": 150000000 }
  }
}
```

**Tab "reorder" (Cần nhập):**

```json
{
  "data": {
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP X",
        "sku": "SKU005",
        "currentStock": 2,
        "minStock": 10,
        "reorderQuantity": 8
      }
    ]
  }
}
```

**Tab "slow" (Hàng chậm bán):**

```json
{
  "data": {
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP Z",
        "sku": "SKU020",
        "currentStock": 15,
        "lastSoldDate": "2026-03-15",
        "daysSinceLastSold": 51
      }
    ]
  }
}
```

**And** tab `current`: chỉ SP có `trackInventory = true` và `deletedAt IS NULL`, sắp theo stockValue DESC
**And** tab `reorder`: SP có `currentStock <= minStock` VÀ `minStock > 0`, `reorderQuantity = minStock - currentStock`
**And** tab `slow`: SP không có order_items trong 30 ngày gần nhất, `lastSoldDate` = MAX(order_items.createdAt) cho SP đó
**And** filter store_id

### AC4: Backend API Báo cáo giá (3 tabs)

**Given** Owner/Manager gọi `GET /api/v1/reports/pricing?tab=overrides|comparison|history&from=YYYY-MM-DD&to=YYYY-MM-DD&productId=uuid`

**When** server xử lý request

**Then** response theo tab:

**Tab "overrides" (Đơn sửa giá):**

```json
{
  "data": {
    "rows": [
      {
        "orderId": "uuid",
        "orderNumber": "HD001",
        "orderDate": "2026-05-01T10:30:00Z",
        "productName": "SP A",
        "originalPrice": 500000,
        "overridePrice": 450000,
        "difference": -50000,
        "userName": "NV A",
        "reason": "Khách VIP"
      }
    ]
  }
}
```

**Tab "comparison" (So sánh bảng giá):**

```json
{
  "data": {
    "priceLists": ["Giá bán lẻ", "Giá sỉ", "Giá VIP"],
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP A",
        "sku": "SKU001",
        "costPrice": 200000,
        "prices": [500000, 450000, 400000],
        "margins": [60.0, 55.6, 50.0]
      }
    ]
  }
}
```

**Tab "history" (Lịch sử giá nhập):**

```json
{
  "data": {
    "rows": [
      {
        "productId": "uuid",
        "productName": "SP A",
        "purchaseDate": "2026-04-20",
        "supplierName": "NCC A",
        "unitPrice": 195000,
        "costAfter": 198000
      }
    ]
  }
}
```

**And** tab `overrides`: join order_items (priceOverride = true) + orders + users. Filter from/to theo orders.createdAt
**And** tab `comparison`: pivot products × priceLists. `margins[i] = (prices[i] - costPrice) / prices[i] * 100`. Chỉ active price lists
**And** tab `history`: join purchase_order_items + purchase_orders + suppliers. `costAfter` = WAC sau nhập (từ purchase_order_items.costAfter). Filter productId optional, from/to theo purchaseDate
**And** filter store_id

### AC5: Export CSV & Excel

**Given** Owner/Manager gọi `GET /api/v1/reports/{type}/export?format=csv|xlsx&tab=...&from=...&to=...`

**Where** `{type}` = `revenue|profit|inventory|pricing`

**When** server xử lý request

**Then**:

- `format=csv`: Content-Type `text/csv; charset=utf-8`, BOM UTF-8 đầu file
- `format=xlsx`: Content-Type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{type}_{tab}_{YYYYMMDD}.csv"` hoặc `.xlsx`
- File chứa đúng dữ liệu (đã áp filter + tab)
- Header tiếng Việt có dấu
- Cột số tiền: integer trong file (không format dấu phẩy)

**And** Excel (.xlsx):

- Header row bold
- Cột số tiền format number (Excel cell format)
- Library: `xlsx` (SheetJS community edition) trên backend

**And** Performance: 500 rows export Excel < 5 giây

### AC6: Frontend UI Báo cáo

**Given** user navigate tới `/reports/revenue` hoặc `/reports/profit` hoặc `/reports/inventory` hoặc `/reports/pricing`

**When** trang load

**Then** mỗi trang báo cáo có:

- Header: tên báo cáo + nút Export (dropdown CSV/Excel)
- Date range picker (from/to) với presets: Hôm nay, 7 ngày, 30 ngày, Tháng này, Quý này
- Tabs (nếu nhiều tab) dùng shadcn/ui Tabs
- Bảng dữ liệu dùng shadcn/ui Table, responsive (scroll horizontal mobile)
- Summary section phía trên bảng (total revenue, profit, etc.)
- Loading state: skeleton table
- Empty state: icon + message
- SP lỗ (profit report): row highlight `bg-red-50 text-red-700`
- Margin âm (pricing comparison): cell `text-red-600 font-bold`

**And** routes:

- `/reports/revenue` → RevenueReportPage
- `/reports/profit` → ProfitReportPage
- `/reports/inventory` → InventoryReportPage
- `/reports/pricing` → PricingReportPage

**And** sidebar nav: group "Báo cáo" với 5 items (Dashboard, Doanh thu, Lợi nhuận, Tồn kho, Giá)

## Tasks / Subtasks

- [ ] Task 1: Tạo Zod schemas cho reports (AC: #1, #2, #3, #4, #5)
  - [ ] 1.1 Tạo `packages/shared/src/schema/reports.ts`:
    - revenueReportQuerySchema (tab, from, to, groupBy)
    - profitReportQuerySchema (from, to)
    - inventoryReportQuerySchema (tab)
    - pricingReportQuerySchema (tab, from, to, productId)
    - exportQuerySchema (format: csv|xlsx)
    - Response schemas cho mỗi tab
  - [ ] 1.2 Export từ `packages/shared/src/schema/index.ts`
  - [ ] 1.3 Verify build shared package pass

- [ ] Task 2: Backend service báo cáo doanh thu (AC: #1)
  - [ ] 2.1 Tạo `apps/api/src/services/revenue-report.service.ts`:
    - getRevenueByTime(db, storeId, from, to, groupBy)
    - getRevenueByProduct(db, storeId, from, to)
    - getRevenueByCustomer(db, storeId, from, to)
    - getRevenueByEmployee(db, storeId, from, to)
  - [ ] 2.2 SQL: JOIN orders + order_items + products/customers/users, GROUP BY, filter status='completed', store_id

- [ ] Task 3: Backend service báo cáo lợi nhuận (AC: #2)
  - [ ] 3.1 Tạo `apps/api/src/services/profit-report.service.ts`:
    - getProfitReport(db, storeId, from, to)
  - [ ] 3.2 COGS = products.costPrice \* order_items.quantity (join products cho costPrice)
  - [ ] 3.3 Tính summary: totalRevenue, totalCogs, grossProfit, marginPercent

- [ ] Task 4: Backend service báo cáo tồn kho (AC: #3)
  - [ ] 4.1 Tạo `apps/api/src/services/inventory-report.service.ts`:
    - getInventoryCurrent(db, storeId)
    - getInventoryReorder(db, storeId)
    - getInventorySlow(db, storeId)
  - [ ] 4.2 Slow: subquery MAX(order_items.createdAt) per product, WHERE > 30 days ago

- [ ] Task 5: Backend service báo cáo giá (AC: #4)
  - [ ] 5.1 Tạo `apps/api/src/services/pricing-report.service.ts`:
    - getPriceOverrides(db, storeId, from, to)
    - getPriceComparison(db, storeId)
    - getPriceHistory(db, storeId, from, to, productId?)
  - [ ] 5.2 Overrides: JOIN order_items(priceOverride=true) + orders + users
  - [ ] 5.3 Comparison: pivot products × price_list_items × price_lists (active only)
  - [ ] 5.4 History: JOIN purchase_order_items + purchase_orders + suppliers

- [ ] Task 6: Backend export CSV/Excel (AC: #5)
  - [ ] 6.1 `pnpm add xlsx --filter @kiotviet-lite/api`
  - [ ] 6.2 Tạo `apps/api/src/services/export.service.ts`:
    - buildCsv(headers: string[], rows: any[][]): string (với BOM UTF-8)
    - buildXlsx(sheetName: string, headers: string[], rows: any[][]): Buffer
  - [ ] 6.3 Export route: GET `/reports/{type}/export` trong reports.routes.ts

- [ ] Task 7: Backend routes (AC: #1-5)
  - [ ] 7.1 Thêm routes vào `apps/api/src/routes/reports.routes.ts`:
    - GET /revenue
    - GET /profit
    - GET /inventory
    - GET /pricing
    - GET /revenue/export, /profit/export, /inventory/export, /pricing/export
  - [ ] 7.2 Integration tests cho mỗi endpoint

- [ ] Task 8: Frontend components (AC: #6)
  - [ ] 8.1 Shared components:
    - `ReportDateRangePicker.tsx` (from/to + presets)
    - `ReportExportButton.tsx` (dropdown CSV/Excel, trigger download)
    - `ReportTable.tsx` (wrapper shadcn Table, responsive scroll)
    - `ReportSummaryCard.tsx` (hiện tổng metrics phía trên bảng)
  - [ ] 8.2 `RevenueReport.tsx` (4 tabs, table per tab, summary)
  - [ ] 8.3 `ProfitReport.tsx` (summary cards + table, loss highlight)
  - [ ] 8.4 `InventoryReport.tsx` (3 tabs)
  - [ ] 8.5 `PricingReport.tsx` (3 tabs, negative margin highlight)

- [ ] Task 9: Frontend data layer (AC: #6)
  - [ ] 9.1 Thêm API functions vào `reports-api.ts`:
    - getRevenueReportApi, getProfitReportApi, getInventoryReportApi, getPricingReportApi
    - downloadReportExport (reuse downloadCsv pattern, adapt for xlsx)
  - [ ] 9.2 Thêm hooks vào `use-reports.ts`:
    - useRevenueReport, useProfitReport, useInventoryReport, usePricingReport

- [ ] Task 10: Routes + Navigation (AC: #6)
  - [ ] 10.1 Tạo page files:
    - `apps/web/src/pages/revenue-report-page.tsx`
    - `apps/web/src/pages/profit-report-page.tsx`
    - `apps/web/src/pages/inventory-report-page.tsx`
    - `apps/web/src/pages/pricing-report-page.tsx`
  - [ ] 10.2 Thêm routes vào `router.tsx`
  - [ ] 10.3 Cập nhật sidebar nav-items: thêm 4 links báo cáo

- [ ] Task 11: Typecheck + test
  - [ ] 11.1 Typecheck pass cả 4 packages
  - [ ] 11.2 Full test suite pass
  - [ ] 11.3 Verify dev server, kiểm tra UI trên browser

## Dev Notes

### Cấu trúc file cần tạo/sửa

**Tạo mới:**

- `packages/shared/src/schema/reports.ts`
- `apps/api/src/services/revenue-report.service.ts`
- `apps/api/src/services/profit-report.service.ts`
- `apps/api/src/services/inventory-report.service.ts`
- `apps/api/src/services/pricing-report.service.ts`
- `apps/api/src/services/export.service.ts`
- `apps/api/src/__tests__/reports.integration.test.ts`
- `apps/web/src/features/reports/components/ReportDateRangePicker.tsx`
- `apps/web/src/features/reports/components/ReportExportButton.tsx`
- `apps/web/src/features/reports/components/ReportTable.tsx`
- `apps/web/src/features/reports/components/ReportSummaryCard.tsx`
- `apps/web/src/features/reports/components/RevenueReport.tsx`
- `apps/web/src/features/reports/components/ProfitReport.tsx`
- `apps/web/src/features/reports/components/InventoryReport.tsx`
- `apps/web/src/features/reports/components/PricingReport.tsx`
- `apps/web/src/pages/revenue-report-page.tsx`
- `apps/web/src/pages/profit-report-page.tsx`
- `apps/web/src/pages/inventory-report-page.tsx`
- `apps/web/src/pages/pricing-report-page.tsx`

**Sửa:**

- `packages/shared/src/schema/index.ts` (export reports schemas)
- `apps/api/src/routes/reports.routes.ts` (thêm 8 routes)
- `apps/api/package.json` (thêm xlsx dependency)
- `apps/web/src/features/reports/reports-api.ts` (thêm 5 API functions)
- `apps/web/src/features/reports/hooks/use-reports.ts` (thêm 4 hooks)
- `apps/web/src/router.tsx` (thêm 4 routes)
- `apps/web/src/components/layout/nav-items.ts` (thêm 4 nav links)

### Architecture Compliance

**Backend pattern (3 tầng):**

- Route handler: parse query params qua Zod, gọi service, return `{ data }` hoặc stream file
- Service: business logic thuần, nhận `db`, `storeId`, params. KHÔNG access request/response
- DB: Drizzle ORM queries, filter `store_id` mọi query, chỉ orders `status='completed'`
- Export: service tạo Buffer/string, route set headers + return body

**Frontend pattern:**

- TanStack Query cho server state
- Components render only, hooks fetch data
- shadcn/ui + Tailwind CSS. KHÔNG CSS custom
- Responsive: CSS grid/flex + Tailwind breakpoints
- Date range: controlled state trong page component, pass to hook

**API response format:**

```json
{ "data": { "rows": [...], "summary": {...} } }
```

### Library Requirements

| Library        | Package  | Dùng cho                 |
| -------------- | -------- | ------------------------ |
| xlsx (SheetJS) | apps/api | Export Excel server-side |
| date-fns       | (đã có)  | Date range calculations  |

### Existing Code to Reuse

- `reports-api.ts`: reuse `buildQs`, `ApiEnvelope<T>`, `downloadCsv` pattern
- `use-reports.ts`: thêm hooks cùng file, follow queryKey convention
- `reports.routes.ts`: thêm endpoints cùng router (đã có middleware `requireAuth` + `requirePermission('reports.view')`)
- `dashboard.service.ts`: reference pattern cho SQL queries (join orders + order_items)
- `DebtAgingReport.tsx` / `DebtSummaryReport.tsx`: reference UI pattern cho report table + date filter
- Nav items pattern từ `nav-items.ts`

### Query Key Convention

```
['reports', 'revenue', { tab, from, to, groupBy }]
['reports', 'profit', { from, to }]
['reports', 'inventory', { tab }]
['reports', 'pricing', { tab, from, to, productId }]
```

### Money Calculation

- Revenue, COGS, profit: integer VND. KHÔNG floating point cho tiền
- marginPercent: floating point OK (display only, round 1 decimal)
- percentage: floating point (round 2 decimal)
- COGS approximation: `products.costPrice * order_items.quantity` (same approach as dashboard)

### DB Schema Reference

**orders**: id, storeId, orderNumber, customerId, userId, total, status, createdAt
**order_items**: id, orderId, productId, productName, unitPrice, quantity, lineTotal, originalPrice, priceOverride, priceOverrideReason
**products**: id, storeId, name, sku, costPrice, currentStock, minStock, trackInventory, deletedAt
**users**: id, storeId, name, role
**customers**: id, storeId, name, phone
**purchase_orders**: id, storeId, supplierId, purchaseDate
**purchase_order_items**: id, purchaseOrderId, productId, unitPrice, costAfter, createdAt
**price_lists**: id, storeId, name, isActive, deletedAt
**price_list_items**: id, priceListId, productId, price
**suppliers**: id, storeId, name

### Anti-patterns

- KHÔNG import cross-feature. Report components nằm trong `features/reports/`
- KHÔNG floating point cho tiền. Integer VND
- KHÔNG CSS custom. Tailwind + shadcn/ui only
- KHÔNG business logic trong route handler
- KHÔNG tạo Zod schema trong apps/. Đặt ở packages/shared
- KHÔNG bypass store_id filter
- KHÔNG dùng xlsx trên frontend (nặng, security). Export trên backend
- KHÔNG load toàn bộ data rồi filter client-side. Filter trên SQL

### Export Implementation Notes

**CSV:**

```typescript
function buildCsv(headers: string[], rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  const escape = (v: string | number | null) => {
    if (v === null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return (
    BOM + [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  )
}
```

**Excel (xlsx):**

```typescript
import * as XLSX from 'xlsx'

function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number | null)[][],
): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  // Bold headers
  const range = XLSX.utils.decode_range(ws['!ref']!)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = { font: { bold: true } }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
```

### Date Range Picker Presets

```typescript
const presets = [
  { label: 'Hôm nay', from: startOfDay(now), to: now },
  { label: '7 ngày', from: subDays(now, 7), to: now },
  { label: '30 ngày', from: subDays(now, 30), to: now },
  { label: 'Tháng này', from: startOfMonth(now), to: now },
  { label: 'Quý này', from: startOfQuarter(now), to: now },
]
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-8-bo-co-dashboard.md#Story 8.2]
- [Source: _bmad-output/implementation-artifacts/8-1-dashboard-tong-quan.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
