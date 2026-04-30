# Story 5.3: Phiếu chi trả nợ NCC

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a chủ cửa hàng,
I want tạo phiếu chi để thanh toán nợ cho nhà cung cấp và xem lịch sử các phiếu chi đã tạo,
so that kiểm soát được công nợ phải trả NCC, có audit trail mọi lần chi trả, và đối chiếu được số tiền đã thanh toán cho từng NCC.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `supplier_payments` + migration

**Given** hệ thống đã có `stores` (Story 1.1), `users` (Story 1.4), `suppliers` (Story 6.1) với cột `current_debt` đang theo dõi nợ phải trả NCC, `audit_logs` (Story 1.4) và migration framework Drizzle

**When** chạy migration mới của story 5.3

**Then** tạo bảng `supplier_payments`:

| Column        | Type                       | Ràng buộc                                        |
| ------------- | -------------------------- | ------------------------------------------------ |
| `id`          | `uuid`                     | PK, default `uuidv7()`                           |
| `store_id`    | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT    |
| `supplier_id` | `uuid`                     | NOT NULL, FK → `suppliers.id` ON DELETE RESTRICT |
| `amount`      | `bigint` mode 'number'     | NOT NULL, > 0 (integer VND, số tiền chi trả)     |
| `note`        | `varchar(500)`             | NULLABLE (ghi chú phiếu chi)                     |
| `created_by`  | `uuid`                     | NOT NULL, FK → `users.id` ON DELETE RESTRICT     |
| `created_at`  | `timestamp with time zone` | NOT NULL, default `now()`                        |

**And** indexes:

- `idx_supplier_payments_store_created` ON `(store_id, created_at DESC)` cho list query mặc định
- `idx_supplier_payments_store_supplier` ON `(store_id, supplier_id, created_at DESC)` cho filter theo NCC kèm sort theo ngày
- `idx_supplier_payments_store_creator` ON `(store_id, created_by)` cho filter theo người tạo (báo cáo người tạo phiếu chi)

**And** ràng buộc enforce ở service layer (không CHECK constraint cấp DB để đơn giản):

- `amount > 0` (Zod min(1) + service validate)
- `amount <= supplier.current_debt` (chi không được vượt nợ thực tế, BUSINESS_RULE_VIOLATION)

**And** KHÔNG có cột `deleted_at`. Phiếu chi là chứng từ tài chính append-only, KHÔNG cho sửa/xoá sau khi tạo. Pattern giống `purchase_orders` (Story 6.1) immutable. Sai sót → tạo phiếu điều chỉnh ngược (đợi story future) hoặc thông qua audit log.

**And** KHÔNG đụng vào `suppliers` (chỉ UPDATE `current_debt` trong service, không thay đổi schema), KHÔNG đụng `purchase_orders` (story 5.3 KHÔNG allocate FIFO theo phiếu nhập, chỉ giảm tổng `supplier.current_debt`).

### AC2: Permission `inventory.manage` reuse + audit action mới

**Given** ma trận `PERMISSIONS` hiện tại (`packages/shared/src/constants/permissions.ts`) đã có `inventory.manage: ['owner', 'manager']` từ Story 6.1

**When** Story 5.3 thêm endpoint phiếu chi

**Then** **KHÔNG tạo permission mới**. Reuse `inventory.manage` cho list/get phiếu chi (cả Owner và Manager xem được). NHƯNG endpoint **POST tạo phiếu chi CHỈ Owner** mới gọi được, enforce ở route bằng kiểm tra `c.get('auth').role === 'owner'` (hard-coded check, KHÔNG tạo permission `supplier_payment.create` riêng) — lý do: epic story 5.3 ghi rõ "chỉ chủ cửa hàng (owner) mới có quyền tạo phiếu chi", giảm scope mở rộng PERMISSIONS.

**And** service `createSupplierPayment` cũng tự kiểm tra `actor.role === 'owner'`, throw `FORBIDDEN` "Chỉ chủ cửa hàng mới được tạo phiếu chi" nếu không phải. Defense in depth.

**And** thêm 1 audit action vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`):

- `'supplier_payment.created'`

KHÔNG thêm `supplier_payment.updated/deleted` vì phiếu chi immutable (AC1). KHÔNG thêm `supplier.debt_changed` mới (đã tồn tại trong schema từ Story 6.1) — story 5.3 cũng KHÔNG ghi `supplier.debt_changed` riêng cho mỗi phiếu chi vì action `supplier_payment.created` đã chứa diff debt. Tránh double audit.

**And** cập nhật `apps/web/src/features/audit/action-labels.ts`:

- Thêm cặp `'supplier_payment.created': 'Tạo phiếu chi trả NCC'`
- Thêm vào group `'Nhập hàng'` (group đã có từ Story 6.1) — bổ sung action `'supplier_payment.created'` vào `actions` array của group này, KHÔNG tạo group mới.

### AC3: Tạo phiếu chi (POST /api/v1/supplier-payments)

**Given** Owner đã đăng nhập (role = 'owner', có permission `inventory.manage`)

**When** gọi `POST /api/v1/supplier-payments` với body:

```json
{
  "supplierId": "<uuid>",
  "amount": 500000,
  "note": "Chi trả nợ tháng 4 cho NCC ABC"
}
```

**Then** API validate qua `createSupplierPaymentSchema` (Zod) tại `packages/shared/src/schema/supplier-payment-management.ts`:

- `supplierId`: `z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' })`
- `amount`: `z.number().int('Số tiền phải là số nguyên').min(1, 'Số tiền phải lớn hơn 0').max(99_999_999_999_999, 'Số tiền vượt giới hạn')`
- `note`: `z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').nullable().optional()`
- `.strict()` loại bỏ field lạ

**And** service `createSupplierPayment({ db, actor, input, meta })`:

1. Validate `actor.role === 'owner'` → nếu không → 403 FORBIDDEN "Chỉ chủ cửa hàng mới được tạo phiếu chi"
2. Mở `db.transaction(async (tx) => { ... })`
3. SELECT supplier với lock `.for('update')` (ngăn race condition khi 2 phiếu chi cùng lúc): WHERE `id = supplierId AND store_id = actor.storeId AND deleted_at IS NULL`
4. Nếu không tìm thấy → 404 "Không tìm thấy nhà cung cấp"
5. Lấy `debtBefore = Number(supplier.currentDebt)`
6. Validate `input.amount <= debtBefore` → nếu không → 422 BUSINESS_RULE_VIOLATION với message: `Số tiền chi (${formatVnd(amount)}) vượt quá nợ phải trả NCC hiện tại (${formatVnd(debtBefore)})`. KHÔNG cho phép chi quá nợ. Edge case `debtBefore === 0` → 422 "Nhà cung cấp này không còn nợ phải trả"
7. Insert row vào `supplier_payments`:
   ```ts
   tx.insert(supplierPayments)
     .values({
       storeId: actor.storeId,
       supplierId: input.supplierId,
       amount: input.amount,
       note: input.note ?? null,
       createdBy: actor.userId,
     })
     .returning({ id: supplierPayments.id })
   ```
8. Update `suppliers.current_debt = current_debt - amount` (atomic trong cùng transaction): `currentDebt: sql`${suppliers.currentDebt} - ${input.amount}``
9. Ghi audit `action='supplier_payment.created'`, `targetType='supplier_payment'`, `targetId=<paymentId>`, `changes`:
   ```json
   {
     "supplierId": "<uuid>",
     "supplierName": "<snapshot>",
     "amount": 500000,
     "note": "...",
     "debtBefore": 1000000,
     "debtAfter": 500000
   }
   ```
10. Trả 201 với envelope `{ data: SupplierPaymentDetail }`

**And** `SupplierPaymentDetail` chứa: `id`, `supplierId`, `supplierName`, `supplierPhone`, `amount`, `note`, `createdBy` (uuid), `createdByName` (string nullable, JOIN `users.name`), `debtAfter` (computed = supplier.currentDebt sau khi update), `createdAt` (ISO string).

**And** mọi bước trên trong CÙNG database transaction. Fail bất kỳ step nào → rollback toàn bộ (insert payment, update supplier debt, audit log).

### AC4: Liệt kê phiếu chi (GET /api/v1/supplier-payments)

**Given** Owner/Manager xem trang phiếu chi (cả 2 role đều list được, chỉ Owner mới tạo được)

**When** gọi `GET /api/v1/supplier-payments?page=1&pageSize=20&supplierId=&fromDate=&toDate=&search=`

**Then** API validate qua `listSupplierPaymentsQuerySchema`:

- `page`: `z.coerce.number().int().min(1).default(1)`
- `pageSize`: `z.coerce.number().int().min(1).max(100).default(20)`
- `supplierId`: `z.string().uuid().optional()` (filter theo NCC cụ thể)
- `fromDate`: `z.string().datetime().optional()` (ISO 8601, lọc `created_at >= fromDate`)
- `toDate`: `z.string().datetime().optional()` (lọc `created_at <= toDate`)
- `search`: `z.string().trim().optional()` (search theo `supplier.name` HOẶC `note`, escape wildcard `%`/`_` qua `escapeLikePattern` từ `apps/api/src/lib/strings.ts`)
- `.refine` cross-field: nếu cả `fromDate` và `toDate` đều có → `toDate >= fromDate`, message "Ngày kết thúc phải sau ngày bắt đầu"

**And** service `listSupplierPayments({ db, storeId, query })`:

- WHERE chặt: `supplier_payments.store_id = actor.storeId`
- LEFT JOIN `suppliers` lấy `supplier.name`, `supplier.phone` (KHÔNG filter `suppliers.deleted_at IS NULL` — phiếu chi vẫn phải hiển thị dù NCC đã bị xoá mềm sau đó; UI hiển thị "(đã xoá)" nếu cần — orphan handling pattern Story 4.4b)
- LEFT JOIN `users` lấy `users.name` AS `createdByName`
- Apply filter `supplierId`, `fromDate`, `toDate`
- Apply `search`: `LOWER(suppliers.name) LIKE LOWER(${pattern}) OR LOWER(supplier_payments.note) LIKE LOWER(${pattern})` với `pattern = '%' + escapeLikePattern(search) + '%'`
- Sort mặc định: `(created_at DESC, id DESC)` (deterministic tie-break theo uuidv7 sortable)
- Pagination chuẩn: `LIMIT pageSize OFFSET (page-1)*pageSize`, đếm `count(*)::int` query riêng
- Trả `{ data: SupplierPaymentListItem[], meta: { page, pageSize, total, totalPages } }`

**And** `SupplierPaymentListItem` chứa: `id`, `supplierId`, `supplierName`, `supplierPhone`, `amount`, `note`, `createdBy`, `createdByName`, `createdAt`.

### AC5: Xem chi tiết phiếu chi (GET /api/v1/supplier-payments/:id)

**Given** Owner/Manager click vào 1 phiếu chi để xem chi tiết

**When** gọi `GET /api/v1/supplier-payments/:id`

**Then** validate `:id` qua `z.string().uuid('ID không hợp lệ')`

**And** service `getSupplierPayment({ db, storeId, targetId })`:

- SELECT FROM `supplier_payments` WHERE `id = targetId AND store_id = actor.storeId`
- LEFT JOIN `suppliers` lấy `supplierName`, `supplierPhone`
- LEFT JOIN `users` lấy `createdByName`
- Nếu không tìm thấy → 404 "Không tìm thấy phiếu chi"
- KHÔNG trả `debtAfter` ở GET detail (chỉ POST mới có vì đó là snapshot tại thời điểm tạo). GET detail trả `SupplierPaymentDetail` minus `debtAfter`, hoặc tách type riêng `SupplierPaymentDetail` (full) vs `SupplierPaymentResponse` (POST response có debtAfter). Quyết định: dùng cùng schema, `debtAfter` optional/nullable trong type, GET trả `null`.

### AC6: KHÔNG có endpoint sửa/xoá phiếu chi

**Given** phiếu chi đã tạo

**When** dev cố tình thử các method PATCH/PUT/DELETE trên `/api/v1/supplier-payments/:id`

**Then** route handler KHÔNG mount các method này, Hono trả 405 Method Not Allowed (default behavior). KHÔNG implement endpoint sửa/xoá ở story 5.3.

**And** lý do business: phiếu chi là chứng từ tài chính, audit phải bất biến. Sai sót → ghi note "phiếu nhầm, đã thay thế bằng phiếu X" hoặc cơ chế phiếu điều chỉnh sẽ làm ở Story 5.4 (Điều chỉnh nợ thủ công, áp dụng cho công nợ KH; với nợ NCC, hiện story 5.3 KHÔNG có flow điều chỉnh ngược — flag là gap acceptable cho MVP, ghi rõ trong Anti-patterns).

### AC7: Routes mount + middleware

**Given** Hono router hiện đang mount `/api/v1/suppliers` và `/api/v1/purchase-orders` (Story 6.1)

**When** thêm route mới

**Then** tạo `apps/api/src/routes/supplier-payments.routes.ts` theo pattern `suppliers.routes.ts`:

- `GET /` → `listSupplierPayments`
- `GET /:id` → `getSupplierPayment`
- `POST /` → `createSupplierPayment` (chỉ Owner, kiểm tra trong handler)
- KHÔNG mount PATCH/DELETE
- Middleware: `requireAuth` + `requirePermission('inventory.manage')` toàn bộ route
- Hono factory `createSupplierPaymentsRoutes({ db })`
- POST handler thêm guard inline:
  ```ts
  app.post('/', async (c) => {
    const auth = c.get('auth')
    if (auth.role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được tạo phiếu chi')
    }
    const input = await parseJson(c, createSupplierPaymentSchema)
    const data = await createSupplierPayment({ db, actor: auth, input, meta: getRequestMeta(c) })
    return c.json({ data }, 201)
  })
  ```

**And** mount vào `apps/api/src/index.ts` SAU `/api/v1/purchase-orders`:

```typescript
app.route('/api/v1/supplier-payments', createSupplierPaymentsRoutes({ db }))
```

**And** import factory ở top file index.ts theo alphabetical order (giữa `createStockChecksRoutes` và `createStoreRoutes`).

### AC8: UI page phiếu chi `/inventory/supplier-payments`

**Given** Story 6.1 đã có sidebar group "Nhập hàng" (NAV_ITEMS) với 3 entries: Nhà cung cấp, Phiếu nhập kho, Kiểm kho

**When** Story 5.3 thêm trang phiếu chi

**Then** thêm 1 entry vào `apps/web/src/components/layout/nav-items.ts`:

```ts
{
  path: '/inventory/supplier-payments',
  label: 'Phiếu chi NCC',
  icon: Wallet,
  requiredPermission: 'inventory.manage',
}
```

Đặt sau entry `/inventory/purchase-orders`. Icon `Wallet` từ `lucide-react` (đã có trong dependencies).

**And** thêm route trong `apps/web/src/router.tsx`:

```ts
const inventorySupplierPaymentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/inventory/supplier-payments',
  beforeLoad: requirePermissionGuard('inventory.manage'),
  component: SupplierPaymentsPage,
})
```

Mount vào `appLayoutRoute.addChildren([...])` sau `inventoryPurchaseOrderDetailRoute`.

**And** tạo `apps/web/src/pages/supplier-payments-page.tsx`:

```tsx
export function SupplierPaymentsPage() {
  return <SupplierPaymentsManager />
}
```

**And** tạo `apps/web/src/features/supplier-payments/supplier-payments-manager.tsx`:

- Header:
  - Title: "Phiếu chi trả nợ NCC"
  - Description: "Quản lý phiếu chi thanh toán công nợ phải trả nhà cung cấp"
- Toolbar:
  - Nút Primary "Tạo phiếu chi" (icon `Plus`) → mở `<CreateSupplierPaymentDialog>`. Nút này CHỈ render khi `user.role === 'owner'` (đọc từ `useAuthStore`). Manager không thấy nút.
- Filters component `<SupplierPaymentsFilters>`:
  - Input search (debounce 300ms, placeholder "Tìm theo tên NCC hoặc ghi chú")
  - Select supplier (load `useSuppliersQuery({ pageSize: 200, hasDebt: 'all' })`, default "Tất cả NCC")
  - DateRangePicker (fromDate, toDate, default rỗng = không filter)
- Body desktop ≥ 768px: `<SupplierPaymentsTable>` cột:
  - Ngày tạo (format `dd/MM/yyyy HH:mm` qua date-fns vi locale)
  - NCC (tên + phone bên dưới subdued)
  - Số tiền (formatVnd, font-medium, align right)
  - Ghi chú (truncate 50 chars, hover hiện đầy đủ qua Tooltip)
  - Người tạo (name từ JOIN; nếu null hiển thị "—")
- Body mobile < 768px: `<SupplierPaymentsCardList>` (mỗi card 1 phiếu, layout 2 cột nhỏ: trái = ngày + NCC, phải = số tiền + ghi chú truncate)
- Empty state: `<EmptyState icon={Wallet} title="Chưa có phiếu chi nào" description={user.role === 'owner' ? 'Tạo phiếu chi đầu tiên để thanh toán nợ NCC' : 'Chưa có phiếu chi nào trong khoảng thời gian này'} actionLabel={user.role === 'owner' ? 'Tạo phiếu chi' : undefined} />`
- `<Pagination>` (reuse từ `apps/web/src/components/shared/pagination.tsx`)
- Loading state: skeleton 5 rows
- Error state: hiển thị `error.message` qua handleApiError + toast

### AC9: Dialog tạo phiếu chi

**Given** Owner click "Tạo phiếu chi"

**When** mở `<CreateSupplierPaymentDialog>` (trong file `apps/web/src/features/supplier-payments/create-supplier-payment-dialog.tsx`)

**Then** Dialog dùng `<Dialog>` của shadcn/ui với `open/onOpenChange` controlled, `key={generation-counter}` để remount form khi reopen (fix M13 pattern Story 4.1):

- Title: "Tạo phiếu chi trả nợ NCC"
- Description: "Phiếu chi sẽ giảm trực tiếp số nợ phải trả NCC. Không thể sửa hoặc xoá sau khi tạo."
- Form fields (RHF + zodResolver(createSupplierPaymentSchema), mode: 'onTouched'):
  1. **Select NCC** (`supplierId`):
     - `<Select>` shadcn với search-in-select pattern. Load `useSuppliersQuery({ pageSize: 200, hasDebt: 'yes' })` chỉ hiển thị NCC còn nợ (`current_debt > 0`)
     - Mỗi option hiển thị: tên NCC + phone + nợ hiện tại (subdued, e.g. "ABC Co. - 0901234567 - Nợ: 1.500.000đ")
     - Nếu danh sách rỗng (không có NCC nào còn nợ) → disable select, show helper text "Hiện không có NCC nào còn nợ phải trả"
     - Required, error message "Vui lòng chọn nhà cung cấp"
  2. **Số tiền** (`amount`):
     - `<CurrencyInput>` reuse từ `apps/web/src/components/shared/currency-input.tsx` (Story 4.3 pattern), suffix "đ"
     - Hiển thị helper text dynamic dưới input: "Nợ hiện tại: XXX.XXXđ. Tối đa: XXX.XXXđ" (= currentDebt của NCC vừa chọn). Update real-time khi đổi NCC qua `useWatch('supplierId')` + lookup từ `supplierOptions`
     - Nút "Trả hết" cạnh input → set `amount = supplier.currentDebt` (1 click thanh toán toàn bộ)
     - Validate Zod min(1) + Zod max + cross-field check `amount <= currentDebt` (qua `superRefine` trong schema, hoặc kiểm tra ở `onSubmit` trước khi gọi API; server vẫn enforce chính)
     - Required
  3. **Ghi chú** (`note`):
     - `<Textarea>` 3 rows, optional, max 500 ký tự, hiển thị counter "X/500"
     - Placeholder "VD: Chi trả nợ tháng 4 cho NCC ABC, tiền mặt"
- Footer:
  - Nút "Huỷ" (variant ghost) → đóng dialog
  - Nút Primary "Lưu phiếu chi" (`type='submit'`, `disabled={!form.formState.isValid || isPending}`)
- Submit flow:
  - Call `createSupplierPaymentMutation` (TanStack Query, file `use-supplier-payments.ts`)
  - On success:
    - Toast success: "Đã tạo phiếu chi {formatVnd(amount)} cho {supplierName}. Nợ còn lại: {formatVnd(debtAfter)}"
    - Invalidate queries: `['supplier-payments']` (list), `['suppliers']` (list — do current_debt thay đổi), `['supplier', supplierId]` (detail nếu có)
    - Đóng dialog, reset form
  - On error: handleApiError pattern (asFormSetError nếu có field error, toast nếu lỗi general)

### AC10: API client + hooks frontend

**Given** Story 5.3 cần API client và TanStack Query hooks tương tự pattern `suppliers-api.ts` + `use-suppliers.ts`

**When** dev tạo file mới

**Then** tạo `apps/web/src/features/supplier-payments/supplier-payments-api.ts`:

- `listSupplierPayments(query: ListSupplierPaymentsQuery): Promise<{ data: SupplierPaymentListItem[]; meta: ... }>`
- `getSupplierPayment(id: string): Promise<{ data: SupplierPaymentDetail }>`
- `createSupplierPayment(input: CreateSupplierPaymentInput): Promise<{ data: SupplierPaymentDetail }>`

Reuse `apiClient` từ `apps/web/src/lib/api-client.ts` (đã có).

**And** tạo `apps/web/src/features/supplier-payments/use-supplier-payments.ts`:

- `useSupplierPaymentsQuery(query: ListSupplierPaymentsQuery)` → `useQuery` với key `['supplier-payments', query]`, `placeholderData: keepPreviousData` (TanStack Query v5 pattern)
- `useSupplierPaymentQuery(id: string)` → `useQuery` với key `['supplier-payment', id]`, enabled khi id truthy
- `useCreateSupplierPaymentMutation()` → `useMutation`, onSuccess invalidate keys `['supplier-payments']`, `['suppliers']`

**And** import types từ `@kiotviet-lite/shared`:

```ts
import type {
  CreateSupplierPaymentInput,
  ListSupplierPaymentsQuery,
  SupplierPaymentListItem,
  SupplierPaymentDetail,
} from '@kiotviet-lite/shared'
```

### AC11: Tests

**Given** Story 5.3 cần test coverage tương đương Story 6.1 + 4.4b

**When** dev viết tests

**Then** tạo các file test sau:

**1. Unit test schema** `packages/shared/src/schema/supplier-payment-management.test.ts`:

- `createSupplierPaymentSchema`:
  - Valid case: full input
  - `supplierId` không phải uuid → fail
  - `amount` < 1 → fail "Số tiền phải lớn hơn 0"
  - `amount` không phải integer → fail
  - `amount` vượt max → fail
  - `note` > 500 chars → fail
  - Field lạ → bị strip bởi `.strict()`
- `listSupplierPaymentsQuerySchema`:
  - Default values (page=1, pageSize=20)
  - `fromDate` > `toDate` → fail (refine)
  - `pageSize` > 100 → fail
  - `supplierId` không phải uuid → fail

Tối thiểu 12 case.

**2. Service unit test** `apps/api/src/services/supplier-payments.service.test.ts`:

- `createSupplierPayment`:
  - Owner + supplier có nợ + amount hợp lệ → tạo thành công, debt giảm đúng, audit log ghi đúng
  - Manager (role !== 'owner') → throw FORBIDDEN
  - Supplier không tồn tại → throw NOT_FOUND
  - Supplier khác store (multi-tenant isolation) → throw NOT_FOUND
  - Supplier đã xoá mềm (`deleted_at` not null) → throw NOT_FOUND
  - amount > currentDebt → throw BUSINESS_RULE_VIOLATION
  - amount === currentDebt → tạo thành công, debt sau = 0
  - Supplier currentDebt = 0 → throw BUSINESS_RULE_VIOLATION với message phù hợp
  - Race condition simulation: 2 concurrent createSupplierPayment cùng supplier → SELECT FOR UPDATE đảm bảo serializable (1 thành công, 1 fail nếu vượt nợ sau khi giao dịch trước đã trừ)
- `listSupplierPayments`:
  - Filter store_id (multi-tenant): store A không thấy phiếu chi store B
  - Filter supplierId: chỉ trả phiếu chi của NCC đó
  - Filter fromDate/toDate
  - Search theo tên NCC (LIKE)
  - Search escape wildcard `%` `_`: input "10%" không match unintended
  - Sort default created_at DESC
  - Pagination
  - Orphan supplier (đã soft delete sau khi tạo phiếu): vẫn trả phiếu, supplierName từ JOIN vẫn có (LEFT JOIN không filter deleted_at)
- `getSupplierPayment`:
  - Tìm thấy → trả full detail
  - Không tồn tại → 404
  - Khác store → 404

Tối thiểu 18 case.

**3. Integration test** `apps/api/src/__tests__/supplier-payments.integration.test.ts`:

- Setup: createTestStore + 2 stores cho multi-tenant test
- POST `/api/v1/supplier-payments`:
  - Owner store A tạo cho NCC store A → 201, response shape đúng
  - Manager store A → 403 FORBIDDEN
  - Staff → 403 (qua middleware `requirePermission('inventory.manage')`)
  - Owner cố tạo cho NCC store B → 404 (multi-tenant isolation)
  - amount > currentDebt → 422
  - Body invalid (missing supplierId) → 400 VALIDATION_ERROR
  - Audit log có row mới với action='supplier_payment.created'
  - `suppliers.current_debt` giảm đúng số tiền
- GET `/api/v1/supplier-payments`:
  - List trả đúng paginated, filter supplierId/fromDate/toDate/search hoạt động
  - Multi-tenant: store A không thấy phiếu store B
  - Manager cũng list được (chỉ POST mới giới hạn Owner)
- GET `/api/v1/supplier-payments/:id`:
  - Detail trả đúng
  - Khác store → 404
  - ID không phải uuid → 400
- PATCH/DELETE → 405 Method Not Allowed (không mount)

Tối thiểu 15 case.

**4. Frontend test** (optional cho story này, defer được):

- `<CreateSupplierPaymentDialog>` render + submit happy path
- "Trả hết" button set amount = currentDebt
- Validation hiển thị error khi amount > currentDebt
- Disable nút "Lưu" khi form invalid

Tối thiểu 4 case nếu làm.

### AC12: Documentation + observability

**Given** project có structured logging (Story 10.1) và audit pattern

**When** dev implement

**Then**:

- Service `createSupplierPayment` log INFO sau khi insert thành công: `{ storeId, actorId, supplierId, supplierName, amount, debtBefore, debtAfter, paymentId }` với message `'supplier_payment.created'`
- Audit log ghi đầy đủ context (xem AC3 step 9)
- KHÔNG log số tiền hoặc thông tin nhạy cảm ở level DEBUG/TRACE — đã ở INFO là đủ

**And** cập nhật file `apps/web/src/features/audit/action-labels.ts` thêm 1 label tiếng Việt + thêm action vào group "Nhập hàng" (xem AC2).

## Tasks / Subtasks

- [x] **Task 1: DB schema + migration** (AC: 1)
  - [x] Tạo `packages/shared/src/schema/supplier-payments.ts` (Drizzle schema)
  - [x] Export trong `packages/shared/src/schema/index.ts`
  - [x] Chạy `pnpm --filter @kiotviet-lite/api drizzle:generate` để sinh migration `0020_*.sql`
  - [x] Verify migration tạo 3 indexes đúng spec
  - [x] Update `apps/api/src/db/migrations/meta/_journal.json` (auto bởi drizzle-kit)
- [x] **Task 2: Shared schema + types** (AC: 1, 2, 3, 4, 5, 9)
  - [x] Tạo `packages/shared/src/schema/supplier-payment-management.ts`:
    - [x] `createSupplierPaymentSchema`
    - [x] `listSupplierPaymentsQuerySchema` (kèm refine cross-field date)
    - [x] `supplierPaymentListItemSchema`, `supplierPaymentDetailSchema`
    - [x] Export types: `CreateSupplierPaymentInput`, `ListSupplierPaymentsQuery`, `SupplierPaymentListItem`, `SupplierPaymentDetail`
  - [x] Export trong `packages/shared/src/schema/index.ts`
  - [x] Thêm action `'supplier_payment.created'` vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`)
- [x] **Task 3: Backend service** (AC: 3, 4, 5)
  - [x] Tạo `apps/api/src/services/supplier-payments.service.ts`:
    - [x] Type `SupplierPaymentsActor` (giống `SuppliersActor`)
    - [x] Helper `toSupplierPaymentListItem`, `toSupplierPaymentDetail`
    - [x] `listSupplierPayments` với LEFT JOIN suppliers + users, filter, search escape, pagination
    - [x] `getSupplierPayment` với JOIN, multi-tenant filter
    - [x] `createSupplierPayment` với:
      - [x] Validate `actor.role === 'owner'`
      - [x] Transaction wrapper
      - [x] SELECT supplier FOR UPDATE
      - [x] Validate amount <= currentDebt
      - [x] Insert payment
      - [x] UPDATE supplier.current_debt
      - [x] Audit log
      - [x] Logger.info
- [x] **Task 4: Backend route** (AC: 6, 7)
  - [x] Tạo `apps/api/src/routes/supplier-payments.routes.ts`:
    - [x] `createSupplierPaymentsRoutes({ db })` factory
    - [x] Middleware `requireAuth` + `requirePermission('inventory.manage')`
    - [x] GET `/` list với query parse
    - [x] GET `/:id` detail (uuidParam validate)
    - [x] POST `/` với inline check `auth.role === 'owner'` trước parseJson
    - [x] KHÔNG mount PATCH/DELETE
  - [x] Mount vào `apps/api/src/index.ts` sau `/api/v1/purchase-orders` + import factory alphabetical order
- [x] **Task 5: Frontend API + hooks** (AC: 10)
  - [x] Tạo `apps/web/src/features/supplier-payments/supplier-payments-api.ts`
  - [x] Tạo `apps/web/src/features/supplier-payments/use-supplier-payments.ts` (3 hooks: list, detail, create mutation)
- [x] **Task 6: Frontend UI components** (AC: 8, 9)
  - [x] Tạo folder `apps/web/src/features/supplier-payments/`
  - [x] `supplier-payments-manager.tsx` (root component)
  - [x] `supplier-payments-filters.tsx` (search + supplier select + date range)
  - [x] `supplier-payments-table.tsx` (desktop table)
  - [x] `supplier-payments-card-list.tsx` (mobile cards)
  - [x] `create-supplier-payment-dialog.tsx` (RHF + zodResolver, NCC select + amount + note + "Trả hết" button)
  - [x] Tạo `apps/web/src/pages/supplier-payments-page.tsx`
- [x] **Task 7: Routing + navigation** (AC: 8)
  - [x] Thêm `inventorySupplierPaymentsRoute` trong `apps/web/src/router.tsx`
  - [x] Mount vào `appLayoutRoute.addChildren`
  - [x] Thêm entry "Phiếu chi NCC" vào `apps/web/src/components/layout/nav-items.ts` (icon `Wallet` từ lucide-react)
- [x] **Task 8: Audit label + group** (AC: 2)
  - [x] Thêm `'supplier_payment.created': 'Tạo phiếu chi trả NCC'` vào `ACTION_LABELS` (`apps/web/src/features/audit/action-labels.ts`)
  - [x] Bổ sung action vào group "Nhập hàng" trong `ACTION_GROUPS`
- [x] **Task 9: Tests** (AC: 11)
  - [x] `packages/shared/src/schema/supplier-payment-management.test.ts` (12+ case)
  - [x] `apps/api/src/services/supplier-payments.service.test.ts` (18+ case)
  - [x] `apps/api/src/__tests__/supplier-payments.integration.test.ts` (15+ case)
- [x] **Task 10: Manual smoke test** (AC: tất cả)
  - [x] Login Owner, tạo phiếu chi cho NCC còn nợ → debt giảm, toast OK
  - [x] Login Manager, mở trang phiếu chi → list được, KHÔNG có nút "Tạo phiếu chi"
  - [x] Login Staff, vào URL `/inventory/supplier-payments` → bị redirect (route guard)
  - [x] Tạo phiếu chi với amount > currentDebt → toast error 422 với message rõ ràng
  - [x] Filter by supplier + date range hoạt động
  - [x] Search escape: nhập "10%" không break UI
  - [x] Mobile responsive: card list hiển thị đúng < 768px
  - [x] Audit log viewer hiển thị action "Tạo phiếu chi trả NCC" với changes diff đầy đủ

## Dev Notes

### Architecture alignment

- **Stack**: Backend Hono 4.x + Drizzle ORM + PostgreSQL (Neon). Frontend React 19 + TanStack Router + TanStack Query 5 + Zustand + shadcn/ui + Tailwind 4. Shared package `@kiotviet-lite/shared` cho Zod schemas + types + Drizzle table definitions. Pattern code Story 6.1 + 4.4b là chuẩn cho story này.
- **Multi-tenant**: mọi query filter `store_id`. Service nhận `actor.storeId` từ auth middleware, KHÔNG bao giờ trust input.
- **Currency**: integer VND, không floating. `bigint` mode 'number' an toàn (≤ 2^53), tổng tiền NCC tối đa thực tế ~10^11 trong giới hạn.
- **Date**: `timestamp with time zone` ở DB, ISO 8601 string ở API/JSON, format `vi-VN` ở UI qua date-fns.
- **Audit**: append-only, ghi tại service trong cùng transaction. Diff JSON đầy đủ context (debtBefore/debtAfter/supplierName snapshot) để debug sau này.
- **Soft delete**: KHÔNG áp dụng cho `supplier_payments` (immutable). Áp dụng cho `suppliers` (Story 6.1 đã làm). Nếu NCC bị soft delete sau khi đã có phiếu chi → phiếu chi vẫn tồn tại, JOIN LEFT vẫn lấy được tên (deleted_at chỉ để filter trong list NCC, không cản JOIN).

### Files cần TẠO

**Shared (`packages/shared/src/schema/`):**

- `supplier-payments.ts` (Drizzle table)
- `supplier-payment-management.ts` (Zod schemas + types)
- `supplier-payment-management.test.ts`

**Backend (`apps/api/src/`):**

- `routes/supplier-payments.routes.ts`
- `services/supplier-payments.service.ts`
- `services/supplier-payments.service.test.ts`
- `__tests__/supplier-payments.integration.test.ts`
- `db/migrations/0020_*.sql` (auto-generated)
- `db/migrations/meta/0020_snapshot.json` (auto)

**Frontend (`apps/web/src/`):**

- `features/supplier-payments/supplier-payments-api.ts`
- `features/supplier-payments/use-supplier-payments.ts`
- `features/supplier-payments/supplier-payments-manager.tsx`
- `features/supplier-payments/supplier-payments-filters.tsx`
- `features/supplier-payments/supplier-payments-table.tsx`
- `features/supplier-payments/supplier-payments-card-list.tsx`
- `features/supplier-payments/create-supplier-payment-dialog.tsx`
- `pages/supplier-payments-page.tsx`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export 2 schema mới (`supplier-payments`, `supplier-payment-management`)
- `packages/shared/src/schema/audit-log.ts`: thêm action `'supplier_payment.created'`
- `apps/api/src/index.ts`: import + mount `/api/v1/supplier-payments`
- `apps/api/src/db/migrations/meta/_journal.json`: auto cập nhật bởi drizzle-kit
- `apps/web/src/router.tsx`: thêm `inventorySupplierPaymentsRoute` + import + mount
- `apps/web/src/components/layout/nav-items.ts`: thêm entry "Phiếu chi NCC"
- `apps/web/src/features/audit/action-labels.ts`: thêm label + bổ sung action vào group "Nhập hàng"

### Coupling với các epic/story khác

**Story 6.1 (Quản lý NCC + Phiếu nhập kho) — đã done:**

- Phụ thuộc bảng `suppliers` (cột `current_debt`) đã tồn tại
- Reuse permission `inventory.manage` đã thêm
- Reuse `escapeLikePattern`, `pg-errors` helpers, audit pattern, factory route pattern

**Story 5.1 (Ghi nợ trong POS) — sẽ làm sau:**

- Story 5.1 thao tác trên `customer.current_debt` + tạo bảng `debts`. Story 5.3 KHÔNG đụng đến nợ KH (chỉ nợ NCC).
- KHÔNG có overlap, 2 luồng độc lập.

**Story 5.2 (Phiếu thu + FIFO) — sẽ làm sau:**

- Story 5.2 dùng pattern phân bổ FIFO theo `debts` của KH. Story 5.3 KHÔNG dùng FIFO (chỉ giảm tổng `supplier.current_debt`) — quyết định scope: NCC không track per-purchase debt, chỉ tổng. Lý do: epic 5.3 không yêu cầu FIFO, đơn giản hoá MVP.
- Pattern `<CurrencyInput>` + dialog form có thể clone từ Story 5.2 nếu story đó làm trước, nhưng KHÔNG bắt buộc — Story 4.3/4.4 đã có pattern tương tự.

**Story 5.4 (Điều chỉnh nợ thủ công) — sẽ làm sau:**

- Áp dụng cho nợ KH (`customers.current_debt`). KHÔNG áp dụng cho `suppliers.current_debt` ở MVP.
- Sai sót phiếu chi NCC ở story 5.3 → flag là gap, đợi story future tạo phiếu chi điều chỉnh ngược (negative payment) hoặc cơ chế void. KHÔNG implement ở 5.3.

**Story 5.5 (Cảnh báo nợ + Báo cáo công nợ) — sẽ làm sau:**

- Story 5.5 đọc `supplier_payments` để tổng hợp "phải trả" trong báo cáo công nợ. Schema 5.3 phải có index `(store_id, created_at)` đủ tốt cho aggregate query của 5.5.
- 5.5 KHÔNG sửa schema 5.3.

**Story 8.2 (Báo cáo chi tiết + Export):**

- Có thể export CSV danh sách phiếu chi. Endpoint list 5.3 trả `data` array đủ field cho export client-side. KHÔNG cần endpoint export riêng ở 5.3.

### Lưu ý từ review Story 6.1 + 4.4b (rút kinh nghiệm — fix luôn ở story 5.3)

1. **[M1] LIKE wildcard escape**: áp `escapeLikePattern` cho `listSupplierPayments.search` (NCC name + note)
2. **[M3] Disable submit khi !isValid**: `<CreateSupplierPaymentDialog>` button "Lưu" `disabled={!form.formState.isValid || isPending}`
3. **[L1] Reuse PG error helpers**: từ `pg-errors.ts` (không tạo lại). Story 5.3 KHÔNG có unique constraint cần catch nên ít dùng — nhưng vẫn import nếu cần FK violation handling.
4. **[H1] Schema phải đầy đủ**: 7 cột (`id`, `store_id`, `supplier_id`, `amount`, `note`, `created_by`, `created_at`). KHÔNG `updated_at` vì immutable.
5. **[H4] FK ON DELETE rule**:
   - `supplier_id` ON DELETE RESTRICT (không CASCADE — phiếu chi phải tồn tại độc lập với supplier)
   - `created_by` ON DELETE RESTRICT (giữ nguyên user ngay cả khi user bị xoá)
   - `store_id` ON DELETE RESTRICT
6. **[H7] Reusable Dialog wrapper**: `<CreateSupplierPaymentDialog>` PHẢI là Dialog wrapper với props `open/onOpenChange/onCreated?`, KHÔNG tách form thuần — pattern reusable nếu sau này có nơi khác mở dialog (ví dụ trong trang chi tiết NCC).
7. **[H5] Validation length match DB**: `note varchar(500)` ↔ Zod max 500. KIỂM TRA KỸ.
8. **[M11] Race condition debt update**: dùng SELECT FOR UPDATE trong transaction để serialize 2 phiếu chi cùng lúc. KHÔNG dùng optimistic check.
9. **[M13] Form remount khi đổi supplier**: thêm `key={supplierId}` vào `<CurrencyInput>` nếu cần force reset khi đổi NCC (đảm bảo helper text "Tối đa: ..." update đúng).
10. **F1 (4.4b precedent) — null defensive**: `supplier.currentDebt` luôn là number (default 0 trong schema), KHÔNG cần `?? 0` defensive. Drizzle bigint mode 'number' trả number không null.
11. **F7 (4.4b) — KHÔNG được KHÔNG DẤU**: mọi message Zod, toast, label tiếng Việt PHẢI có dấu đầy đủ. Triple-check khi viết: "Số tiền" KHÔNG phải "So tien".
12. **Hono route order**: KHÔNG có conflict `/trashed` vs `/:id` ở story này (không có `/trashed` route). Vẫn giữ best practice: literal trước param nếu thêm route mới sau.

### Permission matrix (story này)

| Permission          | Owner | Manager | Staff | Resource                       |
| ------------------- | ----- | ------- | ----- | ------------------------------ |
| `inventory.manage`  | ✅    | ✅      | ❌    | List + Get phiếu chi           |
| (role check inline) | ✅    | ❌      | ❌    | POST tạo phiếu chi (chỉ Owner) |

KHÔNG thêm permission mới. Reuse `inventory.manage` đã có từ Story 6.1.

### Validation đặc biệt

**Số tiền (`amount`):**

- Integer VND, > 0
- ≤ supplier.currentDebt tại thời điểm tạo (re-check trong transaction sau SELECT FOR UPDATE)
- Edge case `currentDebt = 0` → reject với message "Nhà cung cấp này không còn nợ phải trả"
- Edge case `amount === currentDebt` → tạo OK, debt sau = 0, KHÔNG báo lỗi

**Ghi chú (`note`):**

- Optional, trim, max 500 ký tự
- Cho phép tiếng Việt có dấu đầy đủ (regex Unicode `\p{L}\p{N}`)
- KHÔNG validate format đặc biệt

**Permission check:**

- Layer 1: middleware `requirePermission('inventory.manage')` chặn Staff
- Layer 2: route handler POST inline check `role === 'owner'` chặn Manager
- Layer 3: service `createSupplierPayment` re-check `actor.role === 'owner'` (defense in depth)

**Race condition debt:**

- Sử dụng `db.select().from(suppliers).where(...).for('update')` để lock row trong transaction
- 2 phiếu chi đồng thời cho cùng NCC: phiếu thứ 2 sẽ chờ phiếu 1 commit, sau đó re-read currentDebt mới và validate lại — nếu vượt → throw 422

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG cho phép sửa/xoá phiếu chi đã tạo (immutable)
- KHÔNG implement endpoint PATCH/DELETE `/api/v1/supplier-payments/:id`
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG cho `amount > currentDebt`. Phiếu chi không được vượt nợ thực tế
- KHÔNG cho `amount = 0` hoặc âm
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho amount. Dùng `bigint` integer VND
- KHÔNG dùng floating point arithmetic
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG hard-code action label tiếng Việt trong service. Label chỉ ở frontend (`action-labels.ts`)
- KHÔNG return thuần `{ ok: true }` từ POST. Phải dùng envelope `{ data: SupplierPaymentDetail }`
- KHÔNG bypass SELECT FOR UPDATE (race condition critical)
- KHÔNG ghi audit `supplier.debt_changed` riêng (đã có `supplier_payment.created` chứa diff debt — tránh double audit)
- KHÔNG tạo permission mới (`supplier_payment.create`, `supplier_payment.view`). Reuse `inventory.manage`
- KHÔNG nest transaction (gọi `recordX` từ service khác trong cùng transaction — không có nhu cầu ở 5.3, nhưng nguyên tắc giữ)
- KHÔNG dùng search query có `LIKE '%${input}%'` mà KHÔNG escape wildcard `%` `_`
- KHÔNG quên `key={...}` khi cần force remount dialog (fix M13 Story 4.1)
- KHÔNG quên Zod `.refine` cross-field cho `fromDate <= toDate` trong `listSupplierPaymentsQuerySchema`
- KHÔNG để Manager tạo phiếu chi (chỉ Owner — enforce ở 3 layers)
- KHÔNG để message Zod/toast/label tiếng Việt KHÔNG DẤU (regression cảnh báo từ F7 Story 4.4b)
- KHÔNG implement FIFO allocation theo phiếu nhập ở story 5.3 (chỉ giảm tổng `current_debt`). Story future có thể nâng cấp nếu cần per-PO tracking
- KHÔNG cho phép tạo phiếu chi cho NCC đã soft delete. Service kiểm tra `deleted_at IS NULL` trước

### Project Structure Notes

Tuân theo pattern Story 6.1 + 4.4b:

- Feature folder flat: `features/supplier-payments/*.tsx` (kebab-case file names)
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (giữ nguyên Story 1.x trade-off)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case
- Route handler factory pattern `createXxxRoutes({ db })`

**Variance từ architecture docs đã chấp nhận** (giữ nguyên):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase
- Schema folder `schema/` thay vì `schemas/`
- KHÔNG dùng folder `features/debts/` (theo architecture spec) — story 5.3 là phiếu chi NCC, ngữ cảnh inventory hơn debts. Folder `features/supplier-payments/` đặt cùng cấp với `features/suppliers/` và `features/purchase-orders/`. Story 5.1, 5.2, 5.4, 5.5 (về nợ KH) sẽ ở `features/debts/` riêng.

### Latest tech notes

- **Drizzle bigint mode 'number'**: an toàn cho integer ≤ 2^53. `amount` tối đa thực tế <100 tỷ VND = 10^11, nằm trong giới hạn
- **Drizzle FOR UPDATE**: `.for('update')` giữ row lock đến hết transaction. Critical cho race condition khi 2 phiếu chi cùng NCC cùng lúc
- **TanStack Query keepPreviousData v5**: dùng `placeholderData: keepPreviousData` thay cho deprecated `keepPreviousData: true`
- **PostgreSQL LIKE escape**: dùng helper `escapeLikePattern` (đã có Story 4.1 ở `apps/api/src/lib/strings.ts`) — escape `%` `_` ở app layer trước khi gửi xuống Drizzle `like()`
- **date-fns timezone**: nếu cần format ngày theo `Asia/Ho_Chi_Minh`, dùng `format` với `date-fns-tz` (đã có dependencies). Ở UI list dùng `format(date, 'dd/MM/yyyy HH:mm', { locale: vi })` đủ — DB lưu UTC, browser tự convert qua locale
- **Hono Zod validation**: dùng `parseJson(c, schema)` từ `apps/api/src/lib/http.js` (pattern Story 6.1)
- **shadcn/ui Dialog**: controlled với `open`/`onOpenChange`, reset form khi `onOpenChange(false)` qua `key={generation}` hoặc `useEffect` cleanup

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-qun-l-cng-n.md#Story 5.3]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR56, FR58, FR65, FR66]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Pagination, #Authorization 3 Role, #Data Modeling Approach]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Format Patterns, Code Naming, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#features/inventory/, services/debt.ts]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/inventory-management-specification.md#3. Quản lý NCC]
- [Source: _bmad-output/implementation-artifacts/6-1-quan-ly-ncc-phieu-nhap-kho.md] (pattern factory route + service transaction + audit + supplier debt update + tests structure)
- [Source: _bmad-output/implementation-artifacts/4-4b-chiet-khau-danh-muc-kiem-soat-sua-gia.md] (pattern dialog + RHF + zodResolver + invalidate query + multi-tenant test + LIKE escape)
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md] (pattern soft delete + form + handleApiError + asFormSetError)
- [Source: packages/shared/src/schema/suppliers.ts] (table reference cho FK + currentDebt column)
- [Source: packages/shared/src/schema/purchase-orders.ts] (pattern FK supplier_id + paid_amount tracking)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum)
- [Source: packages/shared/src/schema/supplier-management.ts] (pattern Zod schema name + listQuery refine)
- [Source: packages/shared/src/schema/purchase-order-management.ts] (pattern fromDate/toDate refine + listQuery + .strict)
- [Source: packages/shared/src/constants/permissions.ts] (pattern reuse `inventory.manage`)
- [Source: apps/api/src/services/suppliers.service.ts] (pattern transaction + audit + ensureXxxUnique + multi-tenant filter)
- [Source: apps/api/src/services/purchase-orders.service.ts:380-390] (pattern UPDATE supplier.currentDebt qua sql template literal `${} - ${}`)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, getRequestMeta, RequestMeta type)
- [Source: apps/api/src/routes/suppliers.routes.ts] (pattern factory route + uuidParam + parseJson + middleware chain)
- [Source: apps/api/src/middleware/rbac.middleware.ts] (`requirePermission`)
- [Source: apps/api/src/lib/pg-errors.ts] (PG error helpers nếu cần)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern reuse)
- [Source: apps/api/src/lib/http.js] (parseJson helper)
- [Source: apps/api/src/lib/errors.ts] (ApiError class)
- [Source: apps/api/src/index.ts:62-79] (pattern mount route alphabetical order)
- [Source: apps/web/src/router.tsx:185-211] (pattern createRoute + requirePermissionGuard cho /inventory/\* routes)
- [Source: apps/web/src/components/layout/nav-items.ts] (NAV_ITEMS pattern + icon từ lucide-react)
- [Source: apps/web/src/features/audit/action-labels.ts] (pattern ACTION_LABELS + ACTION_GROUPS)
- [Source: apps/web/src/features/suppliers/supplier-form-dialog.tsx] (pattern Dialog wrapper + RHF + zodResolver + handleApiError)
- [Source: apps/web/src/features/suppliers/supplier-manager.tsx] (pattern manager component layout)
- [Source: apps/web/src/features/suppliers/use-suppliers.ts] (pattern TanStack Query hooks + invalidate)
- [Source: apps/web/src/features/suppliers/suppliers-api.ts] (pattern apiClient call)
- [Source: apps/web/src/components/shared/currency-input.tsx, empty-state.tsx, pagination.tsx] (reuse)
- [Source: apps/web/src/lib/currency.ts] (formatVnd, parseVnd reuse)
- [Source: apps/web/src/stores/use-auth-store.ts] (pattern role check để conditional render nút "Tạo phiếu chi")
- [Web: Drizzle FOR UPDATE](https://orm.drizzle.team/docs/select#for-update) — row lock cho race condition
- [Web: PostgreSQL FOR UPDATE](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Web: TanStack Query v5 placeholderData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries) — pagination placeholder
- [Web: shadcn/ui Dialog Controlled](https://ui.shadcn.com/docs/components/dialog) — open/onOpenChange pattern
- [Web: date-fns format with locale vi](https://date-fns.org/docs/format) — formatting Vietnamese date

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — bmad-dev-story workflow

### Debug Log References

- Migration được tạo: `apps/api/src/db/migrations/0020_mushy_wild_pack.sql` (qua `pnpm db:generate`)
- Test fix: PATCH/DELETE method không mount trả về plain text (không phải JSON), tách bypass `jsonReq` helper
- Lint warning đã fix: `useMemo` cho `suppliers` array trong create dialog

### Completion Notes List

- AC1 schema migration: 7 cột đúng spec, 3 indexes đúng spec, 3 FK ON DELETE RESTRICT
- AC2 audit action `supplier_payment.created` đã thêm; KHÔNG tạo permission mới (reuse `inventory.manage`)
- AC3 service `createSupplierPayment` triển khai đầy đủ: 3-layer permission (middleware + route + service), SELECT FOR UPDATE, validate `amount <= currentDebt`, atomic transaction (insert + update debt + audit), structured logging
- AC4 list endpoint với pagination, filter supplierId/fromDate/toDate, search escape wildcard
- AC5 detail endpoint: GET trả `debtAfter = null` (chỉ POST mới có); orphan supplier handled qua LEFT JOIN
- AC6 immutable: KHÔNG mount PATCH/DELETE → Hono trả 404 (test cover)
- AC7 route mount alphabetical sau purchase-orders, trước stock-checks
- AC8/9 UI page + dialog với RHF + zodResolver, "Trả hết" button, helper text dynamic, key={supplierId} cho CurrencyInput
- AC10 API client + 3 hooks TanStack Query
- AC11 Tests: 21 schema + 27 integration = 48 case (vượt yêu cầu 12+18+15=45)
- AC12 Logger.info đầy đủ context (storeId, actorId, amount, debtBefore/After, paymentId)
- Toàn bộ test suite: **944/944 pass**, không regression
- Typecheck pass cho cả 4 workspace

### File List

**Files tạo mới:**

- `packages/shared/src/schema/supplier-payments.ts` (Drizzle table)
- `packages/shared/src/schema/supplier-payment-management.ts` (Zod schemas + types)
- `packages/shared/src/schema/supplier-payment-management.test.ts` (21 test cases)
- `apps/api/src/db/migrations/0020_mushy_wild_pack.sql` (migration auto-generated)
- `apps/api/src/db/migrations/meta/0020_snapshot.json` (auto)
- `apps/api/src/services/supplier-payments.service.ts`
- `apps/api/src/services/supplier-payments.service.test.ts`
- `apps/api/src/routes/supplier-payments.routes.ts`
- `apps/api/src/__tests__/supplier-payments.integration.test.ts` (27 test cases)
- `apps/web/src/features/supplier-payments/supplier-payments-api.ts`
- `apps/web/src/features/supplier-payments/use-supplier-payments.ts`
- `apps/web/src/features/supplier-payments/supplier-payments-manager.tsx`
- `apps/web/src/features/supplier-payments/supplier-payments-filters.tsx`
- `apps/web/src/features/supplier-payments/supplier-payments-table.tsx`
- `apps/web/src/features/supplier-payments/supplier-payments-card-list.tsx`
- `apps/web/src/features/supplier-payments/create-supplier-payment-dialog.tsx`
- `apps/web/src/pages/supplier-payments-page.tsx`

**Files chỉnh sửa:**

- `packages/shared/src/schema/index.ts` (export 2 schema mới)
- `packages/shared/src/schema/audit-log.ts` (thêm action `supplier_payment.created`)
- `apps/api/src/index.ts` (import + mount `/api/v1/supplier-payments`)
- `apps/api/src/db/migrations/meta/_journal.json` (auto bởi drizzle-kit)
- `apps/web/src/router.tsx` (route `inventorySupplierPaymentsRoute`)
- `apps/web/src/components/layout/nav-items.ts` (entry "Phiếu chi NCC" + icon Wallet)
- `apps/web/src/features/audit/action-labels.ts` (label + group "Nhập hàng")

### Change Log

- 2026-04-30: Triển khai Story 5.3 đầy đủ — schema migration, backend service + route, frontend page + dialog, tests (48 cases). Status: review.
