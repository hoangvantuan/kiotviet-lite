# Story 8.1: Dashboard tổng quan

Status: review

## Story

As a chủ cửa hàng,
I want xem dashboard tổng quan với chỉ số kinh doanh, biểu đồ, cảnh báo,
so that nắm được tình hình cửa hàng trong 30 giây.

## Acceptance Criteria (BDD)

### AC1: Backend API Dashboard metrics + chart data

**Given** Owner/Manager gọi `GET /api/v1/reports/dashboard?period=today|week|month|year`

**When** server xử lý request

**Then** response trả về:

```json
{
  "data": {
    "metrics": {
      "revenue": { "value": 15200000, "previousValue": 12800000, "trend": 18.75, "sparkline": [1200000, 1800000, 2100000, 1900000, 2500000, 2200000, 3500000] },
      "profit": { "value": 4560000, "previousValue": 3840000, "trend": 18.75, "sparkline": [...] },
      "orderCount": { "value": 45, "previousValue": 38, "trend": 18.42, "sparkline": [...] },
      "avgOrderValue": { "value": 337778, "previousValue": 336842, "trend": 0.28, "sparkline": [...] }
    },
    "revenueChart": [
      { "date": "2026-04-29", "label": "T3", "revenue": 1200000, "orderCount": 5 },
      ...
    ],
    "topProducts": [
      { "productId": "uuid", "name": "Sản phẩm A", "quantity": 25, "revenue": 5000000, "percentage": 32.89 },
      ...
    ],
    "lowStockAlerts": [
      { "productId": "uuid", "name": "SP X", "currentStock": 2, "minStock": 10, "status": "low" },
      ...
    ],
    "overdueDebts": [
      { "customerId": "uuid", "name": "KH Y", "totalDebt": 5000000, "maxOverdueDays": 45 },
      ...
    ]
  }
}
```

**And** `period` mặc định `today`. Validation qua Zod schema trong `packages/shared`
**And** `trend` tính bằng `((value - previousValue) / previousValue) * 100`. previousValue = 0 thì trend = null
**And** `sparkline` luôn 7 điểm (7 ngày gần nhất cho mọi period)
**And** `revenueChart` = 7 ngày gần nhất, label format theo locale vi-VN (T2, T3...CN)
**And** `topProducts` = top 5 theo quantity sold trong period, giới hạn 5
**And** `lowStockAlerts` = SP có `currentStock <= minStock` (từ bảng products), giới hạn 5, sắp theo `currentStock ASC`
**And** `overdueDebts` = KH có khoản nợ remaining > 0 và `daysSinceCreated > overdueDays[0]` (lấy từ store settings), giới hạn 5, sắp theo `maxOverdueDays DESC`
**And** revenue, profit chỉ tính orders có `status = 'completed'`
**And** profit = revenue - COGS (giá vốn = `costPrice * quantity` từ order_items)
**And** mọi query filter theo `store_id` (multi-tenant)
**And** permission: `reports.view` (Owner + Manager + Staff dashboard-only)

### AC2: Zod schemas cho dashboard

**Given** cần type-safety shared giữa frontend và backend

**When** tạo schemas

**Then** tạo file `packages/shared/src/schemas/dashboard.ts`:

```typescript
import { z } from 'zod'

export const dashboardPeriodSchema = z.enum(['today', 'week', 'month', 'year'])
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>

export const dashboardQuerySchema = z.object({
  period: dashboardPeriodSchema.default('today'),
})

export const dashboardMetricSchema = z.object({
  value: z.number().int(),
  previousValue: z.number().int(),
  trend: z.number().nullable(),
  sparkline: z.array(z.number().int()).length(7),
})

export const dashboardMetricsSchema = z.object({
  revenue: dashboardMetricSchema,
  profit: dashboardMetricSchema,
  orderCount: dashboardMetricSchema,
  avgOrderValue: dashboardMetricSchema,
})

export const revenueChartItemSchema = z.object({
  date: z.string(),
  label: z.string(),
  revenue: z.number().int(),
  orderCount: z.number().int(),
})

export const topProductSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int(),
  revenue: z.number().int(),
  percentage: z.number(),
})

export const lowStockAlertSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  currentStock: z.number().int(),
  minStock: z.number().int(),
  status: z.enum(['out', 'low']),
})

export const overdueDebtSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string(),
  totalDebt: z.number().int(),
  maxOverdueDays: z.number().int(),
})

export const dashboardResponseSchema = z.object({
  metrics: dashboardMetricsSchema,
  revenueChart: z.array(revenueChartItemSchema),
  topProducts: z.array(topProductSchema).max(5),
  lowStockAlerts: z.array(lowStockAlertSchema).max(5),
  overdueDebts: z.array(overdueDebtSchema).max(5),
})

export type DashboardMetric = z.infer<typeof dashboardMetricSchema>
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>
export type RevenueChartItem = z.infer<typeof revenueChartItemSchema>
export type TopProduct = z.infer<typeof topProductSchema>
export type LowStockAlert = z.infer<typeof lowStockAlertSchema>
export type OverdueDebt = z.infer<typeof overdueDebtSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
```

**And** export tất cả từ `packages/shared/src/index.ts`

### AC3: 4 DashboardMetricCard hiển thị metrics

**Given** dashboard page load xong

**When** data trả về thành công

**Then** hiển thị 4 MetricCard:

| #   | Label          | Value format                              | Trend                        |
| --- | -------------- | ----------------------------------------- | ---------------------------- |
| 1   | Doanh thu      | VNĐ format (`Intl.NumberFormat('vi-VN')`) | % so kỳ trước, ↑ xanh / ↓ đỏ |
| 2   | Lợi nhuận      | VNĐ format                                | % so kỳ trước                |
| 3   | Số đơn hàng    | Number                                    | % so kỳ trước                |
| 4   | Trung bình/đơn | VNĐ format                                | % so kỳ trước                |

**And** mỗi card: label (text-sm neutral-500), value (text-2xl font-mono font-bold), trend (icon + %), sparkline SVG 7 điểm (height 24px, stroke 2px)
**And** layout: 2 cột mobile (<768px), 4 cột desktop (>=1024px), 2x2 grid tablet
**And** 4 states: loading (skeleton shimmer), data, empty (hiện "0" + trend "-"), error

### AC4: DashboardPeriodSelector

**Given** dashboard đang hiển thị

**When** user chọn period (hôm nay / tuần / tháng / năm)

**Then** tất cả metrics, chart, top products cập nhật theo period mới
**And** UI dùng Tabs component (shadcn/ui) đặt đầu trang
**And** default = "today"
**And** phím tắt desktop: 1/2/3/4 chuyển period

### AC5: Biểu đồ doanh thu 7 ngày (Recharts BarChart)

**Given** dashboard load xong

**When** data revenueChart trả về

**Then** hiển thị vertical bar chart:

- 7 bars, mỗi bar 1 ngày
- Trục X: label ngày (T2, T3...CN hoặc dd/MM)
- Trục Y: tiền VND format (K, M suffixes)
- Hover/tap bar → tooltip: doanh thu format VNĐ + số đơn
- Desktop: chiếm 2/3 width row 2
- Mobile: full width

**And** library: `recharts` (install vào `apps/web`)
**And** loading state: skeleton bars animation
**And** empty state: "Chưa có dữ liệu doanh thu trong kỳ này" + placeholder icon

### AC6: Top 5 SP bán chạy

**Given** dashboard load xong

**When** data topProducts trả về

**Then** hiển thị bảng/list top 5:

- Columns: Rank (#1-5), Tên SP, SL bán, Doanh thu (VNĐ), % tổng DT
- Desktop: table nhỏ, chiếm 1/3 width row 2
- Mobile: card list full width

**And** period theo period selector chung
**And** empty state: "Chưa có đơn hàng trong kỳ này"

### AC7: Cảnh báo tồn kho thấp

**Given** có SP tồn kho <= định mức (products.minStock)

**When** dashboard hiển thị section "Cảnh báo tồn kho"

**Then** header: "Cảnh báo tồn kho" + badge số lượng SP
**And** list max 5 items: tên SP, tồn hiện tại, định mức tối thiểu
**And** tồn = 0 → badge "Hết hàng" đỏ. Tồn > 0 nhưng <= min → text vàng
**And** CTA "Xem tất cả" → navigate `/products?filter=low-stock` (hoặc trang inventory phù hợp)
**And** empty state: "Tất cả sản phẩm đủ tồn kho" + icon check xanh
**And** desktop: chiếm 1/2 width row 3

### AC8: Nợ quá hạn

**Given** có KH nợ quá hạn (remaining > 0, daysSince > overdueDays[0])

**When** dashboard hiển thị section "Nợ quá hạn"

**Then** header: "Nợ quá hạn" + badge số KH
**And** list max 5 KH: tên, tổng nợ (font-mono bold), số ngày quá hạn lớn nhất
**And** color coding: >90 ngày = đỏ, >60 = cam, >30 = vàng
**And** CTA "Xem tất cả" → navigate `/debts?filter=overdue`
**And** empty state: "Không có khách hàng nợ quá hạn" + icon check xanh
**And** desktop: chiếm 1/2 width row 3

### AC9: Data refresh + keyboard shortcuts

**Given** dashboard đang hiển thị

**When** data cần refresh

**Then** TanStack Query config:

- `staleTime = 5 * 60 * 1000` (5 phút)
- `refetchInterval = 5 * 60 * 1000` (khi tab active)
- Nút refresh icon góc phải header
- Phím tắt R = refresh data

**And** khi đơn hàng mới hoàn thành trên POS → invalidate `['reports', 'dashboard']`

### AC10: Route dashboard

**Given** user navigate tới `/reports/dashboard`

**When** trang load

**Then** render Dashboard component
**And** route file: `apps/web/src/routes/_authenticated/reports/dashboard.tsx`
**And** breadcrumb: Báo cáo > Dashboard

## Tasks / Subtasks

- [x] Task 1: Tạo Zod schemas dashboard (AC: #2)
  - [x] 1.1 Tạo `packages/shared/src/schema/dashboard.ts` với tất cả schemas
  - [x] 1.2 Export từ `packages/shared/src/schema/index.ts`
  - [x] 1.3 Verify build shared package pass

- [x] Task 2: Backend API endpoint (AC: #1)
  - [x] 2.1 Tạo `apps/api/src/services/dashboard.service.ts`
    - getDashboardMetrics(db, storeId, period)
    - getRevenueChart(db, storeId)
    - getTopProducts(db, storeId, period)
    - getLowStockAlerts(db, storeId)
    - getOverdueDebts(db, storeId)
  - [x] 2.2 Thêm route `GET /dashboard` vào `apps/api/src/routes/reports.routes.ts`
  - [x] 2.3 Tính period range: today (startOfDay-now), week (startOfWeek-now, locale vi), month (startOfMonth-now), year (startOfYear-now)
  - [x] 2.4 Tính previous period: today → yesterday, week → tuần trước, month → tháng trước, year → năm trước
  - [x] 2.5 Integration tests cho dashboard endpoint

- [x] Task 3: Install Recharts (AC: #5)
  - [x] 3.1 `pnpm add recharts --filter @kiotviet-lite/web`
  - [x] 3.2 Verify build vẫn pass

- [x] Task 4: Frontend components (AC: #3, #4, #5, #6, #7, #8)
  - [x] 4.1 `DashboardPeriodSelector.tsx` (Tabs: hôm nay/tuần/tháng/năm)
  - [x] 4.2 `DashboardMetricCard.tsx` (label, value, trend, sparkline SVG)
  - [x] 4.3 `DashboardBarChart.tsx` (Recharts BarChart, tooltip, responsive)
  - [x] 4.4 `DashboardTopProducts.tsx` (table desktop, card list mobile)
  - [x] 4.5 `DashboardAlertCard.tsx` (reusable cho low stock + overdue debts)
  - [x] 4.6 `Dashboard.tsx` (page component, compose tất cả sections)

- [x] Task 5: Frontend data layer (AC: #9)
  - [x] 5.1 Thêm `getDashboardApi` vào `reports-api.ts`
  - [x] 5.2 Thêm `useDashboard(period)` hook vào `use-reports.ts`
  - [x] 5.3 Config staleTime, refetchInterval

- [x] Task 6: Route + navigation (AC: #10)
  - [x] 6.1 Tạo route `/reports/dashboard` trong `router.tsx`
  - [x] 6.2 Keyboard shortcuts (1-4 period, R refresh)
  - [x] 6.3 Sidebar navigation link "Dashboard"

- [x] Task 7: Typecheck + test
  - [x] 7.1 Typecheck pass cả 4 packages (shared, web, api, notifications)
  - [x] 7.2 Full test suite pass (1250/1250)
  - [x] 7.3 Verify dev server, kiểm tra UI trên browser

## Dev Notes

### Cấu trúc file cần tạo/sửa

**Tạo mới:**

- `packages/shared/src/schemas/dashboard.ts`
- `apps/api/src/services/dashboard.service.ts`
- `apps/web/src/features/reports/components/Dashboard.tsx`
- `apps/web/src/features/reports/components/DashboardMetricCard.tsx`
- `apps/web/src/features/reports/components/DashboardBarChart.tsx`
- `apps/web/src/features/reports/components/DashboardTopProducts.tsx`
- `apps/web/src/features/reports/components/DashboardAlertCard.tsx`
- `apps/web/src/features/reports/components/DashboardPeriodSelector.tsx`

**Sửa:**

- `packages/shared/src/index.ts` (export dashboard schemas)
- `apps/api/src/routes/reports.routes.ts` (thêm GET /dashboard)
- `apps/web/src/features/reports/reports-api.ts` (thêm getDashboardApi)
- `apps/web/src/features/reports/hooks/use-reports.ts` (thêm useDashboard)
- `apps/web/src/routes/_authenticated/reports/dashboard.tsx` (route file)

### Architecture Compliance

**Backend pattern (3 tầng):**

- Route handler: parse query params qua Zod, gọi service, return `{ data }`
- Service: business logic thuần, nhận `db`, `storeId`, `period`. Logger qua parameter
- DB: Drizzle queries, filter `store_id`, chỉ orders `status='completed'`

**Frontend pattern:**

- TanStack Query cho server state. queryKey: `['reports', 'dashboard', period]`
- Zustand KHÔNG cần cho dashboard (không có client state riêng)
- Components render only, hooks fetch data
- shadcn/ui + Tailwind CSS. KHÔNG CSS custom
- Responsive: CSS grid/flex + Tailwind breakpoints

**API response format:**

```json
{ "data": { ... } }
```

Error format:

```json
{ "error": { "code": "...", "message": "...", "details": [...] } }
```

### Library Requirements

| Library  | Version       | Dùng cho                                      |
| -------- | ------------- | --------------------------------------------- |
| recharts | latest stable | BarChart dashboard                            |
| date-fns | (đã có)       | startOfDay, startOfWeek, startOfMonth, format |

**Recharts notes:**

- Import selective: `import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'`
- Wrap trong `ResponsiveContainer` width="100%" height={300}
- Tooltip custom để format VNĐ

### Sparkline SVG

Sparkline trong MetricCard là inline SVG, KHÔNG dùng Recharts (quá nặng cho sparkline đơn giản):

```tsx
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80,
    h = 24
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}
```

### Period Range Calculation

```typescript
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  subDays,
  subWeeks,
  subMonths,
  subYears,
} from 'date-fns'

function getPeriodRange(period: DashboardPeriod, now: Date) {
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: now }
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now }
    case 'month':
      return { start: startOfMonth(now), end: now }
    case 'year':
      return { start: startOfYear(now), end: now }
  }
}

function getPreviousPeriodRange(period: DashboardPeriod, now: Date) {
  switch (period) {
    case 'today': {
      const d = subDays(now, 1)
      return getPeriodRange('today', d)
    }
    case 'week': {
      const d = subWeeks(now, 1)
      return getPeriodRange('week', d)
    }
    case 'month': {
      const d = subMonths(now, 1)
      return getPeriodRange('month', d)
    }
    case 'year': {
      const d = subYears(now, 1)
      return getPeriodRange('year', d)
    }
  }
}
```

### Dashboard Layout Grid

```
Desktop (≥1024px):
┌─────────┬─────────┬─────────┬─────────┐
│ Revenue │ Profit  │ Orders  │ Avg/Ord │  ← Row 1: 4 MetricCards
└─────────┴─────────┴─────────┴─────────┘
┌───────────────────────────┬───────────┐
│    Revenue Chart 7d       │  Top 5 SP │  ← Row 2: 2/3 + 1/3
└───────────────────────────┴───────────┘
┌──────────────┬──────────────┐
│ Low Stock    │ Overdue Debt │  ← Row 3: 1/2 + 1/2
└──────────────┴──────────────┘

Mobile (<768px):
┌──────┬──────┐
│ Rev  │ Prof │  ← 2 col grid
├──────┼──────┤
│ Ord  │ Avg  │
└──────┴──────┘
┌────────────────┐
│  Chart 7d      │  ← full width
├────────────────┤
│  Top 5 SP      │  ← full width card list
├────────────────┤
│  Low Stock     │  ← stacked
├────────────────┤
│  Overdue Debt  │  ← stacked
└────────────────┘
```

Tailwind grid classes:

```
Row 1: grid grid-cols-2 lg:grid-cols-4 gap-4
Row 2: grid grid-cols-1 lg:grid-cols-3 gap-4 (chart col-span-2, top5 col-span-1)
Row 3: grid grid-cols-1 md:grid-cols-2 gap-4
```

### Existing Code to Reuse

- `reports-api.ts`: reuse `buildQs` pattern và `ApiEnvelope<T>` wrapper
- `use-reports.ts`: thêm `useDashboard` hook cùng file
- `reports.routes.ts`: thêm `/dashboard` endpoint vào cùng router (đã có middleware `requireAuth` + `requirePermission('reports.view')`)
- `reports.service.ts`: KHÔNG thêm vào file này (quá dài). Tạo `dashboard.service.ts` riêng
- `CurrencyDisplay` component hoặc `formatCurrency` util nếu đã có
- `apiClient` từ `@/lib/api-client`

### Query Key Convention

```
['reports', 'dashboard', period]  // dashboard data
['reports', 'debt-aging', query]   // existing
['reports', 'debt-summary', query] // existing
```

### Money Calculation

- Revenue, profit, avgOrderValue: integer VND. KHÔNG floating point
- Profit = SUM(order_items.unitPrice _ quantity) - SUM(order_items.costPrice _ quantity) cho orders completed trong period
- Trend percentage: floating point OK (display only)
- avgOrderValue = Math.round(revenue / orderCount) nếu orderCount > 0, else 0

### Products Table Check

Cần verify bảng `products` có cột `min_stock` (integer, default NULL hoặc 0). Nếu chưa có, cần thêm migration. Check schema:

```bash
grep -r "minStock\|min_stock" packages/shared/src/schemas/ apps/api/src/db/schema/
```

### Previous Story Intelligence

**Story 5-5 (cảnh báo nợ):** Đã implement debt aging report, debt summary report, store settings cho debt_warning_percent và debt_overdue_days. Dashboard overdue debts reuse cùng logic nhưng simplified (chỉ top 5, không cần full aging buckets).

**Story 7-1 (danh sách hóa đơn):** Đã có orders query patterns, filter theo store_id + status.

**Git recent commits:** Debt monitoring, thermal printing, order returns done. Tất cả follow 3-layer pattern (route/service/db).

### Quy tắc anti-patterns

- KHÔNG import cross-feature. Dashboard components nằm trong `features/reports/`
- KHÔNG floating point cho tiền. Integer VND
- KHÔNG CSS custom. Tailwind + shadcn/ui only
- KHÔNG business logic trong route handler
- KHÔNG tạo Zod schema trong apps/. Đặt ở packages/shared
- KHÔNG bypass store_id filter

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-8-bo-co-dashboard.md#Story 8.1]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/dashboard-specification.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md#DashboardMetricCard]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- order_items does not have costPrice column; profit COGS calculated by joining products.costPrice as approximation
- date-fns was not a dependency of apps/api; installed via pnpm add

### Completion Notes List

- Task 1: Created Zod schemas in packages/shared/src/schema/dashboard.ts with all types per AC2
- Task 2: Created dashboard.service.ts with 5 exported functions following 3-layer pattern. All queries filter by store_id. Revenue/profit only count completed orders. Sparklines always 7 points. Added GET /dashboard to reports.routes.ts. 10 integration tests pass (metrics, chart, top products, low stock, overdue debts, multi-tenant, permissions, period param, trend null)
- Task 3: Installed recharts in apps/web
- Task 4: Created 6 components: DashboardPeriodSelector (Tabs), DashboardMetricCard (with inline SVG sparkline), DashboardBarChart (Recharts), DashboardTopProducts (desktop table + mobile cards), DashboardAlertCard (reusable for low stock + overdue debts), Dashboard (page composition with responsive grid layout)
- Task 5: Added getDashboardApi to reports-api.ts, useDashboard hook with staleTime=5min and refetchInterval=5min, useInvalidateDashboard for manual refresh
- Task 6: Created /reports/dashboard route, keyboard shortcuts (1-4 period, R refresh), Dashboard sidebar nav link
- Task 7: Typecheck clean on all 4 packages, 1250/1250 tests pass

### File List

**New files:**

- packages/shared/src/schema/dashboard.ts
- apps/api/src/services/dashboard.service.ts
- apps/api/src/**tests**/dashboard.integration.test.ts
- apps/web/src/features/reports/components/Dashboard.tsx
- apps/web/src/features/reports/components/DashboardMetricCard.tsx
- apps/web/src/features/reports/components/DashboardBarChart.tsx
- apps/web/src/features/reports/components/DashboardTopProducts.tsx
- apps/web/src/features/reports/components/DashboardAlertCard.tsx
- apps/web/src/features/reports/components/DashboardPeriodSelector.tsx
- apps/web/src/pages/dashboard-page.tsx

**Modified files:**

- packages/shared/src/schema/index.ts (added dashboard export)
- apps/api/src/routes/reports.routes.ts (added GET /dashboard endpoint)
- apps/api/package.json (added date-fns dependency)
- apps/web/package.json (added recharts dependency)
- apps/web/src/features/reports/reports-api.ts (added getDashboardApi)
- apps/web/src/features/reports/hooks/use-reports.ts (added useDashboard, useInvalidateDashboard)
- apps/web/src/router.tsx (added /reports/dashboard route)
- apps/web/src/components/layout/nav-items.ts (added Dashboard nav link)
- pnpm-lock.yaml
