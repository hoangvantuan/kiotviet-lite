# Story 4.5: Tích hợp 6 tầng giá vào POS

Status: done

## Story

As a nhân viên bán hàng,
I want hệ thống tự động áp dụng đúng giá theo 6 tầng ưu tiên khi chọn khách hàng và sản phẩm,
so that không cần nhớ giá, bán đúng chính sách, tránh sai sót.

## Acceptance Criteria (BDD)

### AC1: Pricing engine 6 tầng (`packages/shared/src/utils/pricing-engine.ts`)

**Given** pricing engine nhận `product_id`, `customer_id` (nullable), `quantity`
**When** gọi `resolvePrice({ db, storeId, productId, customerId, quantity })`
**Then** engine tính giá theo thứ tự ưu tiên:

| Tầng | Tên              | Bảng/Field                                                      | Điều kiện áp dụng                                                         |
| ---- | ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | Giá riêng KH     | `customer_prices` (customerId + productId → price)              | customerId NOT NULL                                                       |
| 2    | CK danh mục      | `category_discounts` (categoryId + customerId/groupId + minQty) | customerId NOT NULL, product có categoryId                                |
| 3    | Giá chỉnh tay    | `order_items.price_override = true`                             | Chỉ khi nhân viên đã sửa giá tay trên cart (client state, KHÔNG query DB) |
| 4    | Giá theo SL      | `volume_prices` (productId + minQty → price)                    | quantity >= minQty                                                        |
| 5    | Bảng giá nhóm KH | `price_list_items` JOIN `customer_groups.default_price_list_id` | customerId NOT NULL, customer có groupId, group có defaultPriceListId     |
| 6    | Giá bán lẻ       | `products.selling_price`                                        | Luôn có (fallback)                                                        |

**And** dừng ở tầng đầu tiên tìm thấy giá hợp lệ (> 0)
**And** trả về `{ price: number, source: PriceSource, sourceDetail?: string }`

**QUAN TRỌNG tầng 3**: Giá chỉnh tay là client state (cart store `priceOverride = true`). Engine server-side BỎ QUA tầng 3. Frontend tự xử lý: nếu cart item đã có `priceOverride = true` thì KHÔNG gọi engine cho item đó (giữ giá user đã sửa)

**Given** `customerId` = null (khách lẻ)
**When** engine resolve
**Then** bỏ qua tầng 1, 2, 5 (cần customer). Chỉ xét tầng 4 (volume) → tầng 6 (giá lẻ)

### AC2: API endpoint resolve giá (`POST /api/v1/pos/resolve-prices`)

**Given** POS cần tính giá cho 1+ sản phẩm trong đơn hàng
**When** gọi `POST /api/v1/pos/resolve-prices` với body:

```json
{
  "customerId": "<uuid | null>",
  "items": [{ "productId": "<uuid>", "variantId": "<uuid | null>", "quantity": 5 }]
}
```

**Then** API validate qua `resolvePricesSchema` (Zod):

- `customerId`: optional uuid hoặc null
- `items`: array 1-100 items, mỗi item có `productId` (uuid required), `variantId` (uuid optional/null), `quantity` (int >= 1)
- `.strict()`

**And** service `resolvePrices`:

- Cho mỗi item, chạy pricing engine 6 tầng
- Trả `{ data: ResolvedPriceItem[] }` với mỗi item: `{ productId, variantId, price, source, sourceDetail }`
- `source`: enum `'customer_price' | 'category_discount' | 'manual_override' | 'volume_price' | 'price_list' | 'retail_price'`
- `sourceDetail`: mô tả nguồn. Ví dụ tầng 5: tên bảng giá; tầng 2: "Giảm 10% danh mục Đồ uống"
- Filter store_id (multi-tenant)
- Middleware: `requireAuth` + `requirePermission('pos.sell')`

**And** mount vào `apps/api/src/routes/pos.routes.ts` (thêm endpoint, KHÔNG tạo route file mới):

```typescript
app.post('/resolve-prices', async (c) => { ... })
```

**And** mount TRƯỚC route `/orders` trong pos.routes.ts (literal route trước parameterized)

### AC3: Customer selection trên POS

**Given** POS hiện tại KHÔNG có customer selection (checkout luôn `customerId: null`)
**When** Story 4.5 thêm customer select
**Then** thêm vào `CartPanel.tsx` phần header (trên danh sách items):

- `<CustomerSearchCombobox>` component: Combobox search KH theo tên/phone (debounce 300ms)
- State: `selectedCustomerId: string | null` lưu trong cart store (thêm vào `TabState`)
- Khi chọn KH: lưu `customerId` + `customerName` + `customerGroupId` vào TabState
- Nút "x" xoá customer (reset về null)
- Hiển thị: tên KH + phone + nhóm (nếu có)

**And** mở rộng `TabState` trong `use-cart-store.ts`:

```typescript
interface TabState {
  items: CartItem[]
  orderDiscountType: DiscountType | null
  orderDiscountValue: number
  orderDiscountAmount: number
  // Story 4.5: customer context
  customerId: string | null
  customerName: string | null
  customerGroupId: string | null
  customerGroupName: string | null
}
```

**And** thêm actions: `setCustomer(customer: SelectedCustomer | null)` vào `CartState`

**And** sửa `PosScreen.tsx` checkout flow: truyền `customerId` từ cart store thay vì hardcode `null`

### AC4: Auto re-price khi chọn/đổi KH

**Given** đơn hàng đã có sản phẩm trong cart
**When** chọn khách hàng từ CustomerSearchCombobox
**Then** gọi `POST /api/v1/pos/resolve-prices` với `customerId` mới + tất cả items (trừ item có `priceOverride = true`)
**And** cập nhật `unitPrice` và `priceSource` cho từng item theo kết quả engine
**And** item có `priceOverride = true` giữ nguyên giá user đã sửa, KHÔNG gọi engine
**And** `PriceSourceBadge` cập nhật tương ứng
**And** tổng đơn hàng tính lại

**Given** khách hàng đang được chọn trên POS
**When** bỏ chọn KH (click "x")
**Then** re-price tất cả items (trừ `priceOverride = true`) với `customerId = null`
**And** badge đổi về "Giá lẻ" hoặc "Giá SL" (tuỳ tầng match)

### AC5: Auto re-price khi đổi số lượng vượt volume tier

**Given** sản phẩm có volume_prices: [từ 1: 50.000, từ 10: 45.000, từ 50: 40.000]
**When** thay đổi quantity từ 5 lên 12
**Then** gọi resolve-prices cho item đó (cùng customerId hiện tại)
**And** nếu tầng volume có ưu tiên cao hơn tầng hiện tại (hoặc cùng tầng nhưng giá mới) → cập nhật giá + badge
**And** KHÔNG re-price nếu item có `priceOverride = true`

### AC6: PriceSourceBadge component

**Given** sản phẩm đang hiển thị trên dòng đơn hàng POS
**When** giá đã được xác định bởi pricing engine
**Then** hiển thị `<PriceSourceBadge>` bên cạnh giá, nội dung + màu theo tầng:

| Source              | Badge text      | Color (Tailwind)                |
| ------------------- | --------------- | ------------------------------- |
| `customer_price`    | "Giá riêng KH"  | `bg-purple-100 text-purple-700` |
| `category_discount` | "CK danh mục"   | `bg-blue-100 text-blue-700`     |
| `manual_override`   | "Giá chỉnh tay" | `bg-orange-100 text-orange-700` |
| `volume_price`      | "Giá SL"        | `bg-green-100 text-green-700`   |
| `price_list`        | "BG {tên}"      | `bg-teal-100 text-teal-700`     |
| `retail_price`      | "Giá lẻ"        | `bg-gray-100 text-gray-600`     |

**And** tạo `apps/web/src/features/pos/components/PriceSourceBadge.tsx`
**And** dùng Tailwind classes, KHÔNG CSS custom

### AC7: PriceSourceTooltip (click badge xem chi tiết)

**Given** PriceSourceBadge hiển thị trên dòng sản phẩm
**When** nhân viên click vào badge
**Then** hiển thị Popover chi tiết:

- Giá ở từng tầng (nếu có), tầng đang áp dụng highlight bold
- Tầng không match: xám, ghi lý do bỏ qua ("Không có giá riêng", "Không đủ SL", "KH không thuộc nhóm nào")
- Tầng bị override: ghi "Đã sửa tay"

**And** endpoint resolve-prices trả thêm optional `breakdown: TierBreakdown[]` (mỗi tầng: `{ tier, price, matched, reason }`)

### AC8: Cart store mở rộng `priceSource` cho CartItem

**Given** CartItem hiện có `unitPrice`, `costPrice`, `originalPrice`, `priceOverride`
**When** Story 4.5 thêm tracking nguồn giá
**Then** mở rộng `CartItem` interface:

```typescript
interface CartItem {
  // ... existing fields
  priceSource: PriceSource // 'customer_price' | 'category_discount' | 'manual_override' | 'volume_price' | 'price_list' | 'retail_price'
  priceSourceDetail: string | null // tên bảng giá, mô tả CK, etc.
}
```

**And** mở rộng `CartItemInput`: `priceSource` default `'retail_price'`, `priceSourceDetail` default `null`
**And** khi `addItem`: mặc định `priceSource = 'retail_price'`. Sau đó nếu có customer → re-price tự động
**And** khi `updateUnitPrice` (sửa giá tay): set `priceSource = 'manual_override'`, `priceSourceDetail = null`
**And** type `PriceSource` định nghĩa tại `packages/shared/src/constants/pricing.ts`

### AC9: Settings cascade mode (Cài đặt > Chính sách giá)

**DEFER sang phase 2**. Epic spec ghi 3 tuỳ chọn cascade + 3 tuỳ chọn price change strategy. Story 4.5 MVP chỉ implement pricing engine resolve. Cascade mode (realtime/xác nhận/theo lịch) và price change strategy (thủ công/cảnh báo/tự động) để backlog cho story riêng.

Lý do: scope quá lớn, cần UX riêng, không ảnh hưởng core flow POS.

### AC10: Auto re-price khi add sản phẩm

**Given** customer đã được chọn trong cart
**When** add sản phẩm mới vào cart
**Then** ngay sau `addItem`, gọi resolve-prices cho sản phẩm mới với customerId hiện tại + quantity
**And** cập nhật `unitPrice`, `priceSource`, `priceSourceDetail` từ kết quả
**And** nếu KHÔNG có customer: dùng giá `basePrice` từ product (tầng 6: selling_price) hoặc check volume_prices nếu quantity > 1

### AC11: Test coverage

**Given** mọi feature mới phải có test
**When** triển khai story 4.5
**Then** backend integration test `apps/api/src/__tests__/pricing-engine.integration.test.ts`:

**Setup**: store + owner + staff + 2 customers (1 có group, 1 không) + 2 customer_groups (1 có defaultPriceListId) + 2 price_lists + price_list_items + 3 products (thuộc categories khác nhau) + customer_prices cho customer A + product 1 + volume_prices cho product 2 + category_discounts cho category A + customer_group 1

**Test cases**:

- **Tầng 1**: Customer A + Product 1 → trả giá từ `customer_prices`. Source = `customer_price`
- **Tầng 2**: Customer A (thuộc group có CK danh mục cho category A) + Product thuộc category A + quantity >= minQty → trả giá sau CK. Source = `category_discount`
- **Tầng 2 skip**: quantity < minQty → skip tầng 2, xuống tầng tiếp
- **Tầng 4**: Khách lẻ (null) + Product 2 + quantity = 15 (tier 10: 45k) → trả 45.000. Source = `volume_price`
- **Tầng 4 skip**: quantity = 3 (dưới mọi tier) → skip, xuống tầng 6
- **Tầng 5**: Customer thuộc group có `defaultPriceListId` + Product có giá trong price_list đó → trả giá bảng giá. Source = `price_list`
- **Tầng 5 skip**: group KHÔNG có defaultPriceListId → skip
- **Tầng 5 skip**: product KHÔNG có giá trong price_list → skip
- **Tầng 6**: Mọi product luôn có `selling_price` → fallback. Source = `retail_price`
- **Priority**: Customer A + Product 1 (có giá riêng 40k) + volume tier match 35k → trả 40k (tầng 1 > tầng 4)
- **Khách lẻ**: customerId = null → skip tầng 1,2,5 → check tầng 4 → fallback tầng 6
- **Multi-tenant**: store B không access pricing data store A
- **Batch resolve**: 5 items cùng lúc → trả đúng giá cho từng item

**And** unit test shared pricing types `packages/shared/src/constants/pricing.test.ts`:

- PriceSource enum valid values
- resolvePricesSchema validation (empty items → fail, quantity 0 → fail, valid → pass)

**And** frontend: verify flow thủ công (xem Tasks)

## Tasks / Subtasks

### Phase A: Shared Types + Constants

- [x] **Task 1: PriceSource type + resolvePricesSchema** (AC: #1, #2, #8)
  - [x] 1.1: Tạo `packages/shared/src/constants/pricing.ts`:
    - `PriceSource` type literal union: `'customer_price' | 'category_discount' | 'manual_override' | 'volume_price' | 'price_list' | 'retail_price'`
    - `PRICE_SOURCE_LABELS: Record<PriceSource, string>` map tên tiếng Việt cho badge
    - Export từ `packages/shared/src/constants/index.ts`
  - [x] 1.2: Tạo `packages/shared/src/schema/pricing-resolve.ts`:
    - `resolvePriceItemSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional(), quantity: z.number().int().min(1) })`
    - `resolvePricesSchema = z.object({ customerId: z.string().uuid().nullable().optional(), items: z.array(resolvePriceItemSchema).min(1).max(100) }).strict()`
    - `resolvedPriceItemSchema = z.object({ productId, variantId, price, source: priceSourceSchema, sourceDetail: z.string().nullable() })`
    - Type exports: `ResolvePricesInput`, `ResolvePriceItem`, `ResolvedPriceItem`
    - Export từ `packages/shared/src/schema/index.ts`
  - [x] 1.3: Unit test `packages/shared/src/constants/pricing.test.ts`

### Phase B: Backend Pricing Engine + API

- [x] **Task 2: Pricing engine service** (AC: #1)
  - [x] 2.1: Tạo `apps/api/src/services/pricing.service.ts`:
    - Helper `findCustomerPriceForProduct(db, storeId, customerId, productId)`: query `customer_prices` WHERE customerId + productId → price hoặc null
    - Helper `findVolumePriceForProduct(db, storeId, productId, quantity)`: query `volume_prices` WHERE productId + minQty <= quantity, ORDER BY minQty DESC LIMIT 1 → price hoặc null
    - Helper `findPriceListPriceForProduct(db, storeId, customerId, productId)`: query customer → customer_groups.default_price_list_id → price_list_items WHERE priceListId + productId + price_list is_active + effective dates → price hoặc null
    - Reuse `findApplicableCategoryDiscount` từ `apps/api/src/services/category-discounts.service.ts`
    - Main function `resolveProductPrice({ db, storeId, customerId, productId, quantity }): Promise<ResolvedPrice>`:
      - Nếu customerId: check tầng 1 → 2 → 4 → 5 → 6
      - Nếu !customerId: check tầng 4 → 6
      - Tầng 3 skip (client state)
      - Return `{ price, source, sourceDetail, breakdown }`
    - Batch function `resolvePrices({ db, storeId, customerId, items }): Promise<ResolvedPriceItem[]>` (loop resolveProductPrice)
  - [x] 2.2: Helper `buildBreakdown(db, storeId, customerId, productId, quantity)`: query tất cả tầng, trả `TierBreakdown[]` cho tooltip

- [x] **Task 3: API endpoint resolve-prices** (AC: #2)
  - [x] 3.1: Sửa `apps/api/src/routes/pos.routes.ts`: thêm `POST /resolve-prices`:
    - Parse body qua `resolvePricesSchema`
    - Gọi `resolvePrices({ db, actor.storeId, customerId, items })`
    - Trả `{ data: ResolvedPriceItem[] }`
    - Mount TRƯỚC route `/orders`
    - KHÔNG tạo route file mới, thêm vào `pos.routes.ts` vì đây là chức năng POS
  - [x] 3.2: Import `resolvePrices` trong pos.routes.ts

### Phase C: Frontend Cart Store + Customer Selection

- [x] **Task 4: Cart store mở rộng** (AC: #3, #8)
  - [x] 4.1: Sửa `apps/web/src/stores/use-cart-store.ts`:
    - Import `PriceSource` từ `@kiotviet-lite/shared`
    - Thêm `priceSource: PriceSource` + `priceSourceDetail: string | null` vào `CartItem` interface
    - Thêm `customerId`, `customerName`, `customerGroupId`, `customerGroupName` vào `TabState`
    - Mở rộng `CartItemInput`: `priceSource` optional default `'retail_price'`, `priceSourceDetail` optional default `null`
    - Sửa `addItem`: init `priceSource = input.priceSource ?? 'retail_price'`, `priceSourceDetail = input.priceSourceDetail ?? null`
    - Sửa `updateUnitPrice`: set `priceSource = 'manual_override'`, `priceSourceDetail = null`
    - Thêm action `setCustomer(customer: { id: string, name: string, groupId: string | null, groupName: string | null } | null)`
    - Thêm action `updateItemPrice(id: string, price: number, source: PriceSource, sourceDetail: string | null)` cho re-price result apply
    - Sửa `createEmptyTab()` init `customerId: null, customerName: null, customerGroupId: null, customerGroupName: null`
  - [x] 4.2: Sửa `clearCart()` reset customer fields về null

- [x] **Task 5: API client + hook resolve-prices** (AC: #2)
  - [x] 5.1: Tạo `apps/web/src/features/pos/pos-pricing-api.ts`:
    - `resolvePricesApi(input: ResolvePricesInput): Promise<{ data: ResolvedPriceItem[] }>`
  - [x] 5.2: Tạo `apps/web/src/features/pos/hooks/use-resolve-prices.ts`:
    - `useResolvePricesMutation()` (TanStack Query mutation, KHÔNG dùng query vì là POST on-demand)
    - onSuccess: loop results, gọi `cartStore.updateItemPrice` cho từng item

- [x] **Task 6: CustomerSearchCombobox** (AC: #3)
  - [x] 6.1: Tạo `apps/web/src/features/pos/components/CustomerSearchCombobox.tsx`:
    - Combobox pattern (Popover + Command từ shadcn/ui)
    - Search customers API `GET /api/v1/customers?search=...&pageSize=10` (debounce 300ms)
    - Hiển thị mỗi option: tên + phone + nhóm KH (nếu có)
    - onSelect: gọi `cartStore.setCustomer({ id, name, groupId, groupName })`
    - Nút clear "x" khi đã chọn: gọi `cartStore.setCustomer(null)`
    - Reuse `useCustomersQuery` từ `apps/web/src/features/customers/use-customers.ts` nếu query params tương thích, hoặc tạo query inline
  - [x] 6.2: Tạo `apps/web/src/features/pos/components/QuickCreateCustomerInline.tsx` (option cuối Combobox "Tạo KH mới"):
    - Reuse `QuickCreateCustomerDialog` từ `apps/web/src/features/customers/components/QuickCreateCustomerDialog.tsx`
    - Sau tạo thành công: auto-select customer mới

### Phase D: POS Integration + Re-price

- [x] **Task 7: Integrate CustomerSearchCombobox vào CartPanel** (AC: #3, #4)
  - [x] 7.1: Sửa `apps/web/src/features/pos/components/CartPanel.tsx`:
    - Thêm `<CustomerSearchCombobox>` SAU CartTabBar, TRƯỚC danh sách items
    - Đọc `customerId` từ cart store `s.tabs[s.activeTab]`
    - Hiển thị compact: icon Users + tên KH + phone (nếu đã chọn), nút clear
    - Nếu chưa chọn: placeholder "Khách lẻ" + nút search
  - [x] 7.2: Sửa `PosScreen.tsx` checkout: đọc `customerId` từ `tabs[activeTab].customerId` thay vì hardcode `null`

- [x] **Task 8: Auto re-price hook** (AC: #4, #5, #10)
  - [x] 8.1: Tạo `apps/web/src/features/pos/hooks/use-auto-reprice.ts`:
    - Hook nhận `customerId`, `items` từ cart store
    - Khi `customerId` thay đổi: gọi `resolvePricesApi` cho TẤT CẢ items CHƯA có `priceOverride`
    - Apply kết quả vào cart store qua `updateItemPrice`
    - Debounce 200ms tránh gọi API quá nhiều khi user thay đổi nhanh
  - [x] 8.2: Integrate `useAutoReprice` vào `CartPanel.tsx` (hoặc `PosScreen.tsx`)
  - [x] 8.3: Khi add item + có customer: gọi resolve cho item mới ngay sau addItem
  - [x] 8.4: Khi đổi quantity: nếu item KHÔNG có priceOverride → re-resolve item đó

- [x] **Task 9: PriceSourceBadge + Tooltip** (AC: #6, #7)
  - [x] 9.1: Tạo `apps/web/src/features/pos/components/PriceSourceBadge.tsx`:
    - Props: `source: PriceSource`, `sourceDetail: string | null`, `breakdown?: TierBreakdown[]`
    - Render badge text + color theo bảng AC6
    - Click → mở Popover hiển thị breakdown chi tiết (nếu có)
  - [x] 9.2: Sửa `apps/web/src/features/pos/components/CartItem.tsx`:
    - Import `PriceSourceBadge`
    - Render badge cạnh giá (sau `formatVndWithSuffix(item.unitPrice)`)
    - Badge chỉ hiện khi `priceSource !== 'retail_price'` HOẶC khi customer đã chọn (để user biết rõ tầng nào)

### Phase E: Tests + Verify

- [ ] **Task 10: Backend integration tests** (AC: #11)
  - [ ] 10.1: Tạo `apps/api/src/__tests__/pricing-engine.integration.test.ts`:
    - Setup: seed đầy đủ data cho 6 tầng
    - Test cases theo AC11
    - Test API endpoint `POST /api/v1/pos/resolve-prices`
  - [ ] 10.2: Test multi-tenant isolation
  - [ ] 10.3: Test batch resolve (5 items)

- [x] **Task 11: Frontend manual verify** (AC: tất cả)
  - [x] 11.1: `pnpm typecheck` pass
  - [x] 11.2: `pnpm lint` pass
  - [x] 11.3: `pnpm test` pass toàn bộ suite (999/999, không regression)
  - [ ] 11.4: Manual flow khách lẻ:
    - POS → add SP "Coca Cola" (giá lẻ 15.000) → badge "Giá lẻ" (hoặc không badge)
    - Add 12 SP có volume tier [10: 45.000] → giá chuyển 45.000, badge "Giá SL"
    - Đổi qty về 3 → giá quay lại 50.000 (giá lẻ)
  - [ ] 11.5: Manual flow chọn KH:
    - POS → add 2 SP → chọn KH "Nguyễn Văn A" (có giá riêng SP 1) → SP 1 đổi giá + badge "Giá riêng KH". SP 2 giữ giá lẻ
    - Đổi KH sang "Trần Thị B" (thuộc nhóm có bảng giá) → SP 2 đổi giá theo bảng giá nhóm + badge "BG Sỉ"
    - Bỏ chọn KH (click x) → tất cả quay về giá lẻ/volume
  - [ ] 11.6: Manual flow sửa giá tay + re-price:
    - Chọn KH → SP có badge "Giá riêng KH" (40k) → sửa giá tay thành 38k → badge đổi "Giá chỉnh tay"
    - Đổi KH khác → SP đã sửa giá tay GIỮ NGUYÊN 38k (priceOverride = true). SP khác re-price theo KH mới
  - [ ] 11.7: Manual flow checkout với customer:
    - Chọn KH → add SP → thanh toán → đơn hàng lưu customerId
  - [ ] 11.8: Manual mobile (375px):
    - CustomerSearchCombobox hiển thị compact
    - PriceSourceBadge không bị tràn
  - [ ] 11.9: Click badge → Popover hiện breakdown các tầng

## Dev Notes

### Pattern reuse từ Story 4.3, 4.4, 4.4b (BẮT BUỘC tuân thủ)

| Khu vực                   | File hiện có                                                                         | Cách dùng                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Customer prices query     | `apps/api/src/services/customer-prices.service.ts`                                   | Tham khảo query pattern cho helper tầng 1                                      |
| Category discount resolve | `apps/api/src/services/category-discounts.service.ts:findApplicableCategoryDiscount` | REUSE trực tiếp cho tầng 2. KHÔNG viết lại                                     |
| Volume prices schema      | `packages/shared/src/schema/volume-prices.ts`                                        | Query `volume_prices` WHERE productId + minQty                                 |
| Price list items schema   | `packages/shared/src/schema/price-list-items.ts`                                     | Query `price_list_items` WHERE priceListId + productId                         |
| Customer groups schema    | `packages/shared/src/schema/customer-groups.ts:defaultPriceListId`                   | Lấy `defaultPriceListId` từ nhóm KH                                            |
| Price lists schema        | `packages/shared/src/schema/price-lists.ts`                                          | Check `is_active`, `effective_from/to` của bảng giá                            |
| Cart store                | `apps/web/src/stores/use-cart-store.ts`                                              | MỞ RỘNG, không rewrite. Thêm fields + actions                                  |
| CartItem component        | `apps/web/src/features/pos/components/CartItem.tsx`                                  | Sửa thêm PriceSourceBadge                                                      |
| CartPanel component       | `apps/web/src/features/pos/components/CartPanel.tsx`                                 | Sửa thêm CustomerSearchCombobox                                                |
| POS routes                | `apps/api/src/routes/pos.routes.ts`                                                  | Thêm endpoint, KHÔNG tạo file mới                                              |
| POS Screen                | `apps/web/src/features/pos/components/PosScreen.tsx`                                 | Sửa checkout customerId                                                        |
| Quick create KH           | `apps/web/src/features/customers/components/QuickCreateCustomerDialog.tsx`           | Reuse cho "Tạo KH mới" trong Combobox                                          |
| Customer API              | `apps/web/src/features/customers/use-customers.ts`                                   | Reuse query hook cho search KH                                                 |
| Pricing formulas          | `packages/shared/src/utils/pricing-formulas.ts`                                      | KHÔNG liên quan trực tiếp. Đây cho formula bảng giá, không phải pricing engine |
| Permission guard          | `usePermissions()` từ `apps/web/src/features/auth/use-permissions.ts`                | Dùng cho `pos.sell` check                                                      |
| ApiError                  | `apps/api/src/lib/errors.ts`                                                         | NOT_FOUND cho invalid productId/customerId                                     |
| Multi-tenant filter       | Mọi query PHẢI filter `store_id`                                                     | Pattern từ tất cả service files                                                |

### Files cần TẠO MỚI

**Shared (`packages/shared/src/`):**

- `constants/pricing.ts` (PriceSource type + labels)
- `constants/pricing.test.ts`
- `schema/pricing-resolve.ts` (Zod schemas cho resolve API)

**Backend (`apps/api/src/`):**

- `services/pricing.service.ts` (6-tier pricing engine)
- `__tests__/pricing-engine.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/pos/pos-pricing-api.ts` (API client)
- `features/pos/hooks/use-resolve-prices.ts` (mutation hook)
- `features/pos/hooks/use-auto-reprice.ts` (auto re-price logic)
- `features/pos/components/PriceSourceBadge.tsx`
- `features/pos/components/CustomerSearchCombobox.tsx`
- `features/pos/components/QuickCreateCustomerInline.tsx`

### Files cần SỬA

- `packages/shared/src/constants/index.ts`: export `pricing`
- `packages/shared/src/schema/index.ts`: export `pricing-resolve`
- `apps/api/src/routes/pos.routes.ts`: thêm `POST /resolve-prices`
- `apps/web/src/stores/use-cart-store.ts`: thêm 2 fields CartItem + 4 fields TabState + 2 actions
- `apps/web/src/features/pos/components/CartPanel.tsx`: thêm CustomerSearchCombobox
- `apps/web/src/features/pos/components/CartItem.tsx`: thêm PriceSourceBadge
- `apps/web/src/features/pos/components/PosScreen.tsx`: sửa checkout customerId

### Coupling quan trọng

**Story 4.4 (done):** `customer_prices` + `volume_prices` đã có. Helper CRUD đã sẵn. Story 4.5 chỉ cần query helpers đọc giá.

**Story 4.4b (done):** `findApplicableCategoryDiscount` đã expose. Cart store đã có `priceOverride` fields. Permission `pos.editPrice` đã có. Story 4.5 reuse tất cả.

**Story 4.3 (done):** `price_lists` + `price_list_items` đã có. `customer_groups.defaultPriceListId` đã có. Story 4.5 query trực tiếp.

**Story 3.3 (done):** POS checkout endpoint đã có. Story 4.5 sửa frontend truyền `customerId` từ cart store.

**Story 4.3c (backlog, so sánh bảng giá):** Không ảnh hưởng. Chạy song song được.

### Logic priority chi tiết

```
resolveProductPrice(db, storeId, customerId, productId, quantity):
  sellingPrice = product.sellingPrice  // fallback tầng 6

  if customerId:
    // Tầng 1: Giá riêng KH
    cp = SELECT price FROM customer_prices
         WHERE customer_id = ? AND product_id = ? AND store_id = ?
    if cp: return { price: cp, source: 'customer_price' }

    // Tầng 2: CK danh mục
    cd = findApplicableCategoryDiscount({ db, storeId, productId, customerId, customerGroupId, quantity, basePrice: sellingPrice })
    if cd: return { price: cd.finalPrice, source: 'category_discount', detail: "Giảm {value}% danh mục {name}" }

  // Tầng 3: SKIP (client state)

  // Tầng 4: Giá theo SL
  vp = SELECT price FROM volume_prices
       WHERE product_id = ? AND store_id = ? AND min_qty <= ?
       ORDER BY min_qty DESC LIMIT 1
  if vp: return { price: vp, source: 'volume_price' }

  if customerId:
    // Tầng 5: Bảng giá nhóm KH
    customer = SELECT group_id FROM customers WHERE id = ?
    if customer.groupId:
      group = SELECT default_price_list_id FROM customer_groups WHERE id = ?
      if group.defaultPriceListId:
        pl = SELECT * FROM price_lists WHERE id = ? AND is_active AND effective dates OK
        if pl:
          pli = SELECT price FROM price_list_items WHERE price_list_id = ? AND product_id = ?
          if pli: return { price: pli, source: 'price_list', detail: pl.name }

  // Tầng 6: Giá bán lẻ
  return { price: sellingPrice, source: 'retail_price' }
```

### Project Structure Notes

- Pricing engine service nằm ở `apps/api/src/services/pricing.service.ts` (server-side, cần DB access)
- `packages/shared/src/utils/pricing-engine.ts` (architecture doc) sẽ KHÔNG tạo trong story này vì engine cần DB queries (không phải pure function). Shared chỉ chứa types + constants
- PriceSourceBadge nằm trong `features/pos/components/` (POS-specific, không shared)
- CustomerSearchCombobox nằm trong `features/pos/components/` (tuy search KH có thể reuse, nhưng UX POS compact khác với trang quản lý KH)

### Edge cases

- Product không có `categoryId` → tầng 2 skip
- Customer không thuộc group → tầng 5 skip
- Group không có `defaultPriceListId` → tầng 5 skip
- Price list hết hiệu lực (`effective_to < today`) → tầng 5 skip
- Price list items không có giá cho product → tầng 5 skip
- Volume prices không có tier nào match → tầng 4 skip
- Sản phẩm có variant → `productId` vẫn là product chính, giá từ product.sellingPrice hoặc variant.price. CẦN XÁC NHẬN: pricing engine resolve theo productId hay cần xét variantId?

### Deferred items (KHÔNG implement trong story 4.5)

- Cascade mode (realtime/xác nhận/theo lịch) cho bảng giá formula/chain → story riêng
- Price change strategy (thủ công/cảnh báo/tự động) → story riêng
- Pricing engine cho variant-specific pricing → có thể cần story riêng nếu variant có giá khác product
- Offline pricing engine (PGlite) → Epic 9

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.5]
- [Source: _bmad-output/implementation-artifacts/4-4b-chiet-khau-danh-muc-kiem-soat-sua-gia.md#AC8, #Logic priority]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/project-context.md]
- [Source: apps/api/src/services/category-discounts.service.ts:findApplicableCategoryDiscount]
- [Source: apps/web/src/stores/use-cart-store.ts]
- [Source: apps/api/src/routes/pos.routes.ts]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
