# Story 4.2: Trang chi tiết khách hàng

Status: done

## Story

As a chủ cửa hàng,
I want xem toàn bộ thông tin khách hàng (lịch sử đơn hàng, công nợ, thống kê mua hàng) trong một trang chi tiết duy nhất,
so that đánh giá giá trị khách hàng và ra quyết định chính sách giá / hạn mức nợ phù hợp.

## Acceptance Criteria (BDD)

### AC1: Route, header và shell 3 tab

**Given** chủ cửa hàng đã đăng nhập với quyền `customers.manage`
**When** truy cập `/customers/{customerId}` (qua nút trong danh sách hoặc URL trực tiếp)
**Then** điều hướng vào route `customerDetailRoute` (TanStack Router) với param `customerId`
**And** trang gọi `GET /api/v1/customers/:id` lấy `CustomerDetail`
**And** hiển thị header gồm:

- Tên khách hàng (size lớn) và mã KH
- Số điện thoại, email (nếu có)
- Badge nhóm khách hàng (nếu có), bấm vào không điều hướng (hint tooltip)
- 4 KPI tiles song song: `totalPurchased` (Tổng mua), `purchaseCount` (Số đơn), `currentDebt` (Nợ hiện tại), `effectiveDebtLimit` (Hạn mức)
- Nút "Quay lại danh sách" (icon `ArrowLeft`) trở về `/customers` giữ nguyên search/filter
- Nút "Sửa khách hàng" mở sheet `CustomerForm` (reuse Story 4.1)

**And** dưới header là `Tabs` (Radix) với 3 tab: `Đơn hàng`, `Công nợ`, `Thống kê`
**And** tab mặc định là `Đơn hàng`
**And** tab hiện tại được lưu vào URL search param `?tab=orders|debts|stats` (validate bằng Zod), reload không mất state

**Given** customer không tồn tại hoặc đã bị soft-delete
**When** load trang
**Then** API trả `NOT_FOUND`, UI hiển thị empty state "Không tìm thấy khách hàng" + nút quay lại danh sách

### AC2: Tab Đơn hàng

**Given** đang ở tab `Đơn hàng`
**When** mở tab
**Then** gọi `GET /api/v1/customers/:id/orders?page=1&pageSize=20`
**And** hiển thị bảng có cột: `Mã đơn`, `Ngày đặt`, `Tổng tiền` (format `Intl.NumberFormat('vi-VN')`), `Trạng thái` (badge màu theo enum)
**And** mặc định sắp xếp `purchaseDate DESC`
**And** có filter:

- Khoảng ngày (date range, mặc định 90 ngày gần đây)
- Trạng thái đơn (multi-select: `completed`, `partial_paid`, `unpaid`, `cancelled`, `returned`)

**And** phân trang giữ pattern Envelope `{ data, meta: { page, pageSize, total, totalPages } }`
**And** click vào dòng đơn navigate sang `/orders/$orderId` (Story 3.x sẽ tạo route, Story 4-2 chỉ cần `<Link>` không break khi route chưa tồn tại)

**Given** bảng `orders` chưa được tạo (Story 3.2 chưa merge)
**When** API xử lý request
**Then** service kiểm tra `tableExists('orders')`, nếu false trả `{ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }`
**And** UI hiển thị empty state: icon `Receipt`, dòng chữ "Khách hàng chưa có đơn hàng nào"

### AC3: Tab Công nợ

**Given** đang ở tab `Công nợ`
**When** mở tab
**Then** gọi `GET /api/v1/customers/:id/debts`
**And** hiển thị card tổng quan trên cùng:

- `currentDebt` (số tiền nợ hiện tại) format VND
- `effectiveDebtLimit` (hạn mức hiệu lực, ưu tiên customer.debtLimit > group.debtLimit; null = không giới hạn)
- Thanh `Progress` hiển thị phần trăm `currentDebt / effectiveDebtLimit * 100`:
  - 0%: badge xanh "Không nợ"
  - 0 đến 80%: thanh xanh
  - 80 đến 100%: thanh vàng + cảnh báo "Sắp đạt hạn mức"
  - vượt 100%: thanh đỏ + cảnh báo "Vượt hạn mức"
  - `effectiveDebtLimit = null`: hiển thị "Không giới hạn", ẩn thanh progress

**And** danh sách các khoản nợ chi tiết (mỗi đơn còn nợ là 1 dòng):

- Cột: `Mã đơn`, `Ngày phát sinh`, `Tổng đơn`, `Đã trả`, `Còn nợ`
- Sắp xếp `purchaseDate ASC` (FIFO, đơn cũ lên đầu)
- Chỉ hiển thị đơn có `paymentStatus IN ('partial_paid', 'unpaid')`

**Given** bảng `orders` hoặc `debts` chưa tồn tại
**When** API xử lý request
**Then** trả `{ data: { summary: { currentDebt: <từ customer.currentDebt>, effectiveDebtLimit }, items: [] } }`
**And** UI vẫn render summary card đầy đủ, danh sách hiển thị empty state "Không có khoản nợ chi tiết"

### AC4: Tab Thống kê - Top sản phẩm

**Given** đang ở tab `Thống kê`
**When** mở tab
**Then** gọi `GET /api/v1/customers/:id/top-products?limit=10`
**And** hiển thị bảng "Top 10 sản phẩm mua nhiều nhất" với cột: `Tên SP`, `SKU`, `Số lượng`, `Tổng tiền`
**And** sắp xếp theo tổng tiền giảm dần
**And** click vào dòng navigate sang `/inventory/products/$productId` (link tham chiếu, không break)

**Given** khách hàng chưa có đơn hàng / bảng `order_items` chưa tồn tại
**When** mở tab
**Then** API trả `{ data: [] }`
**And** UI hiển thị empty state "Chưa có dữ liệu mua hàng"

### AC5: Tab Thống kê - Biểu đồ doanh số 12 tháng

**Given** đang ở tab `Thống kê`
**When** tab mount
**Then** gọi `GET /api/v1/customers/:id/monthly-revenue?months=12` song song với `top-products`
**And** hiển thị `BarChart` (Recharts) "Doanh số 12 tháng gần đây":

- Trục X: 12 tháng (format `MM/yyyy`, timezone `Asia/Ho_Chi_Minh`)
- Trục Y: doanh số VND (format compact `1tr`, `2,5tr`)
- Tooltip hover: tháng đầy đủ + số tiền chi tiết

**And** Recharts được lazy import (`React.lazy`) chỉ khi tab Stats mount, để tránh inflate bundle các tab khác

**Given** chưa có dữ liệu
**When** API trả `{ data: [] }` (hoặc tất cả tháng = 0)
**Then** UI hiển thị empty state "Chưa có doanh số" thay vì biểu đồ rỗng

### AC6: Backend graceful fallback cho bảng chưa tồn tại

**Given** Story 3.2 (orders) và Story 5.1 (debts) chưa merge vào main
**When** bất kỳ endpoint nào trong `/customers/:id/{orders,debts,top-products,monthly-revenue}` chạy
**Then** service gọi helper `tableExists(db, 'orders')` (và `'order_items'`, `'debts'`) bằng `pg_catalog.pg_tables`
**And** nếu false: trả response shape đúng nhưng `data` rỗng + log info `customer.detail.fallback` với fields `{customerId, missingTable}`
**And** không throw error, không trả 500

**Given** Story 3.2/5.1 đã merge và bảng tồn tại
**When** endpoint chạy lại
**Then** không cần đổi code, query thật được thực thi tự động

### AC7: API contracts (Backend Hono routes)

Tất cả endpoints dưới đều:

- Mount dưới `createCustomersRoutes({ db })` trong `apps/api/src/routes/customers.routes.ts`
- Yêu cầu middleware `requireAuth + requirePermission('customers.manage')`
- Multi-tenant filter `storeId` từ `c.get('user').storeId`
- Validate `customerId` là UUID v7 hợp lệ, return 404 nếu không thuộc store

| Method | Path                                       | Response data shape                                                                     |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| GET    | `/customers/:id/orders`                    | `{ data: CustomerOrderItem[], meta: PaginationMeta }`                                   |
| GET    | `/customers/:id/debts`                     | `{ data: { summary: { currentDebt, effectiveDebtLimit }, items: CustomerDebtItem[] } }` |
| GET    | `/customers/:id/top-products?limit=10`     | `{ data: CustomerTopProduct[] }`                                                        |
| GET    | `/customers/:id/monthly-revenue?months=12` | `{ data: CustomerMonthlyRevenue[] }`                                                    |

### AC8: Quyền và đa cửa hàng

**Given** user thiếu quyền `customers.manage`
**When** truy cập `/customers/$customerId`
**Then** route guard chuyển hướng về `/forbidden` (reuse pattern Story 4.1)

**Given** user thuộc store A truy cập customer của store B
**When** API xử lý request
**Then** trả `NOT_FOUND` (không leak thông tin tồn tại của resource)

### AC9: Counter `totalPurchased`/`purchaseCount` (cross-story note)

**Story 4-2 KHÔNG implement counter update**, chỉ đọc giá trị hiện tại từ `customers` table.

**Story 3.3** (tạo đơn hàng + thanh toán) PHẢI cập nhật trong cùng transaction với `INSERT INTO orders`:

- `customers.totalPurchased += order.totalAmount`
- `customers.purchaseCount += 1`

Story 4-2 ghi rõ phụ thuộc này trong Dev Notes để Story 3.3 không bỏ sót.

### AC10: Accessibility

**Given** keyboard user
**When** điều hướng
**Then** Tabs có ARIA roles đúng (`role=tablist`, `aria-selected`, focus visible)
**And** bảng đơn hàng có header `<th scope=col>`
**And** progress bar có `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
**And** biểu đồ Recharts có `aria-label` mô tả tổng quát + bảng tóm tắt số liệu (sr-only)

### AC11: Tích hợp navigation từ danh sách

**Given** đang ở `/customers`
**When** click vào tên khách hàng (ô `customer.name` trong bảng)
**Then** navigate sang `/customers/{customer.id}`
**And** không trigger các side effect khác (không mở sheet edit như Story 4.1 hiện đang làm)
**And** Story 4-2 sửa hành vi click hiện tại của Story 4.1 (Code review của Story 4.1 đã yêu cầu đổi click name = navigate)

## Tasks / Subtasks

### Phase A — Backend (Schemas + Services + Routes)

- [ ] Task 1: Shared Zod schemas cho customer detail (AC: #2, #3, #4, #5, #7)
  - [ ] 1.1 Tạo `packages/shared/src/schema/customer-detail.ts`:
    - [ ] `customerOrderItemSchema` (id, code, purchaseDate, totalAmount, paymentStatus, status)
    - [ ] `customerDebtItemSchema` (orderId, code, purchaseDate, totalAmount, paidAmount, remaining)
    - [ ] `customerDebtsResponseSchema` (summary { currentDebt, effectiveDebtLimit }, items)
    - [ ] `customerTopProductSchema` (productId, name, sku, totalQuantity, totalAmount)
    - [ ] `customerMonthlyRevenueSchema` (month: string `YYYY-MM`, total: number)
    - [ ] Query params schemas: `customerOrdersQuerySchema` (page, pageSize, dateFrom, dateTo, status[]), `topProductsQuerySchema` (limit), `monthlyRevenueQuerySchema` (months)
  - [ ] 1.2 Export từ `packages/shared/src/schema/index.ts`
  - [ ] 1.3 Lưu ý: dùng `z.coerce.number()` cho query string numeric, `z.preprocess` cho enum array nếu cần

- [ ] Task 2: Helper `tableExists` (AC: #6)
  - [ ] 2.1 Tạo `apps/api/src/lib/db-introspection.ts`:
    ```ts
    export async function tableExists(db: NodePgDatabase, tableName: string): Promise<boolean> {
      const result = await db.execute(sql`
        SELECT 1 FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = ${tableName}
        LIMIT 1
      `)
      return result.rows.length > 0
    }
    ```
  - [ ] 2.2 Cache kết quả per-request (không cần module-level cache) để tránh query lặp lại trong cùng handler

- [ ] Task 3: Service `customer-detail.service.ts` (AC: #2, #3, #4, #5, #6, #7)
  - [ ] 3.1 Tạo `apps/api/src/services/customer-detail.service.ts` với factory pattern `createCustomerDetailService({ db })`
  - [ ] 3.2 Function `getCustomerOrders(storeId, customerId, query)`:
    - Verify customer thuộc store (reuse pattern `customers.service.ts:getCustomer`)
    - Nếu `!tableExists('orders')` return empty paginated
    - Else query `orders` join filter `storeId, customerId`, áp filter date/status, pagination
  - [ ] 3.3 Function `getCustomerDebts(storeId, customerId)`:
    - Lấy customer record để có `currentDebt` và compute `effectiveDebtLimit` (logic: customer.debtLimit ?? group.debtLimit ?? null)
    - Nếu `!tableExists('orders')` items = []
    - Else query orders WHERE `paymentStatus IN ('partial_paid','unpaid')` ORDER BY `purchaseDate ASC`
  - [ ] 3.4 Function `getCustomerTopProducts(storeId, customerId, limit)`:
    - Nếu `!tableExists('order_items')` return []
    - Else aggregate `SUM(quantity), SUM(line_total) GROUP BY product_id ORDER BY SUM(line_total) DESC LIMIT ?`
    - Join `products` để lấy name, sku
  - [ ] 3.5 Function `getCustomerMonthlyRevenue(storeId, customerId, months)`:
    - Tạo dải tháng đủ N tháng (kể cả tháng = 0) với timezone `Asia/Ho_Chi_Minh`
    - Nếu `!tableExists('orders')` return mảng N tháng đều = 0
    - Else `SUM(total_amount)` GROUP BY `date_trunc('month', purchase_date AT TIME ZONE 'Asia/Ho_Chi_Minh')`
    - Outer-join với dải tháng để fill 0 các tháng thiếu
  - [ ] 3.6 Tất cả service throw `ApiError('NOT_FOUND', 'CUSTOMER_NOT_FOUND')` nếu customer không thuộc store

- [ ] Task 4: Mount routes vào `customers.routes.ts` (AC: #7, #8)
  - [ ] 4.1 Trong `createCustomersRoutes({ db })` thêm 4 route GET (`/orders`, `/debts`, `/top-products`, `/monthly-revenue`)
  - [ ] 4.2 Reuse `requireAuth` + `requirePermission('customers.manage')` đã có trên router
  - [ ] 4.3 Validate path param `:id` là UUID, query bằng Zod schemas đã định nghĩa
  - [ ] 4.4 Inject `customer-detail.service` qua factory (không tạo service global)
  - [ ] 4.5 Sử dụng helper `envelopeOk(data, meta)` đã có trong codebase

- [ ] Task 5: Backend integration tests (AC: #2, #3, #4, #5, #6)
  - [ ] 5.1 Tạo `apps/api/src/__tests__/customer-detail.integration.test.ts` dùng PGlite
  - [ ] 5.2 Test fallback khi `orders`/`order_items` chưa tồn tại: mỗi endpoint trả 200 với data rỗng đúng shape
  - [ ] 5.3 Test multi-tenant: user store A xem customer store B → 404
  - [ ] 5.4 Test thiếu permission: user không có `customers.manage` → 403
  - [ ] 5.5 Test happy path với bảng `orders` được tạo manual trong setup: orders endpoint trả đúng filter date/status, pagination
  - [ ] 5.6 Test `getCustomerDebts` summary: customer.currentDebt = 50k, group.debtLimit = 200k → effectiveDebtLimit = 200k

### Phase B — Frontend (API + hooks)

- [ ] Task 6: Mở rộng API client + hooks (AC: #2, #3, #4, #5)
  - [ ] 6.1 Trong `apps/web/src/features/customers/customers-api.ts` thêm:
    - [ ] `getCustomerOrdersApi(id, params)` → `Envelope<CustomerOrderItem[], PaginationMeta>`
    - [ ] `getCustomerDebtsApi(id)` → `Envelope<CustomerDebtsResponse>`
    - [ ] `getCustomerTopProductsApi(id, limit)` → `Envelope<CustomerTopProduct[]>`
    - [ ] `getCustomerMonthlyRevenueApi(id, months)` → `Envelope<CustomerMonthlyRevenue[]>`
  - [ ] 6.2 Trong `apps/web/src/features/customers/use-customers.ts` thêm hooks:
    - [ ] `useCustomerOrdersQuery(id, params)` key `['customers', 'detail', id, 'orders', params]`
    - [ ] `useCustomerDebtsQuery(id)` key `['customers', 'detail', id, 'debts']`
    - [ ] `useCustomerTopProductsQuery(id, limit)` key `['customers', 'detail', id, 'top-products', limit]`
    - [ ] `useCustomerMonthlyRevenueQuery(id, months)` key `['customers', 'detail', id, 'monthly-revenue', months]`
    - [ ] Tất cả dùng `placeholderData: keepPreviousData`, `staleTime: 30_000`

### Phase C — Frontend (UI components + Page + Router)

- [ ] Task 7: Cài đặt Recharts (AC: #5)
  - [ ] 7.1 `pnpm --filter @kiotviet-lite/web add recharts`
  - [ ] 7.2 Verify `recharts ^2.x` xuất hiện trong `apps/web/package.json`

- [ ] Task 8: `CustomerDetailHeader.tsx` (AC: #1, #11)
  - [ ] 8.1 Tạo `apps/web/src/features/customers/components/CustomerDetailHeader.tsx`
  - [ ] 8.2 Props: `customer: CustomerDetail`, `onBack(): void`, `onEdit(): void`
  - [ ] 8.3 Layout: tên + mã trên cùng, dòng kế là phone/email/group, dưới là 4 KPI tiles
  - [ ] 8.4 Format VND, tách 3 chữ số, fallback `—` cho null

- [ ] Task 9: `CustomerOrdersTab.tsx` (AC: #2)
  - [ ] 9.1 Tạo component nhận `customerId`
  - [ ] 9.2 Local state (hoặc URL search param) cho filter: `dateFrom`, `dateTo`, `status[]`, `page`
  - [ ] 9.3 Dùng `useCustomerOrdersQuery`
  - [ ] 9.4 Render bảng + pagination + empty state

- [ ] Task 10: `CustomerDebtsTab.tsx` (AC: #3)
  - [ ] 10.1 Tạo component
  - [ ] 10.2 Card summary: 2 KPI + Progress bar (Radix `Progress` từ shadcn nếu có, hoặc div Tailwind)
  - [ ] 10.3 Tô màu progress theo ngưỡng: <80% xanh, 80-100% vàng, >100% đỏ
  - [ ] 10.4 Bảng items (FIFO theo `purchaseDate ASC`)
  - [ ] 10.5 Empty state riêng cho danh sách (summary luôn hiển thị)

- [ ] Task 11: `CustomerStatsTab.tsx` + sub-components (AC: #4, #5)
  - [ ] 11.1 Tạo `CustomerStatsTab.tsx` chứa 2 panel: TopProductsTable + MonthlyRevenueChart
  - [ ] 11.2 Tạo `TopProductsTable.tsx` (bảng đơn giản, click row navigate)
  - [ ] 11.3 Tạo `MonthlyRevenueChart.tsx` wrapper, bên trong dùng `React.lazy(() => import('./MonthlyRevenueChartInner'))`
  - [ ] 11.4 `MonthlyRevenueChartInner.tsx` import Recharts (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`)
  - [ ] 11.5 Tooltip format VND đầy đủ, trục Y format compact
  - [ ] 11.6 Empty state cho cả 2 panel

- [ ] Task 12: `CustomerDetailView.tsx` orchestrator (AC: #1, #10)
  - [ ] 12.1 Tạo `apps/web/src/features/customers/customer-detail-view.tsx` (giống pattern `purchase-order-detail-view`)
  - [ ] 12.2 Nhận prop `customerId`, dùng `useCustomerQuery(customerId)`
  - [ ] 12.3 Render `CustomerDetailHeader` + Radix `Tabs`
  - [ ] 12.4 Sync tab state với URL search param qua `useSearch`/`navigate` của TanStack Router
  - [ ] 12.5 Loading skeleton + error state (ApiError NOT_FOUND → empty state với CTA về list)
  - [ ] 12.6 Sheet edit reuse `CustomerForm` (Story 4.1) với key={customer.id} để reset form khi đổi customer

- [ ] Task 13: Page + Router (AC: #1, #8)
  - [ ] 13.1 Tạo `apps/web/src/pages/customer-detail-page.tsx` (chỉ gọi `useParams` và render `CustomerDetailView`, theo pattern `purchase-order-detail-page.tsx`)
  - [ ] 13.2 Trong `apps/web/src/router.tsx` thêm `customerDetailRoute`:
    - Path: `/customers/$customerId`
    - Parent: `appLayoutRoute` dưới `_authenticated`
    - `validateSearch: z.object({ tab: z.enum(['orders','debts','stats']).optional() })`
    - `beforeLoad: requirePermissionGuard('customers.manage')`
    - Đặt SAU `customersGroupsRoute`
  - [ ] 13.3 Đăng ký route trong `routeTree`

- [ ] Task 14: Sửa hành vi click name trong `CustomerList.tsx` (AC: #11)
  - [ ] 14.1 Đổi onClick của ô name từ "mở sheet edit" sang `navigate({ to: '/customers/$customerId', params: { customerId: c.id } })`
  - [ ] 14.2 Giữ nguyên hành vi nút "Sửa" trong cột actions
  - [ ] 14.3 Đảm bảo Story 4.1 review finding (HIGH) "đổi click name = navigate" được resolve trong Story 4-2

### Phase D — Tests + Manual verify

- [ ] Task 15: Unit tests cho hooks và component logic (AC: #2, #3, #4, #5)
  - [ ] 15.1 Test format VND, format compact tháng (`1tr`, `2,5tr`), format date `vi-VN`
  - [ ] 15.2 Test logic màu progress (helper function pure, không phụ thuộc DOM)
  - [ ] 15.3 Test compute `effectiveDebtLimit` (mirror logic backend)

- [ ] Task 16: Manual verify checklist (chạy dev server) (AC: tất cả)
  - [ ] 16.1 Login → vào `/customers` → click tên KH → vào trang detail đúng
  - [ ] 16.2 Reload trang với `?tab=stats` → tab Thống kê được chọn đúng
  - [ ] 16.3 Customer chưa có đơn → cả 3 tab hiển thị empty state đúng
  - [ ] 16.4 Customer có `currentDebt > 0`, `effectiveDebtLimit = null` → Progress bar ẩn, hiện "Không giới hạn"
  - [ ] 16.5 Network throttle → Loading skeleton hiện trước khi data về
  - [ ] 16.6 User store khác cố ý gọi customerId của store A → trang hiện "Không tìm thấy khách hàng"
  - [ ] 16.7 Truy cập với user không có `customers.manage` → bị guard chặn

## Dev Notes

### Pattern reuse từ codebase hiện tại

| Item                       | Reuse từ                                                                                            | Ghi chú                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Detail page pattern        | `apps/web/src/pages/purchase-order-detail-page.tsx`                                                 | Page mỏng, gọi `useParams`, render DetailView           |
| Detail view orchestrator   | `apps/web/src/features/purchase-orders/purchase-order-detail-view.tsx`                              | Tabs + sections + loading/error                         |
| Route + permission guard   | `apps/web/src/router.tsx` (cách `customersRoute` dùng `requirePermissionGuard('customers.manage')`) | Áp dụng y nguyên                                        |
| Service factory + ApiError | `apps/api/src/services/customers.service.ts:getCustomer`                                            | Multi-tenant filter, throw `NOT_FOUND`                  |
| Routes factory             | `apps/api/src/routes/customers.routes.ts:createCustomersRoutes`                                     | Mount thêm 4 GET endpoints vào cùng router              |
| Envelope + pagination      | Envelope helper hiện có trong `customers-api.ts` và `customers.routes.ts`                           | Giữ nguyên shape `{ data, meta }`                       |
| TanStack Query keys        | `apps/web/src/features/customers/use-customers.ts`                                                  | Mở rộng prefix `['customers', 'detail', id, ...]`       |
| Zod shared schemas         | `packages/shared/src/schema/customer-management.ts`                                                 | Thêm file mới `customer-detail.ts` để giữ tách bạch     |
| Sheet edit form            | `apps/web/src/features/customers/components/CustomerForm.tsx` (Story 4.1)                           | Reuse, nhớ truyền `key={customer.id}` để reset state    |
| `effectiveDebtLimit` logic | Đã định nghĩa trong `customerDetailSchema` (Story 4.1)                                              | Backend đã compute, frontend chỉ cần đọc                |
| Tabs component             | `apps/web/src/components/ui/tabs.tsx` (Radix)                                                       | Đã có sẵn từ shadcn                                     |
| Progress component         | shadcn `progress` (chưa cài)                                                                        | Cài thêm hoặc dùng div + Tailwind nếu rule cấm thêm dep |

### Files cần TẠO MỚI

Backend:

- `apps/api/src/lib/db-introspection.ts` — `tableExists()` helper
- `apps/api/src/services/customer-detail.service.ts` — 4 service functions
- `apps/api/src/__tests__/customer-detail.integration.test.ts`

Shared:

- `packages/shared/src/schema/customer-detail.ts` — Zod schemas + types

Frontend:

- `apps/web/src/pages/customer-detail-page.tsx`
- `apps/web/src/features/customers/customer-detail-view.tsx`
- `apps/web/src/features/customers/components/CustomerDetailHeader.tsx`
- `apps/web/src/features/customers/components/CustomerOrdersTab.tsx`
- `apps/web/src/features/customers/components/CustomerDebtsTab.tsx`
- `apps/web/src/features/customers/components/CustomerStatsTab.tsx`
- `apps/web/src/features/customers/components/TopProductsTable.tsx`
- `apps/web/src/features/customers/components/MonthlyRevenueChart.tsx` (wrapper + Suspense)
- `apps/web/src/features/customers/components/MonthlyRevenueChartInner.tsx` (lazy boundary, import Recharts)

### Files MODIFY

- `apps/web/src/router.tsx` — thêm `customerDetailRoute`, validateSearch tab
- `apps/web/src/features/customers/customers-api.ts` — 4 API functions
- `apps/web/src/features/customers/use-customers.ts` — 4 hooks
- `apps/web/src/features/customers/components/CustomerList.tsx` — đổi click name = navigate
- `apps/api/src/routes/customers.routes.ts` — mount 4 GET endpoints
- `apps/web/package.json` — thêm `recharts`
- `packages/shared/src/schema/index.ts` — re-export customer-detail schemas

### Coupling với các stories khác

- **Story 3.2** (Cart + Order): tạo bảng `orders` (id, storeId, customerId, code, totalAmount, paidAmount, paymentStatus, status, purchaseDate, ...) và `order_items`. Sau khi Story 3.2 merge, các endpoint Story 4-2 sẽ tự động query thật mà không cần đổi code (nhờ `tableExists` fallback).
- **Story 3.3** (Tạo đơn + thanh toán): trong cùng transaction `INSERT INTO orders` PHẢI `UPDATE customers SET totalPurchased = totalPurchased + ?, purchaseCount = purchaseCount + 1 WHERE id = ?`. Story 4-2 KHÔNG implement, chỉ ghi nhận trong AC9 để Story 3.3 không bỏ sót.
- **Story 5.1** (Debts table): có thể tạo bảng `debts` riêng. Nếu Story 5.1 quyết định lưu nợ trong `orders.paidAmount` thay vì bảng riêng, Story 4-2 đã sẵn sàng (tab Công nợ query `orders` filter `paymentStatus IN ('partial_paid', 'unpaid')`).
- **Story 5.2** (Ghi nhận thanh toán nợ): khi user bấm "Ghi nhận thanh toán" trong tab Công nợ, sẽ gọi API của Story 5.2. Story 4-2 chỉ render data, KHÔNG tạo nút thanh toán (để Story 5.x bổ sung).
- **Story 4.4** (Giá riêng KH): không liên quan trực tiếp, nhưng `effectivePriceListId` của customer có thể được hiển thị trong header nếu cần (optional, không bắt buộc trong Story 4-2).
- **Story 4.5** (Lịch sử thay đổi nhóm/giá): có thể là tab thứ 4 trong tương lai. Story 4-2 không tạo tab này.

### Anti-patterns cần TRÁNH

- KHÔNG tạo migration cho bảng `orders`/`debts` trong Story 4-2. Chỉ Story 3.x/5.x mới được tạo.
- KHÔNG hardcode `effectiveDebtLimit` ở frontend — dùng giá trị backend trả.
- KHÔNG dùng `JOIN orders` ở Story 4-2 service mà không qua `tableExists` check.
- KHÔNG mở sheet edit khi click vào tên — phải navigate.
- KHÔNG quên `key={customer.id}` trên `CustomerForm` (lesson từ Story 4.1 review).
- KHÔNG import Recharts ở entry bundle — phải lazy.
- KHÔNG dùng floating point cho VND.

### Implementation hint: `tableExists` + service skeleton

```ts
// apps/api/src/lib/db-introspection.ts
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export async function tableExists(db: NodePgDatabase, tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = ${tableName}
    LIMIT 1
  `)
  return result.rows.length > 0
}

// apps/api/src/services/customer-detail.service.ts (skeleton)
export function createCustomerDetailService({ db, logger }: Deps) {
  async function getCustomerOrders(
    storeId: string,
    customerId: string,
    query: CustomerOrdersQuery,
  ) {
    await assertCustomerInStore(db, storeId, customerId)
    if (!(await tableExists(db, 'orders'))) {
      logger.info({ customerId, missingTable: 'orders' }, 'customer.detail.fallback')
      return { data: [], meta: emptyMeta(query.page, query.pageSize) }
    }
    // Query thật khi orders tồn tại — Story 3.2 sẽ kích hoạt
    // ...
  }
  return { getCustomerOrders, getCustomerDebts, getCustomerTopProducts, getCustomerMonthlyRevenue }
}
```

### Implementation hint: URL-synced tabs

```ts
// customer-detail-view.tsx
const search = useSearch({ from: '/_authenticated/_app-layout/customers/$customerId' })
const navigate = useNavigate()
const tab = search.tab ?? 'orders'
const setTab = (next: 'orders' | 'debts' | 'stats') =>
  navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true })
```

### Validation rules

- Query `pageSize` clamp: 1..100 (default 20)
- Query `months` clamp: 1..24 (default 12)
- Query `limit` (top-products) clamp: 1..50 (default 10)
- Query `dateFrom` <= `dateTo` (Zod refine)
- `customerId` UUID v7 hợp lệ

### Permission matrix

| Endpoint                             | Permission required |
| ------------------------------------ | ------------------- |
| `GET /customers/:id`                 | `customers.manage`  |
| `GET /customers/:id/orders`          | `customers.manage`  |
| `GET /customers/:id/debts`           | `customers.manage`  |
| `GET /customers/:id/top-products`    | `customers.manage`  |
| `GET /customers/:id/monthly-revenue` | `customers.manage`  |

(Trong tương lai có thể tách `customers.read` riêng, nhưng MVP dùng chung `customers.manage` cho đồng bộ Story 4.1.)

### Latest tech notes

- TanStack Router `validateSearch` là Zod schema, type-safe khi gọi `useSearch`
- TanStack Query v5: `placeholderData: keepPreviousData` thay cho `keepPreviousData: true` cũ
- Drizzle 0.45 hỗ trợ `sql` template literal cho introspection query
- Recharts 2.x compatible với React 19; nếu gặp peer dep warning có thể bỏ qua hoặc dùng `--legacy-peer-deps` cho lệnh add (kiểm tra trước)
- Hono 4.12 factory pattern: tạo router con và mount vào parent qua `app.route('/customers', createCustomersRoutes(...))`

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.2 — AC1..AC6]
- [Source: _bmad-output/project-context.md#API conventions, Error codes, Audit log, Integer VND, UUID v7]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/dashboard-specification.md#Recharts standard]
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md (Customer schema, CustomerForm, review finding click-name)]
- [Source: _bmad-output/planning-artifacts/epics/epic-3-bn-hng-pos-lung-bn-l.md#Story 3.2, 3.3 (orders, order_items, counter)]
- [Source: _bmad-output/planning-artifacts/epics/epic-5-qun-l-cng-n.md#Story 5.1, 5.2 (debts table, payment recording)]
- [Source: apps/api/src/services/customers.service.ts (getCustomer multi-tenant pattern)]
- [Source: apps/api/src/routes/customers.routes.ts (createCustomersRoutes factory)]
- [Source: apps/web/src/router.tsx (customersRoute, requirePermissionGuard pattern)]
- [Source: apps/web/src/pages/purchase-order-detail-page.tsx (detail page pattern)]
- [Source: apps/web/src/features/customers/use-customers.ts (query keys pattern)]
- [Source: packages/shared/src/schema/customer-management.ts (customerDetailSchema, effectiveDebtLimit)]
- [Source: packages/shared/src/schema/customers.ts (totalPurchased, purchaseCount, currentDebt, debtLimit columns)]
- [Source: packages/shared/src/schema/purchase-orders.ts (pattern bigint mode 'number' VND, paymentStatus enum)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context)

### Debug Log References

### Completion Notes List

### File List
