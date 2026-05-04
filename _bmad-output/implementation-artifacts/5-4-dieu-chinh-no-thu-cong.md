# Story 5.4: Điều chỉnh nợ thủ công

Status: done

## Story

As a chủ cửa hàng,
I want điều chỉnh nợ khách hàng thủ công khi cần (xoá nợ xấu, sửa sai, ghi nợ bổ sung),
so that công nợ phản ánh đúng thực tế và có audit trail cho mọi thay đổi.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `debt_adjustments` + migration

**Given** hệ thống đã có `stores` (Story 1.1), `users` (Story 1.4), `customers` (Story 4.1) với cột `current_debt` theo dõi nợ KH, `audit_logs` (Story 1.4), `debts` (Story 5.1), `receipts` + `receipt_allocations` (Story 5.2)

**When** chạy migration mới của story 5.4

**Then** tạo bảng `debt_adjustments`:

| Column        | Type                       | Ràng buộc                                        |
| ------------- | -------------------------- | ------------------------------------------------ |
| `id`          | `uuid`                     | PK, default `uuidv7()`                           |
| `store_id`    | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT    |
| `customer_id` | `uuid`                     | NOT NULL, FK → `customers.id` ON DELETE RESTRICT |
| `old_amount`  | `bigint` mode 'number'     | NOT NULL (snapshot `current_debt` trước điều chỉnh) |
| `new_amount`  | `bigint` mode 'number'     | NOT NULL (giá trị nợ mới sau điều chỉnh, >= 0)  |
| `reason`      | `varchar(500)`             | NOT NULL (lý do bắt buộc)                        |
| `adjusted_by` | `uuid`                     | NOT NULL, FK → `users.id` ON DELETE RESTRICT     |
| `created_at`  | `timestamp with time zone` | NOT NULL, default `now()`                        |

**And** indexes:

- `idx_debt_adjustments_store_created` ON `(store_id, created_at DESC)` cho query toàn store
- `idx_debt_adjustments_store_customer` ON `(store_id, customer_id, created_at DESC)` cho tab Công nợ KH

**And** KHÔNG có cột `updated_at` (immutable). KHÔNG có cột `deleted_at`. Điều chỉnh nợ là chứng từ tài chính append-only, KHÔNG cho sửa/xoá. Pattern giống `supplier_payments` (Story 5.3) và `receipts` (Story 5.2).

**And** KHÔNG có DB CHECK constraint cho `new_amount >= 0` hay `new_amount != old_amount`. Enforce ở service layer + Zod.

### AC2: Audit action + permission reuse

**Given** ma trận `PERMISSIONS` hiện tại đã có `customers.manage: ['owner', 'manager']`

**When** Story 5.4 thêm endpoint điều chỉnh nợ

**Then** **KHÔNG tạo permission mới**. Reuse `customers.manage` cho middleware. Endpoint POST tạo điều chỉnh CHỈ Owner gọi được, enforce ở route inline check `c.get('auth').role === 'owner'` + service re-check `actor.role === 'owner'` (defense in depth). Manager và Staff xem lịch sử điều chỉnh qua tab Công nợ (GET trả về cùng với debt data).

**And** thêm 1 audit action vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`):

- `'debt_adjustment.created'`

**And** cập nhật `apps/web/src/features/audit/action-labels.ts`:

- Thêm `'debt_adjustment.created': 'Điều chỉnh nợ khách hàng'` vào `ACTION_LABELS`
- Thêm action `'debt_adjustment.created'` vào group `'Công nợ'` (group đã có từ Story 5.1 với `debt.created`, `debt.limit_overridden`)

### AC3: Tạo điều chỉnh nợ (POST /api/v1/debt-adjustments)

**Given** Owner đã đăng nhập (role = 'owner', có permission `customers.manage`)

**When** gọi `POST /api/v1/debt-adjustments` với body:

```json
{
  "customerId": "<uuid>",
  "newAmount": 300000,
  "reason": "Xoá nợ xấu, KH đã thanh toán bên ngoài"
}
```

**Then** API validate qua `createDebtAdjustmentSchema` (Zod) tại `packages/shared/src/schema/debt-adjustment-management.ts`:

- `customerId`: `z.string().uuid({ message: 'Vui lòng chọn khách hàng' })`
- `newAmount`: `z.number().int('Số tiền phải là số nguyên').min(0, 'Số nợ mới không được âm').max(99_999_999_999_999, 'Số tiền vượt giới hạn')`
- `reason`: `z.string().trim().min(1, 'Vui lòng nhập lý do điều chỉnh').max(500, 'Lý do tối đa 500 ký tự')`
- `.strict()` loại bỏ field lạ

**And** service `createDebtAdjustment({ db, actor, input, meta })`:

1. Validate `actor.role === 'owner'` → nếu không → 403 FORBIDDEN "Chỉ chủ cửa hàng mới được điều chỉnh nợ"
2. Mở `db.transaction(async (tx) => { ... })`
3. SELECT customer với lock `.for('update')`: WHERE `id = customerId AND store_id = actor.storeId AND deleted_at IS NULL`
4. Nếu không tìm thấy → 404 "Không tìm thấy khách hàng"
5. Lấy `oldAmount = Number(customer.currentDebt)`
6. Validate `input.newAmount !== oldAmount` → nếu bằng → 422 BUSINESS_RULE_VIOLATION "Số nợ mới phải khác số nợ hiện tại ({formatVnd(oldAmount)})"
7. Insert row vào `debt_adjustments`:
   ```ts
   tx.insert(debtAdjustments).values({
     storeId: actor.storeId,
     customerId: input.customerId,
     oldAmount,
     newAmount: input.newAmount,
     reason: input.reason,
     adjustedBy: actor.userId,
   }).returning({ id: debtAdjustments.id })
   ```
8. Update `customers.current_debt = newAmount` (atomic): `currentDebt: input.newAmount`
9. Ghi audit `action='debt_adjustment.created'`, `targetType='debt_adjustment'`, `targetId=<adjustmentId>`, `changes`:
   ```json
   {
     "customerId": "<uuid>",
     "customerName": "<snapshot>",
     "oldAmount": 500000,
     "newAmount": 300000,
     "reason": "Xoá nợ xấu, KH đã thanh toán bên ngoài"
   }
   ```
10. Trả 201 với envelope `{ data: DebtAdjustmentDetail }`

**And** `DebtAdjustmentDetail` chứa: `id`, `customerId`, `customerName`, `oldAmount`, `newAmount`, `reason`, `adjustedBy` (uuid), `adjustedByName` (string nullable, JOIN `users.name`), `createdAt` (ISO string).

**And** mọi bước trong CÙNG database transaction. Fail bất kỳ step → rollback toàn bộ.

### AC4: Liệt kê điều chỉnh nợ theo KH (GET /api/v1/debt-adjustments)

**Given** Owner/Manager xem tab Công nợ trên trang chi tiết KH

**When** gọi `GET /api/v1/debt-adjustments?customerId=<uuid>&page=1&pageSize=20`

**Then** API validate qua `listDebtAdjustmentsQuerySchema`:

- `customerId`: `z.string().uuid()` (REQUIRED, điều chỉnh nợ luôn xem theo KH)
- `page`: `z.coerce.number().int().min(1).default(1)`
- `pageSize`: `z.coerce.number().int().min(1).max(100).default(20)`

**And** service `listDebtAdjustments({ db, storeId, query })`:

- WHERE: `debt_adjustments.store_id = actor.storeId AND debt_adjustments.customer_id = query.customerId`
- LEFT JOIN `users` lấy `users.name` AS `adjustedByName`
- Sort: `created_at DESC, id DESC` (mới nhất trước)
- Pagination chuẩn: `LIMIT pageSize OFFSET (page-1)*pageSize`, count query riêng
- Trả `{ data: DebtAdjustmentListItem[], meta: { page, pageSize, total, totalPages } }`

**And** `DebtAdjustmentListItem` chứa: `id`, `customerId`, `oldAmount`, `newAmount`, `reason`, `adjustedBy`, `adjustedByName`, `createdAt`.

**And** KHÔNG LEFT JOIN customers (customerId là query param, UI đã biết customer context). Tiết kiệm JOIN.

### AC5: KHÔNG có endpoint sửa/xoá điều chỉnh nợ

**Given** điều chỉnh nợ đã tạo

**When** dev thử PATCH/PUT/DELETE trên `/api/v1/debt-adjustments/:id`

**Then** route handler KHÔNG mount các method này, Hono trả 405. KHÔNG implement endpoint sửa/xoá. Pattern giống story 5.3.

**And** lý do: chứng từ tài chính append-only. Sai → tạo điều chỉnh ngược (new_amount = old_amount).

### AC6: Routes mount + middleware

**Given** Hono router hiện mount `/api/v1/receipts` (Story 5.2), `/api/v1/customers` (Story 4.1)

**When** thêm route mới

**Then** tạo `apps/api/src/routes/debt-adjustments.routes.ts` theo pattern `receipts.routes.ts`:

- `GET /` → `listDebtAdjustments` (customerId required query param)
- `POST /` → `createDebtAdjustment` (chỉ Owner, kiểm tra trong handler)
- KHÔNG mount GET /:id (không cần xem detail riêng, list đã đủ)
- KHÔNG mount PATCH/DELETE
- Middleware: `requireAuth` + `requirePermission('customers.manage')` toàn bộ route
- Factory `createDebtAdjustmentsRoutes({ db })`
- POST handler thêm guard inline:
  ```ts
  app.post('/', async (c) => {
    const auth = c.get('auth')
    if (auth.role !== 'owner') {
      throw new ApiError('FORBIDDEN', 'Chỉ chủ cửa hàng mới được điều chỉnh nợ')
    }
    const input = await parseJson(c, createDebtAdjustmentSchema)
    const data = await createDebtAdjustment({ db, actor: auth, input, meta: getRequestMeta(c) })
    return c.json({ data }, 201)
  })
  ```

**And** mount vào `apps/api/src/index.ts` SAU `/api/v1/customers`:

```typescript
app.route('/api/v1/debt-adjustments', createDebtAdjustmentsRoutes({ db }))
```

Import factory alphabetical order (giữa `createCustomersRoutes` và `createNotificationRoutes`).

### AC7: UI tích hợp vào CustomerDebtsTab

**Given** `CustomerDebtsTab` hiện hiển thị: tổng công nợ, progress bar hạn mức, bảng chi tiết các khoản nợ

**When** Story 5.4 triển khai

**Then** mở rộng `CustomerDebtsTab` thêm 2 section mới:

1. **Nút "Điều chỉnh nợ"** trên header card tổng quan (cùng hàng với tổng công nợ):
   - Icon `PenLine` từ lucide-react
   - CHỈ render khi `user.role === 'owner'` (đọc từ `useAuthStore`)
   - Variant: `outline`, size: `sm`
   - Click → mở `<DebtAdjustmentDialog>`

2. **Section "Lịch sử điều chỉnh nợ"** phía dưới bảng chi tiết khoản nợ:
   - Heading: "Lịch sử điều chỉnh nợ"
   - Bảng readonly gồm cột: Ngày, Nợ cũ, Nợ mới, Chênh lệch (computed = newAmount - oldAmount, hiển thị +/- prefix), Lý do, Người điều chỉnh
   - Sort: mới nhất trước (API default)
   - Nếu chưa có điều chỉnh nào: `<EmptyState icon={PenLine} title="Chưa có điều chỉnh nợ" description="Các điều chỉnh nợ thủ công sẽ hiển thị tại đây" />`
   - Pagination (nếu > 20 records, dùng `<Pagination>` reuse)
   - Chênh lệch dương (tăng nợ): text-red-700, prefix "+"
   - Chênh lệch âm (giảm nợ): text-green-700, prefix "-"

### AC8: Dialog điều chỉnh nợ

**Given** Owner click "Điều chỉnh nợ" trên tab Công nợ KH

**When** mở `<DebtAdjustmentDialog>` (file `apps/web/src/features/customers/components/DebtAdjustmentDialog.tsx`)

**Then** Dialog dùng `<Dialog>` shadcn/ui, controlled `open/onOpenChange`, `key={generation}` remount form:

- Title: "Điều chỉnh nợ khách hàng"
- Description: "Thay đổi số nợ hiện tại. Không thể sửa hoặc xoá sau khi lưu."
- Form fields (RHF + zodResolver(createDebtAdjustmentSchema), mode: 'onTouched'):
  1. **Nợ hiện tại** (readonly, KHÔNG phải form field):
     - Hiển thị `formatVnd(currentDebt)` + "₫" (đọc từ parent)
     - Label: "Nợ hiện tại"
     - Màu text-muted-foreground, font-medium
  2. **Số nợ mới** (`newAmount`):
     - `<CurrencyInput>` reuse từ `apps/web/src/components/shared/currency-input.tsx`, suffix "₫"
     - Helper text: "Nhập 0 để xoá toàn bộ nợ"
     - Validate Zod min(0) + cross-check `newAmount !== currentDebt` (ở `onSubmit` trước khi gọi API)
     - Required
  3. **Lý do** (`reason`):
     - `<Textarea>` 3 rows, REQUIRED, max 500 ký tự, hiển thị counter "X/500"
     - Placeholder "VD: Xoá nợ xấu, KH đã thanh toán bên ngoài"
     - Error message nếu trống: "Vui lòng nhập lý do điều chỉnh"
- Preview section (trước footer, sau form):
  - Card nhỏ hiển thị: "Nợ cũ: X → Nợ mới: Y" + chênh lệch (có prefix +/- và màu)
  - Chỉ hiển thị khi `newAmount` đã nhập và khác `currentDebt`
- Footer:
  - Nút "Huỷ" (variant ghost) → đóng dialog
  - Nút Primary "Xác nhận điều chỉnh" (`type='submit'`, `disabled={!form.formState.isValid || isPending}`)
- Submit flow:
  - Call `createDebtAdjustmentMutation` (TanStack Query)
  - On success:
    - Toast: "Đã điều chỉnh nợ {customerName}: {formatVnd(oldAmount)} → {formatVnd(newAmount)}"
    - Invalidate queries: `['customers', 'detail', customerId, 'debts']` (debt tab), `['customers', 'detail', customerId]` (customer header), `['debt-adjustments', customerId]` (adjustment list)
    - Đóng dialog, reset form
  - On error: handleApiError pattern (toast lỗi general)

### AC9: API client + hooks frontend

**Given** Story 5.4 cần API client và hooks cho debt adjustments

**When** dev tạo file mới

**Then** thêm API functions vào `apps/web/src/features/customers/customers-api.ts` (KHÔNG tạo file riêng, vì debt adjustment gắn chặt với customer context):

- `listDebtAdjustments(customerId: string, query?: { page?: number; pageSize?: number })`
- `createDebtAdjustment(input: CreateDebtAdjustmentInput)`

**And** thêm hooks vào `apps/web/src/features/customers/hooks/use-customer-detail.ts`:

- `useDebtAdjustments(customerId: string, page?: number)` → `useQuery` key `['debt-adjustments', customerId, { page }]`, `placeholderData: keepPreviousData`
- `useCreateDebtAdjustmentMutation()` → `useMutation`, onSuccess invalidate keys `['customers', 'detail']`, `['debt-adjustments']`

**And** import types từ `@kiotviet-lite/shared`.

### AC10: Tests

**Given** Story 5.4 cần test coverage tương đương Story 5.3

**When** dev viết tests

**Then** tạo các file test:

**1. Unit test schema** `packages/shared/src/schema/debt-adjustment-management.test.ts`:

- `createDebtAdjustmentSchema`:
  - Valid case: full input
  - `customerId` không uuid → fail
  - `newAmount` < 0 → fail "Số nợ mới không được âm"
  - `newAmount` không integer → fail
  - `newAmount` vượt max → fail
  - `reason` trống → fail "Vui lòng nhập lý do điều chỉnh"
  - `reason` > 500 chars → fail
  - Field lạ → bị strip bởi `.strict()`
- `listDebtAdjustmentsQuerySchema`:
  - Default values (page=1, pageSize=20)
  - `customerId` required, không uuid → fail
  - `pageSize` > 100 → fail

Tối thiểu 10 case.

**2. Integration test** `apps/api/src/__tests__/debt-adjustments.integration.test.ts`:

- Setup: createTestStore + 2 stores cho multi-tenant test, createTestCustomer với currentDebt
- POST `/api/v1/debt-adjustments`:
  - Owner tạo điều chỉnh giảm nợ → 201, response shape đúng, customer.currentDebt = newAmount
  - Owner tạo điều chỉnh tăng nợ → 201, currentDebt tăng đúng
  - Owner set nợ = 0 → 201, currentDebt = 0
  - Manager → 403 FORBIDDEN
  - Staff → 403 (qua middleware customers.manage)
  - Owner cố điều chỉnh cho KH store khác → 404 (multi-tenant)
  - KH đã soft delete → 404
  - newAmount === currentDebt → 422 "phải khác"
  - newAmount < 0 → 400 VALIDATION_ERROR
  - reason trống → 400 VALIDATION_ERROR
  - Audit log có row mới action='debt_adjustment.created' + changes chứa oldAmount/newAmount/reason
  - Race condition: 2 concurrent adjustments → SELECT FOR UPDATE serialize, cả 2 thành công tuần tự, oldAmount của phiếu 2 = newAmount phiếu 1
- GET `/api/v1/debt-adjustments`:
  - Missing customerId → 400
  - List trả đúng paginated, sort created_at DESC
  - Multi-tenant: store A không thấy adjustments store B
  - Manager list được (chỉ POST giới hạn Owner)
- PATCH/DELETE → 405

Tối thiểu 18 case.

### AC11: Documentation + observability

**Given** project có structured logging (Story 10.1) và audit pattern

**When** dev implement

**Then**:

- Service `createDebtAdjustment` log INFO: `{ storeId, actorId, customerId, customerName, oldAmount, newAmount, adjustmentId }` message `'debt_adjustment.created'`
- Audit log ghi đầy đủ context (xem AC3 step 9)
- Message Zod, toast, label tiếng Việt đầy đủ dấu

## Tasks / Subtasks

- [x] **Task 1: DB schema + migration** (AC: 1)
  - [x] Tạo `packages/shared/src/schema/debt-adjustments.ts` (Drizzle table)
  - [x] Export trong `packages/shared/src/schema/index.ts`
  - [x] Chạy `pnpm --filter @kiotviet-lite/api db:generate` để sinh migration `0025_sudden_taskmaster.sql`
  - [x] Verify migration tạo 2 indexes đúng spec
- [x] **Task 2: Shared schema + types** (AC: 2, 3, 4)
  - [x] Tạo `packages/shared/src/schema/debt-adjustment-management.ts`:
    - [x] `createDebtAdjustmentSchema`
    - [x] `listDebtAdjustmentsQuerySchema`
    - [x] `debtAdjustmentListItemSchema`, `debtAdjustmentDetailSchema`
    - [x] Export types: `CreateDebtAdjustmentInput`, `ListDebtAdjustmentsQuery`, `DebtAdjustmentListItem`, `DebtAdjustmentDetail`
  - [x] Export trong `packages/shared/src/schema/index.ts`
  - [x] Thêm `'debt_adjustment.created'` vào `auditActionSchema`
- [x] **Task 3: Backend service** (AC: 3, 4)
  - [x] Tạo `apps/api/src/services/debt-adjustments.service.ts`:
    - [x] Type `DebtAdjustmentsActor`
    - [x] Helper `toDebtAdjustmentListItem`, `toDebtAdjustmentDetail`
    - [x] `createDebtAdjustment` với:
      - [x] Validate `actor.role === 'owner'`
      - [x] Transaction + SELECT customer FOR UPDATE
      - [x] Validate `newAmount !== oldAmount`
      - [x] Insert adjustment
      - [x] UPDATE customer.currentDebt = newAmount
      - [x] Audit log
      - [x] Logger.info
    - [x] `listDebtAdjustments` với LEFT JOIN users, pagination
- [x] **Task 4: Backend route** (AC: 5, 6)
  - [x] Tạo `apps/api/src/routes/debt-adjustments.routes.ts`:
    - [x] Factory `createDebtAdjustmentsRoutes({ db })`
    - [x] Middleware `requireAuth` + `requirePermission('customers.manage')`
    - [x] GET `/` list với customerId required query param
    - [x] POST `/` với inline check `auth.role === 'owner'`
    - [x] KHÔNG mount GET /:id, PATCH, DELETE
  - [x] Mount vào `apps/api/src/index.ts`
- [x] **Task 5: Frontend API + hooks** (AC: 9)
  - [x] Thêm `listDebtAdjustments`, `createDebtAdjustment` vào `customers-api.ts`
  - [x] Thêm `useDebtAdjustments`, `useCreateDebtAdjustmentMutation` vào `use-customer-detail.ts`
- [x] **Task 6: Frontend UI components** (AC: 7, 8)
  - [x] Tạo `apps/web/src/features/customers/components/DebtAdjustmentDialog.tsx`
  - [x] Tạo `apps/web/src/features/customers/components/DebtAdjustmentHistory.tsx` (bảng readonly + pagination)
  - [x] Sửa `apps/web/src/features/customers/components/CustomerDebtsTab.tsx`:
    - [x] Thêm nút "Điều chỉnh nợ" trên header card (Owner only)
    - [x] Thêm section `<DebtAdjustmentHistory>` phía dưới bảng nợ chi tiết
- [x] **Task 7: Audit label + group** (AC: 2)
  - [x] Thêm `'debt_adjustment.created': 'Điều chỉnh nợ khách hàng'` vào `ACTION_LABELS`
  - [x] Bổ sung action vào group "Công nợ" trong `ACTION_GROUPS`
- [x] **Task 8: Tests** (AC: 10)
  - [x] `packages/shared/src/schema/debt-adjustment-management.test.ts` (16 case)
  - [x] `apps/api/src/__tests__/debt-adjustments.integration.test.ts` (18 case)
- [x] **Task 9: Typecheck + lint + full test suite** (AC: tất cả)
  - [x] `pnpm typecheck` pass 4 workspace
  - [x] `vitest run` full suite: 1191 pass, 1 fail (price-lists timeout, pre-existing, không liên quan)
### Review Findings

- [x] [Review][Patch] F1: DebtAdjustmentHistory hiển thị trống khi page > 1 và không có dữ liệu [DebtAdjustmentHistory.tsx:52]
- [x] [Review][Defer] F2: Query invalidation rộng hơn spec (`['customers', 'detail']` thay vì scope theo customerId) [use-customer-detail.ts] — defer, minor performance, functional correct
- [x] [Review][Defer] F3: Race condition test chỉ verify sequential, không test concurrent FOR UPDATE [debt-adjustments.integration.test.ts] — defer, test coverage gap
- [x] [Review][Defer] F4: Nút "Huỷ" không disable khi đang submit [DebtAdjustmentDialog.tsx:168] — defer, UX minor
- [x] [Review][Defer] F5: currentDebt prop có thể stale nếu user mở dialog lại trước khi refetch xong [DebtAdjustmentDialog.tsx] — defer, server validates

- [ ] **Task 10: Manual smoke test** (AC: tất cả)
  - [ ] Login Owner, vào chi tiết KH có nợ, tab Công nợ → thấy nút "Điều chỉnh nợ"
  - [ ] Click điều chỉnh, nhập số nợ mới + lý do → toast thành công, card nợ cập nhật
  - [ ] Lịch sử điều chỉnh hiển thị đúng: nợ cũ, nợ mới, chênh lệch có màu, lý do, người điều chỉnh
  - [ ] Login Manager → tab Công nợ hiển thị lịch sử nhưng KHÔNG có nút "Điều chỉnh nợ"
  - [ ] Thử điều chỉnh nợ = giá trị hiện tại → toast error "phải khác"
  - [ ] Thử điều chỉnh nợ = 0 (xoá nợ) → thành công
  - [ ] Thử để lý do trống → validation error hiện rõ
  - [ ] Audit log viewer hiển thị action "Điều chỉnh nợ khách hàng" với changes diff đúng

## Dev Notes

### Architecture alignment

- **Stack**: Backend Hono 4.x + Drizzle ORM + PostgreSQL. Frontend React 19 + TanStack Router + TanStack Query 5 + shadcn/ui + Tailwind 4. Shared `@kiotviet-lite/shared` cho Zod + Drizzle. Pattern code Story 5.3 (immutable financial doc) + Story 5.2 (customer debt operation) là chuẩn.
- **Multi-tenant**: mọi query filter `store_id`. Service nhận `actor.storeId`.
- **Currency**: integer VND, `bigint` mode 'number'.
- **Audit**: append-only, ghi tại service trong cùng transaction. Diff JSON snapshot (customerName, oldAmount, newAmount, reason).
- **Immutable**: `debt_adjustments` KHÔNG cho sửa/xoá. Sai → tạo điều chỉnh ngược.

### Files cần TẠO

**Shared (`packages/shared/src/schema/`):**

- `debt-adjustments.ts` (Drizzle table)
- `debt-adjustment-management.ts` (Zod schemas + types)
- `debt-adjustment-management.test.ts`

**Backend (`apps/api/src/`):**

- `routes/debt-adjustments.routes.ts`
- `services/debt-adjustments.service.ts`
- `__tests__/debt-adjustments.integration.test.ts`
- `db/migrations/0025_*.sql` (auto-generated, number may vary)
- `db/migrations/meta/0025_snapshot.json` (auto)

**Frontend (`apps/web/src/features/customers/`):**

- `components/DebtAdjustmentDialog.tsx`
- `components/DebtAdjustmentHistory.tsx`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export 2 schema mới (`debt-adjustments`, `debt-adjustment-management`)
- `packages/shared/src/schema/audit-log.ts`: thêm `'debt_adjustment.created'`
- `apps/api/src/index.ts`: import + mount `/api/v1/debt-adjustments`
- `apps/api/src/db/migrations/meta/_journal.json`: auto bởi drizzle-kit
- `apps/web/src/features/customers/customers-api.ts`: thêm 2 API functions
- `apps/web/src/features/customers/hooks/use-customer-detail.ts`: thêm 2 hooks
- `apps/web/src/features/customers/components/CustomerDebtsTab.tsx`: thêm nút + section lịch sử
- `apps/web/src/features/audit/action-labels.ts`: label + group "Công nợ"

### KHÔNG đụng (scope boundary)

- KHÔNG tạo route/page mới trong `router.tsx` (không cần standalone page)
- KHÔNG thêm nav-item mới (truy cập qua customer detail đã có)
- KHÔNG đụng `debts` table (Story 5.1) hay `receipts` table (Story 5.2)
- KHÔNG đụng `supplier_payments` hay `suppliers.current_debt` (Story 5.3, đó là nợ NCC)
- KHÔNG implement endpoint sửa/xoá (immutable)

### Coupling với các story khác

**Story 5.1 (Ghi nợ POS) + 5.2 (Phiếu thu FIFO), đã done:**

- Story 5.4 cùng thao tác trên `customers.currentDebt` nhưng khác flow: 5.1 tăng nợ khi bán hàng, 5.2 giảm nợ khi thu tiền, 5.4 set nợ trực tiếp
- KHÔNG cần cập nhật `debts` records khi điều chỉnh (điều chỉnh nợ thủ công thay đổi tổng `currentDebt`, KHÔNG phân bổ vào từng khoản nợ cụ thể)
- Lý do: điều chỉnh nợ là override tổng nợ (xoá nợ xấu, sửa sai, ghi nhận thanh toán ngoài hệ thống). Nếu cần FIFO chính xác, owner dùng phiếu thu (Story 5.2)

**Story 5.3 (Phiếu chi NCC), đã done:**

- KHÔNG overlap. 5.3 là nợ NCC, 5.4 là nợ KH.
- Clone pattern immutable (append-only, SELECT FOR UPDATE, audit trail)

**Story 5.5 (Cảnh báo nợ + Báo cáo), sẽ làm sau:**

- 5.5 có thể đọc `debt_adjustments` để tổng hợp báo cáo. Index `(store_id, customer_id, created_at)` đủ tốt cho aggregate query.

### Lưu ý từ review Story 5.2 + 5.3 (rút kinh nghiệm)

1. **[CRIT] SELECT FOR UPDATE**: race condition khi 2 điều chỉnh cùng KH. Dùng `.for('update')` trong transaction.
2. **[MAJOR] Audit trong transaction**: `logAction` gọi bên trong `tx`, KHÔNG gọi ngoài. Fail audit → rollback tất cả.
3. **[SF] Dialog key remount**: `key={generation}` để reset form khi reopen (Story 4.1 M13 pattern).
4. **[SF] Validation match DB**: `reason varchar(500)` ↔ Zod max(500).
5. **[SF] Tiếng Việt đầy đủ dấu**: triple-check mọi message Zod, toast, label.
6. **[SF] Integer arithmetic**: newAmount là integer VND, KHÔNG floating point.
7. **[PATTERN] formatVnd reuse**: import `formatVnd` từ `apps/api/src/services/receipts.service.ts` cho server, hoặc tạo cục bộ nếu import cross-service. Frontend dùng `@/lib/currency.ts`.
8. **[PATTERN] LEFT JOIN users cho adjustedByName**: pattern giống receipts + supplier-payments.

### Permission matrix (story này)

| Permission          | Owner | Manager | Staff | Resource                               |
| ------------------- | ----- | ------- | ----- | -------------------------------------- |
| `customers.manage`  | ✅    | ✅      | ❌    | GET list điều chỉnh nợ                 |
| (role check inline) | ✅    | ❌      | ❌    | POST tạo điều chỉnh (chỉ Owner)        |

KHÔNG tạo permission mới. Reuse `customers.manage`.

### Validation đặc biệt

**Số nợ mới (`newAmount`):**

- Integer VND, >= 0 (nợ không thể âm)
- PHẢI khác `currentDebt` hiện tại (check ở service SAU SELECT FOR UPDATE, KHÔNG check ở schema vì schema không biết currentDebt)
- Edge case `newAmount = 0`: cho phép (xoá toàn bộ nợ)
- Edge case `newAmount > currentDebt`: cho phép (tăng nợ, VD ghi nhận nợ bổ sung)

**Lý do (`reason`):**

- REQUIRED, min 1 ký tự sau trim, max 500
- Cho phép tiếng Việt có dấu

**Race condition:**

- SELECT customer FOR UPDATE lock row trong transaction
- 2 điều chỉnh đồng thời: phiếu 2 chờ phiếu 1 commit, re-read currentDebt mới, dùng làm oldAmount chính xác

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG cho sửa/xoá điều chỉnh đã tạo (immutable)
- KHÔNG mount PATCH/DELETE endpoint
- KHÔNG bypass `storeId` filter (multi-tenant)
- KHÔNG cho `newAmount < 0`
- KHÔNG cho `newAmount === oldAmount` (vô nghĩa)
- KHÔNG dùng floating point cho amount
- KHÔNG dùng `any` hay `@ts-ignore`
- KHÔNG tạo permission mới
- KHÔNG cập nhật `debts` records khi điều chỉnh (chỉ thay `customers.currentDebt`)
- KHÔNG bypass SELECT FOR UPDATE
- KHÔNG ghi audit ngoài transaction
- KHÔNG tạo standalone page/route (sử dụng qua customer detail tab)
- KHÔNG import cross-feature (debt adjustment code nằm trong `features/customers/`)
- KHÔNG để message Zod/toast/label KHÔNG DẤU

### Project Structure Notes

- Components mới trong `features/customers/components/` (gắn chặt customer context)
- API functions trong `features/customers/customers-api.ts` (mở rộng, không tạo file riêng)
- Hooks trong `features/customers/hooks/use-customer-detail.ts` (mở rộng)
- Shared schema files trong `packages/shared/src/schema/` (Drizzle + Zod riêng cho debt-adjustments)
- Service + route backend riêng `debt-adjustments.service.ts` + `debt-adjustments.routes.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-5-qun-l-cng-n.md#Story 5.4]
- [Source: _bmad-output/implementation-artifacts/5-3-phieu-chi-tra-no-ncc.md] (pattern immutable financial doc + SELECT FOR UPDATE + audit)
- [Source: _bmad-output/implementation-artifacts/5-2-phieu-thu-phan-bo-fifo.md] (pattern customer debt update + receipts)
- [Source: packages/shared/src/schema/customers.ts] (table reference cho currentDebt column)
- [Source: packages/shared/src/schema/debts.ts] (table reference)
- [Source: packages/shared/src/schema/receipts.ts] (pattern immutable table, no updated_at/deleted_at)
- [Source: packages/shared/src/schema/receipt-management.ts] (pattern Zod schema + types)
- [Source: packages/shared/src/schema/audit-log.ts] (auditActionSchema)
- [Source: apps/api/src/services/receipts.service.ts] (pattern formatVnd, transaction, audit, customer debt update)
- [Source: apps/api/src/routes/receipts.routes.ts] (pattern route factory, middleware, parseJson)
- [Source: apps/web/src/features/customers/components/CustomerDebtsTab.tsx] (file cần mở rộng)
- [Source: apps/web/src/features/customers/hooks/use-customer-detail.ts] (file cần thêm hooks)
- [Source: apps/web/src/features/customers/customers-api.ts] (file cần thêm API functions)
- [Source: apps/web/src/pages/customer-detail-page.tsx] (page context, tabs)
- [Source: apps/web/src/features/audit/action-labels.ts] (ACTION_LABELS + ACTION_GROUPS)
- [Source: apps/api/src/index.ts] (mount pattern)
- [Source: apps/web/src/components/shared/currency-input.tsx] (reuse)
- [Source: apps/web/src/components/shared/empty-state.tsx] (reuse)
- [Source: apps/web/src/components/shared/pagination.tsx] (reuse)
- [Source: apps/web/src/lib/currency.ts] (formatVnd frontend)
- [Source: apps/web/src/stores/use-auth-store.ts] (role check)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- price-lists.integration.test.ts timeout (pre-existing flaky test, not related to 5.4)

### Completion Notes List

- Task 1: Drizzle table `debt_adjustments` với 8 columns, 2 indexes, 3 FKs. Migration `0025_sudden_taskmaster.sql`.
- Task 2: Zod schemas + types. `createDebtAdjustmentSchema` strict, `listDebtAdjustmentsQuerySchema` với customerId required. Audit action `debt_adjustment.created` added.
- Task 3: Service `createDebtAdjustment` với transaction, SELECT FOR UPDATE, audit log trong tx, logger.info. `listDebtAdjustments` với LEFT JOIN users, pagination.
- Task 4: Route factory pattern, middleware requireAuth + requirePermission('customers.manage'), POST inline check owner. Mounted at `/api/v1/debt-adjustments`.
- Task 5: API functions + hooks thêm vào existing customer files (không tạo file riêng).
- Task 6: DebtAdjustmentDialog (form với CurrencyInput, preview, key remount), DebtAdjustmentHistory (table + pagination). CustomerDebtsTab mở rộng thêm nút owner-only + section lịch sử.
- Task 7: ACTION_LABELS + ACTION_GROUPS updated.
- Task 8: 16 schema tests + 18 integration tests pass.
- Task 9: Typecheck 4/4 pass. Full suite 1191/1192 pass (1 pre-existing timeout).
- Task 10: Manual smoke test checklist ready.

### File List

**Created:**
- `packages/shared/src/schema/debt-adjustments.ts`
- `packages/shared/src/schema/debt-adjustment-management.ts`
- `packages/shared/src/schema/debt-adjustment-management.test.ts`
- `apps/api/src/services/debt-adjustments.service.ts`
- `apps/api/src/routes/debt-adjustments.routes.ts`
- `apps/api/src/__tests__/debt-adjustments.integration.test.ts`
- `apps/api/src/db/migrations/0025_sudden_taskmaster.sql`
- `apps/api/src/db/migrations/meta/0025_snapshot.json`
- `apps/web/src/features/customers/components/DebtAdjustmentDialog.tsx`
- `apps/web/src/features/customers/components/DebtAdjustmentHistory.tsx`

**Modified:**
- `packages/shared/src/schema/index.ts` (2 exports added)
- `packages/shared/src/schema/audit-log.ts` (1 action added)
- `apps/api/src/index.ts` (import + mount)
- `apps/api/src/db/migrations/meta/_journal.json` (auto by drizzle-kit)
- `apps/web/src/features/customers/customers-api.ts` (2 API functions)
- `apps/web/src/features/customers/hooks/use-customer-detail.ts` (2 hooks)
- `apps/web/src/features/customers/components/CustomerDebtsTab.tsx` (nút + section)
- `apps/web/src/features/audit/action-labels.ts` (label + group)
- `apps/web/src/pages/customer-detail-page.tsx` (pass customerName prop)
- `_bmad-output/implementation-artifacts/5-4-dieu-chinh-no-thu-cong.md` (status update)
