# Story 7.2: Trả hàng

Status: done

## Story

As a manager/owner,
I want xử lý trả hàng từ hóa đơn gốc với hoàn tiền hoặc giảm nợ tương ứng,
so that hoàn trả chính xác cho khách và tồn kho luôn đúng.

## Acceptance Criteria (BDD)

### AC1: Hiển thị nút "Trả hàng" (role-gated)

**Given** user đang xem chi tiết hóa đơn đã hoàn thành (`status = 'completed'`)
**When** trang chi tiết load xong
**Then** nếu `role = 'owner' || 'manager'` → hiển thị nút "Trả hàng" ở header
**And** nếu `role = 'staff'` → KHÔNG hiển thị nút "Trả hàng"
**And** nếu `status = 'cancelled'` → KHÔNG hiển thị nút

### AC2: Dialog trả hàng với danh sách SP

**Given** manager bấm "Trả hàng"
**When** dialog mở
**Then** hiển thị danh sách SP từ HĐ gốc, mỗi dòng gồm:

- Tên SP (+ biến thể nếu có)
- SL đã mua (từ `orderItems.quantity`)
- SL đã trả trước đó (tính từ `order_return_items` cùng `orderItemId`)
- Ô nhập SL trả (type=number, min=0, max = SL đã mua - SL đã trả)
- Dropdown lý do trả: "Lỗi sản phẩm" / "Sai sản phẩm" / "Khách đổi ý" / "Khác"

**And** SL trả mặc định = 0
**And** nút "Xác nhận" disabled khi chưa nhập SL trả > 0 ở bất kỳ dòng nào
**And** hiển thị tổng tiền hoàn: Σ(unitPrice × returnQty) cho các dòng được chọn

### AC3: Xử lý trả hàng (backend transaction)

**Given** manager xác nhận trả hàng với items đã chọn
**When** gọi `POST /api/v1/orders/:id/returns`
**Then** trong 1 DB transaction:

1. Validate: order thuộc store, status = 'completed', SL trả ≤ SL còn lại
2. Tạo `order_returns` record (returnNumber format `TH-YYMMDD-XXXX`)
3. Tạo `order_return_items` records cho mỗi dòng trả
4. Cộng lại tồn kho cho mỗi SP (inventory_transactions type='return')
5. Nếu KH đã trả tiền (paid/partial) → tạo bút toán refund (ghi nhận hoàn tiền)
6. Nếu KH còn nợ → giảm `debts.remaining` và `customers.currentDebt`
7. Cập nhật `orders.status` thành 'partial_return' hoặc 'full_return'
8. Ghi audit log action='order.returned'

**And** trả response `{ data: OrderReturnDetail }`

### AC4: Trả hàng nhiều lần (partial return)

**Given** hóa đơn đã trả hàng 1 phần trước đó
**When** manager bấm "Trả hàng" lần nữa
**Then** SL trả tối đa = SL đã mua - SL đã trả trước đó (tính aggregate từ `order_return_items`)
**And** hiển thị "Đã trả: X" bên cạnh mỗi dòng SP
**And** dòng nào đã trả hết (SL trả = SL mua) → disable, hiện "Đã trả hết"

### AC5: Hiển thị lịch sử trả hàng trong chi tiết HĐ

**Given** hóa đơn đã có ≥ 1 lần trả hàng
**When** xem chi tiết hóa đơn
**Then** hiển thị section "Lịch sử trả hàng" với mỗi lần trả:

- Mã phiếu trả (TH-YYMMDD-XXXX)
- Ngày trả
- Danh sách SP trả: tên, SL, lý do
- Tổng tiền hoàn
- Người xử lý

**And** badge trạng thái HĐ đổi: "Đã trả 1 phần" (vàng) hoặc "Đã trả toàn bộ" (xám)

### AC6: API danh sách trả hàng của 1 order

**Given** frontend cần hiển thị lịch sử trả hàng
**When** gọi `GET /api/v1/orders/:id/returns`
**Then** trả `{ data: OrderReturnListItem[] }` gồm: id, returnNumber, totalAmount, createdByName, createdAt, items[]

### AC7: Hoàn nợ khi trả hàng

**Given** hóa đơn có nợ (paymentStatus = 'partial' hoặc 'unpaid')
**When** trả hàng thành công
**Then** giảm `debts.remaining` tối đa bằng tổng tiền trả (không giảm xuống dưới 0)
**And** giảm `customers.currentDebt` tương ứng
**And** nếu `debts.remaining = 0` → cập nhật `orders.paymentStatus` thành 'paid'

### AC8: Hoàn tiền khi trả hàng (KH đã trả đủ)

**Given** hóa đơn đã thanh toán đủ (`paymentStatus = 'paid'`)
**When** trả hàng thành công
**Then** ghi nhận refund amount trong `order_returns.refundAmount`
**And** hiển thị thông báo "Cần hoàn {amount} cho khách" trong dialog kết quả

## Tasks / Subtasks

- [x] Task 1: Tạo DB schema + migration cho `order_returns` và `order_return_items` (AC: #3)
  - [x] 1.1: Tạo `packages/shared/src/schema/order-returns.ts` (bảng `order_returns`)
  - [x] 1.2: Tạo `packages/shared/src/schema/order-return-items.ts` (bảng `order_return_items`)
  - [x] 1.3: Export từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Chạy `drizzle-kit generate` tạo migration
  - [x] 1.5: Chạy `drizzle-kit push` apply migration

- [x] Task 2: Tạo Zod schemas + types cho returns (AC: #2, #3, #6)
  - [x] 2.1: Tạo `packages/shared/src/schema/order-return-management.ts` với:
    - `createOrderReturnItemSchema` (orderItemId, quantity, reason)
    - `createOrderReturnSchema` (items[], note?)
    - `orderReturnReasonSchema` enum
  - [x] 2.2: Export types từ shared index

- [x] Task 3: Thêm permission `orders.return` (AC: #1)
  - [x] 3.1: Thêm `'orders.return': ['owner', 'manager']` vào `PERMISSIONS` trong `permissions.ts`

- [x] Task 4: Tạo returns service (AC: #3, #4, #7, #8)
  - [x] 4.1: Tạo `apps/api/src/services/returns.service.ts`
  - [x] 4.2: `createReturn({ db, actor, orderId, input, meta })`: transaction hoàn chỉnh
    - Validate order exists + belongs to store + status completed/partial_return
    - Validate SL trả ≤ SL còn lại (query aggregate `order_return_items`)
    - Generate returnNumber (format `TH-YYMMDD-XXXX`, pattern giống `generateOrderNumber`)
    - Insert `order_returns` + `order_return_items`
    - Cộng lại tồn kho (cùng pattern deduct stock từ `createOrder` nhưng ngược lại)
    - Xử lý nợ/hoàn tiền theo paymentStatus
    - Update order status (partial_return / full_return)
    - Audit log
  - [x] 4.3: `getOrderReturns({ db, storeId, orderId })`: lấy danh sách trả hàng
  - [x] 4.4: `getReturnableItems({ db, storeId, orderId })`: lấy items + SL đã trả

- [x] Task 5: Tạo returns routes (AC: #3, #6)
  - [x] 5.1: Thêm routes vào `apps/api/src/routes/orders.routes.ts`:
    - `POST /:id/returns` (tạo phiếu trả, permission `orders.return`)
    - `GET /:id/returns` (danh sách trả hàng, permission `pos.sell`)
    - `GET /:id/returnable-items` (items + SL đã trả, permission `orders.return`)

- [x] Task 6: Tạo frontend API + hooks (AC: #2, #5, #6)
  - [x] 6.1: Thêm vào `apps/web/src/features/orders/orders-api.ts`:
    - `createReturnApi(orderId, input)`
    - `getOrderReturnsApi(orderId)`
    - `getReturnableItemsApi(orderId)`
  - [x] 6.2: Thêm hooks vào `apps/web/src/features/orders/use-orders.ts`:
    - `useOrderReturnsQuery(orderId)`
    - `useReturnableItemsQuery(orderId)`
    - `useCreateReturnMutation()`

- [x] Task 7: Tạo ReturnDialog component (AC: #2, #4)
  - [x] 7.1: Tạo `apps/web/src/features/orders/return-dialog.tsx`
  - [x] 7.2: Form: danh sách SP với SL trả + dropdown lý do
  - [x] 7.3: Validation: ít nhất 1 dòng SL > 0, SL ≤ max
  - [x] 7.4: Hiển thị tổng tiền hoàn realtime
  - [x] 7.5: Loading state + error handling
  - [x] 7.6: Success dialog hiện kết quả (số tiền hoàn, phương thức)

- [x] Task 8: Cập nhật OrderDetailView (AC: #1, #5)
  - [x] 8.1: Thêm nút "Trả hàng" vào header (gated by role + status)
  - [x] 8.2: Thêm section "Lịch sử trả hàng" phía dưới
  - [x] 8.3: Cập nhật StatusBadge cho `partial_return` và `full_return`
  - [x] 8.4: Invalidate order query sau khi trả hàng thành công

- [x] Task 9: Cập nhật order status schema (AC: #3, #5)
  - [x] 9.1: Thêm `'partial_return' | 'full_return'` vào `orderStatusSchema` trong `order-management.ts`
  - [x] 9.2: Cập nhật `STATUS_LABELS` trong `order-detail-view.tsx` và `order-list.tsx`

- [x] Task 10: Integration tests (AC: #3, #4, #7, #8)
  - [x] 10.1: Tạo `apps/api/src/__tests__/returns.integration.test.ts`
  - [x] 10.2: Test case: trả hàng 1 SP, verify tồn kho tăng
  - [x] 10.3: Test case: trả hàng nhiều SP, verify tổng tiền
  - [x] 10.4: Test case: trả hàng partial, trả lần 2 verify SL max
  - [x] 10.5: Test case: trả hàng HĐ có nợ, verify giảm debt
  - [x] 10.6: Test case: trả hàng HĐ đã trả đủ, verify refund amount
  - [x] 10.7: Test case: SL trả > SL còn lại → 400 error
  - [x] 10.8: Test case: staff gọi API → 403
  - [x] 10.9: Test case: multi-tenant isolation (orderId store A, actor store B → 404)
  - [x] 10.10: Test case: trả hết toàn bộ → status = full_return

### Review Findings

- [x] [Review][Patch] F1: listOrdersQuerySchema status filter thiếu partial_return/full_return, user không filter được đơn đã trả [order-management.ts:230] — FIXED
- [x] [Review][Defer] F2: N+1 query trong getOrderReturns (mỗi return query items riêng) [returns.service.ts:574] — deferred, optimization
- [x] [Review][Defer] F3: Unit conversion không reverse khi trả hàng (unitConversionId không lưu trong order_items) — deferred, pre-existing

## Dev Notes

### Codebase patterns BẮT BUỘC tuân thủ

**Backend:**

- Route file: thêm vào `orders.routes.ts` hiện có (KHÔNG tạo file route mới)
- Service: tạo file mới `returns.service.ts` (tách biệt vì logic phức tạp)
- Schema: Drizzle table tạo file mới trong `packages/shared/src/schema/`
- Zod management schemas: tạo file mới `order-return-management.ts`
- Multi-tenant: MỌI query PHẢI filter `store_id`
- Transaction: toàn bộ logic return trong 1 `db.transaction()`
- Audit: dùng `logAction()` từ `audit.service.ts` (pattern giống `createOrder`)
- Error handling: dùng `ApiError` từ `lib/errors.ts`
- Number format: `generateReturnNumber()` pattern giống `generateOrderNumber()` nhưng prefix `TH-`

**Frontend:**

- Feature folder: thêm vào `apps/web/src/features/orders/` (KHÔNG tạo folder mới)
- API layer: thêm functions vào `orders-api.ts` hiện có
- Hooks: thêm vào `use-orders.ts` hiện có
- Auth check: `useAuthStore.getState().user?.role` để check role (KHÔNG dùng middleware)
- Import `useAuthStore` từ `@/stores/use-auth-store`
- Dialog: dùng `Dialog` từ `@/components/ui/dialog` (pattern giống `DebtAdjustmentDialog`)
- Currency: `formatVnd`, `formatVndWithSuffix` từ `@/lib/currency`
- Date: `formatDateTime` đã có trong `order-detail-view.tsx`

### DB Schema cần tạo

```sql
-- order_returns: header phiếu trả hàng
CREATE TABLE order_returns (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  store_id UUID NOT NULL REFERENCES stores(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  return_number VARCHAR(32) NOT NULL,
  total_amount BIGINT NOT NULL,        -- Σ(unitPrice × quantity) các dòng trả
  refund_amount BIGINT NOT NULL DEFAULT 0, -- Số tiền cần hoàn (0 nếu giảm nợ)
  debt_reduction_amount BIGINT NOT NULL DEFAULT 0, -- Số nợ giảm
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, return_number)
);

-- order_return_items: chi tiết từng dòng trả
CREATE TABLE order_return_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  return_id UUID NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  product_name VARCHAR(255) NOT NULL,
  variant_name VARCHAR(255),
  unit VARCHAR(50),
  unit_price BIGINT NOT NULL,
  quantity BIGINT NOT NULL,           -- SL trả
  line_total BIGINT NOT NULL,         -- unitPrice × quantity
  reason VARCHAR(32) NOT NULL,        -- 'defective'|'wrong_product'|'customer_changed_mind'|'other'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_return_items_return ON order_return_items(return_id);
CREATE INDEX idx_return_items_order_item ON order_return_items(order_item_id);
```

### DB Schema đã có (KHÔNG cần migration)

```
orders: id, storeId, orderNumber, customerId, userId, subtotal, discountType, discountValue,
        discountAmount, total, paymentMethod, paymentStatus, cashAmount, transferAmount, change,
        note, status('completed'|'cancelled'), createdAt, updatedAt

order_items: id, orderId, productId, variantId, productName, variantName, unit, unitPrice,
             quantity, discountType, discountValue, discountAmount, lineTotal, originalPrice,
             priceOverride, priceOverrideReason, priceOverridePinUsed, note, createdAt

debts: id, storeId, orderId(unique per store), customerId, amount, paid, remaining, createdAt

inventory_transactions: id, storeId, productId, variantId, type, quantity, unitCost, costAfter,
                        stockAfter, note, createdBy, createdAt
  → type values: 'purchase'|'sale'|'adjustment'|'stock_check' → thêm 'return'

customers: currentDebt (bigint) → cần cập nhật khi giảm nợ

orders.status: hiện có 'completed'|'cancelled' → thêm 'partial_return'|'full_return'
```

### Stock restoration logic (ngược của createOrder)

```typescript
// Pattern đã có trong createOrder (deduct), đảo ngược cho return:
// 1. Load product FOR UPDATE
// 2. Nếu có variant: update variant.stockQuantity + qty, aggregate lên product
// 3. Nếu không variant: update product.currentStock + qty (relative SQL)
// 4. Insert inventory_transaction type='return', quantity=+qty
```

### Debt reduction logic

```typescript
// Khi order có nợ (debts.remaining > 0):
// 1. SELECT debts WHERE orderId = X FOR UPDATE
// 2. reductionAmount = min(returnTotalAmount, debts.remaining)
// 3. UPDATE debts SET remaining = remaining - reductionAmount, paid = paid + reductionAmount
// 4. UPDATE customers SET currentDebt = currentDebt - reductionAmount
// 5. Nếu remaining = 0: UPDATE orders SET paymentStatus = 'paid'
//
// Khi order đã trả đủ (debts.remaining = 0 hoặc không có debt record):
// → refundAmount = returnTotalAmount
// → Ghi nhận vào order_returns.refundAmount (hiển thị cho nhân viên)
```

### Previous story learnings (7-1)

- Route mount: `apps/api/src/index.ts` mount `.route('/api/v1/orders', ordersRoutes)`
- Route đã có: `GET /` (list), `GET /:id` (detail) → thêm return routes vào cùng file
- getOrderDetail đã JOIN debts.remaining → reuse logic
- Frontend `OrderDetailView` đã có skeleton, header, items table, totals, note sections
- Story 7-1 review findings: paidAmount/debtAmount lấy từ debts.remaining (source of truth)
- Pattern `DebtAdjustmentDialog`: dialog form + submit + invalidate queries + success toast

### Permission model

```
'orders.return': ['owner', 'manager']  ← mới, cần thêm vào permissions.ts
'pos.sell': ['owner', 'manager', 'staff']  ← dùng cho GET returns (xem lịch sử)
```

Frontend check: `useAuthStore().user?.role !== 'staff'` để hiện/ẩn nút "Trả hàng"

### Return reason enum

```typescript
const RETURN_REASONS = {
  defective: 'Lỗi sản phẩm',
  wrong_product: 'Sai sản phẩm',
  customer_changed_mind: 'Khách đổi ý',
  other: 'Khác',
} as const
```

### Project Structure Notes

- Thêm 2 file schema mới vào `packages/shared/src/schema/` (follow convention: kebab-case)
- Thêm 1 file management schema vào cùng folder
- Thêm 1 file service mới vào `apps/api/src/services/`
- Thêm 1 file component mới vào `apps/web/src/features/orders/`
- KHÔNG tạo folder mới, KHÔNG tạo route file mới

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-7-ha-n-in-n.md#Story 7.2]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR49]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Authentication & Security]
- [Source: packages/shared/src/schema/orders.ts]
- [Source: packages/shared/src/schema/order-items.ts]
- [Source: packages/shared/src/schema/debts.ts]
- [Source: packages/shared/src/schema/inventory-transactions.ts]
- [Source: packages/shared/src/constants/permissions.ts]
- [Source: apps/api/src/services/orders.service.ts]
- [Source: apps/api/src/services/debt-adjustments.service.ts]
- [Source: apps/api/src/routes/orders.routes.ts]
- [Source: apps/api/src/routes/debt-adjustments.routes.ts]
- [Source: apps/web/src/features/orders/order-detail-view.tsx]
- [Source: apps/web/src/features/orders/use-orders.ts]
- [Source: apps/web/src/features/orders/orders-api.ts]
- [Source: apps/web/src/stores/use-auth-store.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- All 10 tasks completed (2026-05-04)
- Backend: Drizzle schema (order_returns + order_return_items), migration 0026, returns service (createReturn + getOrderReturns + getReturnableItems), 3 new routes on orders.routes.ts
- Frontend: API layer + TanStack Query hooks, ReturnDialog component, updated OrderDetailView with return button (role-gated) + return history section
- Permission: added orders.return (owner, manager)
- Audit: added order.returned action
- TypeScript compile clean: shared + api + web + notifications (4/4)
- New tests: 12 integration tests pass (returns.integration.test.ts)
- Full test suite: 590 pass, 1 pre-existing fail (notifications-emit unrelated)

### Change Log

- 2026-05-04: Initial implementation of Story 7-2 (all 10 tasks)

### File List

**New files:**

- packages/shared/src/schema/order-returns.ts
- packages/shared/src/schema/order-return-items.ts
- packages/shared/src/schema/order-return-management.ts
- apps/api/src/db/migrations/0026_unique_sumo.sql
- apps/api/src/services/returns.service.ts
- apps/api/src/__tests__/returns.integration.test.ts
- apps/web/src/features/orders/return-dialog.tsx

**Modified files:**

- packages/shared/src/schema/index.ts (added order-return exports)
- packages/shared/src/schema/order-management.ts (added partial_return/full_return to orderStatusSchema)
- packages/shared/src/schema/audit-log.ts (added order.returned action)
- packages/shared/src/constants/permissions.ts (added orders.return)
- packages/shared/src/constants/permissions.test.ts (added orders.return to matrix)
- apps/api/src/routes/orders.routes.ts (added return routes)
- apps/web/src/features/orders/orders-api.ts (added return API functions)
- apps/web/src/features/orders/use-orders.ts (added return hooks)
- apps/web/src/features/orders/order-detail-view.tsx (added return button + history section)
- apps/web/src/features/orders/order-list.tsx (added partial_return/full_return status badges)
- apps/web/src/features/audit/action-labels.ts (added order.returned label)
