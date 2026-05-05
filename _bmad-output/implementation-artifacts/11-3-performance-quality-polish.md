# Story 11.3: Performance & Quality Polish

Status: ready-for-dev

## Story

As a **chủ cửa hàng**,
I want app nhanh, dễ dùng, và accessible cho mọi thiết bị,
so that nhân viên thao tác hiệu quả hơn và ít lỗi hơn.

## Acceptance Criteria

1. **Fix N+1 Query trong getOrderReturns** (TD11)
   - Given getOrderReturns service query returns items
   - When có N return rows
   - Then load tất cả return items trong 1 query (JOIN hoặc IN) thay vì N queries loop
   - And POS variant barcode search ≤ 3 queries tổng (hiện 5 round-trips khi có variant match)

2. **Category sortOrder Unique Constraint** (TD12)
   - Given 2 concurrent category updates đổi parent
   - When cả hai có sortOrder trùng
   - Then DB unique constraint (storeId, parentId, sort_order) prevent duplicate
   - And retry logic hoặc UPDATE CASE WHEN bulk reorder

3. **Notification Deliveries Purge Cron** (TD13)
   - Given notification_deliveries table tích luỹ records
   - When records older than 90 ngày
   - Then purge endpoint/cron xoá records cũ (retain 90 days configurable)
   - And log count deleted

4. **Touch Targets 44x44px** (TD14)
   - Given CartItem stepper buttons, CategoryFilter chips, scanner button
   - When render trên mobile (≤767px)
   - Then touch targets ≥ 44x44px
   - And CartItem stepper hiện h-9/w-9 (36px) → nâng lên min-h-11/min-w-11 (44px)
   - And CategoryFilter chips thêm min-h-11 padding

5. **PosSearchBar ARIA Combobox** (TD15)
   - Given PosSearchBar component với suggestions dropdown
   - When user type và suggestions hiện
   - Then input có role="combobox", aria-expanded, aria-controls
   - And suggestion list có role="listbox", mỗi item role="option"
   - And aria-activedescendant track item đang highlight

6. **Combined Payment Detail Verify** (TD16)
   - Given thanh toán POS kết hợp (combined)
   - When xem chi tiết đơn hàng
   - Then hiển thị cashAmount và transferAmount riêng biệt
   - NOTE: DB columns đã tồn tại (orders.cashAmount, orders.transferAmount). Cần verify frontend hiển thị đúng.

7. **StatusBadge Shared Component** (TD24)
   - Given StatusBadge và PaymentStatusBadge duplicate trong order-list.tsx và order-detail-view.tsx
   - When cần render badge trạng thái
   - Then extract 1 shared component cho mỗi loại
   - And cả 2 file import cùng component

8. **CategoryDiscount zodResolver** (TD25)
   - Given CreateCategoryDiscountDialog và EditCategoryDiscountDialog
   - When form validation
   - Then dùng zodResolver (thay manual validation)
   - And remove duplicate logic, delegate cho Zod schema

9. **Shared Variant Mapping Helper** (TD26)
   - Given searchProductsForPos service map variant data 2 lần (line 1932 + line 2017)
   - When map variant row → PosVariantItem
   - Then extract shared helper function `mapVariantToPosItem(v)`
   - And cả 2 loop dùng helper

10. **Unit Conversion Return Documentation** (TD27)
    - Given trả hàng sản phẩm có unit conversion
    - When tạo phiếu trả
    - Then document design limitation "unitConversionId not stored in order_items"
    - And thêm TODO comment trong returns.service.ts + note trong deferred-work.md

11. **Category Name Whitespace Normalization** (TD28)
    - Given category name input "Cà phê" (multiple spaces)
    - When save category
    - Then collapse thành "Cà phê" (single space) trước khi save
    - And unique check normalize whitespace

12. **Notification Error Logging** (TD29)
    - Given packages/notifications/src/index.ts có 6 catch blocks swallow errors
    - When exception xảy ra
    - Then log error với context (không silent `catch {}`)
    - And preserve stack trace cho debugging

13. **POS Search Query Optimization** (TD30)
    - Given searchProductsForPos hiện dùng 5 queries khi có variant search
    - When search có term match variant barcode
    - Then giảm xuống ≤ 3 queries: (1) product search, (2) variant load for matched, (3) combined variant barcode search with JOIN
    - And merge variant mapping logic (liên quan TD26)

## Tasks / Subtasks

- [ ] Task 1: Fix N+1 Query trong getOrderReturns (AC: #1)
  - [ ] 1.1 Sửa `apps/api/src/services/returns.service.ts:574` — thay for-loop query thành single query với `inArray(orderReturnItems.returnId, returnIds)`
  - [ ] 1.2 Group items by returnId trong code sau query
  - [ ] 1.3 Test: returns với nhiều items load chính xác, 0 N+1

- [ ] Task 2: POS Search Query Optimization (AC: #13, #1)
  - [ ] 2.1 Sửa `apps/api/src/services/products.service.ts:1955-2037` — merge variant barcode search vào query chính bằng LEFT JOIN
  - [ ] 2.2 Hoặc: kết hợp product query + variant barcode check thành 1 query với UNION/subquery
  - [ ] 2.3 Giảm tổng queries từ 5 xuống ≤ 3
  - [ ] 2.4 Test: search by variant barcode vẫn trả kết quả đúng

- [ ] Task 3: Extract Shared Variant Mapping Helper (AC: #9)
  - [ ] 3.1 Tạo helper function `mapVariantToPosItem(v: typeof productVariants.$inferSelect): PosVariantItem` trong `products.service.ts` (hoặc separate file)
  - [ ] 3.2 Replace inline mapping tại line 1932-1951 và line 2017-2035
  - [ ] 3.3 Test: output unchanged

- [ ] Task 4: Category sortOrder Unique Constraint (AC: #2)
  - [ ] 4.1 Tạo migration: `ALTER TABLE categories ADD CONSTRAINT categories_store_parent_sort_unique UNIQUE (store_id, parent_id, sort_order)`
  - [ ] 4.2 Sửa `apps/api/src/services/categories.service.ts` — handle unique violation với retry (dùng existing `unwrapDriverError` pattern)
  - [ ] 4.3 `reorderCategories` function (line 426) cần update logic để tránh conflict
  - [ ] 4.4 Test: concurrent updates không crash, sortOrder unique enforced

- [ ] Task 5: Notification Deliveries Purge (AC: #3)
  - [ ] 5.1 Tạo service function `purgeOldDeliveries(db, retentionDays=90)` trong `packages/notifications/src/`
  - [ ] 5.2 Tạo API endpoint `POST /api/notifications/purge` (admin-only) hoặc cron hook
  - [ ] 5.3 Delete from notification_deliveries WHERE createdAt < NOW() - retentionDays
  - [ ] 5.4 Log: `"Purged N notification deliveries older than 90 days"`
  - [ ] 5.5 Test: records older than threshold deleted, recent preserved

- [ ] Task 6: Touch Targets 44px (AC: #4)
  - [ ] 6.1 Sửa `apps/web/src/features/pos/components/CartItem.tsx:211,223,239` — đổi `h-9 w-9` → `h-11 w-11` (44px) cho mobile, giữ `sm:h-7 sm:w-7` cho desktop
  - [ ] 6.2 Sửa `apps/web/src/features/pos/components/CategoryFilter.tsx` — thêm `min-h-[44px]` cho chips trên mobile
  - [ ] 6.3 Verify scanner button trong PosScreen.tsx đạt 44px
  - [ ] 6.4 Visual test: mobile layout không bị vỡ

- [ ] Task 7: PosSearchBar ARIA Combobox (AC: #5)
  - [ ] 7.1 Sửa `apps/web/src/features/pos/components/PosSearchBar.tsx`
  - [ ] 7.2 Input: thêm `role="combobox"`, `aria-expanded={isOpen}`, `aria-controls="pos-search-listbox"`, `aria-autocomplete="list"`
  - [ ] 7.3 Suggestion list: thêm `role="listbox"`, `id="pos-search-listbox"`
  - [ ] 7.4 Mỗi suggestion item: `role="option"`, `id="pos-search-option-{index}"`
  - [ ] 7.5 Input: `aria-activedescendant="pos-search-option-{activeIndex}"` khi navigate
  - [ ] 7.6 Test: axe-core hoặc manual verify no accessibility violations

- [ ] Task 8: Combined Payment Display Verify (AC: #6)
  - [ ] 8.1 Check `apps/web/src/features/orders/order-detail-view.tsx` — verify cashAmount + transferAmount hiển thị khi paymentMethod === 'combined'
  - [ ] 8.2 Nếu chưa hiển thị: thêm section "Chi tiết thanh toán" với tiền mặt / chuyển khoản
  - [ ] 8.3 Check invoice print template cũng hiển thị chi tiết

- [ ] Task 9: Extract StatusBadge Shared Component (AC: #7)
  - [ ] 9.1 Tạo `apps/web/src/features/orders/components/order-status-badge.tsx` — export `OrderStatusBadge` + `PaymentStatusBadge`
  - [ ] 9.2 Move logic từ `order-list.tsx:50-113` và `order-detail-view.tsx:48-111`
  - [ ] 9.3 Update imports trong cả 2 file
  - [ ] 9.4 Test: visual unchanged

- [ ] Task 10: CategoryDiscount zodResolver (AC: #8)
  - [ ] 10.1 Tạo Zod schema cho category discount form trong shared hoặc local
  - [ ] 10.2 Sửa `apps/web/src/features/pricing/components/CreateCategoryDiscountDialog.tsx` — useForm({ resolver: zodResolver(schema) })
  - [ ] 10.3 Sửa `EditCategoryDiscountDialog.tsx` — same pattern
  - [ ] 10.4 Remove manual validation logic
  - [ ] 10.5 Test: validation behavior unchanged

- [ ] Task 11: Unit Conversion Return Documentation (AC: #10)
  - [ ] 11.1 Add TODO comment in `apps/api/src/services/returns.service.ts` near return creation logic
  - [ ] 11.2 Update `_bmad-output/implementation-artifacts/deferred-work.md` — add note about unitConversionId limitation
  - [ ] 11.3 Note: Phase 2 sẽ add unitConversionId column to order_items

- [ ] Task 12: Category Name Whitespace Normalization (AC: #11)
  - [ ] 12.1 Sửa `apps/api/src/services/categories.service.ts` — hàm createCategory: `name = name.replace(/\s+/g, ' ').trim()`
  - [ ] 12.2 Sửa updateCategory: same normalization
  - [ ] 12.3 Unique check: normalize before comparing
  - [ ] 12.4 Test: "Cà phê" → "Cà phê", unique collision detected after normalize

- [ ] Task 13: Notification Error Logging (AC: #12)
  - [ ] 13.1 Sửa `packages/notifications/src/index.ts` — 6 `catch {}` blocks
  - [ ] 13.2 Đổi thành `catch (err) { logger.error({ err, context }, 'message') }`
  - [ ] 13.3 Ensure logger available (import from service context hoặc pass as dependency)
  - [ ] 13.4 Test: error thrown → logged with stack trace

## Dev Notes

### Architecture Constraints

- **Framework**: Hono v4.12.0 + @hono/node-server v1.15.0
- **DB**: Drizzle ORM + PostgreSQL. Schema: `packages/shared/src/schema/`
- **Validation**: Zod 3.x — zodResolver via `@hookform/resolvers`
- **Testing**: Vitest + Hono test client
- **CSS**: Tailwind CSS 3.x — utility classes, responsive prefix `sm:`, `md:`, `lg:`

### Key Files to Touch

| File                                                                        | Action                                          | TD         |
| --------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| `apps/api/src/services/returns.service.ts`                                  | EDIT (N+1 fix)                                  | TD11       |
| `apps/api/src/services/products.service.ts`                                 | EDIT (POS search optimization + helper extract) | TD26, TD30 |
| `apps/api/src/services/categories.service.ts`                               | EDIT (unique constraint handling + whitespace)  | TD12, TD28 |
| `packages/notifications/src/index.ts`                                       | EDIT (error logging)                            | TD29       |
| `packages/notifications/src/purge.ts`                                       | CREATE (purge service)                          | TD13       |
| `apps/web/src/features/pos/components/CartItem.tsx`                         | EDIT (touch targets)                            | TD14       |
| `apps/web/src/features/pos/components/CategoryFilter.tsx`                   | EDIT (touch targets)                            | TD14       |
| `apps/web/src/features/pos/components/PosSearchBar.tsx`                     | EDIT (ARIA)                                     | TD15       |
| `apps/web/src/features/orders/order-detail-view.tsx`                        | EDIT (verify combined + extract badge)          | TD16, TD24 |
| `apps/web/src/features/orders/order-list.tsx`                               | EDIT (extract badge)                            | TD24       |
| `apps/web/src/features/orders/components/order-status-badge.tsx`            | CREATE (shared badge)                           | TD24       |
| `apps/web/src/features/pricing/components/CreateCategoryDiscountDialog.tsx` | EDIT (zodResolver)                              | TD25       |
| `apps/web/src/features/pricing/components/EditCategoryDiscountDialog.tsx`   | EDIT (zodResolver)                              | TD25       |
| `_bmad-output/implementation-artifacts/deferred-work.md`                    | EDIT (add note)                                 | TD27       |

### Testing Standards

- Unit tests co-located: `*.test.ts` cạnh source file
- Integration tests: `__tests__/` folder
- Vitest + Hono test client `app.request()`
- Pattern: Given/When/Then trong describe/it blocks

### Previous Story Intelligence (11-1, 11-2)

- Rate limiter, CORS, security headers đã implement (11-1)
- Webhook HMAC replay, SSRF, crypto validation đã implement (11-2)
- Logger pattern: `c.get('logger')` in routes, direct import in services
- Error pattern: throw `ApiError` with status + message
- DB constraint error: dùng `unwrapDriverError` + `getPgErrorCode` từ `apps/api/src/lib/pg-errors.ts`

### Critical Implementation Notes

1. **TD11 (N+1)**: `getOrderReturns` line 574 loops qua returnRows, mỗi row query orderReturnItems. Fix: collect all returnIds, 1 query IN(...), group in JS.

2. **TD30 (POS Search)**: Hiện 5 queries: (1) products search, (2) variants for hasVariants products, (3) variant barcode match, (4) extra products fetch, (5) extra variants fetch. Merge 3+4+5 vào combined query.

3. **TD12 (sortOrder)**: Hiện không có unique constraint. `reorderCategories` dùng loop UPDATE. Cần: (a) migration add constraint, (b) reorder dùng temporary gap hoặc set all to NULL first then reassign.

4. **TD14 (Touch)**: CartItem stepper hiện `h-9 w-9` = 36px. WCAG 2.5.5 yêu cầu ≥ 44px. Đổi class mobile, giữ desktop nhỏ hơn.

5. **TD24 (Badge)**: `StatusBadge` duplicate ở `order-list.tsx:50` và `order-detail-view.tsx:48`. Logic identical. Extract ra file riêng.

6. **TD29 (Logging)**: 6 empty catch blocks trong `notifications/src/index.ts`. Cần inject logger. Package notifications hiện không import logger. Options: (a) pass logger as param, (b) import pino directly, (c) use console.error as fallback.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-11-technical-debt-resolution.md#Story 11.3]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- [Source: _bmad-output/implementation-artifacts/11-1-production-ready-critical-fixes.md]
- [Source: _bmad-output/implementation-artifacts/11-2-security-hardening.md]

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes List

(to be filled after implementation)

### File List

(to be filled after implementation)
