# Story 5.2: Phiếu thu & Phân bổ FIFO

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a chủ cửa hàng,
I want tạo phiếu thu tiền từ khách hàng và phân bổ tự động theo FIFO vào các hoá đơn nợ cũ nhất,
so that theo dõi chính xác từng khoản nợ đã thu và còn lại, đồng thời có audit trail đầy đủ.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `receipts` + `receipt_allocations` + migration

**Given** hệ thống đã có `stores` (Story 1.1), `users` (Story 1.4), `customers` (Story 4.1) với cột `current_debt`, bảng `debts` (Story 5.1) lưu từng khoản nợ theo order với index FIFO `idx_debts_store_customer (storeId, customerId, createdAt ASC)`, `audit_logs` (Story 1.4)

**When** chạy migration mới của story 5.2

**Then** tạo bảng `receipts`:

| Column        | Type                       | Ràng buộc                                      |
| ------------- | -------------------------- | ---------------------------------------------- |
| `id`          | `uuid`                     | PK, default `uuidv7()`                         |
| `store_id`    | `uuid`                     | NOT NULL, FK `stores.id` ON DELETE RESTRICT    |
| `customer_id` | `uuid`                     | NOT NULL, FK `customers.id` ON DELETE RESTRICT |
| `amount`      | `bigint` mode 'number'     | NOT NULL, > 0 (integer VND, tổng số tiền thu)  |
| `note`        | `varchar(500)`             | NULLABLE (ghi chú)                             |
| `created_by`  | `uuid`                     | NOT NULL, FK `users.id` ON DELETE RESTRICT     |
| `created_at`  | `timestamp with time zone` | NOT NULL, default `now()`                      |

**And** indexes của `receipts`:

- `idx_receipts_store_created` ON `(store_id, created_at DESC)` cho list query mặc định
- `idx_receipts_store_customer` ON `(store_id, customer_id, created_at DESC)` cho filter theo KH kèm sort theo ngày

**And** tạo bảng `receipt_allocations`:

| Column       | Type                       | Ràng buộc                                     |
| ------------ | -------------------------- | --------------------------------------------- |
| `id`         | `uuid`                     | PK, default `uuidv7()`                        |
| `receipt_id` | `uuid`                     | NOT NULL, FK `receipts.id` ON DELETE RESTRICT |
| `debt_id`    | `uuid`                     | NOT NULL, FK `debts.id` ON DELETE RESTRICT    |
| `amount`     | `bigint` mode 'number'     | NOT NULL, > 0 (số tiền phân bổ vào debt này)  |
| `created_at` | `timestamp with time zone` | NOT NULL, default `now()`                     |

**And** indexes của `receipt_allocations`:

- `idx_receipt_allocations_receipt` ON `(receipt_id)` cho query allocations theo receipt
- `idx_receipt_allocations_debt` ON `(debt_id)` cho query lịch sử allocations cho từng debt
- `uniq_receipt_allocations_receipt_debt` UNIQUE ON `(receipt_id, debt_id)` (mỗi receipt chỉ có tối đa 1 allocation cho mỗi debt; tránh duplicate row khi user chọn 1 debt 2 lần)

**And** ràng buộc enforce ở service layer (KHÔNG dùng CHECK constraint cấp DB):

- `receipts.amount > 0` (Zod min(1) + service validate)
- `SUM(receipt_allocations.amount WHERE receipt_id = X) = receipts.amount` (validate trong service trước khi insert)
- `receipt_allocations.amount > 0`
- `receipt_allocations.amount <= debt.remaining` tại thời điểm phân bổ (re-check trong transaction sau SELECT FOR UPDATE)
- Mọi `debt.id` trong `receipt_allocations` phải thuộc cùng `customer_id` và `store_id` với `receipt`

**And** KHÔNG có cột `deleted_at` ở cả 2 bảng. Phiếu thu là chứng từ tài chính append-only, KHÔNG cho sửa/xoá sau khi tạo (pattern giống `supplier_payments` Story 5.3).

**And** KHÔNG đụng vào schema `customers` hay `debts` (chỉ UPDATE `customers.current_debt` và `debts.paid`/`debts.remaining` trong service, không alter table).

### AC2: Permission + audit action mới

**Given** ma trận `PERMISSIONS` hiện tại (`packages/shared/src/constants/permissions.ts`) đã có `customers.manage: ['owner', 'manager']` từ Story 4.1

**When** Story 5.2 thêm endpoint phiếu thu

**Then** **KHÔNG tạo permission mới**. Reuse `customers.manage` cho list/get/create phiếu thu (cả Owner và Manager đều thao tác được). Khác Story 5.3 ở chỗ phiếu thu KHÔNG hạn chế chỉ Owner — vì thu nợ là nghiệp vụ thường xuyên, nhân viên quản lý cũng được phép. Lý do: epic 5.2 không yêu cầu giới hạn role như 5.3 ("chỉ Owner mới tạo phiếu chi"); đối xứng với Story 5.1 (Manager + Staff đều ghi nợ POS).

**And** thêm 2 audit action vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`):

- `'receipt.created'` (tạo phiếu thu)
- `'receipt.printed'` (in phiếu thu, optional, ghi audit khi user nhấn Print)

**And** cập nhật `apps/web/src/features/audit/action-labels.ts`:

- Thêm `'receipt.created': 'Tạo phiếu thu nợ KH'`
- Thêm `'receipt.printed': 'In phiếu thu'`
- Tạo group mới "Phiếu thu" với 2 actions trên (KHÔNG nhét vào group "Công nợ" hiện có để tách rõ luồng nghiệp vụ phiếu thu vs ghi nợ).

### AC3: Search khách hàng có công nợ

**Given** Owner/Manager đang ở trang phiếu thu, click "Tạo phiếu thu"

**When** mở Dialog tạo phiếu thu, gõ tên hoặc phone vào ô search KH

**Then** tái sử dụng `useCustomersQuery({ search, hasDebt: 'yes', pageSize: 20 })` (đã có từ Story 4.1, không tạo endpoint mới)

**And** hiển thị danh sách KH matching, mỗi item: tên KH + phone + nợ hiện tại (subdued, e.g. "Nguyễn Văn A - 0901234567 - Nợ: 1.200.000đ")

**And** debounce search 300ms (reuse `useDebounced` từ `apps/web/src/hooks/use-debounced.ts`)

**And** nếu search rỗng hoặc không có KH match → hiển thị helper text "Không tìm thấy khách hàng còn nợ"

**And** sau khi user chọn 1 KH → hiển thị thông tin tóm tắt KH + nợ tổng + load danh sách `debts.remaining > 0` qua endpoint mới (xem AC4).

### AC4: API list nợ còn lại của KH theo FIFO (`GET /api/v1/receipts/customer-debts/:customerId`)

**Given** Owner/Manager đã chọn KH trong dialog phiếu thu

**When** frontend gọi `GET /api/v1/receipts/customer-debts/:customerId`

**Then** validate `:customerId` qua `z.string().uuid('ID khách hàng không hợp lệ')`

**And** service `listCustomerOpenDebts({ db, storeId, customerId })`:

- SELECT FROM `debts` WHERE `store_id = actor.storeId AND customer_id = customerId AND remaining > 0`
- LEFT JOIN `orders` lấy `order.code` (mã đơn hàng) + `order.created_at` (= debt.created_at thường)
- Sort `debts.created_at ASC, debts.id ASC` (FIFO + tie-break ổn định)
- Return: `{ items: OpenDebtItem[], totalRemaining: number, customerName: string, customerPhone: string }`

**And** schema response `customerOpenDebtsResponseSchema`:

```ts
const openDebtItemSchema = z.object({
  id: z.string().uuid(), // debts.id
  orderId: z.string().uuid(), // debts.order_id
  orderCode: z.string(), // orders.code (snapshot)
  amount: z.number().int(), // debts.amount (gốc)
  paid: z.number().int(), // debts.paid (đã trả)
  remaining: z.number().int(), // debts.remaining
  createdAt: z.string(), // debts.created_at ISO
})

const customerOpenDebtsResponseSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  customerPhone: z.string(),
  totalRemaining: z.number().int(), // = customers.current_debt
  items: z.array(openDebtItemSchema),
})
```

**And** middleware: `requireAuth` + `requirePermission('customers.manage')`

**And** Multi-tenant: WHERE chặt `store_id = auth.storeId`. Customer thuộc store khác → trả `{ items: [], totalRemaining: 0 }` hoặc 404 (chọn 404 cho rõ ràng).

**And** nếu `customers.deleted_at IS NOT NULL` → 404 "Không tìm thấy khách hàng".

### AC5: Preview phân bổ FIFO tự động

**Given** đã chọn KH có 3 khoản nợ FIFO sắp xếp theo `created_at ASC`: A (remaining 100.000đ), B (remaining 200.000đ), C (remaining 150.000đ), tổng còn 450.000đ

**When** user nhập số tiền thu = 250.000đ và để mode = "FIFO" (mặc định)

**Then** frontend tự compute preview phân bổ qua hàm `computeFifoAllocation(debts: OpenDebtItem[], amount: number): Allocation[]`:

```ts
function computeFifoAllocation(debts, amount) {
  const allocs = []
  let remaining = amount
  for (const d of debts) {
    // debts đã sort FIFO ASC
    if (remaining <= 0) break
    const take = Math.min(d.remaining, remaining)
    if (take > 0) {
      allocs.push({ debtId: d.id, orderCode: d.orderCode, amount: take })
      remaining -= take
    }
  }
  return { allocations: allocs, unallocated: remaining }
}
```

**And** preview hiển thị:

- A: trả 100.000đ → còn 0 (tất toán)
- B: trả 150.000đ → còn 50.000đ
- C: không thay đổi
- Tổng phân bổ = 250.000đ (= số tiền thu)

**And** mỗi row preview hiển thị: mã đơn (orderCode), nợ trước (remaining), trả (allocated), nợ sau (remaining - allocated), badge "Tất toán" nếu nợ sau = 0.

**And** preview là CLIENT-SIDE compute, KHÔNG gọi API. Backend sẽ re-compute và validate khi confirm (xem AC7).

### AC6: Phân bổ thủ công

**Given** đã chọn KH có 3 khoản nợ A/B/C, user muốn phân bổ thủ công

**When** user toggle mode từ "FIFO tự động" sang "Thủ công"

**Then** mỗi debt row hiển thị checkbox + CurrencyInput cho phép nhập số tiền phân bổ riêng cho từng khoản

**And** chỉ debt có checkbox tick mới được phân bổ; debt unchecked → amount = 0

**And** validate client-side khi user gõ:

- Mỗi `allocation.amount > 0` (nếu = 0 và checkbox tick → coi như untick)
- Mỗi `allocation.amount <= debt.remaining` (input max = debt.remaining)
- `SUM(allocations) === receipt.amount` (số tiền thu)

**And** hiển thị live counter "Đã phân bổ: X / Y" dưới preview:

- X = sum allocations
- Y = receipt.amount
- Nếu X < Y: text màu vàng "Còn thiếu: Y - X"
- Nếu X > Y: text màu đỏ "Vượt: X - Y"
- Nếu X = Y: text màu xanh "Cân bằng"

**And** disable nút "Xác nhận thu tiền" nếu `X !== Y` (manual mode).

**And** khi switch mode FIFO ↔ Thủ công: reset allocations theo mode mới (FIFO auto-fill, Manual reset về empty).

### AC7: Tạo phiếu thu (POST /api/v1/receipts)

**Given** Owner/Manager đã chọn KH, nhập số tiền, có preview phân bổ hợp lệ

**When** gọi `POST /api/v1/receipts` với body:

```json
{
  "customerId": "<uuid>",
  "amount": 250000,
  "note": "Thu tiền nợ tháng 4",
  "allocationMode": "fifo",
  "allocations": [
    { "debtId": "<uuid>", "amount": 100000 },
    { "debtId": "<uuid>", "amount": 150000 }
  ]
}
```

**Then** API validate qua `createReceiptSchema` tại `packages/shared/src/schema/receipt-management.ts`:

- `customerId`: `z.string().uuid({ message: 'Vui lòng chọn khách hàng' })`
- `amount`: `z.number().int('Số tiền phải là số nguyên').min(1, 'Số tiền phải lớn hơn 0').max(99_999_999_999_999, 'Số tiền vượt giới hạn')`
- `note`: `z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional()`
- `allocationMode`: `z.enum(['fifo', 'manual'])`
- `allocations`: `z.array(allocationInputSchema).min(1, 'Cần ít nhất một khoản phân bổ')` với `allocationInputSchema = z.object({ debtId: z.string().uuid(), amount: z.number().int().min(1) }).strict()`
- `.strict()` loại bỏ field lạ
- `.refine`: `SUM(allocations.amount) === amount`, message "Tổng phân bổ phải bằng số tiền thu"
- `.refine`: không có `debtId` trùng lặp trong `allocations` (Set size === array length)

**And** service `createReceipt({ db, actor, input, meta })`:

1. Mở `db.transaction(async (tx) => { ... })`
2. SELECT customer FOR UPDATE: `WHERE id = customerId AND store_id = actor.storeId AND deleted_at IS NULL`
   - Nếu không thấy → 404 "Không tìm thấy khách hàng"
   - Lock customer row để tránh race với phiếu thu/ghi nợ khác
3. Validate `input.amount <= customer.currentDebt` → nếu vượt → 422 BUSINESS_RULE_VIOLATION với message: `Số tiền thu (${formatVnd(amount)}) vượt quá tổng nợ còn lại (${formatVnd(currentDebt)})`. Edge case `currentDebt === 0` → 422 "Khách hàng không còn nợ"
4. SELECT TẤT CẢ `debts` trong `input.allocations.map(a => a.debtId)` FOR UPDATE:
   - `WHERE id IN (...debtIds) AND store_id = actor.storeId AND customer_id = customerId AND remaining > 0`
   - Lock từng debt row
5. Validate cross-check:
   - Số debts tìm được = số allocations (không có debtId lạ/đã tất toán)
   - Mọi debt đều thuộc đúng customer + store (chống cross-customer attack)
   - Mỗi `allocation.amount <= debt.remaining` (re-check sau lock; có thể thay đổi giữa preview và confirm)
   - Nếu fail bất kỳ → throw 422 BUSINESS_RULE_VIOLATION với message rõ ràng
6. Insert row vào `receipts`:
   ```ts
   tx.insert(receipts)
     .values({
       storeId: actor.storeId,
       customerId: input.customerId,
       amount: input.amount,
       note: input.note?.trim() || null,
       createdBy: actor.userId,
     })
     .returning({ id: receipts.id, createdAt: receipts.createdAt })
   ```
7. Insert batch vào `receipt_allocations`:
   ```ts
   tx.insert(receiptAllocations).values(
     input.allocations.map((a) => ({
       receiptId: createdReceiptId,
       debtId: a.debtId,
       amount: a.amount,
     })),
   )
   ```
8. UPDATE từng `debts` (loop qua allocations, atomic SQL):
   ```ts
   for (const a of input.allocations) {
     await tx
       .update(debts)
       .set({
         paid: sql`${debts.paid} + ${a.amount}`,
         remaining: sql`${debts.remaining} - ${a.amount}`,
       })
       .where(eq(debts.id, a.debtId))
   }
   ```
9. UPDATE `customers.current_debt = current_debt - input.amount` (atomic SQL):
   ```ts
   tx.update(customers)
     .set({
       currentDebt: sql`${customers.currentDebt} - ${input.amount}`,
     })
     .where(eq(customers.id, input.customerId))
   ```
10. Ghi audit `action='receipt.created'`, `targetType='receipt'`, `targetId=<receiptId>`, `changes`:
    ```json
    {
      "customerId": "<uuid>",
      "customerName": "<snapshot>",
      "amount": 250000,
      "note": "...",
      "allocationMode": "fifo",
      "allocationCount": 2,
      "debtBefore": 1000000,
      "debtAfter": 750000,
      "allocations": [{ "debtId": "...", "orderCode": "ORD-...", "amount": 100000 }, ...]
    }
    ```
11. Trả 201 với envelope `{ data: ReceiptDetail }`

**And** `ReceiptDetail` chứa: `id`, `customerId`, `customerName`, `customerPhone`, `amount`, `note`, `createdBy`, `createdByName`, `createdAt`, `debtAfter` (= customer.currentDebt sau update), `allocations: ReceiptAllocationItem[]`. Mỗi `ReceiptAllocationItem`: `id`, `debtId`, `orderId`, `orderCode`, `amount`, `debtRemainingAfter` (= debt.remaining sau update).

**And** mọi bước trong CÙNG database transaction. Fail bất kỳ → rollback toàn bộ.

**And** sau khi thành công, ghi log INFO: `{ storeId, actorId, receiptId, customerId, customerName, amount, debtBefore, debtAfter, allocationMode, allocationCount }` với message `'receipt.created'`.

### AC8: Liệt kê phiếu thu (GET /api/v1/receipts)

**Given** Owner/Manager xem trang Phiếu thu

**When** gọi `GET /api/v1/receipts?page=1&pageSize=20&customerId=&fromDate=&toDate=&search=`

**Then** API validate qua `listReceiptsQuerySchema`:

- `page`: `z.coerce.number().int().min(1).default(1)`
- `pageSize`: `z.coerce.number().int().min(1).max(100).default(20)`
- `customerId`: `z.string().uuid().optional()` (filter theo KH)
- `fromDate`: `z.string().datetime().optional()` (ISO 8601, lọc `created_at >= fromDate`)
- `toDate`: `z.string().datetime().optional()` (lọc `created_at <= toDate`; auto +23:59:59.999 nếu là 00:00:00 UTC theo pattern Story 5.3)
- `search`: `z.string().trim().max(200).optional()` (search theo `customer.name`, `customer.phone`, hoặc `note`)
- `.refine`: nếu cả `fromDate` và `toDate` → `toDate >= fromDate`, message "Ngày kết thúc phải sau ngày bắt đầu"

**And** service `listReceipts({ db, storeId, query })`:

- WHERE chặt: `receipts.store_id = actor.storeId`
- LEFT JOIN `customers` (KHÔNG filter `deleted_at` để giữ orphan handling — KH bị xoá mềm vẫn hiển thị tên trên phiếu thu cũ)
- LEFT JOIN `users` lấy `users.name` AS `createdByName`
- Apply filter `customerId`, `fromDate`, `toDate`
- Apply `search`: `LOWER(customers.name) LIKE pattern OR customers.phone LIKE pattern OR LOWER(receipts.note) LIKE pattern` với `pattern = '%' + escapeLikePattern(search) + '%'`
- Sort mặc định: `(created_at DESC, id DESC)` (deterministic tie-break)
- Pagination chuẩn LIMIT/OFFSET
- Trả `{ data: ReceiptListItem[], meta: { page, pageSize, total, totalPages } }`

**And** `ReceiptListItem` chứa: `id`, `customerId`, `customerName`, `customerPhone`, `amount`, `note`, `allocationCount` (count subquery), `createdBy`, `createdByName`, `createdAt`. KHÔNG kèm allocations chi tiết để tránh N+1; user click vào sẽ load detail riêng.

### AC9: Xem chi tiết phiếu thu (GET /api/v1/receipts/:id)

**Given** Owner/Manager click vào 1 phiếu thu

**When** gọi `GET /api/v1/receipts/:id`

**Then** validate `:id` qua `z.string().uuid('ID không hợp lệ')`

**And** service `getReceipt({ db, storeId, targetId })`:

- SELECT FROM `receipts` WHERE `id = targetId AND store_id = actor.storeId`
- LEFT JOIN `customers` lấy `customerName`, `customerPhone`
- LEFT JOIN `users` lấy `createdByName`
- SELECT từ `receipt_allocations` JOIN `debts` JOIN `orders` lấy `orderCode` cho từng allocation
- Nếu không tìm thấy receipt → 404 "Không tìm thấy phiếu thu"

**And** `ReceiptDetail` ở GET trả `debtAfter = null` (chỉ POST mới có snapshot tại thời điểm tạo; tuân theo pattern Story 5.3). Frontend in phiếu thu KHÔNG cần debtAfter realtime, lấy từ POST response trực tiếp; nếu reload trang detail sau đó, debtAfter sẽ null và UI ẩn dòng đó.

**And** `allocations` trong detail luôn được trả đầy đủ (không lazy load).

### AC10: KHÔNG có endpoint sửa/xoá phiếu thu

**Given** phiếu thu đã tạo

**When** dev cố gọi PATCH/PUT/DELETE trên `/api/v1/receipts/:id`

**Then** route handler KHÔNG mount các method này, Hono trả 404 (default behavior). KHÔNG implement endpoint sửa/xoá ở story 5.2.

**And** lý do business: phiếu thu là chứng từ tài chính, audit phải bất biến. Sai sót → tạo phiếu điều chỉnh (Story 5.4 sẽ có debt_adjustments cho KH) hoặc workaround thủ công. Pattern giống `supplier_payments` Story 5.3.

### AC11: Routes mount + middleware

**Given** Hono router hiện đang mount các route `/api/v1/customers`, `/api/v1/orders`, `/api/v1/supplier-payments`

**When** thêm route mới

**Then** tạo `apps/api/src/routes/receipts.routes.ts` theo pattern `supplier-payments.routes.ts`:

- `GET /` → `listReceipts`
- `GET /customer-debts/:customerId` → `listCustomerOpenDebts` (mount TRƯỚC `/:id` literal-trước-param)
- `GET /:id` → `getReceipt`
- `POST /` → `createReceipt`
- KHÔNG mount PATCH/DELETE
- Middleware: `requireAuth` + `requirePermission('customers.manage')` toàn bộ route
- Hono factory `createReceiptsRoutes({ db })`

**And** mount vào `apps/api/src/index.ts` SAU `/api/v1/purchase-orders` (giữ alphabetical: products → purchase-orders → receipts → stock-checks):

```typescript
import { createReceiptsRoutes } from './routes/receipts.routes.js'
// ...
app.route('/api/v1/receipts', createReceiptsRoutes({ db }))
```

Đặt entry này SAU `purchase-orders` và TRƯỚC `stock-checks` (alphabetical).

### AC12: UI page phiếu thu `/receipts`

**Given** sidebar hiện có entry "Khách hàng" (`/customers`) cho Owner/Manager

**When** Story 5.2 thêm trang phiếu thu

**Then** thêm 1 entry vào `apps/web/src/components/layout/nav-items.ts`:

```ts
{
  path: '/receipts',
  label: 'Phiếu thu',
  icon: HandCoins,    // hoặc PiggyBank — pick HandCoins từ lucide-react
  requiredPermission: 'customers.manage',
}
```

Đặt SAU entry `/customers` và TRƯỚC `/pricing` (gom nhóm khách hàng + thu nợ liền nhau). Icon `HandCoins` từ `lucide-react` (sẵn có trong dependencies).

**And** thêm route trong `apps/web/src/router.tsx`:

```ts
const receiptsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/receipts',
  beforeLoad: requirePermissionGuard('customers.manage'),
  component: ReceiptsPage,
})
```

Mount vào `appLayoutRoute.addChildren([...])` (vị trí phù hợp alphabetical).

**And** tạo `apps/web/src/pages/receipts-page.tsx`:

```tsx
import { ReceiptsManager } from '@/features/receipts/receipts-manager'
export function ReceiptsPage() {
  return <ReceiptsManager />
}
```

**And** tạo `apps/web/src/features/receipts/receipts-manager.tsx`:

- Header:
  - Title: "Phiếu thu nợ khách hàng"
  - Description: "Quản lý phiếu thu và phân bổ vào các khoản nợ của khách hàng"
- Toolbar:
  - Nút Primary "Tạo phiếu thu" (icon `Plus`) → mở `<CreateReceiptDialog>`. Owner và Manager đều thấy nút (khác Story 5.3 chỉ Owner).
- Filters component `<ReceiptsFilters>`:
  - Input search (debounce 300ms, placeholder "Tìm theo tên KH, phone hoặc ghi chú")
  - Select customer (load `useCustomersQuery({ pageSize: 200, hasDebt: 'all' })`, default "Tất cả KH"; dùng combobox/typeahead nếu list dài)
  - DateRangePicker (fromDate, toDate, default rỗng)
- Body desktop ≥ 768px: `<ReceiptsTable>` cột:
  - Ngày tạo (format `dd/MM/yyyy HH:mm` qua date-fns vi locale)
  - Khách hàng (tên + phone subdued)
  - Số tiền (formatVnd, font-medium, align right)
  - Số khoản phân bổ (allocationCount, badge nhỏ)
  - Ghi chú (truncate 50 chars, hover Tooltip)
  - Người tạo (createdByName; null → "—")
  - Action: nút "Xem chi tiết" (mở `<ReceiptDetailDialog>`) + nút "In" (in lại phiếu)
- Body mobile < 768px: `<ReceiptsCardList>` (mỗi card 1 phiếu)
- Empty state: `<EmptyState icon={HandCoins} title="Chưa có phiếu thu nào" description="Tạo phiếu thu đầu tiên để ghi nhận thu nợ KH" actionLabel="Tạo phiếu thu" onAction={...} />`
- `<Pagination>` reuse từ `apps/web/src/components/shared/pagination.tsx`
- Loading: skeleton 5 rows
- Error: hiển thị error.message + toast

### AC13: Dialog tạo phiếu thu

**Given** Owner/Manager click "Tạo phiếu thu"

**When** mở `<CreateReceiptDialog>` (file `apps/web/src/features/receipts/create-receipt-dialog.tsx`)

**Then** Dialog dùng `<Dialog>` shadcn với `open/onOpenChange` controlled, `key={generation-counter}` để remount form khi reopen (fix M13 pattern Story 4.1):

- Title: "Tạo phiếu thu nợ"
- Description: "Phiếu thu sẽ giảm trực tiếp công nợ KH. Không thể sửa hoặc xoá sau khi tạo."
- DialogContent rộng (`max-w-3xl`) vì có bảng phân bổ.

**Form layout (3 step UI dạng vertical sections, KHÔNG dùng wizard):**

#### Section 1: Chọn khách hàng

- Combobox/Search KH (reuse pattern `useCustomersQuery({ search, hasDebt: 'yes', pageSize: 20 })`):
  - Input placeholder "Tìm theo tên hoặc số điện thoại"
  - Debounce 300ms
  - Dropdown hiển thị: tên + phone + nợ hiện tại (subdued)
  - Click chọn → set `customerId`, fetch open debts
- Sau khi chọn → hiển thị card tóm tắt KH:
  - Tên + phone
  - Tổng nợ còn lại: `formatVndWithSuffix(totalRemaining)`
  - Nút "Đổi khách hàng" (X) reset về step 1
- Required, không cho phép qua step 2 nếu chưa chọn KH

#### Section 2: Nhập số tiền thu

- Hiển thị khi đã chọn KH
- `<CurrencyInput>` reuse từ `apps/web/src/components/shared/currency-input.tsx`
- Helper text dynamic: "Tổng nợ còn lại: {totalRemaining}đ. Tối đa: {totalRemaining}đ"
- Nút "Thu hết" cạnh input → set `amount = totalRemaining` (1 click thu toàn bộ nợ + auto-fill FIFO)
- Validate: `amount >= 1`, `amount <= totalRemaining` (cross-field check qua `superRefine` trong schema HOẶC kiểm tra trong onSubmit)
- Required

#### Section 3: Phân bổ vào các khoản nợ

- Hiển thị khi `amount > 0`
- Toggle mode: 2 radio button hoặc tabs:
  - "FIFO tự động" (default, recommended)
  - "Thủ công"
- Bảng hiển thị danh sách `OpenDebtItem[]` (sort FIFO ASC):
  - Cột: Mã đơn (orderCode), Ngày phát sinh, Nợ trước, Phân bổ (input), Nợ sau, Badge tất toán
  - **FIFO mode**:
    - Mỗi row hiển thị `amount` phân bổ (read-only, computed từ `computeFifoAllocation`)
    - Badge "Tất toán" nếu nợ sau = 0 (text-green)
    - Disable input
  - **Manual mode**:
    - Checkbox đầu mỗi row (toggle có phân bổ hay không)
    - `<CurrencyInput>` cho amount, max = `debt.remaining`, disabled khi checkbox unchecked
    - Live update "Nợ sau" và badge tất toán theo input
- Live counter dưới bảng: "Đã phân bổ: {sumAllocations}đ / {amount}đ"
  - X = Y: text-green "Cân bằng ✓"
  - X < Y: text-yellow "Còn thiếu: {diff}đ"
  - X > Y: text-red "Vượt: {diff}đ"
- Mode FIFO luôn cân bằng (auto-fill); Manual có thể không cân bằng cho tới khi user chỉnh.

#### Section 4: Ghi chú (optional)

- `<Textarea>` 3 rows, max 500 ký tự, counter `{noteValue.length}/500`
- Placeholder "VD: Thu tiền nợ tháng 4, tiền mặt"

#### Footer

- Nút "Huỷ" (variant ghost) → đóng dialog
- Nút Primary "Xác nhận thu tiền" (`type='submit'`):
  - `disabled = !canSubmit` với `canSubmit = customerId && amount > 0 && sumAllocations === amount && allocations.length > 0 && !isPending`
  - Hiển thị "Đang lưu..." khi `mutation.isPending`

#### Submit flow

- Call `createReceiptMutation`
- On success:
  - Toast success: "Đã tạo phiếu thu {formatVnd(amount)} cho {customerName}. Nợ còn lại: {formatVnd(debtAfter)}"
  - Mở `<ReceiptSuccessDialog>` (xem AC14) với `receipt` vừa tạo, hỏi user có muốn in ngay không
  - Invalidate queries: `['receipts']`, `['customer-open-debts', customerId]`, `['customers']`, `['customer', customerId]` (nếu có), `['customer-debt', customerId]` (Story 5.1 POS query)
  - Đóng dialog tạo, reset form
- On error: handleApiError pattern (asFormSetError nếu field error, toast nếu general)

### AC14: Dialog success + In phiếu thu

**Given** vừa tạo phiếu thu thành công

**When** API trả 201 với `ReceiptDetail`

**Then** mở `<ReceiptSuccessDialog>` (file `apps/web/src/features/receipts/receipt-success-dialog.tsx`):

- Title: "Đã tạo phiếu thu thành công"
- Description: "Phiếu thu đã được lưu và công nợ KH đã được cập nhật."
- Nội dung tóm tắt:
  - KH: tên + phone
  - Số tiền: `formatVndWithSuffix(amount)` (font-bold, lớn)
  - Nợ trước: ... → Nợ sau: ... (highlight)
  - Số khoản phân bổ: N
- 2 nút action:
  - "In phiếu thu" (icon `Printer`, primary) → trigger print flow (xem dưới)
  - "Đóng" (variant ghost) → đóng dialog, return về list

**And** print flow:

- Tạo `<ReceiptPrintTemplate receipt={receipt} />` ẩn (style `hidden md:hidden print:block` hoặc render trong portal off-screen)
- Layout phiếu in (A5/khổ thermal, dùng print CSS):
  - Header: tên cửa hàng (lấy từ `useStoreSettings`), địa chỉ, điện thoại
  - Title: "PHIẾU THU"
  - Mã phiếu: 8 ký tự cuối UUID hoặc format `RC-{YYYYMMDD}-{seq}` (chọn UUID 8 ký tự cho đơn giản, KHÔNG cần seq mới)
  - Ngày: `dd/MM/yyyy HH:mm`
  - KH: tên, phone, address (nếu có)
  - Bảng phân bổ: Mã đơn | Ngày phát sinh | Nợ trước | Phân bổ | Nợ sau
  - Tổng phân bổ = số tiền thu
  - Nợ còn lại sau phiếu thu: `formatVnd(debtAfter)`
  - Người thu: createdByName
  - Footer: 2 ô ký tên (KH, Thu ngân)
- Trigger `window.print()` khi user click "In phiếu thu"
- Sau khi print → POST `/api/v1/audit-logs` hoặc gửi `'receipt.printed'` qua endpoint riêng (DEFER: chỉ ghi audit nếu dễ, có thể skip ở MVP — KHÔNG block release nếu hook print khó)
- Recommendation: KHÔNG ghi audit `receipt.printed` ở MVP để tránh thêm endpoint; chỉ giữ enum trong schema sẵn cho future use. Action `receipt.created` đã đủ trace.

### AC15: API client + hooks frontend

**Given** Story 5.2 cần API client và TanStack Query hooks

**When** dev tạo file mới

**Then** tạo `apps/web/src/features/receipts/receipts-api.ts`:

- `listReceiptsApi(query: ListReceiptsQuery): Promise<{ data: ReceiptListItem[]; meta: ... }>`
- `getReceiptApi(id: string): Promise<{ data: ReceiptDetail }>`
- `createReceiptApi(input: CreateReceiptInput): Promise<{ data: ReceiptDetail }>`
- `getCustomerOpenDebtsApi(customerId: string): Promise<{ data: CustomerOpenDebtsResponse }>`

Reuse `apiClient` từ `apps/web/src/lib/api-client.ts`.

**And** tạo `apps/web/src/features/receipts/use-receipts.ts`:

- `useReceiptsQuery(query: ListReceiptsQuery)` → `useQuery` key `['receipts', 'list', query]`, `placeholderData: keepPreviousData`
- `useReceiptQuery(id: string | undefined)` → `useQuery` key `['receipts', 'detail', id]`, enabled khi id truthy
- `useCustomerOpenDebtsQuery(customerId: string | undefined)` → `useQuery` key `['customer-open-debts', customerId]`, enabled khi customerId truthy
- `useCreateReceiptMutation()` → `useMutation`:
  - onSuccess: invalidate `['receipts']`, `['customers']`, `['customer-open-debts', customerId]`, `['customer-debt', customerId]` (Story 5.1 POS query để refresh DebtSummaryCard nếu user quay về POS)

### AC16: Tests

**Given** Story 5.2 cần test coverage tương đương Story 5.3 + 5.1

**When** dev viết tests

**Then** tạo các file test sau:

#### 1. Unit test schema `packages/shared/src/schema/receipt-management.test.ts` (15+ cases)

- `createReceiptSchema`:
  - Valid case: full input, FIFO mode, manual mode
  - `customerId` không phải uuid → fail
  - `amount` < 1 → fail "Số tiền phải lớn hơn 0"
  - `amount` không phải integer → fail
  - `note` > 500 chars → fail
  - `allocations` rỗng → fail
  - `allocations` có debtId trùng → fail
  - `SUM(allocations) !== amount` → fail "Tổng phân bổ phải bằng số tiền thu"
  - `allocation.amount < 1` → fail
  - `allocationMode` invalid enum → fail
  - Field lạ → bị strip bởi `.strict()`
- `listReceiptsQuerySchema`:
  - Default values (page=1, pageSize=20)
  - `fromDate > toDate` → fail (refine)
  - `pageSize > 100` → fail
  - `customerId` không phải uuid → fail

#### 2. Service unit test `apps/api/src/services/receipts.service.test.ts` (20+ cases)

- `createReceipt`:
  - Owner/Manager + KH có nợ + amount + allocations hợp lệ → tạo OK, debt giảm đúng, customer.currentDebt giảm đúng, audit log đúng
  - Customer không tồn tại → 404
  - Customer khác store (multi-tenant) → 404
  - Customer đã soft delete → 404
  - `amount > customer.currentDebt` → 422 BUSINESS_RULE_VIOLATION
  - `customer.currentDebt = 0` → 422 với message "Khách hàng không còn nợ"
  - Allocation chứa debtId không tồn tại → 422
  - Allocation chứa debtId của KH KHÁC → 422 (cross-customer attack)
  - Allocation chứa debtId đã `remaining = 0` → 422
  - `allocation.amount > debt.remaining` → 422 (race với phiếu thu khác)
  - FIFO: 3 debts, amount = 2 debt rưỡi → debt 1 + 2 tất toán, debt 3 trừ một phần
  - Manual: chọn debt giữa danh sách, skip debt cũ → vẫn cho phép (không enforce FIFO server-side, frontend chỉ là gợi ý)
  - Race condition: 2 createReceipt cùng customer concurrent → SELECT FOR UPDATE serialize, một thành công, một fail nếu vượt nợ
  - Audit log có `changes` đầy đủ context
  - Logger.info ghi đúng
- `listReceipts`:
  - Filter store_id (multi-tenant)
  - Filter customerId
  - Filter fromDate/toDate
  - Search theo customer.name (LIKE)
  - Search escape wildcard `%` `_` (input "10%" không break)
  - Sort default created_at DESC
  - Pagination
  - Orphan customer (đã soft delete) → vẫn trả phiếu, customerName từ JOIN
- `getReceipt`:
  - Trả full detail + allocations
  - Allocations sort theo debt.created_at ASC (FIFO order)
  - Khác store → 404
- `listCustomerOpenDebts`:
  - Trả debts có `remaining > 0`, sort FIFO ASC
  - JOIN orderCode đúng
  - Customer khác store → 404
  - Customer không có nợ → `items: [], totalRemaining: 0`
  - Customer soft delete → 404

#### 3. Integration test `apps/api/src/__tests__/receipts.integration.test.ts` (18+ cases)

- Setup: createTestStore + 2 stores cho multi-tenant
- POST `/api/v1/receipts`:
  - Owner store A tạo cho KH có nợ → 201, response shape đúng, debt giảm đúng, allocations insert đúng
  - Manager store A → 201 (KHÔNG bị 403 như Story 5.3)
  - Staff (không có `customers.manage`) → 403
  - Owner cố tạo cho KH store B → 404
  - amount > currentDebt → 422
  - allocations sai SUM → 400 VALIDATION_ERROR (Zod refine)
  - allocations chứa debt KH khác → 422 (defense backend)
  - body invalid (missing customerId) → 400
  - audit_logs có row mới với action='receipt.created'
  - customers.current_debt giảm đúng
  - debts.paid + debts.remaining update đúng
  - debts có remaining = 0 sau update → vẫn ghi nhận (KHÔNG xoá row)
- GET `/api/v1/receipts`:
  - List paginated, filter customerId/fromDate/toDate/search OK
  - Multi-tenant: store A không thấy phiếu store B
  - Manager cũng list được
- GET `/api/v1/receipts/:id`:
  - Detail trả đúng + allocations
  - Khác store → 404
- GET `/api/v1/receipts/customer-debts/:customerId`:
  - Trả đúng items theo FIFO
  - totalRemaining = customer.currentDebt
  - Customer khác store → 404
- PATCH/DELETE → 404 Not Found (không mount)

#### 4. Frontend test (optional, defer được)

- `<CreateReceiptDialog>` render + submit happy path FIFO
- Manual mode: tick checkbox + nhập amount → preview update
- Validation: SUM != amount → disable submit
- "Thu hết" button set amount = totalRemaining
- `computeFifoAllocation` unit test riêng (8+ cases): empty, 1 debt vừa đủ, nhiều debt vừa đủ, dư, thiếu

### AC17: Documentation + observability

**Given** project có structured logging (Story 10.1) và audit pattern

**When** dev implement

**Then**:

- Service `createReceipt` log INFO sau khi insert thành công với context đầy đủ (xem AC7 step cuối)
- Audit log ghi `changes` chi tiết bao gồm allocations array (xem AC7 step 10)
- KHÔNG log thông tin nhạy cảm ở DEBUG/TRACE; INFO là đủ

**And** cập nhật `apps/web/src/features/audit/action-labels.ts` (xem AC2).

## Phạm vi (Scope)

### Bao gồm

- Migration: tạo bảng `receipts` + `receipt_allocations` với indexes
- Backend: service `createReceipt` (transaction: lock customer + lock debts FOR UPDATE, validate cross-check, insert receipt + allocations, update debts.paid/remaining, update customers.current_debt, audit log)
- Backend: API list/get/customer-open-debts
- Frontend: trang `/receipts` với filter + table + pagination
- Frontend: Dialog tạo phiếu thu với 3 sections (chọn KH → nhập tiền → phân bổ FIFO/manual)
- Frontend: Dialog success + in phiếu thu (template HTML + window.print)
- Frontend: hook `useCustomerOpenDebtsQuery`, mutation, invalidation chéo Story 5.1
- Frontend: hàm utility `computeFifoAllocation`
- Schema Zod mới: receipt-management
- Audit log: `receipt.created` (tối thiểu); `receipt.printed` thêm vào enum nhưng không bắt buộc gọi
- Nav item "Phiếu thu" + route `/receipts`

### KHÔNG bao gồm (Stories sau)

- Phiếu chi NCC (Story 5.3 — đã done)
- Điều chỉnh nợ thủ công KH (Story 5.4)
- Cảnh báo nợ quá hạn + báo cáo tuổi nợ (Story 5.5)
- Sửa/xoá phiếu thu (immutable, không story)
- Nhập tiền vào phiếu thu chia thành nhiều phương thức thanh toán (cash + transfer + ...) — phiếu thu Story 5.2 chỉ ghi tổng `amount`, KHÔNG breakdown phương thức
- Phiếu thu offline (Epic 9)
- Sync phiếu thu lên báo cáo công nợ (Story 5.5/8.2)
- Quick action "Tạo phiếu thu" trên trang chi tiết KH (CustomerDebtsTab) — DEFER, có thể thêm sau khi Story 5.2 ổn định
- In phiếu thu thermal printer (Story 7.3 sẽ có template thermal chung)

## Tasks / Subtasks

- [ ] **Task 1: DB schema bảng `receipts` + `receipt_allocations` + migration** (AC: 1)
  - [ ] 1.1 Tạo `packages/shared/src/schema/receipts.ts` (Drizzle table definition cho `receipts` với 7 cột + 2 indexes)
  - [ ] 1.2 Tạo `packages/shared/src/schema/receipt-allocations.ts` (Drizzle table definition cho `receipt_allocations` với 5 cột + 2 indexes + 1 unique)
  - [ ] 1.3 Export 2 schemas trong `packages/shared/src/schema/index.ts` (alphabetical: thêm `export * from './receipt-allocations.js'` và `export * from './receipts.js'` đúng vị trí)
  - [ ] 1.4 Chạy `pnpm --filter @kiotviet-lite/api drizzle:generate` để sinh migration `0024_*.sql`
  - [ ] 1.5 Verify migration tạo:
    - 2 bảng `receipts`, `receipt_allocations`
    - 4 indexes (`idx_receipts_store_created`, `idx_receipts_store_customer`, `idx_receipt_allocations_receipt`, `idx_receipt_allocations_debt`)
    - 1 unique index `uniq_receipt_allocations_receipt_debt`
    - 5 FK ON DELETE RESTRICT (receipts.store_id, customer_id, created_by; receipt_allocations.receipt_id, debt_id)
  - [ ] 1.6 KHÔNG thêm `deleted_at`, `updated_at` (cả 2 bảng immutable)
  - [ ] 1.7 KHÔNG sửa schema `customers` hay `debts` (chỉ UPDATE giá trị)

- [ ] **Task 2: Shared Zod schemas + types** (AC: 4, 7, 8, 9)
  - [ ] 2.1 Tạo `packages/shared/src/schema/receipt-management.ts`:
    - `allocationInputSchema` (debtId uuid + amount int min 1, `.strict()`)
    - `createReceiptSchema` (customerId, amount, note, allocationMode enum, allocations array, `.strict()`, 2 refines: SUM check + no duplicate debtId)
    - `listReceiptsQuerySchema` (kèm refine cross-field date)
    - `openDebtItemSchema`, `customerOpenDebtsResponseSchema`
    - `receiptAllocationItemSchema`, `receiptListItemSchema`, `receiptDetailSchema`
    - Export types: `CreateReceiptInput`, `ListReceiptsQuery`, `OpenDebtItem`, `CustomerOpenDebtsResponse`, `ReceiptAllocationItem`, `ReceiptListItem`, `ReceiptDetail`
  - [ ] 2.2 Export trong `packages/shared/src/schema/index.ts`
  - [ ] 2.3 Thêm 2 actions vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`):
    - `'receipt.created'`
    - `'receipt.printed'`
  - [ ] 2.4 Tạo test `packages/shared/src/schema/receipt-management.test.ts` (15+ cases, xem AC16)

- [ ] **Task 3: Backend service** (AC: 4, 7, 8, 9)
  - [ ] 3.1 Tạo `apps/api/src/services/receipts.service.ts`:
    - Type `ReceiptsActor` (giống `SupplierPaymentsActor`)
    - Helper `toReceiptListItem`, `toReceiptDetail`, `formatVnd`
    - Helper `toOpenDebtItem`
    - Service `listReceipts` (LEFT JOIN customers + users, filter, search escape, pagination, count subquery cho allocationCount)
    - Service `getReceipt` (multi-tenant filter, JOIN customers + users; SELECT receipt_allocations JOIN debts JOIN orders cho allocations)
    - Service `listCustomerOpenDebts` (SELECT debts WHERE remaining > 0, JOIN orders cho orderCode, sort created_at ASC)
    - Service `createReceipt`:
      - Mở `db.transaction`
      - SELECT customer FOR UPDATE
      - Validate amount <= currentDebt
      - SELECT debts FOR UPDATE WHERE id IN (...)
      - Validate cross-check (debt thuộc đúng customer, allocation.amount <= debt.remaining)
      - Insert receipt → returning id, createdAt
      - Insert receipt_allocations batch
      - UPDATE từng debt (paid, remaining)
      - UPDATE customer.currentDebt
      - Ghi audit
      - Logger.info
      - Trả ReceiptDetail
  - [ ] 3.2 Tạo `apps/api/src/services/receipts.service.test.ts` (20+ cases, xem AC16)

- [ ] **Task 4: Backend route** (AC: 4, 7, 8, 9, 10, 11)
  - [ ] 4.1 Tạo `apps/api/src/routes/receipts.routes.ts`:
    - Factory `createReceiptsRoutes({ db })`
    - Middleware `requireAuth` + `requirePermission('customers.manage')`
    - GET `/customer-debts/:customerId` (literal trước param!)
    - GET `/` list với query parse
    - GET `/:id` detail (uuidParam validate)
    - POST `/` với parseJson + service call
    - KHÔNG mount PATCH/DELETE
  - [ ] 4.2 Mount vào `apps/api/src/index.ts`:
    - Import `createReceiptsRoutes` (alphabetical sau `createPurchaseOrdersRoutes`)
    - `app.route('/api/v1/receipts', createReceiptsRoutes({ db }))` đặt sau `/api/v1/purchase-orders` và trước `/api/v1/stock-checks`
  - [ ] 4.3 Tạo `apps/api/src/__tests__/receipts.integration.test.ts` (18+ cases, xem AC16)

- [ ] **Task 5: Frontend API client + hooks** (AC: 15)
  - [ ] 5.1 Tạo folder `apps/web/src/features/receipts/`
  - [ ] 5.2 Tạo `receipts-api.ts` với 4 functions
  - [ ] 5.3 Tạo `use-receipts.ts` với 4 hooks (3 query + 1 mutation), invalidation chéo customer + customer-debt + receipts

- [ ] **Task 6: Frontend utility computeFifoAllocation** (AC: 5)
  - [ ] 6.1 Tạo `apps/web/src/features/receipts/utils.ts` với hàm `computeFifoAllocation(debts, amount): { allocations, unallocated }`
  - [ ] 6.2 Tạo test `apps/web/src/features/receipts/utils.test.ts` (8+ cases): empty debts, 1 debt vừa đủ, nhiều debt vừa đủ, dư amount, thiếu amount, amount = 0
  - [ ] 6.3 Export hàm để dialog dùng

- [ ] **Task 7: Frontend UI page + components** (AC: 12, 13, 14)
  - [ ] 7.1 Tạo `apps/web/src/pages/receipts-page.tsx`
  - [ ] 7.2 Tạo `apps/web/src/features/receipts/receipts-manager.tsx` (root component layout)
  - [ ] 7.3 Tạo `receipts-filters.tsx` (search + customer select + date range)
  - [ ] 7.4 Tạo `receipts-table.tsx` (desktop table với cột Action mở detail + print)
  - [ ] 7.5 Tạo `receipts-card-list.tsx` (mobile cards)
  - [ ] 7.6 Tạo `create-receipt-dialog.tsx`:
    - Section 1: Customer search (combobox dùng useCustomersQuery hasDebt:'yes')
    - Section 2: Amount input + Thu hết button
    - Section 3: Allocation table (FIFO/Manual mode)
    - Section 4: Note textarea
    - Footer: Huỷ + Xác nhận thu tiền
    - RHF + zodResolver(createReceiptSchema)
    - Logic mode switch reset allocations
    - Live SUM counter
  - [ ] 7.7 Tạo `receipt-success-dialog.tsx` (post-create, có nút In phiếu thu)
  - [ ] 7.8 Tạo `receipt-detail-dialog.tsx` (mở từ table action "Xem chi tiết", load qua useReceiptQuery)
  - [ ] 7.9 Tạo `receipt-print-template.tsx` (component A5/thermal-friendly với print CSS)

- [ ] **Task 8: Routing + navigation** (AC: 12)
  - [ ] 8.1 Thêm route `receiptsRoute` trong `apps/web/src/router.tsx` với `requirePermissionGuard('customers.manage')`
  - [ ] 8.2 Mount vào `appLayoutRoute.addChildren([...])` (vị trí phù hợp alphabetical, có thể sau `customersRoute`)
  - [ ] 8.3 Thêm entry "Phiếu thu" vào `apps/web/src/components/layout/nav-items.ts` với icon `HandCoins` từ lucide-react, sau `/customers` trước `/pricing`

- [ ] **Task 9: Audit labels + group** (AC: 2)
  - [ ] 9.1 Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - Thêm `'receipt.created': 'Tạo phiếu thu nợ KH'`
    - Thêm `'receipt.printed': 'In phiếu thu'`
    - Thêm group mới "Phiếu thu" vào `ACTION_GROUPS` với 2 actions trên (đặt sau group "Công nợ")

- [ ] **Task 10: Tests** (AC: 16) - 53+ cases (15 schema + 20 service + 18 integration; bonus 8 utility)
  - [ ] 10.1 Schema tests: `packages/shared/src/schema/receipt-management.test.ts`
  - [ ] 10.2 Service tests: `apps/api/src/services/receipts.service.test.ts`
  - [ ] 10.3 Integration tests: `apps/api/src/__tests__/receipts.integration.test.ts`
  - [ ] 10.4 Utility test: `apps/web/src/features/receipts/utils.test.ts` (computeFifoAllocation 8+ cases)
  - [ ] 10.5 Verify `pnpm -r run typecheck` pass
  - [ ] 10.6 Verify full test suite pass (KHÔNG regression)

- [ ] **Task 11: Manual smoke test** (AC: tất cả)
  - [ ] 11.1 Login Owner → trang `/receipts` hiện thị, có nút "Tạo phiếu thu"
  - [ ] 11.2 Login Manager → cũng thấy + có thể tạo phiếu thu (KHÔNG bị 403)
  - [ ] 11.3 Login Staff → vào URL `/receipts` bị redirect (route guard)
  - [ ] 11.4 Tạo phiếu thu FIFO: chọn KH có 3 nợ, nhập amount = nợ A + 1/2 nợ B → preview hiển thị đúng → submit → toast OK → success dialog
  - [ ] 11.5 Tạo phiếu thu Manual: tick 2 trong 3 debts, nhập amount riêng → SUM khớp → submit OK
  - [ ] 11.6 Tạo phiếu thu Manual SUM lệch → nút "Xác nhận" disabled
  - [ ] 11.7 Nhập amount > totalRemaining → cảnh báo + submit bị chặn
  - [ ] 11.8 Click "Thu hết" → amount = totalRemaining, FIFO auto-fill toàn bộ
  - [ ] 11.9 In phiếu thu: nút "In phiếu thu" trong success dialog → window.print mở preview đúng layout
  - [ ] 11.10 Quay lại trang list, click vào phiếu vừa tạo → detail dialog hiển thị đúng allocations
  - [ ] 11.11 Filter theo KH + date range hoạt động
  - [ ] 11.12 Search escape: nhập "10%" không break UI
  - [ ] 11.13 Mobile responsive (< 768px): card list hiển thị đúng
  - [ ] 11.14 Audit log viewer hiển thị "Tạo phiếu thu nợ KH" với changes diff đầy đủ (allocations, debtBefore, debtAfter)
  - [ ] 11.15 Sau khi tạo phiếu thu, quay lại POS chọn cùng KH → DebtSummaryCard cập nhật nợ giảm đúng (verify cross-invalidation)

## Dev Notes

### Architecture alignment

- **Tech stack** (giống Story 5.1, 5.3, 4.5): Backend Hono 4.x + Drizzle ORM + PostgreSQL (Neon). Frontend React 19 + TanStack Router + TanStack Query 5 + Zustand + shadcn/ui + Tailwind 4. Shared package `@kiotviet-lite/shared` cho Zod + types + Drizzle tables.
- **Multi-tenant**: mọi query filter `store_id`. Service nhận `actor.storeId` từ auth middleware.
- **Currency**: integer VND, không floating. `bigint({ mode: 'number' })`.
- **Date**: `timestamp with time zone` ở DB, ISO 8601 ở API/JSON, format `vi-VN` ở UI qua date-fns.
- **Audit**: append-only, ghi tại service trong cùng transaction. Diff JSON đầy đủ context.
- **Soft delete**: KHÔNG áp dụng cho `receipts`, `receipt_allocations` (immutable).

### Naming conventions

- Component: PascalCase (`CreateReceiptDialog.tsx`)
- File feature: kebab-case (`create-receipt-dialog.tsx`, `receipts-manager.tsx`)
- Hook: `use-receipts.ts`
- Schema: kebab-case (`receipts.ts`, `receipt-allocations.ts`, `receipt-management.ts`)
- DB table: snake_case số nhiều (`receipts`, `receipt_allocations`)
- DB column: snake_case (`customer_id`, `created_by`, `created_at`)

### Backend Pattern Chi Tiết

**Lock order ngăn deadlock:**

```typescript
return db.transaction(async (tx) => {
  // 1. Lock customer FIRST (đảm bảo total debt không thay đổi giữa chừng)
  const [customer] = await tx
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.storeId, actor.storeId),
        isNull(customers.deletedAt),
      ),
    )
    .for('update')
  if (!customer) throw new ApiError('NOT_FOUND', 'Không tìm thấy khách hàng')

  // 2. Validate amount <= currentDebt
  const debtBefore = customer.currentDebt
  if (debtBefore <= 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Khách hàng không còn nợ')
  }
  if (input.amount > debtBefore) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Số tiền thu (${formatVnd(input.amount)}) vượt quá tổng nợ còn lại (${formatVnd(debtBefore)})`,
    )
  }

  // 3. Lock TẤT CẢ debts trong allocations (ORDER BY id để consistent lock order, tránh deadlock cross-transaction)
  const debtIds = input.allocations.map((a) => a.debtId).sort()
  const lockedDebts = await tx
    .select()
    .from(debts)
    .where(
      and(
        inArray(debts.id, debtIds),
        eq(debts.storeId, actor.storeId),
        eq(debts.customerId, input.customerId),
      ),
    )
    .for('update')

  // 4. Cross-check
  if (lockedDebts.length !== debtIds.length) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      'Một hoặc nhiều khoản nợ không hợp lệ (không tồn tại, đã tất toán, hoặc thuộc khách hàng khác)',
    )
  }
  const debtMap = new Map(lockedDebts.map((d) => [d.id, d]))
  for (const a of input.allocations) {
    const d = debtMap.get(a.debtId)!
    if (d.remaining <= 0) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', `Khoản nợ ${a.debtId} đã được tất toán`)
    }
    if (a.amount > d.remaining) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Số tiền phân bổ (${formatVnd(a.amount)}) vượt quá nợ còn lại của khoản nợ`,
      )
    }
  }

  // 5. Insert receipt
  const [receiptRow] = await tx
    .insert(receipts)
    .values({
      storeId: actor.storeId,
      customerId: input.customerId,
      amount: input.amount,
      note: input.note?.trim() || null,
      createdBy: actor.userId,
    })
    .returning({ id: receipts.id, createdAt: receipts.createdAt })

  // 6. Insert allocations batch
  await tx.insert(receiptAllocations).values(
    input.allocations.map((a) => ({
      receiptId: receiptRow.id,
      debtId: a.debtId,
      amount: a.amount,
    })),
  )

  // 7. Update từng debt (atomic SQL)
  for (const a of input.allocations) {
    await tx
      .update(debts)
      .set({
        paid: sql`${debts.paid} + ${a.amount}`,
        remaining: sql`${debts.remaining} - ${a.amount}`,
      })
      .where(eq(debts.id, a.debtId))
  }

  // 8. Update customer.current_debt
  const debtAfter = debtBefore - input.amount
  await tx
    .update(customers)
    .set({ currentDebt: sql`${customers.currentDebt} - ${input.amount}` })
    .where(eq(customers.id, input.customerId))

  // 9. Audit
  await logAction({
    db: tx as unknown as Db,
    storeId: actor.storeId,
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'receipt.created',
    targetType: 'receipt',
    targetId: receiptRow.id,
    changes: {
      customerId: input.customerId,
      customerName: customer.name,
      amount: input.amount,
      note: input.note?.trim() || null,
      allocationMode: input.allocationMode,
      allocationCount: input.allocations.length,
      debtBefore,
      debtAfter,
      allocations: input.allocations.map((a) => ({
        debtId: a.debtId,
        amount: a.amount,
      })),
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  })

  // 10. Log INFO
  logger.info(
    {
      storeId: actor.storeId,
      actorId: actor.userId,
      receiptId: receiptRow.id,
      customerId: input.customerId,
      customerName: customer.name,
      amount: input.amount,
      debtBefore,
      debtAfter,
      allocationMode: input.allocationMode,
      allocationCount: input.allocations.length,
    },
    'receipt.created',
  )

  // 11. Build & return ReceiptDetail
  // (load allocations + JOIN orderCode để trả về client)
  return await buildReceiptDetail(tx, actor.storeId, receiptRow.id, debtAfter)
})
```

**QUAN TRỌNG: Lock order rule:**

- Always lock `customers` BEFORE `debts` (consistent order toàn project, tránh deadlock với Story 5.1 createOrder).
- Lock `debts` theo thứ tự `id` ASC (sort `debtIds.sort()` trước khi `inArray`) để 2 transaction concurrent với cùng tập debts không lock chéo.

**Race condition matrix:**

| Concurrent operation                                         | Result                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 2 createReceipt cùng customer cùng debts                     | Lock customer FOR UPDATE → 2nd chờ; sau commit thì re-validate `amount <= currentDebt` mới                                     |
| createReceipt + createOrder (Story 5.1 ghi nợ) cùng customer | Cả 2 lock customer → serialize. Order phải hoàn thành trước (current_debt += debtAmount), Receipt sau (current_debt -= amount) |
| createReceipt với debt đã được tất toán bởi receipt khác     | Lock debts → re-read remaining; nếu `remaining < a.amount` → throw 422                                                         |

### Frontend Pattern Chi Tiết

**CreateReceiptDialog state machine:**

```
state = {
  customerId: string | null,
  amount: number,
  allocationMode: 'fifo' | 'manual',
  allocations: Map<debtId, amount>,
  note: string,
}

transitions:
- selectCustomer(id) → fetch openDebts → if amount > 0: re-compute allocations theo mode
- changeAmount(n) → if mode='fifo': allocations = computeFifoAllocation(openDebts, n)
                  → if mode='manual': giữ nguyên (user tự chỉnh)
- toggleMode(m) → if m='fifo': allocations = computeFifoAllocation(openDebts, amount)
                → if m='manual': allocations = empty (user tự build)
- toggleDebt(debtId, on) → if mode='manual': set/unset allocation
- changeAllocation(debtId, n) → if mode='manual': set allocation
- submit() → validate SUM === amount → POST → success dialog
```

**Critical edge cases UI:**

1. User chọn KH có nợ → đổi sang KH khác → reset allocations (KHÔNG keep stale)
2. User nhập amount → đổi mode FIFO ↔ Manual → reset allocations theo mode mới
3. User trong mode Manual nhấn "Thu hết" → switch sang FIFO + auto-fill (UX gợi ý)
4. Customer không có nợ (totalRemaining = 0) → disable tất cả input, hiển thị helper text "Khách hàng không còn nợ"
5. Allocations rỗng nhưng amount > 0 → disable submit
6. SUM allocations !== amount (mode Manual) → disable submit + counter đỏ

**Print template (HTML cơ bản, KHÔNG cần PDF library):**

```tsx
function ReceiptPrintTemplate({ receipt, store }: Props) {
  return (
    <div className="hidden print:block print:p-4 print:font-sans">
      <header className="text-center">
        <h1 className="text-lg font-bold">{store.name}</h1>
        <p className="text-xs">{store.address}</p>
        <p className="text-xs">SĐT: {store.phone}</p>
      </header>
      <h2 className="my-4 text-center text-xl font-bold">PHIẾU THU</h2>
      <div className="text-sm space-y-1">
        <p>Mã phiếu: {receipt.id.slice(-8).toUpperCase()}</p>
        <p>Ngày: {format(new Date(receipt.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}</p>
        <p>Khách hàng: {receipt.customerName}</p>
        <p>SĐT: {receipt.customerPhone}</p>
      </div>
      <table className="my-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-1 text-left">Mã đơn</th>
            <th className="border p-1 text-right">Nợ trước</th>
            <th className="border p-1 text-right">Phân bổ</th>
            <th className="border p-1 text-right">Nợ sau</th>
          </tr>
        </thead>
        <tbody>
          {receipt.allocations.map((a) => (
            <tr key={a.id}>
              <td className="border p-1">{a.orderCode}</td>
              <td className="border p-1 text-right">
                {formatVnd(a.amount + (a.debtRemainingAfter ?? 0))}
              </td>
              <td className="border p-1 text-right">{formatVnd(a.amount)}</td>
              <td className="border p-1 text-right">{formatVnd(a.debtRemainingAfter ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-base font-bold">Tổng thu: {formatVnd(receipt.amount)}đ</p>
      {receipt.debtAfter !== null && (
        <p className="text-right text-sm">Nợ còn lại: {formatVnd(receipt.debtAfter)}đ</p>
      )}
      {receipt.note && <p className="mt-2 text-sm">Ghi chú: {receipt.note}</p>}
      <p className="mt-2 text-sm">Người thu: {receipt.createdByName ?? '—'}</p>
      <div className="mt-8 flex justify-around text-sm">
        <div className="text-center">
          <p>Khách hàng</p>
          <p className="mt-12 italic">(ký, họ tên)</p>
        </div>
        <div className="text-center">
          <p>Người thu</p>
          <p className="mt-12 italic">(ký, họ tên)</p>
        </div>
      </div>
    </div>
  )
}
```

CSS print rule trong file global:

```css
@media print {
  body * {
    visibility: hidden;
  }
  .print\:block,
  .print\:block * {
    visibility: visible;
  }
  .print\:block {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
```

### Pattern Reuse (BẮT BUỘC)

| Cần dùng                                   | File nguồn                                                  | Ghi chú                                       |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| `createSupplierPayment` pattern            | `apps/api/src/services/supplier-payments.service.ts`        | Template cho service createReceipt            |
| `supplierPayments` schema pattern          | `packages/shared/src/schema/supplier-payments.ts`           | Template cho receipts schema                  |
| `supplier-payment-management.ts`           | `packages/shared/src/schema/supplier-payment-management.ts` | Template Zod schemas                          |
| `supplier-payments.routes.ts`              | `apps/api/src/routes/supplier-payments.routes.ts`           | Template route factory + middleware           |
| `CurrencyInput`                            | `apps/web/src/components/shared/currency-input.tsx`         | Input số tiền                                 |
| `formatVnd`, `formatVndWithSuffix`         | `apps/web/src/lib/currency.ts`                              | Format số tiền                                |
| `Pagination`                               | `apps/web/src/components/shared/pagination.tsx`             | Pagination component                          |
| `EmptyState`                               | `apps/web/src/components/shared/empty-state.tsx`            | Empty state                                   |
| `useDebounced`                             | `apps/web/src/hooks/use-debounced.ts`                       | Debounce search input                         |
| `useCustomersQuery`                        | `apps/web/src/features/customers/use-customers.ts`          | Search KH (hasDebt: 'yes')                    |
| `escapeLikePattern`                        | `apps/api/src/lib/strings.ts`                               | Escape wildcard cho LIKE                      |
| `parseJson`                                | `apps/api/src/lib/http.js`                                  | Parse + validate Zod                          |
| `ApiError`                                 | `apps/api/src/lib/errors.ts`                                | Throw NOT_FOUND, BUSINESS_RULE_VIOLATION      |
| `logAction`, `getRequestMeta`              | `apps/api/src/services/audit.service.ts`                    | Audit log                                     |
| `requireAuth`, `requirePermission`         | `apps/api/src/middleware/`                                  | Middleware                                    |
| `customers` table                          | `packages/shared/src/schema/customers.ts`                   | FK target, currentDebt column                 |
| `debts` table                              | `packages/shared/src/schema/debts.ts`                       | FK target, paid/remaining columns             |
| `orders` table                             | `packages/shared/src/schema/orders.ts`                      | LEFT JOIN orderCode                           |
| `Dialog` shadcn                            | `apps/web/src/components/ui/dialog.tsx`                     | DialogContent, DialogTitle, DialogDescription |
| `Button`, `Input`, `Textarea`, `Select`    | `apps/web/src/components/ui/*`                              | shadcn primitives                             |
| `Table`                                    | `apps/web/src/components/ui/table.tsx`                      | Table desktop                                 |
| `Checkbox`, `RadioGroup`                   | `apps/web/src/components/ui/`                               | Manual mode toggles                           |
| `useAuthStore`                             | `apps/web/src/stores/use-auth-store.ts`                     | Đọc role nếu cần                              |
| `ApiClientError`, `apiClient`              | `apps/web/src/lib/api-client.ts`                            | Fetch wrapper                                 |
| `showSuccess`, `showError`                 | `apps/web/src/lib/toast.ts`                                 | Toast                                         |
| `handleApiError`, `asFormSetError` pattern | reused inline (xem `create-supplier-payment-dialog.tsx`)    | Form error handling                           |

### KHÔNG được làm

- KHÔNG cho phép sửa/xoá phiếu thu đã tạo (immutable)
- KHÔNG implement endpoint PATCH/DELETE `/api/v1/receipts/:id`
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG cho `amount > customer.currentDebt` (validate BE + FE)
- KHÔNG cho `amount = 0` hoặc âm
- KHÔNG cho phép `allocations` rỗng (must >= 1)
- KHÔNG cho `SUM(allocations) !== amount` (Zod refine + service re-check)
- KHÔNG cho duplicate debtId trong allocations (Zod refine)
- KHÔNG cho phân bổ vào debt không thuộc đúng customer (cross-customer attack)
- KHÔNG cho phân bổ vào debt đã `remaining = 0` (đã tất toán)
- KHÔNG cho `allocation.amount > debt.remaining` (race condition check sau lock)
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho amount. Dùng `bigint` integer VND
- KHÔNG dùng floating point arithmetic
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG bypass SELECT FOR UPDATE customer + debts (race condition critical)
- KHÔNG quên sort `debtIds.sort()` trước `inArray` để consistent lock order (deadlock prevention)
- KHÔNG quên invalidate `['customer-debt', customerId]` sau success (Story 5.1 POS query refresh)
- KHÔNG quên invalidate `['customers']` (current_debt thay đổi → list update)
- KHÔNG tạo permission mới (`receipt.create`, `receipt.view`). Reuse `customers.manage`
- KHÔNG cho Staff tạo phiếu thu (middleware đã chặn `customers.manage` không có Staff)
- KHÔNG dùng search query có `LIKE '%${input}%'` mà KHÔNG escape wildcard
- KHÔNG quên `key={...}` khi cần force remount dialog (fix M13)
- KHÔNG quên Zod `.refine` cross-field
- KHÔNG để message Zod/toast/label tiếng Việt KHÔNG DẤU (regression F7 Story 4.4b)
- KHÔNG cho phép tạo phiếu thu cho KH đã soft delete
- KHÔNG ghi `customer.debt_changed` audit riêng cho mỗi receipt (audit `receipt.created` đã chứa diff debt; tránh double audit, pattern Story 5.3)
- KHÔNG nest transaction
- KHÔNG implement endpoint print riêng nếu không cần (in dùng client-side window.print)
- KHÔNG để allocations trên detail unsorted (sort theo debt.created_at ASC để hiển thị đúng FIFO order)
- KHÔNG quên handle orphan customer (LEFT JOIN, không filter deleted_at trên list)

### Bài học từ Stories trước (PHẢI tuân thủ)

1. **Integer VND** (Story 5.1, 5.3): `bigint({ mode: 'number' })`. Không float.
2. **SELECT FOR UPDATE** (Story 5.1, 5.3): Lock customer + lock debts trước khi update. Sort debtIds để consistent lock order.
3. **Atomic SQL update** (Story 5.1, 5.3): `currentDebt: sql\`\${customers.currentDebt} - \${amount}\`` (không read-then-write).
4. **DialogDescription bắt buộc**: Mọi Dialog PHẢI có DialogDescription (có thể sr-only).
5. **Form remount** (M13 Story 4.1): `key={...}` khi cần force reset.
6. **Route order Hono** (Story 5.1): Literal trước param. `/customer-debts/:customerId` mount TRƯỚC `/:id`.
7. **Tiếng Việt có dấu** (F7 Story 4.4b, M11 Story 5.1): MỌI message PHẢI có dấu đầy đủ.
8. **Multi-tenant defense in depth** (mọi story): Không trust input, luôn filter `store_id` từ `actor`.
9. **Audit log đầy đủ context** (Story 5.3): `changes` chứa snapshot tên + before/after để debug.
10. **Pagination v5 TanStack Query** (Story 5.3): `placeholderData: keepPreviousData`.
11. **LIKE escape** (M1 Story 6.1): `escapeLikePattern` cho mọi search input.
12. **Cleanup PinDialog state** (CRIT-4 Story 5-1): KHÔNG có PinDialog ở Story 5.2 (không cần PIN cho phiếu thu vì không có hạn mức), nhưng pattern cleanup state khi dialog đóng vẫn áp dụng cho create-receipt-dialog.
13. **`for('update')` Drizzle** (Story 5.3): `.for('update')` giữ row lock đến hết transaction.
14. **Defense backend cho FE flag** (CRIT-1, SF-1 Story 5-1): KHÔNG trust client compute. Server PHẢI re-validate SUM, debt ownership, amount cap.

### Coupling với các stories khác

**Story 5.1 (done):**

- Tạo bảng `debts` với index FIFO `idx_debts_store_customer (storeId, customerId, createdAt ASC)` cho Story 5.2 dùng.
- Endpoint POS `GET /api/v1/pos/customer-debt/:customerId` trả tổng `currentDebt` + `effectiveDebtLimit`. Story 5.2 query key `['customer-debt', customerId]` PHẢI invalidate sau receipt create để POS refresh.
- Audit action enum: 5.2 thêm `'receipt.created'`, `'receipt.printed'`. Tách rõ với 5.1's `'debt.created'`, `'debt.limit_overridden'`.

**Story 4.1 (done):**

- `customers.current_debt` cột đã có. Story 5.2 UPDATE giảm.
- `useCustomersQuery({ hasDebt: 'yes' })` có sẵn, dùng cho dialog search KH.
- `customerDebtsResponseSchema` hiện trả `items: []` (chưa hook bảng debts). Story 5.2 KHÔNG bắt buộc fix endpoint `/customers/:id/debts` (giữ items rỗng), thay vào đó tạo endpoint mới `/receipts/customer-debts/:customerId`. Lý do: tránh đụng chạm scope Story 4.1; nếu sau này muốn nhất quán có thể merge ở Story 5.5.

**Story 5.3 (done):**

- Pattern service + route + UI 100% tương đồng. Clone toàn bộ structure.
- Khác biệt: Story 5.3 chỉ Owner; Story 5.2 cả Owner + Manager.
- Khác biệt: Story 5.3 amount đơn giản; Story 5.2 thêm allocations array (phức tạp hơn).

**Story 5.4 (future — Điều chỉnh nợ thủ công):**

- Sẽ điều chỉnh `customers.current_debt` trực tiếp + ghi `debt_adjustments`. KHÔNG đụng `receipts`.
- 5.4 có thể tạo bảng debt_adjustments để fix sai sót phiếu thu (alternative cho immutable).

**Story 5.5 (future — Cảnh báo + Báo cáo công nợ):**

- Sẽ aggregate `receipts` + `supplier_payments` + `debts` để hiển thị sổ quỹ + báo cáo tuổi nợ.
- Index `idx_receipts_store_created` đủ tốt cho aggregate Story 5.5.

**Story 7.3 (future — In hoá đơn):**

- Sẽ có template thermal printer chung. Story 5.2 dùng template HTML đơn giản tự build, sau này có thể migrate sang shared print component.

### Validation đặc biệt

**Số tiền (`amount`):**

- Integer VND, > 0
- ≤ `customer.currentDebt` tại thời điểm tạo (re-check trong transaction sau SELECT FOR UPDATE customer)
- Edge case `currentDebt = 0` → 422 với message "Khách hàng không còn nợ"

**Allocations:**

- Array, min 1 phần tử
- Mỗi `allocation.amount > 0`, `<= debt.remaining`
- Mỗi `allocation.debtId` thuộc đúng customer + store
- Không có duplicate `debtId`
- `SUM(allocations.amount) === amount` (Zod refine + service re-check)

**Note:**

- Optional, trim, max 500 ký tự
- Cho phép tiếng Việt có dấu

**Permission check:**

- Layer 1: middleware `requirePermission('customers.manage')` chặn Staff
- Layer 2: route handler không cần inline check (cả Owner + Manager đều OK)
- Layer 3: service không cần re-check role (khác Story 5.3)

**Race condition:**

- `db.select().from(customers).where(...).for('update')` lock customer
- `db.select().from(debts).where(inArray(debts.id, sortedDebtIds)).for('update')` lock debts
- Sort `debtIds` ASC trước `inArray` để consistent lock order across concurrent transactions (deadlock prevention)
- 2 createReceipt cùng customer concurrent: 2nd chờ commit của 1st, sau đó re-validate

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG tạo bảng `customer_payments` thay vì `receipts` (đặt tên theo epic)
- KHÔNG dùng FIFO ENFORCED ở backend (khách có thể chọn manual phân bổ vào debt giữa); FIFO chỉ là gợi ý/default ở frontend
- KHÔNG tạo audit `customer.debt_changed` cho mỗi receipt (đã có `receipt.created` chứa diff)
- KHÔNG ghi log debt-by-debt (chỉ 1 log INFO `receipt.created` cho cả batch)
- KHÔNG tạo endpoint `/api/v1/receipts/:id/print` riêng (in client-side, không cần audit)
- KHÔNG hard-code mã phiếu format. Dùng `id.slice(-8)` cho đơn giản
- KHÔNG implement preview API riêng. Frontend tự compute FIFO (đã có `computeFifoAllocation`)
- KHÔNG để frontend gửi `paid` hoặc `remaining` của debt. Backend tự tính sau update
- KHÔNG giữ `allocations` array trong cache khi user đổi customer (reset)
- KHÔNG cho Staff bypass middleware (test verify)
- KHÔNG migrate dữ liệu từ debts hiện có (story này chỉ tạo bảng mới, debts data từ Story 5.1 đã có sẵn)

### Project Structure Notes

**Files TẠO MỚI:**

```
packages/shared/src/schema/
├── receipts.ts                          (Drizzle table)
├── receipt-allocations.ts               (Drizzle table)
├── receipt-management.ts                (Zod schemas + types)
└── receipt-management.test.ts           (15+ test cases)

apps/api/src/db/migrations/
└── 0024_*.sql                           (auto-generated)

apps/api/src/services/
├── receipts.service.ts
└── receipts.service.test.ts             (20+ cases)

apps/api/src/routes/
└── receipts.routes.ts

apps/api/src/__tests__/
└── receipts.integration.test.ts         (18+ cases)

apps/web/src/features/receipts/
├── receipts-api.ts
├── use-receipts.ts
├── utils.ts                             (computeFifoAllocation)
├── utils.test.ts                        (8+ cases)
├── receipts-manager.tsx
├── receipts-filters.tsx
├── receipts-table.tsx
├── receipts-card-list.tsx
├── create-receipt-dialog.tsx
├── receipt-success-dialog.tsx
├── receipt-detail-dialog.tsx
└── receipt-print-template.tsx

apps/web/src/pages/
└── receipts-page.tsx
```

**Files SỬA:**

```
packages/shared/src/schema/
├── index.ts                             (export receipts, receipt-allocations, receipt-management)
└── audit-log.ts                         (thêm receipt.created, receipt.printed)

apps/api/src/
└── index.ts                             (import + mount /api/v1/receipts)

apps/web/src/
├── router.tsx                           (thêm receiptsRoute)
└── components/layout/nav-items.ts       (thêm entry "Phiếu thu" + icon HandCoins)

apps/web/src/features/audit/
└── action-labels.ts                     (thêm 2 labels + group "Phiếu thu")
```

### Permission matrix

| Permission         | Owner | Manager | Staff | Resource                             |
| ------------------ | ----- | ------- | ----- | ------------------------------------ |
| `customers.manage` | ✅    | ✅      | ❌    | List + Get + Create + Customer-debts |

KHÔNG có permission mới. Reuse `customers.manage` đã có từ Story 4.1.

### Latest tech notes

- **Drizzle FOR UPDATE batch**: `.for('update')` áp dụng cho cả `inArray(...)` query — tất cả rows match đều bị lock đến hết transaction.
- **Sort lock order**: Khi lock nhiều rows cùng table, sort `id` ASC để mọi transaction lock theo cùng thứ tự, tránh deadlock cross-transaction.
- **TanStack Query v5 invalidation chéo**: `qc.invalidateQueries({ queryKey: ['customer-debt', customerId] })` dùng partial match — invalidate được cả `['customer-debt', customerId]` (Story 5.1) và `['customers', 'detail', customerId]` (Story 4.2) cùng lúc nếu cấu trúc key consistent.
- **Print CSS**: `@media print { ... }` + class Tailwind `print:block`, `print:hidden`. Test bằng Chrome DevTools "Emulate print" mode.
- **window.print()**: Fire-and-forget, không có callback success. Pattern: render template ẩn, gọi `window.print()`, reset state sau timeout 1s nếu cần.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-qun-l-cng-n.md#Story 5.2]
- [Source: _bmad-output/implementation-artifacts/5-1-ghi-no-trong-pos-kiem-tra-han-muc.md] (debts table + idx_debts_store_customer FIFO)
- [Source: _bmad-output/implementation-artifacts/5-3-phieu-chi-tra-no-ncc.md] (template service + route + UI; immutable pattern)
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md] (customers.currentDebt + useCustomersQuery hasDebt)
- [Source: _bmad-output/implementation-artifacts/3-3-thanh-toan-hoan-thanh-don-hang.md] (orders.code pattern)
- [Source: packages/shared/src/schema/debts.ts] (FK target, paid/remaining)
- [Source: packages/shared/src/schema/customers.ts] (currentDebt, deletedAt)
- [Source: packages/shared/src/schema/orders.ts] (orderCode JOIN)
- [Source: packages/shared/src/schema/supplier-payments.ts] (template Drizzle table)
- [Source: packages/shared/src/schema/supplier-payment-management.ts] (template Zod schemas)
- [Source: packages/shared/src/schema/audit-log.ts] (auditActionSchema enum)
- [Source: packages/shared/src/constants/permissions.ts] (customers.manage reuse)
- [Source: apps/api/src/services/supplier-payments.service.ts] (template service createSupplierPayment + listSupplierPayments)
- [Source: apps/api/src/services/orders.service.ts:380-450] (pattern createOrder transaction + SELECT FOR UPDATE customer + debt logic)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature)
- [Source: apps/api/src/routes/supplier-payments.routes.ts] (template factory route)
- [Source: apps/api/src/routes/pos.routes.ts:67-77] (pattern customer-debt endpoint literal trước :id)
- [Source: apps/api/src/middleware/rbac.middleware.ts] (requirePermission)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern)
- [Source: apps/api/src/lib/http.js] (parseJson)
- [Source: apps/api/src/lib/errors.ts] (ApiError)
- [Source: apps/api/src/index.ts:62-79] (mount route alphabetical)
- [Source: apps/web/src/router.tsx] (createRoute pattern)
- [Source: apps/web/src/components/layout/nav-items.ts] (NAV_ITEMS pattern)
- [Source: apps/web/src/features/audit/action-labels.ts] (ACTION_LABELS + ACTION_GROUPS)
- [Source: apps/web/src/features/supplier-payments/create-supplier-payment-dialog.tsx] (template Dialog + RHF + zodResolver + handleApiError)
- [Source: apps/web/src/features/supplier-payments/supplier-payments-manager.tsx] (template manager component)
- [Source: apps/web/src/features/supplier-payments/use-supplier-payments.ts] (template TanStack Query hooks)
- [Source: apps/web/src/features/customers/use-customers.ts] (useCustomersQuery hasDebt)
- [Source: apps/web/src/components/shared/currency-input.tsx, empty-state.tsx, pagination.tsx] (reuse)
- [Source: apps/web/src/lib/currency.ts] (formatVnd, formatVndWithSuffix)
- [Source: apps/web/src/hooks/use-debounced.ts] (debounce search)
- [Web: Drizzle FOR UPDATE](https://orm.drizzle.team/docs/select#for-update)
- [Web: PostgreSQL FOR UPDATE](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Web: TanStack Query v5 placeholderData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)
- [Web: shadcn/ui Dialog Controlled](https://ui.shadcn.com/docs/components/dialog)
- [Web: window.print() MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)
- [Web: CSS @media print](https://developer.mozilla.org/en-US/docs/Web/CSS/@media)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

### Change Log

- 2026-05-02: Story 5-2 spec tạo ra (17 ACs, 11 tasks). Status: ready-for-dev.
