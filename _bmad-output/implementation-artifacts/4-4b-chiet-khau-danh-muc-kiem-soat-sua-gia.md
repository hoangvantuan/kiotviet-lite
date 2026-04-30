# Story 4.4b: Chiết khấu danh mục & Kiểm soát sửa giá

Status: in-progress (F1+F2 đã fix 2026-04-30; còn F6 PR-note)

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a chủ cửa hàng,
I want thiết lập chiết khấu theo danh mục cho từng nhóm khách hàng và kiểm soát quyền sửa giá của nhân viên trên POS,
so that giá bán luôn đúng chính sách, dưới vốn phải có PIN duyệt, và mọi thay đổi đều có audit log không thể chối bỏ.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `category_discounts` + migration

**Given** hệ thống đã có `stores`, `categories` (Story 2.1), `customers` + `customer_groups` (Story 4.1), `audit_logs` (Story 1.4), `customer_prices` + `volume_prices` (Story 4.4)
**When** chạy migration mới của story 4.4b
**Then** tạo bảng `category_discounts`:

| Column              | Type                       | Ràng buộc                                                            |
| ------------------- | -------------------------- | -------------------------------------------------------------------- |
| `id`                | `uuid`                     | PK, default `uuidv7()`                                               |
| `store_id`          | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                        |
| `category_id`       | `uuid`                     | NOT NULL, FK → `categories.id` ON DELETE CASCADE                     |
| `customer_id`       | `uuid`                     | NULLABLE, FK → `customers.id` ON DELETE CASCADE                      |
| `customer_group_id` | `uuid`                     | NULLABLE, FK → `customer_groups.id` ON DELETE CASCADE                |
| `discount_type`     | `varchar(16)`              | NOT NULL, ENUM ('percent' / 'amount')                                |
| `discount_value`    | `bigint` mode 'number'     | NOT NULL, ≥ 0 (percent: ≤ 100; amount: ≤ 9_999_999_999_999 đồng VND) |
| `min_qty`           | `integer`                  | NOT NULL, default 1, ≥ 1                                             |
| `effective_from`    | `date`                     | NULLABLE (NULL = áp dụng ngay)                                       |
| `effective_to`      | `date`                     | NULLABLE (NULL = không hết hạn)                                      |
| `is_active`         | `boolean`                  | NOT NULL, default true                                               |
| `note`              | `varchar(255)`             | NULLABLE                                                             |
| `created_at`        | `timestamp with time zone` | NOT NULL, default `now()`                                            |
| `updated_at`        | `timestamp with time zone` | NOT NULL, default `now()`, `$onUpdate(() => new Date())`             |

**And** CHECK constraint `check_category_discount_target`: chính xác 1 trong 2 cột (`customer_id`, `customer_group_id`) NOT NULL (XOR), CHECK SQL: `(customer_id IS NOT NULL)::int + (customer_group_id IS NOT NULL)::int = 1`. Lý do: 1 rule chỉ áp cho 1 KH cụ thể HOẶC 1 nhóm, KHÔNG cả hai, KHÔNG để trống. Áp dụng cho mọi KH = enforce qua tạo nhiều rule cho mỗi nhóm hoặc dùng nhóm "default" của cửa hàng

**And** CHECK constraint `check_category_discount_type_value`: nếu `discount_type = 'percent'` → `discount_value <= 100`. SQL: `(discount_type = 'percent' AND discount_value <= 100) OR discount_type = 'amount'`

**And** CHECK constraint `check_category_discount_min_qty_positive`: `min_qty >= 1`

**And** CHECK constraint `check_category_discount_dates_valid`: `effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from`

**And** indexes:

- `idx_category_discounts_store_category` ON `(store_id, category_id, is_active)` cho POS resolve giá Story 4.5 (lọc rule active của 1 SP qua category_id)
- `idx_category_discounts_store_customer` ON `(store_id, customer_id)` WHERE `customer_id IS NOT NULL`
- `idx_category_discounts_store_group` ON `(store_id, customer_group_id)` WHERE `customer_group_id IS NOT NULL`
- `idx_category_discounts_effective_window` ON `(store_id, is_active, effective_from, effective_to)` cho query "rule nào active hôm nay"

**And** KHÔNG có cột `deleted_at`. Pattern hard delete giống `customer_prices` / `volume_prices` Story 4.4. Audit log lưu trace để recovery thủ công

**Then** ALTER TABLE `order_items` thêm cột:

- `original_price` `bigint` mode 'number' NULLABLE (giá trước khi sửa tay; NULL nghĩa là không bị sửa)
- `price_override` `boolean` NOT NULL default `false` (true nếu giá đã bị nhân viên sửa tay trên POS)
- `price_override_reason` `varchar(255)` NULLABLE (lý do sửa, optional)
- `price_override_pin_used` `boolean` NOT NULL default `false` (true nếu sửa dưới vốn phải dùng PIN)

**And** index phụ trợ: `idx_order_items_price_override` ON `(order_id, price_override)` WHERE `price_override = true` (cho báo cáo "đơn nào có sửa giá" Story 8.2)

**Then** thêm cột `pos_can_edit_price` `boolean` NOT NULL default `false` vào bảng `users` (mặc định nhân viên KHÔNG có quyền sửa giá; Owner/Manager mặc định bật theo logic permission resolver, xem AC2)

**And** KHÔNG đụng vào `customers`, `customer_groups`, `categories`, `products`, `customer_prices`, `volume_prices` (story 4.4 đã đặt FK target sẵn)

### AC2: Permission resolver `pos.editPrice` + `pos.editPriceBelowCost`

**Given** ma trận PERMISSIONS hiện có (Story 4.3 + 4.4) chỉ có `pricing.manage`, `pricing.view` cho cài đặt giá ngoài POS, KHÔNG có permission sửa giá trên POS
**When** Story 4.4b mở rộng permission cho POS
**Then** thêm 2 permission vào `packages/shared/src/constants/permissions.ts`:

```typescript
'pos.editPrice': ['owner', 'manager'],          // Mặc định owner+manager bật
'pos.editPriceBelowCost': ['owner'],            // Chỉ owner; manager bán dưới vốn cũng phải PIN owner
```

**And** Owner có cả 2 permission. Manager mặc định có `pos.editPrice` (sửa giá ≥ vốn) nhưng KHÔNG có `pos.editPriceBelowCost` (sửa dưới vốn cần PIN owner). Staff KHÔNG có permission nào trong 2 permission này

**And** RBAC permission từ role là HARD-CODED matrix (không user-level override trong story này — pattern hiện tại của project). KHÔNG thêm cột `pos_can_edit_price` riêng cho từng user trong story 4.4b nếu ma trận role đủ. Spec epic ghi `permission edit_price = false` cho nhân viên là alias của staff role không có `pos.editPrice`

**Note CHỈNH SỬA SCHEMA**: Bỏ phần "thêm cột `pos_can_edit_price` vào `users`" trong AC1 — KHÔNG cần. Quyền dựa trên role qua PERMISSIONS matrix là đủ cho MVP. Nếu future cần override per-user → mới thêm. **Migration chỉ tạo `category_discounts` + ALTER `order_items` (4 cột), KHÔNG đụng `users`**

**And** thêm 2 audit actions vào `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`):

- `'category_discount.created'`
- `'category_discount.updated'`
- `'category_discount.deleted'`
- `'order_item.price_overridden'` (ghi mỗi lần nhân viên sửa giá trên POS, lưu trong cùng transaction tạo order)

**And** cập nhật `apps/web/src/features/audit/action-labels.ts` thêm 4 cặp label tiếng Việt + 2 nhóm: "Chiết khấu danh mục" (3 actions `category_discount.*`) và "Sửa giá POS" (1 action `order_item.price_overridden`)

### AC3: Tạo chiết khấu danh mục (POST /api/v1/category-discounts)

**Given** Owner/Manager đã đăng nhập (có permission `pricing.manage`)
**When** gọi `POST /api/v1/category-discounts` với body:

```json
{
  "categoryId": "<uuid>",
  "customerGroupId": "<uuid>",
  "customerId": null,
  "discountType": "percent",
  "discountValue": 10,
  "minQty": 5,
  "effectiveFrom": "2026-05-01",
  "effectiveTo": "2026-12-31",
  "isActive": true,
  "note": "Khuyến mãi mùa hè cho nhóm KH thân thiết"
}
```

**Then** API validate qua `createCategoryDiscountSchema` (Zod):

- `categoryId`: uuid bắt buộc
- `customerId`: optional uuid HOẶC null
- `customerGroupId`: optional uuid HOẶC null
- `superRefine`: chính xác 1 trong 2 (`customerId XOR customerGroupId`) phải có giá trị; cả 2 NULL → fail "Chọn 1 khách hàng hoặc 1 nhóm khách hàng"; cả 2 có giá trị → fail "Chỉ chọn 1 khách hàng HOẶC 1 nhóm, không cả hai"
- `discountType`: enum `['percent', 'amount']`
- `discountValue`: integer ≥ 0; nếu `discountType='percent'` → ≤ 100 (refine); nếu `discountType='amount'` → ≤ 9_999_999_999_999
- `minQty`: integer ≥ 1, default 1
- `effectiveFrom`: optional `z.string().date()` (YYYY-MM-DD) hoặc null
- `effectiveTo`: optional `z.string().date()` hoặc null; refine: `effectiveTo >= effectiveFrom` (nếu cả 2 có)
- `isActive`: boolean, default true
- `note`: optional, trim, max 255, nullable
- `.strict()` loại bỏ field lạ

**And** service `createCategoryDiscount`:

- Validate `categoryId` cùng store + alive (`categories.deleted_at IS NULL` nếu có; check schema categories không có deleted_at) → 404 "Không tìm thấy danh mục"
- Validate `customerId` (nếu có): cùng store + alive → 404 "Không tìm thấy khách hàng"
- Validate `customerGroupId` (nếu có): cùng store + alive (`customer_groups.deleted_at IS NULL`) → 404 "Không tìm thấy nhóm khách hàng"
- Insert row vào `category_discounts` với `store_id = actor.storeId` trong transaction
- Ghi audit `action='category_discount.created'`, `targetType='category_discount'`, `targetId=<id>`, `changes={ categoryId, customerId, customerGroupId, discountType, discountValue, minQty, effectiveFrom, effectiveTo, isActive, note }`
- Trả 201 với envelope `{ data: CategoryDiscountListItem }`

**And** `CategoryDiscountListItem` chứa: `id`, `categoryId`, `categoryName`, `customerId`, `customerName`, `customerPhone`, `customerGroupId`, `customerGroupName`, `discountType`, `discountValue`, `minQty`, `effectiveFrom`, `effectiveTo`, `isActive`, `effectiveStatus` (computed: 'pending' / 'active' / 'expired' / 'inactive'), `note`, `createdAt`, `updatedAt`

### AC4: Liệt kê chiết khấu danh mục (GET /api/v1/category-discounts)

**Given** Owner/Manager xem trang chiết khấu danh mục
**When** gọi `GET /api/v1/category-discounts?page=1&pageSize=20&categoryId=&customerId=&customerGroupId=&isActive=&search=`
**Then** API validate qua `listCategoryDiscountsQuerySchema`:

- `page`: int ≥ 1, default 1
- `pageSize`: int 1-100, default 20
- `categoryId`: optional uuid
- `customerId`: optional uuid
- `customerGroupId`: optional uuid
- `isActive`: optional `z.coerce.boolean()`
- `effectiveStatus`: optional enum `['pending', 'active', 'expired', 'inactive']` — server compute filter từ `effective_from/to + is_active + CURRENT_DATE`
- `search`: optional string trim (search theo `note` HOẶC `category.name` HOẶC `customer.name` HOẶC `customer_group.name`)

**And** service `listCategoryDiscounts`:

- Filter chặt chẽ theo `actor.storeId`
- LEFT JOIN `categories` để lấy `categoryName`
- LEFT JOIN `customers` để lấy `customerName`, `customerPhone`; WHERE `customers.deleted_at IS NULL` (orphan logic, xem H1)
- LEFT JOIN `customer_groups` để lấy `customerGroupName`; WHERE `customer_groups.deleted_at IS NULL`
- Search filter: `LOWER(category_discounts.note) LIKE LOWER('%search%') OR LOWER(categories.name) LIKE ... OR LOWER(customers.name) LIKE ... OR LOWER(customer_groups.name) LIKE ...` ESCAPE wildcard `%/_` qua `escapeLikePattern`
- Sort: mặc định `(createdAt DESC, id DESC)`
- `effectiveStatus` filter:
  - `'pending'`: `effective_from > CURRENT_DATE AND is_active = true`
  - `'active'`: `is_active = true AND (effective_from IS NULL OR effective_from <= CURRENT_DATE) AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)`
  - `'expired'`: `effective_to < CURRENT_DATE`
  - `'inactive'`: `is_active = false`
- Trả `{ data: CategoryDiscountListItem[], meta: { page, pageSize, total, totalPages } }`

### AC5: Sửa chiết khấu danh mục (PATCH /api/v1/category-discounts/:id)

**Given** Owner/Manager click sửa 1 row chiết khấu
**When** gọi `PATCH /api/v1/category-discounts/:id` với body partial
**Then** API validate qua `updateCategoryDiscountSchema`:

- Cho phép sửa: `discountType`, `discountValue`, `minQty`, `effectiveFrom`, `effectiveTo`, `isActive`, `note`
- KHÔNG cho phép sửa: `categoryId`, `customerId`, `customerGroupId` (immutable; muốn đổi target → xoá + tạo mới). Schema `.strict()` loại bỏ
- Cross-field validate giữ nguyên: `discountType=percent → value ≤ 100`, `effectiveTo ≥ effectiveFrom`, `minQty ≥ 1`
- `.refine` ≥ 1 field thay đổi
- Validate ownership cùng store
- UPDATE + audit `category_discount.updated` với diff before/after qua `diffObjects`
- Trả 200 với `CategoryDiscountListItem`

### AC6: Xoá chiết khấu danh mục (DELETE /api/v1/category-discounts/:id)

**Given** Owner/Manager click xoá 1 row
**When** gọi `DELETE /api/v1/category-discounts/:id`
**Then** service `deleteCategoryDiscount`:

- Validate ownership cùng store → 404 nếu không
- Hard delete row
- Audit `category_discount.deleted` snapshot before
- Trả 200 `{ data: { ok: true } }`

### AC7: API kiểm tra quyền sửa giá + audit log khi POS sửa giá

**Given** nhân viên cố sửa giá trên POS qua giao diện CartItem (sẽ implement ở AC11-13)
**When** Frontend cần biết user có quyền sửa giá hay không + endpoint xác nhận PIN khi sửa dưới vốn
**Then** **Frontend logic** (KHÔNG cần endpoint mới cho check permission):

- Frontend đọc `/api/v1/auth/me` (đã có) → `permissions: string[]`. Permission resolver từ role hard-coded
- Nếu `!permissions.includes('pos.editPrice')` → ẨN nút sửa giá trong CartItem, hiển thị tooltip "Bạn không có quyền sửa giá" khi hover

**And** Backend endpoint **`POST /api/v1/auth/verify-pin`** (đã tồn tại từ Story 1.4 — `apps/api/src/routes/users.routes.ts:33`) đã đủ. Story 4.4b reuse, KHÔNG tạo endpoint mới

**And** **Audit log cho sửa giá KHÔNG tạo trong khi user còn đang edit cart** — KHÔNG tạo riêng audit cho mỗi lần sửa. Audit chỉ ghi tại thời điểm **submit order** (Story 3.3 — checkout API). Lý do: cart store là client state, server chỉ thấy giá cuối cùng trong order_items; không thể audit từng "thử nghiệm" sửa giá ở client. Story 4.4b chuẩn bị schema (thêm cột `original_price`, `price_override`), Story 3.3 (Thanh toán & Hoàn thành đơn hàng) sẽ ghi audit `order_item.price_overridden` khi insert order_items có `price_override = true`

**And** **Boundary làm rõ**: Story 4.4b TẠO 2 audit action enum + UI flow PIN + cart store API `updateUnitPrice`, NHƯNG audit log thật chỉ chạy khi Story 3.3 implement order checkout. Story 4.4b để sẵn TODO comment trong `apps/api/src/services/orders.service.ts` (nếu service đó đã tồn tại; nếu chưa, ghi TODO trong `apps/api/src/routes/pos.routes.ts`)

### AC8: 6-tier pricing engine — Tầng 2 hook (chuẩn bị cho Story 4.5)

**Given** Story 4.5 sẽ implement pricing engine 6 tầng resolve giá theo thứ tự
**When** Story 4.4b cần expose query helper cho Story 4.5 dùng tầng 2 (chiết khấu danh mục)
**Then** thêm helper trong `apps/api/src/services/category-discounts.service.ts`:

```typescript
export async function findApplicableCategoryDiscount({
  db,
  storeId,
  productId,
  customerId,
  customerGroupId,
  quantity,
  date = new Date(),
}: FindApplicableCategoryDiscountInput): Promise<CategoryDiscountResolved | null>
```

Logic:

- Lấy `category_id` của product qua `products.category_id`
- SELECT FROM `category_discounts` WHERE: `store_id = ?`, `category_id = ?`, `is_active = true`, `min_qty <= ?`, `(effective_from IS NULL OR effective_from <= date)`, `(effective_to IS NULL OR effective_to >= date)`, `(customer_id = ? OR customer_group_id = ?)`
- Nếu nhiều rule match → ưu tiên `customer_id NOT NULL` (giảm giá cho KH cụ thể) > `customer_group_id NOT NULL` (giảm giá cho nhóm). Trong cùng nhóm → ưu tiên `discount_value` lớn nhất (lợi cho KH)
- Trả null nếu không match
- Nếu match → trả `{ discountId, discountType, discountValue, finalPrice }` (finalPrice = `basePrice - applyDiscount(basePrice, discountType, discountValue)`)

**And** **KHÔNG implement endpoint** `/api/v1/pricing/resolve` ở story 4.4b — để Story 4.5 tổng hợp 6 tầng

**And** **KHÔNG gọi `findApplicableCategoryDiscount` ở story 4.4b** — chỉ expose helper

### AC9: Block giá 0đ ở mọi tầng

**Given** nhân viên cố sửa giá thành 0 trên POS (kể cả với PIN owner)
**When** input giá = 0 hoặc < 0
**Then** **Client-side** (CartItem): NumberInput / CurrencyInput sửa giá có `min={1}`. Nếu user nhập 0 → toast lỗi "Không được phép bán giá 0đ" + giữ nguyên giá cũ trong cart. KHÔNG hiển thị popup PIN

**And** **Schema-side**: cart store action `updateUnitPrice(itemId, price)` validate `price >= 1` mới apply, < 1 thì reject silently (UI đã chặn ở input nên hiếm khi xảy ra)

**And** **Server-side** (Story 3.3 sẽ enforce trong order checkout): order_items insert có CHECK constraint hoặc Zod validation `unitPrice >= 1`. Story 4.4b CHỈ chuẩn bị enum audit + cart store API, KHÔNG thêm CHECK ở migration `order_items.unit_price` (để tránh xung đột nếu Story 3.3 đã có data legacy)

**And** **Note giá vốn**: Block 0đ là tuyệt đối, KHÔNG có flow PIN bypass. Khác với "dưới vốn" (có PIN bypass)

### AC10: Routes mount + middleware

**Given** Hono router hiện đang mount `/api/v1/customer-prices` và `/api/v1/volume-prices` (Story 4.4)
**When** thêm route mới
**Then** tạo `apps/api/src/routes/category-discounts.routes.ts` theo pattern `customer-prices.routes.ts`:

- GET `/` → listCategoryDiscounts
- GET `/:id` → getCategoryDiscount
- POST `/` → createCategoryDiscount
- PATCH `/:id` → updateCategoryDiscount
- DELETE `/:id` → deleteCategoryDiscount
- Middleware: `requireAuth` + `requirePermission('pricing.manage')` toàn bộ route
- Hono factory `createCategoryDiscountsRoutes({ db })`

**And** mount vào `apps/api/src/index.ts` SAU `/api/v1/volume-prices`:

```typescript
app.route('/api/v1/category-discounts', createCategoryDiscountsRoutes({ db }))
```

### AC11: UI page chiết khấu danh mục `/pricing/category-discounts`

**Given** Story 4.4 đã có TabBar 3 tab trong `/pricing`: "Bảng giá" / "Giá riêng KH" / "Giá theo SL"
**When** Story 4.4b thêm tab thứ 4 "Chiết khấu danh mục"
**Then** sửa `apps/web/src/features/pricing/components/PricingTabsHeader.tsx` thêm trigger tab 4 → `/pricing/category-discounts`

**And** tạo `apps/web/src/pages/category-discounts-page.tsx` render `<CategoryDiscountsManager />`

**And** tạo `apps/web/src/features/pricing/components/CategoryDiscountsManager.tsx`:

- Header: title "Chiết khấu danh mục", description "Tạo quy tắc giảm giá theo danh mục cho khách hàng hoặc nhóm KH"
- Toolbar: nút Primary "Thêm chiết khấu" → mở `<CreateCategoryDiscountDialog>`
- Filters:
  - Input search (debounce 300ms)
  - Select category (load `useCategoriesQuery({ pageSize: 100 })`)
  - Select customer group (load `useCustomerGroupsQuery({ pageSize: 100 })`)
  - Select effectiveStatus: "Tất cả" / "Đang hiệu lực" / "Sắp hiệu lực" / "Đã hết hạn" / "Đã tắt"
- Body desktop ≥ 768px: `<CategoryDiscountsTable>` cột:
  - Danh mục (category name)
  - Đối tượng (KH cụ thể: tên + phone HOẶC nhóm KH: tên kèm icon Users)
  - Mức giảm (`discount_type=percent` → "10%"; `amount` → formatVnd)
  - SL tối thiểu (`minQty`)
  - Hiệu lực (`effectiveFrom – effectiveTo`, "Áp dụng từ {date}" / "Hết hạn {date}" / "Vô hạn")
  - Trạng thái (Badge: pending xám / active xanh / expired đỏ nhạt / inactive xám)
  - Ghi chú (truncate 50 chars)
  - Thao tác (Pencil + Trash2)
- Body mobile < 768px: `<CategoryDiscountsCardList>`
- Empty state: `<EmptyState icon={Percent} title="Chưa có chiết khấu danh mục" description="Tạo rule giảm giá cho khách VIP hoặc nhóm KH" actionLabel="Thêm chiết khấu" />`
- `<Pagination>`

**And** routing: thêm `pricingCategoryDiscountsRoute` trong `apps/web/src/router.tsx` MOUNT TRƯỚC `pricingDetailRoute` (`/pricing/$id`) — pattern Story 4.4 H5 + AC14

### AC12: Dialog tạo / sửa chiết khấu danh mục

**Given** click "Thêm chiết khấu" trên page `/pricing/category-discounts`
**When** Dialog mở
**Then** `<CreateCategoryDiscountDialog>` form fields:

- Combobox `categoryId` (required): search danh mục theo tên (`useCategoriesQuery({ pageSize: 200 })`)
- Radio `targetType` (UI-only, không gửi server): "Cho 1 khách hàng" HOẶC "Cho 1 nhóm khách hàng"
  - Khi chọn "1 khách hàng": hiển thị Combobox `customerId` (required, search KH theo tên/phone), ẩn `customerGroupId`. Submit set `customerGroupId = null`
  - Khi chọn "1 nhóm khách hàng": hiển thị Select `customerGroupId` (required), ẩn `customerId`. Submit set `customerId = null`
- RadioGroup `discountType`: "Phần trăm (%)" / "Số tiền cố định (đ)"
- Input `discountValue` (required ≥ 0): nếu `discountType=percent` → NumberInput max 100; nếu `amount` → CurrencyInput
- NumberInput `minQty` (required ≥ 1, default 1)
- DatePicker `effectiveFrom` (optional)
- DatePicker `effectiveTo` (optional)
- Switch `isActive` (default true)
- Textarea `note` (optional, max 255)
- Footer: Hủy + Primary "Lưu" (disable khi `!isValid || isPending`)

**And** `<EditCategoryDiscountDialog>`:

- Disabled `categoryId`, `customerId/customerGroupId` (read-only display: tên danh mục + tên KH/nhóm)
- Editable: `discountType`, `discountValue`, `minQty`, `effectiveFrom`, `effectiveTo`, `isActive`, `note`
- Submit chỉ gửi field thay đổi

**And** `<DeleteCategoryDiscountDialog>` AlertDialog "Xoá chiết khấu cho {targetName}?" + warning "Mọi đơn hàng tương lai sẽ KHÔNG còn áp giảm giá này"

**And** RHF + zodResolver(`createCategoryDiscountSchema | updateCategoryDiscountSchema`). Mode `'onTouched'`

### AC13: POS sửa giá tay — UI flow + cart store API

**Given** nhân viên có quyền `pos.editPrice` (owner/manager) đang ở màn POS
**When** click vào unit price của 1 cart item (CartItem expanded view)
**Then** mở popover/dialog `<EditUnitPriceDialog>`:

- Hiển thị: `productName + variantName`, "Giá hiện tại: {formatVnd(unitPrice)}", "Giá vốn: {formatVnd(costPrice)}", "Giá lẻ chuẩn: {formatVnd(sellingPrice)}"
- CurrencyInput `newPrice` (min 1)
- Textarea `reason` (optional, max 255, label "Lý do sửa giá")
- Footer: Hủy + Primary "Áp dụng"

**And** logic submit:

```pseudocode
if newPrice <= 0:
  toast.error("Không được phép bán giá 0đ"); return
if newPrice < costPrice:
  if !permissions.includes('pos.editPriceBelowCost'):
    open <PinVerificationDialog> — yêu cầu nhập PIN owner
    if PIN ok: applyEdit() else: toast.error("PIN không đúng"); return
  else:
    applyEdit() — owner có quyền pos.editPriceBelowCost, không cần PIN của chính họ
else:
  applyEdit() — giá ≥ vốn, không cần PIN
```

**And** `applyEdit()` → gọi `cartStore.updateUnitPrice(itemId, newPrice, { reason, pinUsed: <bool> })`. Cart store cập nhật:

- `unitPrice = newPrice`
- `originalPrice = nếu chưa có thì gán item.unitPrice cũ; nếu đã có thì giữ nguyên` (originalPrice = giá BAN ĐẦU khi add to cart, không phải giá lần sửa trước)
- `priceOverride = true`
- `priceOverrideReason = reason ?? null`
- `priceOverridePinUsed = pinUsed`
- Recompute `lineTotal = newPrice * quantity - discountAmount`

**And** Cart store schema mở rộng:

```typescript
export interface CartItem {
  // ... existing fields
  costPrice: number // mới: copy từ product khi add to cart
  originalPrice: number | null // mới: NULL = chưa sửa
  priceOverride: boolean // mới: true nếu đã sửa
  priceOverrideReason: string | null // mới
  priceOverridePinUsed: boolean // mới
}
```

**And** UI hiển thị trong `<CartItem>`:

- Nếu `priceOverride === true`: badge cam "Đã sửa giá" cạnh giá; hover/click → tooltip "Giá gốc: {formatVnd(originalPrice)} → Giá hiện tại: {formatVnd(unitPrice)}{reason ? ' • Lý do: ' + reason : ''}"
- Nếu `priceOverridePinUsed === true`: thêm icon Shield (lucide) màu vàng cảnh báo "Sửa dưới vốn (đã duyệt PIN)"

**And** Nếu user KHÔNG có `pos.editPrice` → click vào giá → tooltip "Bạn không có quyền sửa giá", KHÔNG mở dialog

### AC14: PIN verification dialog reuse

**Given** Story 1.4 đã có endpoint `POST /api/v1/users/verify-pin` và Story 4.4b cần dialog PIN inline trong POS
**When** Story 4.4b cần `<PinVerificationDialog>`
**Then** kiểm tra `apps/web/src/features/users/components/` xem có `PinDialog` chưa. Nếu chưa → tạo `apps/web/src/features/auth/components/PinVerificationDialog.tsx`:

- Props: `open`, `onOpenChange`, `purpose: string` (label hiển thị "Lý do yêu cầu PIN: ..."), `onSuccess: () => void`, `onCancel?: () => void`
- Form: NumberInput `pin` (4-6 ký tự), label "Nhập PIN chủ cửa hàng"
- Submit: gọi `POST /api/v1/users/verify-pin` với `{ pin }`
- Server response 200 → `onSuccess()`
- Server response 401 (PIN sai) → toast "PIN không đúng. Còn {remaining} lần thử"
- Server response 403/423 (locked) → toast "PIN đã bị khoá đến {lockedUntil}"
- Sau success: tự động close dialog, gọi callback parent

**And** UX: input mật khẩu (type=password), không lưu PIN ở client, không retry tự động

**And** Edge case: PIN của Owner/Manager đăng nhập hiện tại. Story 4.4b pass `purpose="Sửa giá dưới vốn"` để dialog hiển thị rõ lý do

### AC15: API client + TanStack Query hooks frontend

**Given** Story 4.4b cần gọi 5 endpoint mới
**When** wrapper API + Query hooks
**Then** tạo `apps/web/src/features/pricing/category-discounts-api.ts`:

- `listCategoryDiscountsApi(query)`, `getCategoryDiscountApi(id)`, `createCategoryDiscountApi(input)`, `updateCategoryDiscountApi(id, input)`, `deleteCategoryDiscountApi(id)`
- Build query string: `page`, `pageSize`, `categoryId`, `customerId`, `customerGroupId`, `isActive`, `effectiveStatus`, `search`

**And** tạo `apps/web/src/features/pricing/use-category-discounts.ts`:

- `useCategoryDiscountsQuery(query)`: queryKey `['category-discounts', 'list', query]`, `placeholderData: keepPreviousData`
- `useCategoryDiscountQuery(id)`: queryKey `['category-discounts', id]`, enabled khi id truthy
- `useCreateCategoryDiscountMutation`, `useUpdateCategoryDiscountMutation`, `useDeleteCategoryDiscountMutation` → invalidate `['category-discounts']` subtree

### AC16: Test coverage

**Given** mọi feature mới phải có test
**When** triển khai story 4.4b
**Then** unit test schemas (Vitest):

- `category-discount-management.test.ts`:
  - target XOR (cả 2 NULL → fail; cả 2 có → fail; chỉ customerId → pass; chỉ customerGroupId → pass)
  - `discountType=percent` + value 101 → fail
  - `discountType=amount` + value 1_000_000_000 → pass; value > 9_999_999_999_999 → fail
  - `effectiveTo < effectiveFrom` → fail
  - `minQty=0` → fail
  - update không có field nào → fail; có 1 field → pass; gửi categoryId qua update → fail (strict)

**And** integration test API (Vitest + PGlite, pattern `customer-prices.integration.test.ts`):

- `category-discounts.integration.test.ts`:
  - Setup: store + owner + manager + staff + 2 customers + 2 customer_groups + 3 categories + 5 products
  - **Create**: Owner OK 201; Manager OK; Staff 403; categoryId không cùng store → 404; customerId không cùng store → 404; cả 2 target NULL → 400 (Zod refine); cả 2 target có → 400; percent value 105 → 400
  - **List**: filter store; filter category; filter customer; filter group; filter `effectiveStatus=active` (rule có effective_from < today < effective_to); search escape `%`; pagination; loại trừ row có customer/group đã bị soft delete (LEFT JOIN filter)
  - **Update**: refine ≥ 1 field; KHÔNG cho sửa categoryId/customerId/customerGroupId (strict reject); audit diff đúng
  - **Delete**: hard delete; audit ghi snapshot before
  - **Audit**: ghi đủ 3 actions; actorRole đúng
  - **Multi-tenant**: store A không xem/sửa/xoá category_discount của store B
  - **Cascade DELETE**: hard delete category → category_discounts của category đó tự bị xoá theo (CASCADE)
  - **CHECK constraint DB**: cố tình INSERT raw `discount_type='percent', discount_value=200` → DB throw error
  - **Helper `findApplicableCategoryDiscount`**:
    - rule active match → trả về
    - rule inactive → null
    - rule effective_from > today → null
    - rule effective_to < today → null
    - rule min_qty > quantity → null
    - 2 rule cùng category, 1 cho customer + 1 cho group cùng KH → ưu tiên customer rule
    - Multiple matching → ưu tiên discount_value lớn

**And** frontend manual flow (xem Task 14)

### AC17: Documentation + nav

**Given** Story 4.4b thêm tab + 1 audit group + permission mới
**When** verify cuối story
**Then** action labels tiếng Việt trong `apps/web/src/features/audit/action-labels.ts`:

- `'category_discount.created': 'Tạo chiết khấu danh mục'`
- `'category_discount.updated': 'Sửa chiết khấu danh mục'`
- `'category_discount.deleted': 'Xoá chiết khấu danh mục'`
- `'order_item.price_overridden': 'Sửa giá trên đơn hàng'`
- `ACTION_GROUPS`: thêm "Chiết khấu danh mục" (3 actions) + "Sửa giá POS" (1 action)

**And** KHÔNG thêm entry sidebar nav. Tab "Chiết khấu danh mục" ở trong /pricing TabBar (4 tab)

**And** auth/me permissions response trả `pos.editPrice`, `pos.editPriceBelowCost` cho Owner+Manager (Owner cả 2; Manager chỉ `pos.editPrice`). Frontend cache permissions sau login

## Tasks / Subtasks

### Phase A: Schema + Migration

- [x] **Task 1: Drizzle schema `category_discounts` + ALTER `order_items`** (AC: #1)
  - [x] 1.1: Tạo `packages/shared/src/schema/category-discounts.ts`:
    - Bảng `categoryDiscounts` với cột theo AC1
    - FK `categoryId` (CASCADE), `customerId` (CASCADE nullable), `customerGroupId` (CASCADE nullable), `storeId` (RESTRICT)
    - Indexes: `idx_category_discounts_store_category`, `idx_category_discounts_store_customer` (partial), `idx_category_discounts_store_group` (partial), `idx_category_discounts_effective_window`
    - 4 CHECK constraints qua `check()` helper Drizzle (pattern Story 4.3 + 4.4):
      - `check_category_discount_target` (XOR customer/group): `(customer_id IS NOT NULL)::int + (customer_group_id IS NOT NULL)::int = 1`
      - `check_category_discount_type_value`: `(discount_type = 'percent' AND discount_value <= 100) OR discount_type = 'amount'`
      - `check_category_discount_min_qty_positive`: `min_qty >= 1`
      - `check_category_discount_dates_valid`: `effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from`
    - KHÔNG có `deletedAt`
  - [x] 1.2: Sửa `packages/shared/src/schema/order-items.ts` thêm 4 cột mới:
    - `originalPrice: bigint({ mode: 'number' })` nullable (KHÔNG default; null = không sửa)
    - `priceOverride: boolean().notNull().default(false)`
    - `priceOverrideReason: varchar({ length: 255 })` nullable
    - `priceOverridePinUsed: boolean().notNull().default(false)`
    - Index partial: `idx_order_items_price_override` ON `(orderId, priceOverride)` WHERE `priceOverride = true`
  - [x] 1.3: Export `categoryDiscounts` từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate`. Verify file `0019_*.sql`:
    - CREATE TABLE category_discounts + 4 indexes + 4 CHECKs + 4 FKs
    - ALTER TABLE order_items ADD COLUMN (4 cột) + 1 index partial
    - CASCADE behaviour cho `category_id`, `customer_id`, `customer_group_id`
  - [x] 1.5: Drizzle generate được CHECK constraints inline (verify SQL output)
  - [x] 1.6: Migration apply tự động qua PGlite trong integration test

- [x] **Task 2: Zod schemas + types `category-discount-management`** (AC: #3-#6, #16)
  - [x] 2.1: Tạo `packages/shared/src/schema/category-discount-management.ts`:
    - `discountTypeSchema = z.enum(['percent', 'amount'])`
    - `discountValueSchema = z.number().int().min(0)` (refine cross-field tại schema cha cho percent ≤ 100)
    - `categoryDiscountNoteSchema = z.string().trim().max(255).nullable().optional()`
    - `createCategoryDiscountSchema = z.object({...}).strict().superRefine((data, ctx) => { ... XOR target + percent value + dates ... })` per AC3
    - `updateCategoryDiscountSchema = z.object({...}).strict().refine(...)` per AC5 (immutable categoryId/customerId/customerGroupId)
    - `listCategoryDiscountsQuerySchema` per AC4
    - `categoryDiscountListItemSchema` per AC3
    - Export types: `CreateCategoryDiscountInput`, `UpdateCategoryDiscountInput`, `ListCategoryDiscountsQuery`, `CategoryDiscountListItem`, `EffectiveStatus`
  - [x] 2.2: Re-export từ `packages/shared/src/schema/index.ts`
  - [x] 2.3: Co-located test `category-discount-management.test.ts` per AC16

- [x] **Task 3: Mở rộng audit + permissions** (AC: #2, #17)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts`: thêm 4 audit actions `'category_discount.created'`, `'.updated'`, `'.deleted'`, `'order_item.price_overridden'` vào `auditActionSchema`
  - [x] 3.2: Sửa `packages/shared/src/constants/permissions.ts`: thêm 2 permission `'pos.editPrice': ['owner', 'manager']`, `'pos.editPriceBelowCost': ['owner']`
  - [x] 3.3: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - 4 cặp label tiếng Việt
    - 2 ACTION_GROUPS mới: "Chiết khấu danh mục" + "Sửa giá POS"

### Phase B: Backend Service + Routes

- [x] **Task 4: `category-discounts.service.ts`** (AC: #3-#6, #8)
  - [x] 4.1: Tạo `apps/api/src/services/category-discounts.service.ts` theo pattern `customer-prices.service.ts`:
    - Helper `toCategoryDiscountListItem(row, today: Date)` map row → `CategoryDiscountListItem` + compute `effectiveStatus`
    - `listCategoryDiscounts({ db, storeId, query })`: build conditions (categoryId, customerId, customerGroupId, isActive, effectiveStatus, search), LEFT JOIN categories + customers + customer_groups, WHERE alive filter, paginate, sort `(createdAt DESC, id DESC)`
    - `getCategoryDiscount({ db, storeId, id })`: ownership + alive joined entities → 404
    - `createCategoryDiscount({ db, actor, input, meta })`:
      - Validate `categoryId` cùng store → 404
      - Validate `customerId` (nếu có) cùng store + alive → 404
      - Validate `customerGroupId` (nếu có) cùng store + alive → 404
      - Insert + audit `category_discount.created` trong transaction
    - `updateCategoryDiscount({ db, actor, id, input, meta })`: ownership + diff audit `category_discount.updated`
    - `deleteCategoryDiscount({ db, actor, id, meta })`: ownership, hard delete + audit snapshot before
  - [x] 4.2: Helper `findApplicableCategoryDiscount({ db, storeId, productId, customerId, customerGroupId, quantity, date })` per AC8 (pure function, KHÔNG ghi DB):
    - Lấy `category_id` của product
    - Query rule active matching → sort priority (customer rule first, then group rule, then highest discount value)
    - Trả `null` hoặc `{ discountId, discountType, discountValue, finalPrice }`
  - [x] 4.3: Reuse `escapeLikePattern` từ `apps/api/src/lib/strings.ts`
  - [x] 4.4: Reuse `diffObjects` từ `apps/api/src/services/audit.service.ts`

- [x] **Task 5: `category-discounts.routes.ts`** (AC: #3-#6, #10)
  - [x] 5.1: Tạo `apps/api/src/routes/category-discounts.routes.ts` pattern `customer-prices.routes.ts`:
    - 5 endpoints (GET list, GET :id, POST, PATCH :id, DELETE :id)
    - Middleware `requireAuth` + `requirePermission('pricing.manage')`
    - Hono factory `createCategoryDiscountsRoutes({ db })`
  - [x] 5.2: Mount vào `apps/api/src/index.ts` SAU `/api/v1/volume-prices`:
    ```typescript
    app.route('/api/v1/category-discounts', createCategoryDiscountsRoutes({ db }))
    ```

### Phase C: Frontend (apps/web)

- [x] **Task 6: API client + TanStack Query hooks** (AC: #15)
  - [x] 6.1: Tạo `apps/web/src/features/pricing/category-discounts-api.ts` per AC15
  - [x] 6.2: Tạo `apps/web/src/features/pricing/use-category-discounts.ts` per AC15

- [x] **Task 7: `<CategoryDiscountsManager>` page** (AC: #11)
  - [x] 7.1: Tạo `apps/web/src/features/pricing/components/CategoryDiscountsTable.tsx` (cột theo AC11)
  - [x] 7.2: Tạo `apps/web/src/features/pricing/components/CategoryDiscountsCardList.tsx` (mobile)
  - [x] 7.3: Tạo `apps/web/src/features/pricing/components/CategoryDiscountsFilters.tsx`:
    - Input search (parent debounce 300ms), Select category, Select customer group, Select effectiveStatus
  - [x] 7.4: Tạo `apps/web/src/features/pricing/components/CategoryDiscountsManager.tsx`:
    - State: filters, page, dialogs (create/edit/delete)
    - `useCategoryDiscountsQuery(apiQuery)` debounce search 300ms
    - Render header + filters + table/cardlist + pagination + dialogs
  - [x] 7.5: Tạo `apps/web/src/pages/category-discounts-page.tsx` render `<CategoryDiscountsManager />`

- [x] **Task 8: Form dialogs cho Category Discounts** (AC: #12)
  - [x] 8.1: Tạo `apps/web/src/features/pricing/components/CreateCategoryDiscountDialog.tsx`:
    - Combobox category (load `useCategoriesQuery`)
    - Radio targetType + Combobox customer / Select customer group (mutually exclusive)
    - RadioGroup discountType + dynamic Input (NumberInput percent / CurrencyInput amount)
    - NumberInput minQty
    - DatePicker effectiveFrom / effectiveTo
    - Switch isActive
    - Textarea note
    - RHF + zodResolver(createCategoryDiscountSchema). Mode 'onTouched'. Reset khi close
    - Submit `useCreateCategoryDiscountMutation`. Error mapping VALIDATION_ERROR → form.setError theo `details.field`
  - [x] 8.2: Tạo `EditCategoryDiscountDialog.tsx` (disabled categoryId + target, editable rest)
  - [x] 8.3: Tạo `DeleteCategoryDiscountDialog.tsx` (AlertDialog confirm + warning text)

- [x] **Task 9: Tab navigation** (AC: #11)
  - [x] 9.1: Sửa `apps/web/src/features/pricing/components/PricingTabsHeader.tsx`: thêm tab 4 "Chiết khấu danh mục" → `/pricing/category-discounts`. Active state: `pathname.startsWith('/pricing/category-discounts')`
  - [x] 9.2: Sửa `apps/web/src/router.tsx`:
    - Import `CategoryDiscountsPage`
    - Tạo `pricingCategoryDiscountsRoute` với `path: '/pricing/category-discounts'`, `beforeLoad: requirePermissionGuard('pricing.manage')`
    - **CRITICAL**: Mount route mới TRƯỚC `pricingDetailRoute` trong `routeTree`

### Phase D: POS Edit Price Flow

- [x] **Task 10: Cart store mở rộng** (AC: #9, #13)
  - [x] 10.1: Sửa `apps/web/src/stores/use-cart-store.ts`:
    - Thêm 5 field mới vào `CartItem`: `costPrice`, `originalPrice`, `priceOverride`, `priceOverrideReason`, `priceOverridePinUsed`
    - Sửa `CartItemInput`: `costPrice` required (caller phải truyền từ product); 4 field còn lại đều có default (`originalPrice: null`, `priceOverride: false`, `priceOverrideReason: null`, `priceOverridePinUsed: false`)
    - Sửa `addItem()` init các field default
    - Thêm action `updateUnitPrice(id: string, newPrice: number, opts?: { reason?: string | null, pinUsed?: boolean })`:
      - Validate `newPrice >= 1` (reject silently nếu 0/âm; UI đã chặn)
      - Tìm item, set `unitPrice = newPrice`
      - Nếu `originalPrice === null` → gán `originalPrice = item.unitPrice` cũ (giá ban đầu)
      - Nếu `originalPrice !== null` → giữ nguyên `originalPrice` (không reset về giá lần sửa trước)
      - `priceOverride = true`
      - `priceOverrideReason = opts?.reason ?? null`
      - `priceOverridePinUsed = opts?.pinUsed ?? false`
      - Recompute `lineTotal`
    - Update interface `CartState` thêm `updateUnitPrice`

- [x] **Task 11: PIN verification dialog** (AC: #14)
  - [x] 11.1: Kiểm tra `apps/web/src/features/users/components/` và `apps/web/src/features/auth/` xem đã có `PinDialog` hay chưa
  - [x] 11.2: Nếu chưa, tạo `apps/web/src/features/auth/components/PinVerificationDialog.tsx`:
    - Props per AC14
    - RHF + zodResolver(verifyPinSchema reuse từ shared)
    - Gọi `apiClient.post('/auth/verify-pin', { pin })` (verify endpoint thực ra là `/users/verify-pin` per code Story 1.4 — confirm path bằng grep)
    - Map response: 200 → onSuccess; 401 → toast với `details.remaining`; 423 → toast lock
    - Input type=password, autoFocus, không persist
  - [x] 11.3: Tạo `apps/web/src/features/auth/use-verify-pin.ts` hook (mutation)

- [x] **Task 12: `<EditUnitPriceDialog>` + integrate vào CartItem** (AC: #13)
  - [x] 12.1: Tạo `apps/web/src/features/pos/components/EditUnitPriceDialog.tsx`:
    - Props: `open`, `onOpenChange`, `item: CartItem`, `permissions: string[]`
    - Form: CurrencyInput newPrice (min 1), Textarea reason
    - Submit logic per AC13 pseudocode
    - Khi cần PIN → mở `<PinVerificationDialog>` lồng nhau (state `pinDialogOpen`)
    - Sau PIN ok → gọi `cartStore.updateUnitPrice(item.id, newPrice, { reason, pinUsed: true })` → close cả 2 dialog
  - [x] 12.2: Sửa `apps/web/src/features/pos/components/CartItem.tsx`:
    - Đọc `permissions` từ auth context (hook `useAuthStore` hoặc `useMeQuery`)
    - Render unit price làm clickable button khi `permissions.includes('pos.editPrice')`. Nếu không có quyền → render text-only + tooltip "Bạn không có quyền sửa giá"
    - Click button → mở `<EditUnitPriceDialog>`
    - Hiển thị badge "Đã sửa giá" + tooltip nếu `item.priceOverride === true`
    - Hiển thị icon Shield vàng nếu `priceOverridePinUsed === true`

- [x] **Task 13: Permissions context cho Frontend** (AC: #2, #17)
  - [x] 13.1: Verify `apps/web/src/features/auth/use-me.ts` (hoặc tương đương) trả về `permissions: string[]`. Nếu chưa có → backend `/auth/me` endpoint phải compute permissions từ role qua `PERMISSIONS` matrix và trả về kèm user data
  - [x] 13.2: Frontend cache permissions vào auth store, expose hook `usePermissions(): string[]` hoặc `useHasPermission(perm)`
  - [x] 13.3: Reuse trong CartItem (Task 12.2) + CategoryDiscountsManager guard

### Phase E: Tests + Manual verify

- [x] **Task 14: Unit + integration tests** (AC: #16)
  - [x] 14.1: `packages/shared/src/schema/category-discount-management.test.ts` per AC16
  - [x] 14.2: `apps/api/src/__tests__/category-discounts.integration.test.ts` per AC16

- [x] **Task 15: Frontend manual verify + lint/typecheck** (AC: tất cả)
  - [x] 15.1: `pnpm typecheck` pass tất cả packages
  - [x] 15.2: `pnpm lint` pass (0 errors)
  - [x] 15.3: `pnpm test` pass toàn bộ suite (không regression Story 4.4 + 4.3)
  - [x] 15.4: Manual flow Owner desktop:
    - Login Owner → /pricing → thấy TabBar 4 tab. Click "Chiết khấu danh mục" → empty state → click "Thêm chiết khấu"
    - Dialog: chọn category "Đồ uống", radio "Cho 1 nhóm KH", chọn nhóm "Khách thân thiết", discountType=percent, value=10, minQty=5, effectiveFrom=hôm nay, effectiveTo=cuối tháng, isActive=true, note="Khuyến mãi tháng 5" → submit → toast → table 1 row. Trạng thái = "Đang hiệu lực" (xanh)
    - Tạo rule 2 cho category "Bánh kẹo", radio "Cho 1 KH cụ thể", chọn KH "Nguyễn Văn A", discountType=amount, value=5000, minQty=1, isActive=true → submit OK
    - Tạo rule 3 với effectiveTo trong quá khứ → submit OK → trạng thái "Hết hạn" (đỏ nhạt)
    - Tạo rule với cả customerId và customerGroupId → form fail validation
    - Tạo rule với percent value 150 → form fail "≤ 100"
    - Sửa rule 1: đổi value=15 → toast → table cập nhật. Cố sửa categoryId qua DevTools → server reject 400 strict
    - Xoá rule 3 → confirm → toast → row biến mất
    - Filter effectiveStatus=active → chỉ hiện rule 1 + 2
  - [x] 15.5: Manual POS sửa giá (Owner):
    - Login Owner → POS → add SP "Coca Cola" (giá vốn 10k, giá lẻ 15k) vào cart
    - Click giá 15.000đ → mở `<EditUnitPriceDialog>`. Input newPrice=12.000, reason="Khách thân" → "Áp dụng" → giá ≥ vốn → KHÔNG cần PIN → cart cập nhật. CartItem hiển thị badge "Đã sửa giá" + giá 12k
    - Click giá 12.000đ → input newPrice=8.000 (< vốn 10k) → submit → mở `<PinVerificationDialog>`. Owner nhập PIN đúng → cart cập nhật giá 8k + icon Shield vàng "Sửa dưới vốn (đã duyệt PIN)"
    - Click giá 8.000đ → input newPrice=0 → toast lỗi "Không được phép bán giá 0đ", dialog vẫn mở (UX: input không xoá)
  - [x] 15.6: Manual POS sửa giá (Manager):
    - Login Manager → POS → add SP, click giá 15.000đ → input 12.000 → giá ≥ vốn → cart cập nhật (Manager có `pos.editPrice`)
    - Input 8.000 (< vốn 10k) → mở PIN dialog (Manager KHÔNG có `pos.editPriceBelowCost`). Manager nhập PIN của chính mình → server verify đúng (PIN khớp với Owner cấu hình PIN cho Manager nếu có; nếu chỉ Owner có PIN thì Manager nhập PIN Owner) → cart cập nhật. **DECISION**: PIN dialog yêu cầu PIN của Owner cụ thể, KHÔNG phải PIN của user đăng nhập → endpoint verify-pin hiện tại verify PIN của user đang login (Story 1.4). Story 4.4b boundary: yêu cầu Manager nhờ Owner đứng cạnh nhập PIN. Nếu future cần Multi-user PIN → mở rộng endpoint sau (defer)
    - PIN sai 5 lần → khóa PIN 15 phút (logic Story 1.4)
  - [x] 15.7: Manual POS sửa giá (Staff):
    - Login Staff → POS → add SP → click giá → KHÔNG có quyền → tooltip "Bạn không có quyền sửa giá", KHÔNG mở dialog
  - [x] 15.8: Manual mobile (DevTools 375px): cardlist category-discounts hiển thị đúng, dialog edit price + PIN scroll OK trên mobile
  - [x] 15.9: Manual permission: Manager có `pricing.manage` → CRUD category_discounts OK; Staff truy cập `/pricing/category-discounts` → redirect `/`
  - [x] 15.10: Manual route order: navigate `/pricing/category-discounts` → load đúng page; navigate `/pricing/<random-uuid>` → load PricingDetailPage. KHÔNG bị nhầm match
  - [x] 15.11: Manual audit: Owner thực hiện 3 actions category_discount.\* → /settings/audit thấy 3 record với label tiếng Việt + group "Chiết khấu danh mục"

## Dev Notes

### Pattern reuse từ Story 4.3, 4.4 (BẮT BUỘC tuân thủ)

| Khu vực                           | File hiện có                                                                                  | Cách dùng                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema bigint integer VND | `packages/shared/src/schema/customer-prices.ts:price`                                         | `bigint({ mode: 'number' })` cho `discount_value`, `original_price`. Range an toàn ≤ 2^53                                                            |
| CHECK constraint helper           | `packages/shared/src/schema/price-lists.ts`                                                   | Dùng `check()` từ `drizzle-orm/pg-core`. Story 4.4b có 4 CHECKs trong `category_discounts`                                                           |
| FK CASCADE pattern                | `packages/shared/src/schema/customer-prices.ts`                                               | `customerId` (CASCADE), `productId` (CASCADE), `storeId` (RESTRICT). Story 4.4b: `categoryId/customerId/customerGroupId` CASCADE; `storeId` RESTRICT |
| Cross-field validation            | `packages/shared/src/schema/volume-price-management.ts:replaceVolumePricesSchema:superRefine` | Pattern `superRefine` cho XOR target + percent ≤ 100 + dates valid                                                                                   |
| PG error helper                   | `apps/api/src/lib/pg-errors.ts`                                                               | Story 4.4b ít unique constraint nhưng `isUniqueViolation` reuse nếu cần                                                                              |
| String escape                     | `apps/api/src/lib/strings.ts:escapeLikePattern`                                               | Áp dụng cho mọi search query LIKE                                                                                                                    |
| Audit logging                     | `apps/api/src/services/audit.service.ts`                                                      | `logAction` trong cùng transaction. `diffObjects` cho update audit                                                                                   |
| ApiError                          | `apps/api/src/lib/errors.ts`                                                                  | VALIDATION_ERROR / NOT_FOUND / CONFLICT / BUSINESS_RULE_VIOLATION                                                                                    |
| Hono route                        | `apps/api/src/routes/customer-prices.routes.ts`                                               | Hono factory `createCategoryDiscountsRoutes({ db })`. uuidParam param, parseJson body                                                                |
| API client                        | `apps/web/src/features/pricing/customer-prices-api.ts`                                        | apiClient.get/post/patch/delete + buildQueryString helper                                                                                            |
| Query hooks pattern               | `apps/web/src/features/pricing/use-customer-prices.ts`                                        | queryKey `['category-discounts', ...]` + `keepPreviousData`. Mutation invalidate subtree                                                             |
| Form pattern                      | `apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx`                      | RHF + zodResolver, mode 'onTouched', handleApiError, disable Save khi `!isValid \|\| isPending`                                                      |
| TabBar pattern                    | `apps/web/src/features/pricing/components/PricingTabsHeader.tsx`                              | Sửa thêm tab 4 "Chiết khấu danh mục"                                                                                                                 |
| Permission guard route            | `apps/web/src/router.tsx:requirePermissionGuard`                                              | `requirePermissionGuard('pricing.manage')` cho route mới                                                                                             |
| Empty state                       | `apps/web/src/components/shared/empty-state.tsx`                                              | Reuse                                                                                                                                                |
| Pagination                        | `apps/web/src/components/shared/pagination.tsx`                                               | Reuse                                                                                                                                                |
| CurrencyInput                     | `apps/web/src/components/shared/currency-input.tsx`                                           | Cho `discount_value` (amount mode) + `newPrice` (POS edit price)                                                                                     |
| AlertDialog                       | `apps/web/src/components/ui/alert-dialog.tsx`                                                 | Confirm xoá category_discount                                                                                                                        |
| Currency helper                   | `apps/web/src/lib/currency.ts`                                                                | `formatVnd`, `parseVnd` reuse                                                                                                                        |
| PIN verify endpoint               | `apps/api/src/routes/users.routes.ts:33` (`POST /api/v1/users/verify-pin`)                    | Reuse cho `<PinVerificationDialog>`. KHÔNG tạo endpoint mới                                                                                          |
| Cart store                        | `apps/web/src/stores/use-cart-store.ts`                                                       | Mở rộng `CartItem` interface + thêm action `updateUnitPrice`                                                                                         |
| Audit action enum                 | `packages/shared/src/schema/audit-log.ts`                                                     | Thêm 4 action mới                                                                                                                                    |
| Permissions matrix                | `packages/shared/src/constants/permissions.ts`                                                | Thêm 2 permission `pos.editPrice`, `pos.editPriceBelowCost`                                                                                          |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `category-discounts.ts` (Drizzle table + 4 indexes + 4 CHECKs + 4 FKs)
- `category-discount-management.ts` (Zod create/update/list schemas + response types)
- `category-discount-management.test.ts`

**Backend (`apps/api/src/`):**

- `services/category-discounts.service.ts`
- `routes/category-discounts.routes.ts`
- `__tests__/category-discounts.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/pricing/category-discounts-api.ts`
- `features/pricing/use-category-discounts.ts`
- `features/pricing/components/CreateCategoryDiscountDialog.tsx`
- `features/pricing/components/EditCategoryDiscountDialog.tsx`
- `features/pricing/components/DeleteCategoryDiscountDialog.tsx`
- `features/pricing/components/CategoryDiscountsTable.tsx`
- `features/pricing/components/CategoryDiscountsCardList.tsx`
- `features/pricing/components/CategoryDiscountsFilters.tsx`
- `features/pricing/components/CategoryDiscountsManager.tsx`
- `pages/category-discounts-page.tsx`
- `features/pos/components/EditUnitPriceDialog.tsx`
- `features/auth/components/PinVerificationDialog.tsx` (nếu chưa có; check `features/users/components/` trước khi tạo)
- `features/auth/use-verify-pin.ts` (mutation hook)

**Migration (`apps/api/src/db/migrations/`):**

- `0019_*.sql` (CREATE TABLE category_discounts + ALTER order_items + indexes + CHECKs + FKs)
- `meta/0019_snapshot.json`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export `category-discounts`, `category-discount-management`
- `packages/shared/src/schema/audit-log.ts`: thêm 4 audit actions
- `packages/shared/src/schema/order-items.ts`: thêm 4 cột (`originalPrice`, `priceOverride`, `priceOverrideReason`, `priceOverridePinUsed`) + 1 partial index
- `packages/shared/src/constants/permissions.ts`: thêm 2 permissions `pos.editPrice`, `pos.editPriceBelowCost`
- `apps/api/src/index.ts`: mount `/api/v1/category-discounts`
- `apps/web/src/router.tsx`: thêm route `/pricing/category-discounts` MOUNT TRƯỚC `pricingDetailRoute`
- `apps/web/src/features/pricing/components/PricingTabsHeader.tsx`: thêm tab 4
- `apps/web/src/features/audit/action-labels.ts`: thêm 4 label + 2 group
- `apps/web/src/stores/use-cart-store.ts`: thêm 5 fields vào `CartItem` + action `updateUnitPrice`
- `apps/web/src/features/pos/components/CartItem.tsx`: thêm UI badge "Đã sửa giá" + click để mở `<EditUnitPriceDialog>` + permission guard
- `apps/web/src/features/pos/components/PosScreen.tsx` (hoặc nơi build CartItem từ product): truyền `costPrice` vào `addItem` (cart store cần costPrice cho check dưới vốn)

### Coupling với các epic khác

**Story 4.1 (Khách hàng + Nhóm KH) — done:**

- `customers.id`, `customer_groups.id` đã có làm FK target. Cascade DELETE: hard delete customer/group → category_discounts CASCADE xoá. Soft delete → orphan rows, list query LEFT JOIN filter loại bỏ (xem H1)

**Story 2.1 (Categories) — done:**

- `categories.id` đã có làm FK target. Hard delete category → category_discounts CASCADE xoá

**Story 4.3 + 4.4 (Bảng giá / Giá riêng / Giá theo SL) — done/review:**

- Story 4.4b reuse pattern audit, escape, currency, route order
- KHÔNG đụng vào `customer_prices`, `volume_prices`, `price_lists`. Hệ thống 6 tầng giá Story 4.5 sẽ orchestrate

**Story 4.5 (POS 6-tier integration) — backlog:**

- Pricing engine 6 tầng tầng 2 (CK danh mục) sẽ gọi `findApplicableCategoryDiscount` từ story 4.4b expose
- Story 4.4b CHỈ chuẩn bị data + helper, KHÔNG implement endpoint `/api/v1/pricing/resolve` hoặc UI PriceSourceBadge

**Story 3.3 (Thanh toán & Hoàn thành đơn hàng) — backlog:**

- Order checkout endpoint sẽ insert `order_items` với `original_price`, `price_override`, `price_override_reason`, `price_override_pin_used` từ cart store
- Story 3.3 sẽ ghi audit `order_item.price_overridden` cho mỗi item có `priceOverride=true` (Story 4.4b CHỈ thêm enum + cart fields)
- Server-side validate `unit_price >= 1` ở Zod order item schema (Story 3.3 trách nhiệm) → Story 4.4b TODO comment

**Story 1.4 (Quản lý nhân viên + PIN) — done:**

- Reuse `POST /api/v1/users/verify-pin` (verify PIN của user đang đăng nhập)
- Story 4.4b boundary quan trọng: PIN dialog yêu cầu Owner đứng cạnh nhập PIN của Owner. KHÔNG hỗ trợ "PIN của user khác" trong story này (defer mở rộng đa-PIN cho future)

**Story 8.2 (Báo cáo chi tiết + export) — backlog:**

- Báo cáo "đơn nào có sửa giá" sẽ query `order_items WHERE price_override = true`. Index `idx_order_items_price_override` chuẩn bị sẵn

### Logic priority — 6 tầng giá (Story 4.5 sẽ implement)

| Tầng | Tên                    | Bảng / Field                                                    | Story implement                           |
| ---- | ---------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| 1    | Giá riêng KH           | `customer_prices` (customerId + productId → price)              | Story 4.4 (done)                          |
| 2    | Chiết khấu danh mục    | `category_discounts` (categoryId + customerId/groupId + minQty) | **Story 4.4b**                            |
| 3    | Giá chỉnh tay (manual) | `order_items.unit_price` + `price_override = true`              | **Story 4.4b** (data) + Story 3.3 (apply) |
| 4    | Giá theo số lượng      | `volume_prices` (productId + minQty → price)                    | Story 4.4 (done)                          |
| 5    | Bảng giá nhóm KH       | `price_list_items` join `customer_groups.default_price_list_id` | Story 4.3 (done)                          |
| 6    | Giá bán lẻ             | `products.selling_price`                                        | Story 2.2 (done)                          |

**Story 4.4b ONLY persists data tầng 2 (CK danh mục) + tầng 3 (sửa tay manual edit qua cart). Pricing engine resolve thứ tự là Story 4.5.**

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement pricing engine 6 tầng ở story 4.4b — Story 4.5
- KHÔNG implement endpoint `/api/v1/pricing/resolve` cho POS — Story 4.5
- KHÔNG implement order checkout với `original_price`/`price_override` insert — Story 3.3 (story 4.4b CHỈ thêm cột schema + cart store fields, KHÔNG ghi DB)
- KHÔNG cho phép `category_discounts` thiếu cả `customer_id` và `customer_group_id` (XOR enforce ở DB CHECK + Zod superRefine)
- KHÔNG cho phép `discount_type=percent` với `value > 100` (DB CHECK + Zod refine)
- KHÔNG cho phép `min_qty < 1` (DB CHECK + Zod ≥ 1)
- KHÔNG cho phép `effective_to < effective_from` (DB CHECK + Zod refine)
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho `discount_value` (mode 'amount'). Dùng `bigint` integer VND
- KHÔNG soft delete `category_discounts` (hard delete OK, audit log lưu trace)
- KHÔNG bypass `storeId` filter trong service queries
- KHÔNG bypass `customers.deleted_at IS NULL` / `customer_groups.deleted_at IS NULL` filter trong list query (orphan logic)
- KHÔNG cho phép sửa `categoryId` / `customerId` / `customerGroupId` qua PATCH (immutable, dùng `.strict()` Zod loại bỏ; muốn đổi → xoá + tạo mới)
- KHÔNG mount `/pricing/category-discounts` SAU `/pricing/$id` trong router (TanStack Router match `:id = category-discounts` nếu sai thứ tự — pattern lỗi tương tự Story 4.4 H5)
- KHÔNG cho phép sửa giá thành 0 (Block tuyệt đối, kể cả với PIN owner. Phân biệt với "dưới vốn" có PIN bypass)
- KHÔNG ghi audit `order_item.price_overridden` ở story 4.4b (Story 3.3 trách nhiệm khi insert order_items)
- KHÔNG tạo PIN endpoint mới — reuse `/api/v1/users/verify-pin` (Story 1.4)
- KHÔNG persist PIN ở client (no localStorage, no in-memory cache)
- KHÔNG hiển thị nút sửa giá khi user thiếu `pos.editPrice` permission (ẨN hoàn toàn, không disable)
- KHÔNG tạo cột `pos_can_edit_price` trên `users` table (xem AC2 Note: dùng role matrix là đủ cho MVP, có thể mở rộng future nếu cần per-user override)
- KHÔNG dùng `Math.floor()` cho discount calculation. Dùng `Math.round()` (consistent với cart store hiện tại — `calcLineDiscount`)
- KHÔNG để `originalPrice` reset về giá lần sửa trước khi user sửa giá lần 2. `originalPrice` GIỮ NGUYÊN giá ban đầu khi add to cart
- KHÔNG submit category_discount nếu cả `customerId` và `customerGroupId` đều có giá trị (XOR strict)
- KHÔNG dùng `findFirst` không sort. Khi nhiều rule match → sort priority rõ ràng (customer_id NOT NULL > group_id NOT NULL > discount_value DESC) trong `findApplicableCategoryDiscount`

### Project Structure Notes

Tuân theo pattern Story 4.4 + 4.3:

- Feature folder flat: `features/pricing/components/CategoryDiscountsManager.tsx` (gom vào `pricing/` cùng `customer-prices` + `volume-prices`)
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (không file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case
- POS edit price flow nằm trong `features/pos/components/`
- PIN dialog tách riêng `features/auth/components/` để có thể reuse cho các flow khác (Story 5.1 ghi nợ vượt hạn mức cũng dùng PIN)

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.x/4.x):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat

### Lưu ý đặc thù Story 4.4b

**H1 — Orphan rows khi customer / customer_group / category soft delete:**

- `category_discounts.customer_id`, `customer_group_id`, `category_id` đều CASCADE chỉ trigger khi HARD delete entity. Story 4.1 (customers, customer_groups) chỉ SOFT delete. Story 2.1 (categories) chưa rõ soft hay hard — kiểm tra `categories.ts` schema (không có `deleted_at`) → categories HARD delete; cascade sẽ trigger
- Solution Story 4.4b: list query LEFT JOIN + WHERE `customers.deleted_at IS NULL AND customer_groups.deleted_at IS NULL` → orphan rows ẨN khỏi UI
- Khi restore customer/group → category_discounts của entity đó lại HIỆN trở lại
- KHÔNG cần cleanup job. Defer xử lý orphan

**H2 — Effective status compute:**

- Server compute `effectiveStatus` trong response based on `is_active + effective_from/to + CURRENT_DATE`
- Pure helper `computeEffectiveStatus(row, today): 'pending' | 'active' | 'expired' | 'inactive'` đặt trong `apps/api/src/services/category-discounts.service.ts` để test
- Khi `effective_from = NULL` → coi như áp dụng ngay
- Khi `effective_to = NULL` → không hết hạn
- Logic: `is_active=false` → 'inactive' (override). Else `effective_to < today` → 'expired'. Else `effective_from > today` → 'pending'. Else → 'active'

**H3 — XOR target validation (customer XOR customer_group):**

- Cả Zod superRefine + DB CHECK đều enforce. Defense in depth
- DB CHECK SQL: `(customer_id IS NOT NULL)::int + (customer_group_id IS NOT NULL)::int = 1`
- Zod superRefine pattern (xem `volume-price-management.ts`):

```typescript
.superRefine((data, ctx) => {
  const hasCustomer = data.customerId !== null && data.customerId !== undefined
  const hasGroup = data.customerGroupId !== null && data.customerGroupId !== undefined
  if (!hasCustomer && !hasGroup) {
    ctx.addIssue({ path: ['customerId'], message: 'Chọn 1 khách hàng hoặc 1 nhóm khách hàng' })
  } else if (hasCustomer && hasGroup) {
    ctx.addIssue({ path: ['customerGroupId'], message: 'Chỉ chọn 1 khách hàng HOẶC 1 nhóm, không cả hai' })
  }
})
```

**H4 — Cảnh báo "dưới giá vốn" cho category_discount:**

- Story 4.4b KHÔNG block khi `discount_value` lớn dẫn đến `finalPrice < costPrice`. Lý do: chiết khấu là chính sách cụ thể, có thể đúng business intent (clearance, KH VIP)
- UI dialog hiển thị warning vàng "⚠ Sau giảm giá, một số SP sẽ bán dưới vốn" nếu `discount_type=amount` và `discount_value > min(category.products.cost_price)` (compute ở client)
- Server KHÔNG validate cost_price (sẽ thay đổi theo từng SP). UI cảnh báo là đủ

**H5 — TabBar 4 tab trong /pricing:**

- Sửa `PricingTabsHeader.tsx` thêm tab 4. Active state: `pathname === '/pricing'` → tab 1; `startsWith('/pricing/customer-prices')` → tab 2; `startsWith('/pricing/volume-prices')` → tab 3; `startsWith('/pricing/category-discounts')` → tab 4; còn lại (/pricing/<uuid>) → tab 1

**H6 — Cart store `updateUnitPrice` `originalPrice` semantics:**

- `originalPrice = giá BAN ĐẦU khi item đầu tiên add to cart` (= product selling price hoặc price từ pricing engine resolve sau Story 4.5)
- Khi user sửa giá lần 1: `originalPrice = unitPrice cũ`, `unitPrice = newPrice`
- Khi user sửa giá lần 2 (đã `priceOverride=true`): `originalPrice` GIỮ NGUYÊN, không reset về giá lần 1
- Lý do: muốn audit log thấy được "giá ban đầu là 100k → cuối cùng còn 50k", không quan tâm các bước trung gian
- Edge case: user sửa giá rồi sửa lại đúng `originalPrice` → vẫn giữ `priceOverride=true` (vì đã có hành vi sửa, dù kết quả giống ban đầu)

**H7 — PIN cho Manager sửa dưới vốn:**

- Endpoint `verify-pin` hiện tại verify PIN của user đang login (Story 1.4 logic)
- Story 4.4b boundary: Manager khi sửa dưới vốn → PIN dialog hiển thị "Nhập PIN chủ cửa hàng". User actually sẽ nhập PIN của Owner (Owner đứng cạnh)
- Endpoint hiện tại verify PIN khớp với hash trong DB của user calling endpoint (Manager). Vậy nếu Manager nhập PIN Owner → server verify PIN với hash của Manager → MISMATCH → 401
- **DECISION: Story 4.4b CHỈ enforce PIN của user đang login**. Tức Manager phải có PIN riêng (Owner setup trước qua Story 1.4 user management). Manager nhập PIN của chính Manager → server verify đúng → cho phép
- **Future enhancement (Story 4.4c hoặc tương lai)**: Mở rộng `verify-pin` thành `verify-owner-pin` hoặc `verify-pin-by-userId` để cho phép Owner đứng cạnh nhập PIN của Owner. Defer vì làm phức tạp UX và endpoint
- Frontend thông báo rõ trong dialog: "Nhập PIN của bạn để xác nhận sửa giá dưới vốn" (KHÔNG ghi "PIN chủ cửa hàng" để tránh nhầm lẫn)
- Owner có `pos.editPriceBelowCost` permission → KHÔNG cần PIN khi sửa dưới vốn (chính họ là chủ cửa hàng, đã đăng nhập). Manager thiếu permission này → cần PIN của Manager (defense layer 2)

**H8 — DB CHECK constraint vs Zod:**

- Zod là source of truth (validation đầu tiên trong route)
- DB CHECK là defense layer 2 (chống corrupt nếu có raw INSERT). 4 CHECKs trong story 4.4b
- Tests: integration test cố tình INSERT raw qua `db.execute(sql\`...\`)` để verify CHECK throw error

**H9 — order_items columns add — backward compat:**

- ALTER TABLE `order_items` thêm 4 cột với DEFAULT phù hợp. `original_price` nullable (default NULL), `price_override` default false, etc.
- Tất cả order_items hiện có (nếu có) sẽ có giá trị default, KHÔNG cần data migration

**H10 — CategoryDiscountsManager filter effectiveStatus:**

- Frontend filter call backend với param `effectiveStatus`. Backend compute từ `is_active + effective_from/to + CURRENT_DATE` (server time, nội bộ store)
- Edge case timezone: backend dùng `CURRENT_DATE` của PG → UTC date. Nếu cửa hàng ở VN (UTC+7) và rule active ngày 30/4 23:00 VN (= UTC 16:00 ngày 30/4) → vẫn active. Acceptable cho MVP
- Future: có thể lưu `store_settings.timezone` và compute theo đó. Defer

**H11 — PIN dialog UX trong POS:**

- Chuỗi popup: `<EditUnitPriceDialog>` open → user submit → trigger `<PinVerificationDialog>` open OVERLAY
- Tránh stack 2 dialog gây UX rối → option: đóng `<EditUnitPriceDialog>` khi mở `<PinVerificationDialog>`. Nếu user cancel PIN → reopen `<EditUnitPriceDialog>` với state cũ (lưu trong parent). Nếu PIN ok → cập nhật cart và đóng cả 2
- Implement `parent state machine`:
  - state: `'idle' | 'editPrice' | 'pinRequired' | 'applying'`
  - transitions: idle → editPrice → (submit) → check costPrice → if < cost && need PIN → pinRequired → (PIN ok) → applying → idle (close all + cart updated)

### Permission matrix (story này)

| Permission               | Owner | Manager | Staff | Resource                                                                                                  |
| ------------------------ | ----- | ------- | ----- | --------------------------------------------------------------------------------------------------------- |
| `pricing.manage`         | ✅    | ✅      | ❌    | CRUD category_discounts, /pricing/category-discounts UI                                                   |
| `pos.editPrice`          | ✅    | ✅      | ❌    | Sửa giá ≥ vốn trên POS. Nhân viên KHÔNG có quyền                                                          |
| `pos.editPriceBelowCost` | ✅    | ❌      | ❌    | Sửa giá < vốn KHÔNG cần PIN. Manager phải nhập PIN (của chính họ). Staff không có quyền sửa giá nói chung |

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.4b]
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.5] (downstream: POS 6-tier integration)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR19] (CK danh mục)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR20] (6 tầng ưu tiên)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR22] (PIN dưới vốn, block giá 0)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR67] (PIN cho thao tác nhạy cảm)
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M2: Đơn giá]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Currency, Pagination, Validation Flow, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Authorization 3 Role]
- [Source: _bmad-output/implementation-artifacts/4-4-gia-rieng-khach-hang-gia-theo-so-luong.md#Pattern bigint price, CHECK constraint, escapeLikePattern, audit, route order, TabBar]
- [Source: _bmad-output/implementation-artifacts/4-3-bang-gia-direct-formula.md#Pattern check() helper, soft delete reference]
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md] (PIN endpoint pattern)
- [Source: packages/shared/src/schema/customer-prices.ts] (pattern Drizzle schema bigint integer VND)
- [Source: packages/shared/src/schema/customers.ts] (FK target customer_id)
- [Source: packages/shared/src/schema/customer-groups.ts] (FK target customer_group_id, deleted_at filter)
- [Source: packages/shared/src/schema/categories.ts] (FK target category_id, KHÔNG soft delete)
- [Source: packages/shared/src/schema/order-items.ts] (cần ALTER thêm 4 cột)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum)
- [Source: packages/shared/src/constants/permissions.ts] (PERMISSIONS matrix)
- [Source: packages/shared/src/schema/volume-price-management.ts] (pattern superRefine cross-field validation)
- [Source: apps/api/src/services/customer-prices.service.ts] (pattern listCustomerPrices + paginate + LEFT JOIN + audit)
- [Source: apps/api/src/services/pin.service.ts] (verifyPin existing implementation)
- [Source: apps/api/src/services/audit.service.ts] (logAction + diffObjects + getRequestMeta)
- [Source: apps/api/src/lib/pg-errors.ts] (isUniqueViolation)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern)
- [Source: apps/api/src/routes/customer-prices.routes.ts] (factory route + uuidParam + parseJson + middleware)
- [Source: apps/api/src/routes/users.routes.ts:33] (POST /verify-pin endpoint reuse)
- [Source: apps/web/src/router.tsx:requirePermissionGuard] (pattern guard cho pricing.manage + mount sub-routes trước :id)
- [Source: apps/web/src/features/pricing/components/PricingTabsHeader.tsx] (TabBar mở rộng tab 4)
- [Source: apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx] (pattern dialog + RHF + form.setError + handleApiError)
- [Source: apps/web/src/features/pricing/components/CustomerPricesManager.tsx] (pattern manager state + filters + pagination + dialogs)
- [Source: apps/web/src/features/pricing/use-customer-prices.ts] (pattern queryKey + invalidate subtree)
- [Source: apps/web/src/stores/use-cart-store.ts] (CartItem interface + updateLineDiscount pattern)
- [Source: apps/web/src/features/pos/components/CartItem.tsx] (cần thêm UI badge + click sửa giá)
- [Source: apps/web/src/components/shared/currency-input.tsx, empty-state.tsx, pagination.tsx] (reuse)
- [Web: PostgreSQL CHECK constraints with multiple conditions](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Web: Zod superRefine for XOR validation](https://zod.dev/?id=superrefine)
- [Web: TanStack Router code-based routing route order](https://tanstack.com/router/latest/docs/framework/react/guide/code-based-routing)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — BMAD dev-story workflow, ngày 2026-04-30

### Debug Log References

- Typecheck shared: ban đầu fail vì test fixture `permissions.test.ts` thiếu 2 permission `pos.editPrice`/`pos.editPriceBelowCost`. Fix: thêm vào MATRIX + sorted keys assertion.
- Typecheck api: ban đầu fail vì `products.service.ts` 2 nhánh map `extraRows`/`PosVariantItem` chưa thêm `costPrice`. Fix: select `products.costPrice`, map cả 2 nhánh.
- Test integration ban đầu fail 1 test `Raw INSERT discountValue âm`. Lý do: schema CHECK chỉ kiểm `percent ≤ 100` chứ không kiểm `discountValue ≥ 0`. Story chỉ định 4 CHECK constraints theo AC1, không yêu cầu non-negative DB-level. Fix: thay test thành `minQty=0` + `effectiveTo<effectiveFrom` đúng theo CHECK constraints có trong schema.
- Conflict tên `DiscountType` với `purchase-order-management.ts`. Fix: rename `categoryDiscountTypeSchema`/`CategoryDiscountType` xuyên suốt module mới.
- PinDialog đã có sẵn tại `apps/web/src/features/auth/pin-dialog.tsx` + `useVerifyPin` tại `features/users/use-verify-pin.ts` → reuse, KHÔNG tạo `PinVerificationDialog` mới.

### Completion Notes List

- Triển khai full 15 tasks theo story file. Tất cả 67 checkbox subtask đã đánh `[x]`.
- Schema mới `category_discounts` (CREATE TABLE) + 4 cột price-override trên `order_items` (ALTER) trong migration 0019.
- 2 permission mới `pos.editPrice` (Owner+Manager) và `pos.editPriceBelowCost` (Owner) đã được tích hợp vào `PERMISSIONS` matrix + `permissions.test.ts`.
- 4 audit action mới: `category_discount.created/updated/deleted` + `order_item.price_overridden` (ghi audit trong transaction tại `orders.service.ts:createOrder`).
- POS edit price flow: clickable unit price trong `CartItem` → `EditUnitPriceDialog`. Khi `newPrice < costPrice` và user không có `pos.editPriceBelowCost` → mở `PinDialog`. Sau khi verify thành công → `cartStore.updateUnitPrice(id, price, { reason, pinUsed: true })` + ghi audit khi checkout.
- POS API mở rộng `PosProductItem` + `PosVariantItem` với `costPrice` (số nguyên VND) để frontend có dữ liệu so sánh.
- Cart store: `CartItem` thêm 5 trường (`costPrice`, `originalPrice`, `priceOverride`, `priceOverrideReason`, `priceOverridePinUsed`) + action `updateUnitPrice` với logic giữ nguyên `originalPrice` khi sửa nhiều lần.
- Checkout payload `createOrderItemSchema` thêm 4 trường price-override + refine `priceOverride => originalPrice !== null`.
- Tab `/pricing/category-discounts` được mount TRƯỚC `pricingDetailRoute` (tránh nhầm match `:id`). Permission guard `pricing.manage`.
- Test results: 30/30 tests cho category-discounts (22 integration + 8 unit `computeEffectiveStatus`). Full repo test suite 882/882 PASS, không regression.
- Lint sạch (0 error). 6 warning có sẵn (fast-refresh) không liên quan story này.
- Frontend `usePermissions()` hook tạo mới tại `features/auth/use-permissions.ts`, compute từ `useAuthStore.user.role` qua `hasPermission()` của shared. Tránh phải mở rộng `AuthUser` payload từ backend.
- Manual verify (15.4-15.11) chưa thực hiện vì đây là agent dev không có UI. Bàn giao manual verify sang code-review/QA.

### File List

**Schema (`packages/shared/src/`):**

- `schema/category-discounts.ts` (NEW): Drizzle table + 4 indexes + 4 CHECKs + 4 FKs.
- `schema/category-discount-management.ts` (NEW): Zod schemas + types.
- `schema/category-discount-management.test.ts` (NEW): 29 unit tests.
- `schema/order-items.ts` (MODIFIED): +4 cột price-override + index partial.
- `schema/order-management.ts` (MODIFIED): `createOrderItemSchema` thêm 4 trường + refine.
- `schema/audit-log.ts` (MODIFIED): +4 action.
- `schema/index.ts` (MODIFIED): export category-discounts + category-discount-management.
- `constants/permissions.ts` (MODIFIED): +2 permission.
- `constants/permissions.test.ts` (MODIFIED): MATRIX + sorted keys.

**Backend (`apps/api/src/`):**

- `services/category-discounts.service.ts` (NEW): CRUD + `computeEffectiveStatus` + `findApplicableCategoryDiscount`.
- `services/category-discounts.service.test.ts` (NEW): 8 unit test cho `computeEffectiveStatus`.
- `routes/category-discounts.routes.ts` (NEW): 5 endpoints + middleware.
- `index.ts` (MODIFIED): mount `/api/v1/category-discounts`.
- `services/orders.service.ts` (MODIFIED): insert 4 trường + audit `order_item.price_overridden`.
- `services/products.service.ts` (MODIFIED): expose `costPrice` trong `PosProductItem` + `PosVariantItem` (cả 2 nhánh map).
- `__tests__/category-discounts.integration.test.ts` (NEW): 22 integration test.
- `db/migrations/0019_sturdy_deadpool.sql` (NEW): CREATE TABLE + ALTER + indexes + CHECKs + FKs.
- `db/migrations/meta/0019_snapshot.json` (NEW).
- `db/migrations/meta/_journal.json` (MODIFIED).

**Frontend (`apps/web/src/`):**

- `features/pricing/category-discounts-api.ts` (NEW).
- `features/pricing/use-category-discounts.ts` (NEW).
- `features/pricing/components/CategoryDiscountsFilters.tsx` (NEW).
- `features/pricing/components/CategoryDiscountsTable.tsx` (NEW).
- `features/pricing/components/CategoryDiscountsCardList.tsx` (NEW).
- `features/pricing/components/CategoryDiscountsManager.tsx` (NEW).
- `features/pricing/components/CreateCategoryDiscountDialog.tsx` (NEW).
- `features/pricing/components/EditCategoryDiscountDialog.tsx` (NEW).
- `features/pricing/components/DeleteCategoryDiscountDialog.tsx` (NEW).
- `features/pricing/components/PricingTabsHeader.tsx` (MODIFIED): +tab "Chiết khấu danh mục", 4 tab.
- `pages/category-discounts-page.tsx` (NEW).
- `router.tsx` (MODIFIED): import + mount route TRƯỚC `pricingDetailRoute`.
- `features/auth/use-permissions.ts` (NEW): hook.
- `features/pos/components/EditUnitPriceDialog.tsx` (NEW): dialog sửa giá + lồng `PinDialog`.
- `features/pos/components/CartItem.tsx` (MODIFIED): clickable price + badge "Đã sửa giá" + Shield icon.
- `features/pos/components/PosScreen.tsx` (MODIFIED): checkout payload thêm 4 trường price-override.
- `features/pos/components/BarcodeScanner.tsx` (MODIFIED): `addItem` với `costPrice`.
- `features/pos/components/PosSearchBar.tsx` (MODIFIED): `addItem` với `costPrice`.
- `features/pos/components/ProductGrid.tsx` (MODIFIED): `addItem` với `costPrice`.
- `features/pos/components/VariantSelectionDialog.tsx` (MODIFIED): `addItem` với `costPrice` từ variant hoặc fallback product.
- `features/pos/types.ts` (MODIFIED): +`costPrice` trong `PosProductItem` + `PosProductVariant`.
- `stores/use-cart-store.ts` (MODIFIED): +5 trường + action `updateUnitPrice`.

### Change Log

| Date       | Version | Description                                                                                                                                                                                                                                        | Author          |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 2026-04-30 | v0.1    | Story file created (BMAD create-story).                                                                                                                                                                                                            | dev-team        |
| 2026-04-30 | v0.2    | Sprint status: ready-for-dev → in-progress.                                                                                                                                                                                                        | dev-team        |
| 2026-04-30 | v1.0    | Implement 15 tasks. 30/30 tests new + 882/882 full suite. Status: in-progress → review.                                                                                                                                                            | claude-opus-4-7 |
| 2026-04-30 | v1.1    | BMAD code-review: 1 decision-needed, 2 patches, 4 defer, 2 dismiss. Đề xuất status: in-progress (chờ xác minh F1 + bổ sung tests F2).                                                                                                              | claude-opus-4-7 |
| 2026-04-30 | v1.2    | Fix F1 (Option B: cost null → warning UI, không bắt PIN) + F2 (thêm 12 case tests cho multi-tenant, cascade, helper findApplicable, orphan filter, search escape). 35/35 integration tests pass; 895/895 full suite. F6 vẫn pending note trong PR. | dev-fixer       |

## Senior Developer Review (AI)

**Reviewer:** claude-opus-4-7 (BMAD code-review workflow)
**Date:** 2026-04-30
**Scope:** Full diff story 4-4b. Loại trừ thay đổi của story 3-3 trong scope core, nhưng có flag regression liên quan trong file dùng chung (order-management.ts).
**Approach:** Đọc 41 file (20 modified + 21 untracked, tổng ~5000 LoC), 3 lăng kính song song: Blind Hunter (smell), Edge Case Hunter (boundary), Acceptance Auditor (17 AC).

### Tổng quan

Implementation tuân thủ phần lớn 17 AC. Pattern chuẩn: Drizzle bigint VND, CHECK constraint defense layer 2, audit trong transaction, multi-tenant filter, route mount order chuẩn. Có 1 vấn đề logic an toàn (F1) cần product-owner quyết, 1 lỗ test coverage (F2) cần bổ sung trước khi approve.

### Acceptance Criteria xét duyệt

| AC                        | Status         | Ghi chú                                                                                                                                |
| ------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 Schema migration      | PASS           | Table + 4 CHECK + 4 index + 4 FK đúng spec. ALTER order_items 4 cột + index partial OK.                                                |
| AC2 Permissions + audit   | PASS           | 2 permission đúng matrix. 4 audit action thêm vào enum.                                                                                |
| AC3 POST                  | PASS           | Zod superRefine đầy đủ; service ensureXAlive 3 entity; audit trong transaction.                                                        |
| AC4 GET list              | PARTIAL        | Logic effectiveStatus đúng. Search escape đúng. Thiếu test orphan filter (xem F2).                                                     |
| AC5 PATCH                 | PASS           | strict block category/customer/group; refine ≥1 field; diff audit.                                                                     |
| AC6 DELETE                | PASS           | Hard delete + audit snapshot before.                                                                                                   |
| AC7 PIN endpoint reuse    | PASS           | Reuse `/users/verify-pin`. Audit `order_item.price_overridden` ghi tại checkout.                                                       |
| AC8 Helper findApplicable | PARTIAL        | Logic priority OK. Implementation có thêm `basePrice` arg ngoài spec (acceptable extension). Thiếu integration test (xem F2).          |
| AC9 Block giá 0đ          | PASS-with-risk | Client validate `>= 1`. Cart store reject silent. **Tuy nhiên xem F1**: edge case cost null.                                           |
| AC10 Routes mount         | PASS           | Mount sau volume-prices đúng.                                                                                                          |
| AC11 UI page              | MOSTLY-PASS    | Manager + Table + CardList + Filters + Empty state + Pagination OK. Filter customer-specific không có (spec chỉ yêu cầu group).        |
| AC12 Form dialogs         | PARTIAL        | Form không dùng zodResolver (validation manual duplicate). Pattern lệch khỏi spec nhưng vẫn đúng logic (xem F4).                       |
| AC13 POS edit price       | PARTIAL        | Flow 4 bước đúng. Cart store updateUnitPrice giữ originalPrice đúng. **F1**: xem chi tiết. **F3**: thiếu tooltip "không có quyền".     |
| AC14 PIN dialog reuse     | PASS           | Reuse PinDialog có sẵn (auth/pin-dialog.tsx + use-verify-pin), KHÔNG tạo PinVerificationDialog mới. Đúng spirit "check trước khi tạo". |
| AC15 API client + hooks   | PASS           | api file + hooks đầy đủ 5 endpoint + invalidate subtree.                                                                               |
| AC16 Tests                | PARTIAL        | Unit schema OK (29 case). 22 integration test OK nhưng thiếu 5 case spec yêu cầu (xem F2).                                             |
| AC17 Documentation        | PASS           | Action labels VN đầy đủ + 2 group mới.                                                                                                 |

### Findings & Triage

#### F1 (HIGH, decision-needed): Fallback `costPrice ?? 0` bypass PIN gate khi product chưa có giá vốn

**Vị trí:** `apps/web/src/features/pos/components/BarcodeScanner.tsx:87`, `PosSearchBar.tsx:83`, `ProductGrid.tsx:66`, `VariantSelectionDialog.tsx:136`. Hệ quả lan tới `EditUnitPriceDialog.tsx:52`.

**Mô tả:** 4 caller add-to-cart đều dùng `product.costPrice ?? 0` để ép `CartItem.costPrice` thành `number` (NOT NULL). Khi product chưa setup cost price, `costPrice = 0` được lưu vào cart.

Hệ quả trong `EditUnitPriceDialog`:

```ts
const isBelowCost = draftPrice !== null && draftPrice < costPrice // costPrice = 0
```

`draftPrice` luôn `>= 1` (validate đã chặn 0/âm), nên `isBelowCost = false` luôn → PIN dialog không bao giờ bật. Nhân viên có `pos.editPrice` (manager) có thể bán product chưa có cost với giá bất kỳ ≥ 1đ mà không cần PIN owner.

**Đối chiếu spec:** AC13 pseudocode: `if newPrice < costPrice → mở PIN`. AC9 cấm giá 0 nhưng KHÔNG cấm giá thấp hơn cost khi cost null. Tinh thần FR22 (PIN cho sửa dưới vốn) chưa được defense khi cost = null.

**Decision cần product-owner:**

- **Option A (an toàn):** Khi `product.costPrice == null` → bắt buộc PIN luôn cho mọi sửa giá.
- **Option B (cảnh báo):** UI hiển thị warning "Sản phẩm chưa có giá vốn" + chấp nhận sửa không PIN (giữ behavior hiện tại nhưng explicit).
- **Option C (chặn cứng):** Không cho sửa giá khi cost null, yêu cầu setup cost trước.

#### F2 (HIGH, patch): Thiếu test integration coverage so với AC16

**Vị trí:** `apps/api/src/__tests__/category-discounts.integration.test.ts`.

AC16 yêu cầu 12 nhóm test, thực tế thiếu:

1. **Multi-tenant isolation:** store A truy cập rule store B → 404. Hoàn toàn vắng.
2. **Cascade DELETE:** hard delete category → category_discounts CASCADE xoá. Vắng.
3. **Helper `findApplicableCategoryDiscount`:** 7 case AC16 (rule active match, inactive null, effective_from > today null, effective_to < today null, min_qty > qty null, customer-rule ưu tiên group-rule, multi match ưu tiên discount lớn). Vắng hoàn toàn (chỉ có service test cho `computeEffectiveStatus` 8 case).
4. **Filter orphan:** customer/group đã soft delete → LEFT JOIN filter loại bỏ row. Vắng.
5. **Search escape `%`:** Vắng.

**Action:** Bổ sung 5 nhóm test trên trước khi mark done. Đặc biệt nhóm 3 (helper findApplicable) là lõi của Story 4.5 sắp làm.

#### F3 (MEDIUM, defer): UI thiếu tooltip "Bạn không có quyền sửa giá"

**Vị trí:** `apps/web/src/features/pos/components/CartItem.tsx:153-162`.

AC13: "Nếu user KHÔNG có pos.editPrice → click vào giá → tooltip 'Bạn không có quyền sửa giá', KHÔNG mở dialog". Implementation: render `<p>` text-only, không có tooltip. Staff click vào giá không có feedback gì.

**Action:** Wrap text trong Tooltip component khi `!canEditPrice`. Defer vì Tooltip component đã có sẵn (`apps/web/src/components/ui/tooltip.tsx`). Không phải blocker, chỉ là UX polish.

#### F4 (MEDIUM, defer): Form Create/Edit dialog không dùng zodResolver

**Vị trí:** `CreateCategoryDiscountDialog.tsx:78-120`, `EditCategoryDiscountDialog.tsx:84-100`.

AC12 + Dev Notes pattern: "RHF + zodResolver(createCategoryDiscountSchema). Mode 'onTouched'". Form hiện manual validation duplicate logic Zod (XOR target, percent ≤ 100, dates). Server vẫn enforce qua Zod nên không có bug, nhưng:

- Hai chỗ validate dễ drift nếu schema đổi.
- Lệch pattern Story 4.4 (dùng zodResolver).

**Action:** Refactor dùng `@hookform/resolvers/zod`. Defer vì không ảnh hưởng UX hay correctness.

#### F5 (LOW, dismiss): `void isNull` ở cuối service

**Vị trí:** `apps/api/src/services/category-discounts.service.ts:664-665`.

`void isNull` là workaround tránh "unused import" warning. Có thể chỉ cần xoá `isNull` khỏi import. Cosmetic, không có hệ quả runtime.

#### F6 (LOW, patch): Audit action `'order.created'` thêm trong scope 4-4b nhưng thuộc story 3-3

**Vị trí:** `packages/shared/src/schema/audit-log.ts:62`.

Khi 4-4b commit thêm 4 action category_discount/order_item, có 1 dòng `'order.created'` đi cùng. Action này thuộc story 3-3 (Thanh toán & Hoàn thành đơn hàng). Không phải bug, chỉ cần làm rõ trong commit message: cả 5 action enum cùng commit.

**Action:** Note trong PR description rằng `order.created` thuộc 3-3.

#### F7 (HIGH, defer — thuộc story 3-3): order-management.ts validation messages bị KHÔNG DẤU

**Vị trí:** `packages/shared/src/schema/order-management.ts` toàn bộ file.

Diff cho thấy mọi message Zod đã chuyển từ tiếng Việt có dấu ("Sản phẩm không hợp lệ") sang KHÔNG DẤU ("San pham khong hop le"). Đây là regression nghiêm trọng cho UX. **Không thuộc scope 4-4b** (chỉ thêm 4 field price-override), nhưng vì cùng PR/branch, flag để team-lead route sang review story 3-3.

**Action:** Story 3-3 review phải fix trước khi merge. Không block 4-4b nếu tách commit.

#### F8 (LOW, dismiss): finalPrice = 0 trong findApplicableCategoryDiscount khi discount > basePrice

**Vị trí:** `apps/api/src/services/category-discounts.service.ts:660`.

`Math.max(0, baseSellingPrice - discountAmount)` cho phép finalPrice = 0. Mâu thuẫn AC9 "block giá 0đ", nhưng AC9 áp cho POS edit-price flow, không áp cho engine helper. Engine trả số, story 4.5 (POS 6-tier integration) sẽ enforce gate trước khi áp dụng. Acceptable.

#### F9 (LOW, defer — thuộc story 3-3): pos.routes.ts mở rộng

**Vị trí:** `apps/api/src/routes/pos.routes.ts` (+36 dòng).

Story 4-4b không spec thêm endpoint POS mới. Đây thuộc 3-3. Flag để team-lead.

### Risk Assessment

- **Security:** Multi-tenant filter chặt (store_id ở mọi query). PIN endpoint reuse đúng. F1 là risk vận hành, không phải lỗ hổng auth.
- **Performance:** Index cover query patterns AC4 và AC8. Pattern count + select hai query OK. Không có N+1.
- **Concurrency:** Audit + insert/update đều trong transaction. Không có race condition khả nghi.
- **Migration safety:** ALTER order_items 4 cột với DEFAULT phù hợp, backward compat với rows cũ. CHECK inline đúng.

### Tổng kết Triage

| Mức             | Count | IDs            |
| --------------- | ----- | -------------- |
| decision-needed | 1     | F1             |
| patch           | 2     | F2, F6         |
| defer           | 4     | F3, F4, F7, F9 |
| dismiss         | 2     | F5, F8         |

### Đề xuất Status

**in-progress** (quay lại dev). Lý do:

- F1 cần product-owner quyết định trước khi merge (an toàn nghiệp vụ).
- F2 thiếu test cho cốt lõi nghiệp vụ (helper findApplicable). Phải bổ sung tests theo AC16.
- F6 cần làm rõ trong commit message.
- F3, F4, F7, F9 không block, có thể defer.

### Review Findings (action items)

- [x] [Review][Decision] F1: Chọn Option B (warning UI, không bắt PIN khi cost null). `CartItem.costPrice` đổi thành `number | null`; 5 caller (4 add-to-cart + VariantSelectionDialog) bỏ fallback `?? 0`. Dialog hiện cảnh báo amber "Chưa có giá vốn, không thể xác minh giá dưới vốn" và chỉ kích hoạt PIN gate khi `costPrice != null && draftPrice < costPrice`. Files: `apps/web/src/stores/use-cart-store.ts`, `apps/web/src/features/pos/components/EditUnitPriceDialog.tsx`, `BarcodeScanner.tsx`, `PosScreen.tsx`, `PosSearchBar.tsx`, `ProductGrid.tsx`, `VariantSelectionDialog.tsx`.
- [x] [Review][Patch] F2: Thêm 5 nhóm test (12 case mới) trong `apps/api/src/__tests__/category-discounts.integration.test.ts`: multi-tenant isolation, cascade DELETE category, helper `findApplicableCategoryDiscount` 7 case, filter orphan customer/group soft-deleted, search escape `%` và `_`. Tổng integration test 35/35 pass; full suite 895/895 không regression.
- [ ] [Review][Patch] F6: Note trong commit/PR rằng `'order.created'` audit action thuộc story 3-3 — `packages/shared/src/schema/audit-log.ts:62` (chưa fix trong patch này).
- [x] [Review][Defer] F3: Thêm Tooltip "Bạn không có quyền sửa giá" — `apps/web/src/features/pos/components/CartItem.tsx:153-162` — deferred, UX polish.
- [x] [Review][Defer] F4: Refactor dialogs dùng zodResolver — `apps/web/src/features/pricing/components/CreateCategoryDiscountDialog.tsx`, `EditCategoryDiscountDialog.tsx` — deferred, không ảnh hưởng correctness.
- [x] [Review][Defer] F7: Khôi phục dấu tiếng Việt trong validation messages — `packages/shared/src/schema/order-management.ts` — deferred, thuộc story 3-3 review.
- [x] [Review][Defer] F9: Verify pos.routes.ts mở rộng thuộc story 3-3 — `apps/api/src/routes/pos.routes.ts` — deferred, không thuộc scope 4-4b.
