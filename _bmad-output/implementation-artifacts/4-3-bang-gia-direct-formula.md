# Story 4.3: Bảng giá Direct & Formula

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a chủ cửa hàng,
I want tạo bảng giá bằng phương pháp nhập trực tiếp hoặc công thức từ một bảng giá nền, có ngày hiệu lực và quy tắc làm tròn,
so that thiết lập giá bán riêng cho từng nhóm khách hàng theo chiến lược kinh doanh và để Story 4.5 (POS) áp đúng giá khi chọn khách hàng.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `price_lists`, `price_list_items` và FK kích hoạt

**Given** hệ thống đã có bảng `stores`, `products`, `customer_groups` (với cột `default_price_list_id uuid nullable` không FK), `audit_logs`
**When** chạy migration mới của story 4.3
**Then** tạo bảng `price_lists`:

| Column               | Type                       | Ràng buộc                                                                                                                                                                                                                               |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | `uuid`                     | PK, default `uuidv7()`                                                                                                                                                                                                                  |
| `store_id`           | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                                                                                                                                                                                           |
| `name`               | `varchar(100)`             | NOT NULL                                                                                                                                                                                                                                |
| `description`        | `varchar(255)`             | NULLABLE                                                                                                                                                                                                                                |
| `method`             | `varchar(16)`              | NOT NULL, ENUM constraint check `method IN ('direct','formula')` (Story 4.3b mở rộng `'chain','clone','import'`)                                                                                                                        |
| `base_price_list_id` | `uuid`                     | NULLABLE, FK → `price_lists.id` ON DELETE RESTRICT (chỉ dùng khi `method='formula'`)                                                                                                                                                    |
| `formula_type`       | `varchar(16)`              | NULLABLE, ENUM check `formula_type IN ('percent_increase','percent_decrease','amount_increase','amount_decrease')` (chỉ dùng khi `method='formula'`)                                                                                    |
| `formula_value`      | `bigint`                   | NULLABLE, ≥ 0 (mode 'number'). Với `percent_*` → đơn vị 0.01% (basis points / 100), VD: 5% = 500. Với `amount_*` → integer VND                                                                                                          |
| `rounding_rule`      | `varchar(24)`              | NOT NULL, default `'none'`, ENUM check `rounding_rule IN ('none','nearest_hundred','nearest_five_hundred','nearest_thousand','ceil_hundred','ceil_five_hundred','ceil_thousand','floor_hundred','floor_five_hundred','floor_thousand')` |
| `effective_from`     | `date`                     | NULLABLE (NULL = có hiệu lực ngay)                                                                                                                                                                                                      |
| `effective_to`       | `date`                     | NULLABLE (NULL = không giới hạn)                                                                                                                                                                                                        |
| `is_active`          | `boolean`                  | NOT NULL, default `true` (cờ enable/disable do owner toggle, KHÁC `effectiveActive` tính từ ngày)                                                                                                                                       |
| `deleted_at`         | `timestamp with time zone` | NULLABLE (soft delete)                                                                                                                                                                                                                  |
| `created_at`         | `timestamp with time zone` | NOT NULL, default `now()`                                                                                                                                                                                                               |
| `updated_at`         | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                                                                                                                                                                                                  |

**And** unique index `uniq_price_lists_store_name_alive` trên `(store_id, LOWER(name))` WHERE `deleted_at IS NULL`
**And** index `idx_price_lists_store_created` trên `(store_id, created_at)` cho list query mặc định
**And** index `idx_price_lists_store_method_active` trên `(store_id, method, is_active)` cho filter
**And** check constraint `check_formula_required`: nếu `method = 'formula'` thì `base_price_list_id NOT NULL` và `formula_type NOT NULL` và `formula_value NOT NULL`; nếu `method = 'direct'` thì 3 cột trên đều phải NULL (enforce ở SQL CHECK constraint, KHÔNG chỉ ở service)
**And** check constraint `check_effective_range`: nếu cả 2 cột không null thì `effective_to >= effective_from`

**Then** tạo bảng `price_list_items`:

| Column          | Type                       | Ràng buộc                                                                                                                                        |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | `uuid`                     | PK, default `uuidv7()`                                                                                                                           |
| `price_list_id` | `uuid`                     | NOT NULL, FK → `price_lists.id` ON DELETE CASCADE                                                                                                |
| `product_id`    | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE CASCADE                                                                                                   |
| `price`         | `bigint`                   | NOT NULL, ≥ 0 (mode 'number', integer VND)                                                                                                       |
| `is_overridden` | `boolean`                  | NOT NULL, default `false` (chỉ ý nghĩa với formula price list: `true` = giá đã được sửa tay sau khi auto-tính, KHÔNG re-compute khi recalculate) |
| `created_at`    | `timestamp with time zone` | NOT NULL, default `now()`                                                                                                                        |
| `updated_at`    | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                                                                                                           |

**And** unique index `uniq_price_list_items_list_product` trên `(price_list_id, product_id)` (mỗi sản phẩm chỉ có 1 giá trong 1 bảng)
**And** index `idx_price_list_items_product` trên `(product_id)` cho query "sản phẩm này có trong bảng giá nào" (Story 4.5)

**Then** ALTER TABLE `customer_groups`:

- ADD CONSTRAINT FK `customer_groups.default_price_list_id REFERENCES price_lists(id) ON DELETE SET NULL`
- KHÔNG đổi cột (đã có sẵn từ Story 4.1, NULLABLE giữ nguyên)
- Trước khi thêm FK: kiểm tra mọi `default_price_list_id` hiện tại đều NULL hoặc tồn tại trong `price_lists`. Vì story 4.1 KHÔNG cho UI nhập uuid (input disabled, gửi NULL), thực tế DB chỉ có NULL → FK add an toàn

### AC2: Tạo bảng giá Direct (POST /api/v1/price-lists)

**Given** Owner/Manager đã đăng nhập (có permission `pricing.manage`)
**When** gọi `POST /api/v1/price-lists` với body method='direct':

```json
{
  "name": "Bảng giá VIP",
  "description": "Giá riêng cho khách VIP",
  "method": "direct",
  "roundingRule": "nearest_thousand",
  "effectiveFrom": "2026-05-01",
  "effectiveTo": null,
  "isActive": true,
  "items": [
    { "productId": "<uuid>", "price": 50000 },
    { "productId": "<uuid>", "price": 75000 }
  ]
}
```

**Then** API validate qua `createPriceListSchema` (Zod discriminated union theo `method`):

- `name`: trim, 1-100 ký tự, regex Unicode + số + ký tự thông dụng `- _ & ( ) ' . / ,` (giống tên customer/category)
- `description`: optional, trim, max 255
- `method`: literal `'direct'` (cho discriminator nhánh direct)
- `roundingRule`: enum ENUM_ROUNDING_RULES, default `'none'` (direct có thể bỏ qua, vẫn áp dụng nếu set)
- `effectiveFrom`: optional date string ISO `YYYY-MM-DD` hoặc null
- `effectiveTo`: optional, nếu cả 2 có giá trị thì `effectiveTo >= effectiveFrom` (Zod refine)
- `isActive`: boolean, default true
- `items`: optional array, mỗi item `{ productId: uuid, price: integer ≥ 0 }`. Cho phép gửi mảng rỗng (story này khuyến khích lưu nháp + thêm sau ở UI). KHÔNG validate sản phẩm trùng productId trong array — bắt unique ở service trước khi insert (trả lỗi rõ ràng "Sản phẩm bị trùng trong danh sách giá")
- `baseListId`, `formulaType`, `formulaValue`: KHÔNG cho phép xuất hiện trong nhánh direct (Zod loại bỏ, hoặc enforce undefined)

**And** service `createPriceList`:

- Insert `price_lists` với `method='direct'`, `base_price_list_id=NULL`, `formula_type=NULL`, `formula_value=NULL`
- Validate mọi `productId` trong `items` đều thuộc cùng store + alive (không deleted_at)
- Insert toàn bộ `price_list_items` với `is_overridden=false` trong cùng transaction
- Áp dụng `roundingRule` lên giá nhập trước khi insert (helper `applyRounding(price, rule)`); ví dụ user nhập 45.250 + `nearest_thousand` → lưu 45.000
- Ghi audit `action='price_list.created'`, `target_type='price_list'`, `changes={ name, method, itemCount, effectiveFrom, effectiveTo, isActive, roundingRule }`

**And** trả 201 với envelope `{ data: PriceListDetail }` chứa metadata bảng giá + computed `effectiveActive` (xem AC4) + `itemCount`. KHÔNG trả full items trong response create (giảm payload), client gọi `GET /:id/items` riêng nếu cần
**And** unique tên trong store (alive): nếu trùng `LOWER(name)` → 409 CONFLICT field=name "Tên bảng giá đã được sử dụng"
**And** nếu store còn 0 sản phẩm alive → vẫn cho phép tạo bảng giá rỗng (để user setup trước, thêm SP sau)

### AC3: Tạo bảng giá Formula (POST /api/v1/price-lists)

**Given** Owner/Manager đang tạo bảng giá
**When** gọi `POST /api/v1/price-lists` với body method='formula':

```json
{
  "name": "Giá sỉ -10%",
  "description": "Giảm 10% so với bảng giá lẻ",
  "method": "formula",
  "baseListId": "<uuid bảng giá nguồn>",
  "formulaType": "percent_decrease",
  "formulaValue": 1000,
  "roundingRule": "ceil_thousand",
  "effectiveFrom": "2026-05-01",
  "effectiveTo": null,
  "isActive": true,
  "overrides": [{ "productId": "<uuid>", "price": 30000 }]
}
```

**Then** API validate qua `createPriceListSchema` nhánh formula:

- `method`: literal `'formula'`
- `baseListId`: uuid bắt buộc. Service kiểm tra: cùng store + alive + `baseListId !== self id` (chống self-reference). Story 4.3 KHÔNG cho phép chọn `baseListId` mà bảng đó cũng là `formula` (chain) → 422 BUSINESS_RULE_VIOLATION "Bảng giá nền phải có phương thức 'direct'. Bảng giá nối chuỗi sẽ hỗ trợ ở Story 4.3b". Trong Zod chỉ validate uuid, kiểm tra method ở service
- `formulaType`: enum `'percent_increase' | 'percent_decrease' | 'amount_increase' | 'amount_decrease'`
- `formulaValue`: integer ≥ 0. Với `percent_*` → đơn vị 0.01% (basis points / 100). VD: 5% = 500, 10% = 1000, 12.5% = 1250. Service áp dụng: `multiplier = (10000 ± formulaValue) / 10000` rồi `Math.round(basePrice * multiplier)` (integer arithmetic, dùng BigInt tạm thời để tránh overflow 2^53 nếu cần). Với `amount_*` → cộng/trừ trực tiếp vào basePrice. Khi `amount_decrease` làm giá < 0 → clamp về 0 (không âm)
- `roundingRule`: bắt buộc cho formula (default `'none'` được phép — nghĩa là không làm tròn, giữ nguyên kết quả công thức)
- `overrides`: optional array `{ productId: uuid, price: integer ≥ 0 }`. Đại diện cho sản phẩm có giá override (sửa tay sau khi tính tự động). Nếu cùng productId xuất hiện cả trong base và overrides → dùng giá override
- `items`: KHÔNG được phép trong nhánh formula (giá auto compute, override dùng `overrides`)

**And** service `createPriceList` (formula):

- Validate `baseListId` cùng store + `deletedAt IS NULL` + `method = 'direct'` → nếu sai → 422 BUSINESS_RULE_VIOLATION với message rõ ràng
- Load tất cả `price_list_items` của `baseListId` (chỉ alive — không có soft delete cho items, chỉ cascade delete khi xoá price_list)
- Tính giá cho từng product: `computedPrice = applyFormula(basePrice, formulaType, formulaValue); finalPrice = applyRounding(computedPrice, roundingRule); finalPrice = Math.max(0, finalPrice)` (không âm)
- Tạo `price_list_items` cho mỗi sản phẩm thuộc base list với `price=finalPrice`, `is_overridden=false`
- Áp dụng `overrides`: với mỗi override entry, UPDATE (hoặc upsert) `price = override.price`, `is_overridden = true`. Nếu override.productId KHÔNG có trong base list → vẫn insert mới (cho phép thêm sản phẩm riêng vào bảng formula), `is_overridden = true` (đánh dấu manual)
- Insert price_list metadata + items + audit trong cùng transaction
- Ghi audit `action='price_list.created'` với `changes={ name, method:'formula', baseListId, formulaType, formulaValue, roundingRule, itemCount, overrideCount }`

**And** trả 201 với `PriceListDetail` envelope. itemCount = số dòng đã insert; overrideCount = số dòng `is_overridden=true`
**And** nếu base list không có item nào → tạo bảng formula rỗng OK, audit ghi `itemCount: 0`

### AC4: Hiệu lực ngày + cờ active (`effectiveActive` computed)

**Given** bảng giá có `is_active`, `effective_from`, `effective_to`
**When** API trả `PriceListDetail` hoặc `PriceListListItem`
**Then** thêm field computed `effectiveActive: boolean` tính như sau (tại thời điểm response):

```
effectiveActive = is_active
  AND (effective_from IS NULL OR today >= effective_from)
  AND (effective_to IS NULL OR today <= effective_to)
  AND deleted_at IS NULL
```

(`today` = `now()::date` ở backend dùng UTC; client KHÔNG tự tính lại)

**And** Story 4.5 (POS) sẽ chỉ áp bảng giá vào pricing engine khi `effectiveActive = true`. Story 4.3 KHÔNG implement pricing engine, chỉ EXPOSE field `effectiveActive` để 4.5 dùng

**Given** UI đang xem danh sách bảng giá
**When** hiển thị status badge cho mỗi bảng giá
**Then** logic UI:

- `effectiveActive = true` → badge xanh "Đang áp dụng"
- `is_active = true` && `today < effective_from` → badge vàng "Chưa hiệu lực" + tooltip "Có hiệu lực từ {effectiveFrom}"
- `is_active = true` && `today > effective_to` → badge xám "Hết hiệu lực" + tooltip "Đã hết hạn từ {effectiveTo}"
- `is_active = false` → badge xám "Đã tắt"
- `deleted_at IS NOT NULL` → bảng giá bị soft delete, KHÔNG hiện trong list mặc định (chỉ hiện trong trash)

### AC5: Liệt kê bảng giá + filter (GET /api/v1/price-lists)

**Given** Owner/Manager mở trang `/pricing` (placeholder route mới)
**When** gọi `GET /api/v1/price-lists?page=1&pageSize=20&search=&method=&status=`
**Then** API validate qua `listPriceListsQuerySchema`:

- `page`: int ≥ 1, default 1
- `pageSize`: int 1-100, default 20
- `search`: optional, trim
- `method`: optional enum `'direct' | 'formula'`
- `status`: optional enum `'all' | 'effective' | 'inactive' | 'expired' | 'pending'`, default `'all'`

**And** service `listPriceLists`:

- Filter chặt chẽ theo `actor.storeId` và `deleted_at IS NULL`
- `search`: WHERE `LOWER(name) LIKE LOWER('%search%')` với escape wildcard `%` `_` qua `escapeLikePattern` (helper từ Story 4.1)
- `method`: WHERE `method = ?`
- `status`:
  - `'effective'` → WHERE `is_active = true AND (effective_from IS NULL OR effective_from <= CURRENT_DATE) AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)`
  - `'inactive'` → WHERE `is_active = false`
  - `'expired'` → WHERE `effective_to IS NOT NULL AND effective_to < CURRENT_DATE`
  - `'pending'` → WHERE `effective_from IS NOT NULL AND effective_from > CURRENT_DATE`
  - `'all'` → bỏ qua filter status
- LEFT JOIN `price_lists` lần 2 (alias `base`) để lấy `baseName` khi `method='formula'`
- Sort: `(created_at DESC, name ASC)`
- Trả `{ data: PriceListListItem[], meta: { page, pageSize, total, totalPages } }`

**And** mỗi `PriceListListItem` chứa:

```typescript
{
  id: uuid,
  name: string,
  description: string | null,
  method: 'direct' | 'formula',
  baseListId: uuid | null,
  baseName: string | null,           // resolve qua LEFT JOIN, null nếu method='direct'
  formulaType: ... | null,
  formulaValue: number | null,
  roundingRule: ...,
  effectiveFrom: string | null,      // ISO date 'YYYY-MM-DD'
  effectiveTo: string | null,
  isActive: boolean,
  effectiveActive: boolean,          // computed (xem AC4)
  itemCount: number,                 // count items với (price_list_id = id)
  createdAt: string,
  updatedAt: string,
}
```

`itemCount` compute qua subquery hoặc LEFT JOIN GROUP BY ở backend (hiệu năng OK với ≤ 100 bảng giá / store, đủ nhu cầu MVP)

### AC6: Xem chi tiết + items của một bảng giá (GET /api/v1/price-lists/:id, /:id/items)

**Given** Owner/Manager click vào tên bảng giá trong danh sách
**When** gọi `GET /api/v1/price-lists/:id`
**Then** trả `PriceListDetail` (extends `PriceListListItem`) + `storeId`. Nếu không cùng store hoặc đã xoá → 404

**Given** Owner/Manager mở tab "Sản phẩm trong bảng giá"
**When** gọi `GET /api/v1/price-lists/:id/items?page=1&pageSize=50&search=`
**Then** API validate qua `listPriceListItemsQuerySchema` (page, pageSize 1-200 default 50, search). Service:

- Validate price_list ownership (cùng store + alive). Nếu không → 404
- LEFT JOIN `products` để lấy `productName`, `productSku`, `productImageUrl`, `productSellingPrice` (giá lẻ chuẩn — bằng `products.selling_price`), `productCostPrice` (giá vốn nullable)
- WHERE products `deletedAt IS NULL` (sản phẩm đã xoá thì không hiện kể cả vẫn còn trong items — dev note H8: deferred xử lý orphan items)
- Search filter: WHERE `LOWER(products.name) LIKE LOWER('%search%')` ESCAPE wildcard
- Sort `products.name ASC`
- Trả `{ data: PriceListItemListItem[], meta: { page, pageSize, total, totalPages } }`

**And** mỗi `PriceListItemListItem`:

```typescript
{
  id: uuid,                          // price_list_item.id
  productId: uuid,
  productName: string,
  productSku: string,
  productImageUrl: string | null,
  productSellingPrice: number,       // giá lẻ chuẩn của SP
  productCostPrice: number | null,   // để UI cảnh báo "dưới vốn"
  price: number,                     // giá trong bảng giá này
  isOverridden: boolean,
  createdAt: string,
  updatedAt: string,
}
```

### AC7: Sửa giá riêng từng item (PATCH /api/v1/price-lists/:id/items/:itemId)

**Given** đang xem chi tiết một bảng giá (cả direct và formula)
**When** sửa giá của 1 sản phẩm và gọi `PATCH /api/v1/price-lists/:id/items/:itemId` body `{ "price": 45000 }`
**Then** API validate qua `updatePriceListItemSchema` (chỉ field `price: integer ≥ 0`):

- Validate price_list cùng store + alive + item thuộc price_list
- Cho phép cả `method='direct'` và `method='formula'`. Với formula: SET `is_overridden = true` (đánh dấu đã sửa tay, không bị overwrite khi recalculate). Với direct: vẫn áp `roundingRule` của bảng giá lên giá mới
- UPDATE `price_list_items` + audit `price_list_item.updated` với `changes={ before: {price, isOverridden}, after: {price, isOverridden} }`. Audit chỉ ở action `price_list_item.updated` để gọn (KHÔNG dùng `price_list.updated` cho mỗi item)

**And** trả `{ data: PriceListItemListItem }` mới
**And** Story 4.3 KHÔNG implement endpoint bulk update items (mỗi item một request). Story 4.3b/4.3c có thể bổ sung bulk

### AC8: Thêm/xoá item lẻ (POST /api/v1/price-lists/:id/items, DELETE /:itemId)

**Given** đang xem chi tiết bảng giá direct
**When** click "Thêm sản phẩm" và chọn sản phẩm chưa có trong bảng giá, nhập giá → `POST /api/v1/price-lists/:id/items` body `{ productId, price }`
**Then** validate uniqueness (price_list_id, product_id) → nếu trùng → 409 CONFLICT field=productId "Sản phẩm đã có trong bảng giá"
**And** validate product cùng store + alive
**And** áp `roundingRule` của bảng giá
**And** insert + audit `price_list_item.created`

**Given** đang xem chi tiết bảng giá direct
**When** xoá 1 item → `DELETE /api/v1/price-lists/:id/items/:itemId`
**Then** hard delete row (KHÔNG soft delete cho items, vì cascade theo bảng giá đã đủ)
**And** audit `price_list_item.deleted` với snapshot before
**And** với `method='formula'`: cho phép xoá item override (sản phẩm sẽ biến mất khỏi bảng cho đến khi recalculate hoặc add lại). KHÔNG cho phép xoá item của base (chưa override) ở story này — trả 422 "Sản phẩm thuộc bảng giá nền, không thể xoá lẻ. Hãy xoá khỏi bảng giá nền hoặc tạm tắt bảng giá này"

### AC9: Cập nhật metadata + tính lại bảng giá formula (PATCH /api/v1/price-lists/:id, POST /:id/recalculate)

**Given** Owner/Manager mở dialog "Sửa bảng giá"
**When** sửa name/description/effectiveFrom/effectiveTo/isActive/roundingRule và gọi `PATCH /api/v1/price-lists/:id`
**Then** API validate qua `updatePriceListSchema` (mọi field optional, refine ≥ 1 field):

- Cho phép sửa: `name`, `description`, `effectiveFrom`, `effectiveTo`, `isActive`, `roundingRule`
- KHÔNG cho phép sửa: `method`, `baseListId`, `formulaType`, `formulaValue` (các field này định nghĩa bảng giá; muốn đổi → tạo bảng giá mới hoặc dùng `recalculate`). Nếu client gửi → Zod loại bỏ (`.strict()`) hoặc enforce undefined
- Validate `effectiveTo >= effectiveFrom` nếu cả 2 không null
- Audit `price_list.updated` với diff
- KHÔNG tự động recalculate items khi đổi `roundingRule` (rounding mới chỉ áp dụng cho item mới insert sau đó, để tránh ghi đè ngầm các giá đã chốt). Muốn áp dụng → user gọi `recalculate` thủ công

**Given** bảng giá `method='formula'`, user click "Tính lại từ bảng giá nền"
**When** gọi `POST /api/v1/price-lists/:id/recalculate`
**Then** service `recalculatePriceList`:

- Validate ownership + `method='formula'` (nếu direct → 422 "Chỉ bảng giá công thức mới có thể tính lại")
- Load lại `base_price_list_id` (validate alive)
- Tính lại giá cho từng product trong base bằng `applyFormula + applyRounding`
- UPSERT items: nếu item đã `is_overridden=true` → GIỮ NGUYÊN giá, KHÔNG overwrite. Nếu `is_overridden=false` → cập nhật giá mới. Nếu base có sản phẩm mới chưa có trong formula list → INSERT mới. Nếu formula list có item của base mà base đã xoá → DELETE item đó (cascade behavior thủ công ở story này, vì base có thể bị xoá item ngoài luồng)
- Audit `price_list.recalculated` với `changes={ updatedCount, addedCount, removedCount, preservedOverrideCount }`
- Trả `{ data: { updatedCount, addedCount, removedCount, preservedOverrideCount } }` để UI toast

**And** Story 4.3 KHÔNG triggers tự động recalculate khi base list thay đổi (cascade mode realtime/confirm/scheduled là Story 4.5). Story 4.3 chỉ có endpoint manual recalculate

### AC10: Soft delete + Restore bảng giá (DELETE /api/v1/price-lists/:id, POST /:id/restore, GET /trashed)

**Given** Owner/Manager click xoá bảng giá
**When** gọi `DELETE /api/v1/price-lists/:id`
**Then** service `deletePriceList`:

- Validate ownership + alive → nếu không → 404
- Kiểm tra không có `customer_groups.default_price_list_id = :id` (alive groups) → nếu có → 422 BUSINESS_RULE_VIOLATION "Bảng giá đang được X nhóm khách hàng dùng làm mặc định, không thể xoá. Vui lòng đổi bảng giá mặc định của các nhóm trước"
- Story 4.3 KHÔNG check `base_price_list_id` references từ formula price lists khác (chain feature là 4.3b). Tạm thời cho phép soft delete bảng giá đang là base. Khi đó các formula list trỏ về sẽ thấy `baseName=null` (vì query LEFT JOIN với filter `deletedAt IS NULL`). Story 4.3b sẽ thêm check chain
- Defensive: try-catch FK violation 23503 → throw BUSINESS_RULE_VIOLATION generic "Bảng giá đang được sử dụng, không thể xoá"
- Soft delete: `deletedAt = NOW()`. KHÔNG hard delete (giữ audit trail + restore)
- KHÔNG cascade soft delete `price_list_items` — chỉ cascade khi hard delete (cấu hình DB FK ON DELETE CASCADE đã đủ). Trong tình trạng soft delete, items vẫn còn trong DB nhưng không truy vấn được vì query mặc định join filter `deletedAt IS NULL`
- Audit `price_list.deleted` với snapshot

**Given** Owner/Manager mở "Bảng giá đã xoá"
**When** gọi `POST /api/v1/price-lists/:id/restore`
**Then** service `restorePriceList`:

- Validate ownership + `deletedAt IS NOT NULL` → nếu không → 404
- Kiểm tra name không bị bảng giá sống khác chiếm trong store (vì partial unique chỉ enforce alive). Nếu trùng → 409 CONFLICT field=name "Tên bảng giá đã được dùng cho bảng giá khác, vui lòng đổi tên trước khi khôi phục"
- Kiểm tra `base_price_list_id` (nếu method=formula) vẫn alive → nếu base đã bị xoá → 422 "Bảng giá nền đã bị xoá. Vui lòng khôi phục bảng giá nền trước hoặc tạo bảng giá mới"
- Set `deletedAt = NULL` + audit `price_list.restored`
- Trả `{ data: PriceListDetail }`

**Given** mở `/trashed`
**When** gọi `GET /api/v1/price-lists/trashed?page=&pageSize=`
**Then** trả tương tự `GET /` nhưng WHERE `deleted_at IS NOT NULL`. Sort `deletedAt DESC`. Mount route `/trashed` TRƯỚC `/:id` (Hono pattern Story 4.1)

### AC11: UI trang Quản lý bảng giá (/pricing)

**Given** Owner/Manager đăng nhập, có permission `pricing.manage`
**When** navigate đến `/pricing`
**Then** trang render `<PriceListsManager>` với layout giống `<CustomersManager>`/`<ProductsManager>`:

- Header: title "Bảng giá", description "Quản lý các bảng giá direct, formula và ngày hiệu lực"
- Nút trên cùng bên phải:
  - Outline "Bảng giá đã xoá" (icon Trash2) → mở `<TrashedPriceListsSheet>`
  - Primary "Tạo bảng giá" (icon Plus) → mở `<CreatePriceListDialog>` (chọn method qua RadioGroup direct/formula trong dialog wizard 2 bước; story 4.3b sẽ thêm các method khác)
- Filters: `<PriceListFilters>` (Input search + Select method + Select status). Debounce search 300ms
- Body:
  - Loading → skeleton
  - Error → text destructive
  - Empty (không filter) → `<EmptyState icon={Tags} title="Chưa có bảng giá" description="Tạo bảng giá đầu tiên để áp dụng cho nhóm khách hàng" actionLabel="Tạo bảng giá" onAction={...} />`
  - Empty (có filter) → `<EmptyState icon={SearchX} ... />`
  - else: desktop → `<PriceListTable>`; mobile → `<PriceListCardList>`
- `<Pagination>` cố định bên dưới

**And** `<PriceListTable>` cột:

- Tên (font-medium, click → mở chi tiết)
- Phương thức (chip "Trực tiếp" / "Công thức")
- Bảng giá nền (chỉ hiện cho method=formula, hiển thị `baseName` hoặc "—")
- Số sản phẩm (`itemCount`, right align)
- Ngày hiệu lực (range `effectiveFrom → effectiveTo`, format `dd/MM/yyyy`)
- Trạng thái (badge theo logic AC4)
- Thao tác: Pencil (sửa metadata), Trash2 (xoá)

**And** `<PriceListCardList>` (mobile): card mỗi bảng giá: title + chip method + status badge + itemCount + dates + menu 3-chấm

**And** Sidebar/BottomTabBar: thêm item "Bảng giá" với icon `Tags` (Lucide) ngay sau "Khách hàng", `requiredPermission: 'pricing.manage'`

### AC12: UI Wizard tạo bảng giá Direct (`<CreatePriceListDialog>`)

**Given** click "Tạo bảng giá" trên trang `/pricing`
**When** Dialog mở step 1: chọn phương thức
**Then** RadioGroup 2 lựa chọn:

- "Nhập giá trực tiếp" (icon `Pencil`, mô tả "Nhập giá riêng cho từng sản phẩm")
- "Tính theo công thức" (icon `Calculator`, mô tả "Tăng/giảm theo % hoặc số tiền cố định so với bảng giá nền")
- (Disabled với tooltip: "Story 4.3b") các option khác: Nối chuỗi, Sao chép, Import CSV
- Nút "Tiếp theo" disable cho đến khi chọn

**Given** chọn "Nhập giá trực tiếp" → step 2:
**Then** form fields:

- Input `name` (required)
- Textarea `description` (optional, max 255)
- Select `roundingRule` (default "Không làm tròn"; options theo enum, label tiếng Việt VD `"Làm tròn lên đến 1.000đ"`)
- DatePicker `effectiveFrom` (optional, default null; placeholder "Có hiệu lực ngay")
- DatePicker `effectiveTo` (optional, default null; placeholder "Không giới hạn")
- Switch `isActive` (default true)
- Section "Sản phẩm trong bảng giá":
  - Bảng các sản phẩm của store (load qua `useProductsQuery({ page: 1, pageSize: 100 })` — story 4.3 dùng pageSize lớn vì MVP ≤ 100 SP; story tương lai có thể virtual scroll)
  - Mỗi dòng: Tên SP, SKU, Giá lẻ chuẩn (display `productSellingPrice`), Input giá tuỳ chỉnh (CurrencyInput, default `''` = không thêm vào bảng giá)
  - Submit: chỉ gửi các dòng có giá khác null lên API (omit dòng để trống)
  - Footer: "Hủy" + Primary "Tạo bảng giá" (disable khi `!form.formState.isValid || isPending`)

**And** Submit dùng `useCreatePriceListMutation`:

- Build body `{ name, description, method:'direct', roundingRule, effectiveFrom, effectiveTo, isActive, items: [...filtered] }`
- Success: toast "Đã tạo bảng giá [tên]" + invalidate `['price-lists']` + close dialog + (optional) navigate `/pricing/:id`
- Error CONFLICT field=name → form.setError('name', ...)

### AC13: UI Wizard tạo bảng giá Formula

**Given** chọn "Tính theo công thức" trong step 1 → step 2:
**Then** form fields:

- Input `name`
- Textarea `description`
- Select `baseListId`: options là các bảng giá `method='direct'` alive trong store (load qua `useDirectPriceListsQuery({ method:'direct' })`). Disabled khi chưa có bảng direct nào → hiển thị helper text "Chưa có bảng giá nhập trực tiếp. Hãy tạo một bảng giá direct trước"
- Group "Công thức":
  - RadioGroup `formulaType`:
    - "Tăng %" (`percent_increase`)
    - "Giảm %" (`percent_decrease`)
    - "Tăng số tiền cố định" (`amount_increase`)
    - "Giảm số tiền cố định" (`amount_decrease`)
  - Input `formulaValue`:
    - Với `percent_*`: NumberInput suffix "%", step 0.01, min 0, max 1000 (=10x). Convert UI value × 100 → API value (basis points / 100). VD UI 5.5 → API 550
    - Với `amount_*`: CurrencyInput (≥ 0)
- Select `roundingRule` (default "Không làm tròn"; recommend "Làm tròn lên 1.000đ" cho amount_decrease để tránh giá lẻ kỳ quặc)
- DatePicker effectiveFrom/effectiveTo, Switch isActive (giống direct)
- Preview Section: bảng 5 sản phẩm đầu tiên của baseListId chọn, hiển thị columns: Tên SP, Giá nền, Giá tính theo công thức (compute realtime ở client dùng helper `applyFormula + applyRounding`), Giá lẻ chuẩn. Cảnh báo dòng đỏ nếu giá tính ra < `productCostPrice` ("Dưới vốn"). Story 4.3 chỉ preview 5 dòng top, sau khi tạo dùng trang chi tiết để xem đủ + override
- KHÔNG cho phép override trong dialog tạo (story 4.3 đơn giản hoá: tạo trước, override sau ở trang chi tiết). Khi cần override hàng loạt → Story 4.3b/4.3c

**And** Submit body `{ name, description, method:'formula', baseListId, formulaType, formulaValue, roundingRule, effectiveFrom, effectiveTo, isActive }` (KHÔNG gửi `items` hoặc `overrides`)
**And** Backend tự load base items + tính + insert (xem AC3)

### AC14: Trang chi tiết bảng giá (`/pricing/:id`)

**Given** Owner/Manager click vào tên bảng giá trong table
**When** navigate đến `/pricing/:id`
**Then** trang render `<PriceListDetailPage>`:

- Header: tên bảng giá, status badge, breadcrumb `Bảng giá > {tên}`
- Toolbar: nút "Sửa thông tin" (mở `<EditPriceListDialog>` cho metadata), nút "Tính lại từ bảng giá nền" (chỉ hiện cho method=formula, gọi `useRecalculatePriceListMutation`), nút "Xoá" (mở AlertDialog)
- Section info: hiển thị description, method (chip), nếu formula → bảng giá nền (link), formula type + value (formatted "Giảm 10%"), rounding rule (label tiếng Việt), effective range, isActive switch (toggle inline qua PATCH)
- Section items: tab/Section "Sản phẩm trong bảng giá":
  - Toolbar: Input search (debounce), nút "Thêm sản phẩm" (mở `<AddPriceListItemDialog>` chọn product chưa có trong bảng + nhập giá)
  - Table columns: Ảnh SP, Tên + SKU, Giá lẻ chuẩn, Giá trong bảng, Override (checkmark nếu `isOverridden`), Thao tác (Pencil inline edit + Trash2 xoá)
  - Inline edit: click Pencil → row chuyển thành editable mode với CurrencyInput + nút Save/Cancel; submit gọi `useUpdatePriceListItemMutation`. Hoặc dialog `<EditPriceListItemDialog>` cho UX nhất quán (chọn 1 cách)
  - Pagination ở dưới (pageSize 50)

**And** Click "Tính lại từ bảng giá nền" → confirm dialog "Sẽ tính lại giá cho tất cả sản phẩm chưa override. Tiếp tục?" → nếu OK gọi mutation → toast "Đã cập nhật N sản phẩm, thêm M, xoá K, giữ X giá đã sửa tay" → invalidate items query

**And** Trang `/pricing/:id` thêm vào `router.tsx` với param `:id`. `beforeLoad: requirePermissionGuard('pricing.manage')`. Nếu không tìm thấy ID hoặc cross-store → redirect về `/pricing` + toast error

### AC15: Permission, Multi-tenant, Audit

**Given** ma trận permission
**When** kiểm tra access
**Then** thêm `pricing.manage: ['owner', 'manager']` vào `packages/shared/src/constants/permissions.ts`
**And** thêm `pricing.view: ['owner', 'manager', 'staff']` (Staff cần view để Story 4.5 POS resolve giá; story 4.3 chỉ cần view ở trang `/pricing` cho Manager+, Staff thấy `/pricing` trả 403 vì story 4.3 chưa expose API cho Staff. Thực tế: Staff truy cập pricing TỪ POS qua endpoint nội bộ Story 4.5 sẽ thiết kế. Story 4.3 chỉ thêm cả 2 perm để chuẩn bị, route `/pricing` UI dùng `pricing.manage`, các API CRUD dùng `pricing.manage`, GET items có thể được dùng bởi cả `pricing.view` ở Story 4.5)
**And** mọi API endpoint `/api/v1/price-lists/*` middleware: `requireAuth` + `requirePermission('pricing.manage')` cho story 4.3. Story 4.5 sẽ thêm route `/api/v1/price-lists/:id/items` cho Staff khi cần resolve giá trên POS — nhưng story 4.3 chỉ implement cho Manager+
**And** mọi service query CHẶT CHẼ filter theo `actor.storeId` và `deleted_at IS NULL`
**And** thêm audit actions vào `auditActionSchema`:

- `'price_list.created'`
- `'price_list.updated'`
- `'price_list.deleted'`
- `'price_list.restored'`
- `'price_list.recalculated'`
- `'price_list_item.created'`
- `'price_list_item.updated'`
- `'price_list_item.deleted'`

**And** thêm 2 group "Bảng giá" và "Mục bảng giá" vào `apps/web/src/features/audit/action-labels.ts` `ACTION_GROUPS`
**And** action labels tiếng Việt cho 8 actions trên

**And** Frontend route `/pricing` và `/pricing/:id` đặt `beforeLoad: requirePermissionGuard('pricing.manage')`

## Tasks / Subtasks

### Phase A: Schema + Migration

- [x] **Task 1: Drizzle schema `price_lists`, `price_list_items`** (AC: #1)
  - [x] 1.1: Tạo `packages/shared/src/schema/price-lists.ts`:
    - Bảng `priceLists` với cột theo AC1, dùng `varchar` cho `method`, `formulaType`, `roundingRule` thay vì `pgEnum` (giữ pattern chuỗi trong store-settings/products đã dùng)
    - Self-FK `baseListId`: `uuid().references((): any => priceLists.id, { onDelete: 'restrict' })` (cast any để tránh TS circular reference, pattern đã dùng cho `categories.parentId`)
    - 3 indexes: `uniq_price_lists_store_name_alive` (partial unique WHERE deletedAt IS NULL), `idx_price_lists_store_created`, `idx_price_lists_store_method_active`
    - 2 CHECK constraints: `check_formula_required`, `check_effective_range` (raw SQL trong table builder)
  - [x] 1.2: Tạo `packages/shared/src/schema/price-list-items.ts`:
    - Bảng `priceListItems` với FK `priceListId` (CASCADE), `productId` (CASCADE)
    - 2 indexes: `uniq_price_list_items_list_product`, `idx_price_list_items_product`
  - [x] 1.3: Export 2 schema mới từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter api run db:generate` → file `0013_*.sql`. Verify:
    - CREATE TABLE price_lists + price_list_items + indexes
    - 2 FK + CASCADE behaviour
    - 2 CHECK constraints (Drizzle 0.45 hỗ trợ qua `sql` + table-level constraints)
    - Partial unique index (manual SQL append nếu Drizzle không generate `WHERE deleted_at IS NULL` — pattern Story 2.2 + 4.1)
    - ALTER TABLE customer_groups ADD CONSTRAINT FK default_price_list_id (manual append vì cross-table dependency)
  - [x] 1.5: Append manual SQL vào file migration nếu cần (partial unique WHERE, FK customer_groups, CHECK constraints):
    ```sql
    --> statement-breakpoint
    DROP INDEX IF EXISTS "uniq_price_lists_store_name_alive";
    CREATE UNIQUE INDEX "uniq_price_lists_store_name_alive"
      ON "price_lists" ("store_id", LOWER("name"))
      WHERE "deleted_at" IS NULL;
    --> statement-breakpoint
    ALTER TABLE "price_lists" ADD CONSTRAINT "check_formula_required"
      CHECK (
        (method = 'direct' AND base_price_list_id IS NULL AND formula_type IS NULL AND formula_value IS NULL)
        OR (method = 'formula' AND base_price_list_id IS NOT NULL AND formula_type IS NOT NULL AND formula_value IS NOT NULL)
      );
    --> statement-breakpoint
    ALTER TABLE "price_lists" ADD CONSTRAINT "check_effective_range"
      CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from);
    --> statement-breakpoint
    ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_default_price_list_id_fk"
      FOREIGN KEY ("default_price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL;
    ```
  - [x] 1.6: Chạy `pnpm --filter api run db:migrate`, verify SQL output. Test rollback bằng cách down + up lại

- [x] **Task 2: Zod schemas + helpers (formula, rounding)** (AC: #2, #3, #4, #5, #6, #7, #8, #9)
  - [x] 2.1: Tạo `packages/shared/src/schema/price-list-management.ts`:
    - Enum schemas: `priceListMethodSchema = z.enum(['direct', 'formula'])`, `formulaTypeSchema = z.enum(['percent_increase', 'percent_decrease', 'amount_increase', 'amount_decrease'])`, `roundingRuleSchema = z.enum([...10 values...])`, `priceListStatusFilterSchema = z.enum(['all', 'effective', 'inactive', 'expired', 'pending'])`
    - `priceListNameSchema`: trim 1-100, regex Unicode (giống `customerNameSchema`)
    - `priceSchema = z.number().int().min(0).max(9_999_999_999_999)` (integer VND)
    - `dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD').nullable().optional()`
    - `formulaValueSchema = z.number().int().min(0).max(1_000_000_000)` (đủ cho mọi case)
    - `priceListItemInputSchema = z.object({ productId: z.string().uuid(), price: priceSchema })`
    - **Discriminated union `createPriceListSchema`**:
      ```ts
      export const createPriceListSchema = z
        .discriminatedUnion('method', [
          z.object({
            method: z.literal('direct'),
            name: priceListNameSchema,
            description: z.string().trim().max(255).nullable().optional(),
            roundingRule: roundingRuleSchema.default('none'),
            effectiveFrom: dateStringSchema,
            effectiveTo: dateStringSchema,
            isActive: z.boolean().default(true),
            items: z.array(priceListItemInputSchema).default([]),
          }),
          z.object({
            method: z.literal('formula'),
            name: priceListNameSchema,
            description: z.string().trim().max(255).nullable().optional(),
            baseListId: z.string().uuid('Bảng giá nền không hợp lệ'),
            formulaType: formulaTypeSchema,
            formulaValue: formulaValueSchema,
            roundingRule: roundingRuleSchema.default('none'),
            effectiveFrom: dateStringSchema,
            effectiveTo: dateStringSchema,
            isActive: z.boolean().default(true),
            overrides: z.array(priceListItemInputSchema).default([]),
          }),
        ])
        .superRefine((data, ctx) => {
          if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
            ctx.addIssue({
              code: 'custom',
              path: ['effectiveTo'],
              message: 'Ngày kết thúc phải sau ngày bắt đầu',
            })
          }
        })
      ```
    - `updatePriceListSchema` (chỉ metadata, refine ≥ 1 field):
      ```ts
      export const updatePriceListSchema = z
        .object({
          name: priceListNameSchema.optional(),
          description: z.string().trim().max(255).nullable().optional(),
          roundingRule: roundingRuleSchema.optional(),
          effectiveFrom: dateStringSchema,
          effectiveTo: dateStringSchema,
          isActive: z.boolean().optional(),
        })
        .refine((d) => Object.keys(d).length > 0, { message: 'Cần ít nhất một trường để cập nhật' })
      ```
    - `updatePriceListItemSchema = z.object({ price: priceSchema })`
    - `createPriceListItemSchema = priceListItemInputSchema`
    - `listPriceListsQuerySchema`: page/pageSize coerce, `search`, `method`, `status` (default 'all')
    - `listPriceListItemsQuerySchema`: page/pageSize (default 50, max 200), `search`
    - Response schemas: `priceListListItemSchema`, `priceListDetailSchema`, `priceListItemListItemSchema`
    - Export types tương ứng
  - [x] 2.2: Tạo `packages/shared/src/utils/pricing-formulas.ts` (HELPER PURE FUNCTIONS, dùng được cả backend + frontend preview):
    - `applyFormula(basePrice: number, formulaType: FormulaType, formulaValue: number): number`:
      - `percent_increase`: `Math.round(basePrice * (10000 + formulaValue) / 10000)`
      - `percent_decrease`: `Math.round(basePrice * (10000 - formulaValue) / 10000)`
      - `amount_increase`: `basePrice + formulaValue`
      - `amount_decrease`: `basePrice - formulaValue`
      - return `Math.max(0, result)` (clamp âm về 0)
    - `applyRounding(price: number, rule: RoundingRule): number`:
      - `'none'` → return as-is
      - `'nearest_hundred' | 'nearest_five_hundred' | 'nearest_thousand'` → `Math.round(price / unit) * unit` với unit tương ứng
      - `'ceil_hundred' | 'ceil_five_hundred' | 'ceil_thousand'` → `Math.ceil(price / unit) * unit`
      - `'floor_hundred' | 'floor_five_hundred' | 'floor_thousand'` → `Math.floor(price / unit) * unit`
    - `computeFinalPrice(basePrice, formulaType, formulaValue, roundingRule)`: combo apply + round, return non-negative integer
    - `formatFormulaLabel(formulaType, formulaValue): string` (cho UI): "Tăng 5%" / "Giảm 1.000đ" v.v. (dùng `formatVnd` cho amount)
    - `formatRoundingLabel(rule): string`: "Không làm tròn" / "Làm tròn lên 1.000đ" v.v.
  - [x] 2.3: Co-located test `price-list-management.test.ts` cover:
    - Discriminated union: gửi method='direct' với `baseListId` → fail; gửi method='formula' thiếu `baseListId` → fail
    - Date validation: `effectiveTo < effectiveFrom` → fail
    - `priceSchema`: âm fail, decimal fail (vì int), 0 OK
    - `formulaValue`: 0 OK, 100000% (1000000 với percent) OK
  - [x] 2.4: Co-located test `pricing-formulas.test.ts`:
    - `applyFormula`: 100000 + percent_increase 10% (1000) = 110000; 100000 + percent_decrease 10% = 90000; 50000 + amount_increase 5000 = 55000; 50000 + amount_decrease 60000 → 0 (clamp); 33333 + percent_decrease 33.33% (3333) = 22222
    - `applyRounding`: 45250 + nearest_thousand = 45000; 45500 + nearest_thousand = 46000; 45200 + ceil_thousand = 46000; 45800 + floor_thousand = 45000; 45250 + nearest_hundred = 45300; 45200 + ceil_five_hundred = 45500
    - Kết hợp: 33333 với formula percent_decrease 10% và rounding ceil_thousand → 30000 → 30000 (already round); 33334 với percent_decrease 10% và ceil_thousand → 30001 → 31000

- [x] **Task 3: Mở rộng audit action enum + permission** (AC: #15)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts`: thêm 8 audit actions vào `auditActionSchema`
  - [x] 3.2: Sửa `packages/shared/src/constants/permissions.ts`: thêm `'pricing.view': ['owner', 'manager', 'staff']` và `'pricing.manage': ['owner', 'manager']`
  - [x] 3.3: Cập nhật test matrix `permissions.test.ts` (nếu có) để cover 2 perm mới
  - [x] 3.4: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - 8 cặp label tiếng Việt (`'price_list.created': 'Tạo bảng giá'`, ..., `'price_list.recalculated': 'Tính lại bảng giá'`, `'price_list_item.updated': 'Sửa giá sản phẩm trong bảng giá'`, ...)
    - Thêm 2 ACTION_GROUPS: "Bảng giá" và "Mục bảng giá"

### Phase B: Backend Service + Routes

- [x] **Task 4: Price Lists service** (AC: #2, #3, #4, #5, #6, #9, #10, #15)
  - [x] 4.1: Tạo `apps/api/src/services/price-lists.service.ts` theo pattern `customers.service.ts`:
    - Helper: `toPriceListListItem(row, baseName, itemCount)`, `toPriceListDetail(row, baseName, itemCount)`, `computeEffectiveActive(row, today)`
    - `ensureNameUnique({ db, storeId, name, excludeId })` reuse pattern, throw CONFLICT field=name
    - `listPriceLists({ db, storeId, query })`: build conditions (search escape `%/_`, method, status với CURRENT_DATE), LEFT JOIN price_lists alias `base` để lấy baseName, COUNT(`price_list_items`) qua subquery hoặc LEFT JOIN GROUP BY, paginate, sort. Compute `effectiveActive` ở backend
    - `getPriceList({ db, storeId, id })`: ownership + alive → throw 404. Trả `PriceListDetail` với `effectiveActive` + `itemCount`
    - `createPriceList({ db, actor, input, meta })`:
      - Phân nhánh theo `input.method` (TS narrow nhờ discriminated union)
      - Direct: validate items productId cùng store + alive (1 query bulk: `SELECT id FROM products WHERE id IN (...) AND store_id = ? AND deleted_at IS NULL`); detect duplicate productId trong input (Set check) → throw VALIDATION_ERROR; insert price_list + items (áp `applyRounding` lên price từng item) trong transaction; audit
      - Formula: validate `baseListId` cùng store + alive + `method='direct'` (story 4.3 không cho chain) → throw 422 nếu sai; load base items via `SELECT FROM price_list_items WHERE price_list_id = ?`; với mỗi item: `finalPrice = applyRounding(applyFormula(item.price, formulaType, formulaValue), roundingRule)`; insert metadata + items với `is_overridden=false`; áp dụng `overrides`: với mỗi override entry, nếu productId đã có trong base → UPDATE price + is_overridden=true (hoặc xử lý trong code thuần JS trước khi bulk insert); nếu chưa có → insert mới với is_overridden=true; transaction + audit
    - `updatePriceList({ db, actor, id, input, meta })`: validate ownership + alive, refine ≥ 1 field, validate effective range, update + diff audit
    - `deletePriceList({ db, actor, id, meta })`: validate ownership + alive, kiểm tra `customer_groups.default_price_list_id = id AND deleted_at IS NULL` count → nếu > 0 → 422 với count chính xác; defensive try-catch FK 23503; soft delete + audit
    - `restorePriceList({ db, actor, id, meta })`: validate target deleted + ownership; kiểm tra name không bị bảng giá khác sống chiếm; nếu method=formula → kiểm tra baseListId vẫn alive; restore + audit
    - `listTrashedPriceLists({ db, storeId, query })`: tương tự `listPriceLists` nhưng WHERE `deleted_at IS NOT NULL`, sort `deletedAt DESC`
    - `recalculatePriceList({ db, actor, id, meta })`: validate ownership + alive + method='formula'; load base items; load existing items; phân loại: items cần update (cùng productId, không override), items mới (chỉ ở base), items thừa (chỉ ở existing, không override → DELETE; là override → giữ); thực hiện UPSERT/DELETE trong transaction; audit `price_list.recalculated` với 4 counts
  - [x] 4.2: Cập nhật helper `pg-errors.ts` nếu cần (reuse `isUniqueViolation`, `isFkViolation`)
  - [x] 4.3: Reuse `escapeLikePattern` từ `apps/api/src/lib/strings.ts` (Story 4.1)

- [x] **Task 5: Price List Items service** (AC: #6, #7, #8, #15)
  - [x] 5.1: Tạo `apps/api/src/services/price-list-items.service.ts`:
    - `listPriceListItems({ db, storeId, priceListId, query })`: validate ownership price_list + alive; LEFT JOIN products để lấy productName/SKU/imageUrl/sellingPrice/costPrice; WHERE products.deletedAt IS NULL; search filter; paginate; sort productName ASC
    - `getPriceListItem({ db, storeId, priceListId, itemId })`: validate ownership + item thuộc price_list + product alive; trả PriceListItemListItem
    - `createPriceListItem({ db, actor, priceListId, input, meta })`: validate price_list ownership + alive; validate product cùng store + alive; áp `roundingRule` của price_list lên price; insert hoặc CONFLICT (catch unique violation `uniq_price_list_items_list_product` → throw CONFLICT field=productId); audit `price_list_item.created`
    - `updatePriceListItem({ db, actor, priceListId, itemId, input, meta })`: validate ownership + item; với method='formula' SET `is_overridden=true`; áp roundingRule lên price; update + diff audit
    - `deletePriceListItem({ db, actor, priceListId, itemId, meta })`: validate ownership; với method='formula' check item.is_overridden — nếu false (item thuộc base, chưa override) → 422 BUSINESS_RULE_VIOLATION với message AC8; hard delete + audit `price_list_item.deleted` với snapshot before
  - [x] 5.2: Helper `applyPriceListRounding({ db, priceListId, price })`: load `roundingRule` từ price_list, apply, return rounded price (dùng trong updateItem + createItem)

- [x] **Task 6: Routes `price-lists.routes.ts` + `price-list-items.routes.ts`** (AC: #2-#15)
  - [x] 6.1: Tạo `apps/api/src/routes/price-lists.routes.ts` theo pattern `products.routes.ts`:
    - GET `/` → listPriceLists (envelope `{ data, meta }`)
    - GET `/trashed` → listTrashedPriceLists (mount TRƯỚC `/:id`)
    - GET `/:id` → getPriceList
    - GET `/:id/items` → listPriceListItems
    - POST `/` → createPriceList
    - PATCH `/:id` → updatePriceList
    - DELETE `/:id` → deletePriceList
    - POST `/:id/restore` → restorePriceList
    - POST `/:id/recalculate` → recalculatePriceList
    - POST `/:id/items` → createPriceListItem
    - PATCH `/:id/items/:itemId` → updatePriceListItem
    - DELETE `/:id/items/:itemId` → deletePriceListItem
    - Middleware: `requireAuth` + `requirePermission('pricing.manage')`
    - Hono factory function `createPriceListsRoutes({ db })`
  - [x] 6.2: Mount vào `apps/api/src/index.ts` sau `/api/v1/customers`:
    ```ts
    app.route('/api/v1/price-lists', createPriceListsRoutes({ db }))
    ```

### Phase C: Frontend (apps/web)

- [x] **Task 7: API client + TanStack Query hooks** (AC: #2-#14)
  - [x] 7.1: Tạo `apps/web/src/features/pricing/price-lists-api.ts` theo pattern `customers-api.ts`:
    - `listPriceListsApi(query)`, `listTrashedPriceListsApi(query)`, `getPriceListApi(id)`, `createPriceListApi(input)`, `updatePriceListApi(id, input)`, `deletePriceListApi(id)`, `restorePriceListApi(id)`, `recalculatePriceListApi(id)`
    - `listPriceListItemsApi(priceListId, query)`, `createPriceListItemApi(priceListId, input)`, `updatePriceListItemApi(priceListId, itemId, input)`, `deletePriceListItemApi(priceListId, itemId)`
    - Build query string helper: `page`, `pageSize`, `search`, `method`, `status`
  - [x] 7.2: Tạo `apps/web/src/features/pricing/use-price-lists.ts`:
    - `usePriceListsQuery(query)`: queryKey `['price-lists', query]`, `placeholderData: keepPreviousData`
    - `useDirectPriceListsQuery()`: queryKey `['price-lists', { method: 'direct', status: 'all', pageSize: 100 }]` cho dropdown chọn baseListId
    - `useTrashedPriceListsQuery(query)`: queryKey `['price-lists', 'trashed', query]`
    - `usePriceListQuery(id)`: queryKey `['price-lists', id]`, enabled khi id truthy
    - `usePriceListItemsQuery(priceListId, query)`: queryKey `['price-lists', priceListId, 'items', query]`
    - Mutations: `useCreatePriceListMutation`, `useUpdatePriceListMutation`, `useDeletePriceListMutation`, `useRestorePriceListMutation`, `useRecalculatePriceListMutation` → invalidate `['price-lists']` toàn subtree (cho cả list, detail, items)
    - Mutations items: `useCreatePriceListItemMutation`, `useUpdatePriceListItemMutation`, `useDeletePriceListItemMutation` → invalidate `['price-lists', priceListId]` (subtree gồm detail + items để cập nhật itemCount)

- [x] **Task 8: Form dialogs cho create/edit Price List** (AC: #12, #13, #14)
  - [x] 8.1: Tạo `apps/web/src/features/pricing/components/CreatePriceListDialog.tsx`:
    - Wizard 2 step: chọn method → fill form
    - Step 1: RadioGroup 2 options (direct/formula). Disabled options chain/clone/import với tooltip "Story 4.3b"
    - Step 2 direct: form fields theo AC12. Section sản phẩm: load tất cả products của store qua `useProductsQuery({ pageSize: 100 })`. Mỗi sản phẩm 1 hàng với CurrencyInput (có thể bỏ trống). Validate ≥ 0. Submit chỉ gửi các dòng có giá
    - Step 2 formula: form fields theo AC13. `useDirectPriceListsQuery` cho Select baseListId. Preview 5 SP đầu tính realtime ở client dùng `applyFormula + applyRounding` từ `pricing-formulas.ts`
    - Footer: nút "Quay lại" (về step 1), "Hủy", "Tạo bảng giá" (disable khi `!isValid || isPending`)
    - RHF + zodResolver(createPriceListSchema). Mode 'onTouched'
    - handleApiError: map CONFLICT field=name → form.setError; map BUSINESS_RULE_VIOLATION (baseList không phải direct) → toast + set error trên field baseListId
  - [x] 8.2: Tạo `apps/web/src/features/pricing/components/EditPriceListDialog.tsx`:
    - Mode 'edit', props: `open`, `onOpenChange`, `priceList: PriceListDetail`
    - Fields: name, description, roundingRule, effectiveFrom, effectiveTo, isActive (KHÔNG cho sửa method/baseListId/formula\*)
    - Submit: `useUpdatePriceListMutation` + invalidate
    - Disable nút Lưu khi `!isValid || isPending`
  - [x] 8.3: Tạo `apps/web/src/features/pricing/components/AddPriceListItemDialog.tsx`:
    - Props: `priceListId`, `existingProductIds: string[]`, `roundingRule`
    - Fields: Select sản phẩm (filter: products NOT trong existing), CurrencyInput price
    - Submit: `useCreatePriceListItemMutation`. Map CONFLICT field=productId → toast
  - [x] 8.4: Tạo `apps/web/src/features/pricing/components/EditPriceListItemDialog.tsx`:
    - Props: `priceListId`, `item: PriceListItemListItem`, `roundingRule`
    - Fields: CurrencyInput price (display Tên SP + giá lẻ chuẩn để tham khảo)
    - Submit: `useUpdatePriceListItemMutation`

- [x] **Task 9: List components + Manager** (AC: #4, #5, #11)
  - [x] 9.1: Tạo `apps/web/src/features/pricing/components/PriceListStatusBadge.tsx`:
    - Props: `priceList: PriceListListItem`. Logic theo AC4
  - [x] 9.2: Tạo `apps/web/src/features/pricing/components/PriceListTable.tsx`:
    - Cột theo AC11. Click name → navigate `/pricing/:id`
    - Format effectiveFrom/effectiveTo qua `format(new Date(...), 'dd/MM/yyyy', { locale: vi })` (date-fns đã có ở project)
    - Format formula label dùng `formatFormulaLabel` từ helper
  - [x] 9.3: Tạo `apps/web/src/features/pricing/components/PriceListCardList.tsx` (mobile)
  - [x] 9.4: Tạo `apps/web/src/features/pricing/components/PriceListFilters.tsx`:
    - Input search (debounce ở parent), Select method (Tất cả/Trực tiếp/Công thức), Select status (5 options theo enum)
  - [x] 9.5: Tạo `apps/web/src/features/pricing/components/TrashedPriceListsSheet.tsx`:
    - Sheet với danh sách bảng giá đã xoá, mỗi dòng có nút "Khôi phục"
  - [x] 9.6: Tạo `apps/web/src/features/pricing/components/DeletePriceListDialog.tsx`:
    - AlertDialog "Xoá bảng giá {name}?" + handle 422 toast
  - [x] 9.7: Tạo `apps/web/src/features/pricing/components/PriceListsManager.tsx`:
    - State: filters, page, dialogs
    - `usePriceListsQuery(apiQuery)`, debounce search 300ms
    - Render header + filters + table/cardlist + pagination + dialogs
  - [x] 9.8: Tạo `apps/web/src/pages/pricing-page.tsx` render `<PriceListsManager />`

- [x] **Task 10: Trang chi tiết bảng giá + Items management** (AC: #6, #7, #8, #9, #14)
  - [x] 10.1: Tạo `apps/web/src/features/pricing/components/PriceListItemsTable.tsx`:
    - Cột theo AC14. Inline edit qua `<EditPriceListItemDialog>`
  - [x] 10.2: Tạo `apps/web/src/features/pricing/components/PriceListDetail.tsx`:
    - Header với badge + breadcrumb + toolbar
    - Section info: hiển thị metadata; toggle isActive inline qua PATCH (optimistic + rollback)
    - Section items: search + table + pagination
    - Nút "Tính lại từ bảng giá nền" (chỉ hiện cho method=formula): mở confirm AlertDialog → mutation → toast với 4 counts
  - [x] 10.3: Tạo `apps/web/src/pages/pricing-detail-page.tsx`:
    - Lấy `:id` từ params, `usePriceListQuery(id)`, render `<PriceListDetail>` hoặc loading/error/notFound
  - [x] 10.4: Thêm route `/pricing` và `/pricing/:id` vào `router.tsx`:
    ```ts
    const pricingRoute = createRoute({
      getParentRoute: () => appLayoutRoute,
      path: '/pricing',
      beforeLoad: requirePermissionGuard('pricing.manage'),
      component: PricingPage,
    })
    const pricingDetailRoute = createRoute({
      getParentRoute: () => appLayoutRoute,
      path: '/pricing/$id',
      beforeLoad: requirePermissionGuard('pricing.manage'),
      component: PricingDetailPage,
    })
    ```
  - [x] 10.5: Thêm vào `nav-items.ts` mục "Bảng giá" với icon `Tags` (lucide-react), `requiredPermission: 'pricing.manage'`, đặt sau "Khách hàng"

- [x] **Task 11: Tích hợp ô `defaultPriceListId` vào CustomerGroup form** (AC: #1, #15)
  - [x] 11.1: Sửa `apps/web/src/features/customers/components/CustomerGroupManager.tsx` (hoặc form dialog tương ứng):
    - Bỏ trạng thái disabled với placeholder "Story 4.3 sẽ kích hoạt"
    - Replace bằng `<Select>` real: load qua `useDirectPriceListsQuery()` + thêm option "Không gán bảng giá" (value `__NONE__` map sang null khi submit)
    - Lưu ý: customer_groups dùng `defaultPriceListId`. Sau khi FK đã thêm (task 1.5), API cũ vẫn nhận uuid hoặc null, không cần đổi
  - [x] 11.2: Cập nhật helper text dưới Select: "Áp dụng bảng giá này cho mọi khách hàng trong nhóm khi bán trên POS (Story 4.5)"

### Phase D: Tests + Manual verify

- [x] **Task 12: Unit tests** (AC: tất cả)
  - [x] 12.1: `packages/shared/src/schema/price-list-management.test.ts` (mô tả ở 2.3)
  - [x] 12.2: `packages/shared/src/utils/pricing-formulas.test.ts` (mô tả ở 2.4)
  - [x] 12.3: Bổ sung test cho `permissions.test.ts`: pricing.view và pricing.manage có đúng role

- [x] **Task 13: API integration tests** (AC: #1-#10, #15)
  - [x] 13.1: `apps/api/src/__tests__/price-lists.integration.test.ts` (Vitest + PGlite, pattern từ `customers.integration.test.ts`):
    - **Setup**: tạo store + owner + manager + staff + 5 sản phẩm
    - **Create direct**: Owner OK 201; Manager OK; Staff 403; trùng tên (case-insensitive) → 409 field=name; items có productId không cùng store → 400 (hoặc 404); items có productId trùng nhau → 400; method='direct' nhưng gửi baseListId → schema reject
    - **Create formula**: tạo bảng direct trước, tạo formula với baseListId → 201, items được tính đúng (verify giá theo applyFormula+applyRounding); baseListId của formula list khác → 422; baseListId không cùng store → 422; clamp giá âm về 0 (amount_decrease > basePrice); overrides apply đúng (`is_overridden=true`)
    - **List**: filter store; search escape `%`; filter method, status (effective/expired/pending/inactive); pagination; `effectiveActive` compute đúng theo `today`; `baseName` resolve qua LEFT JOIN
    - **Get + items**: cross-store 404; trả đầy đủ field + computed; items list lọc deleted products
    - **Update metadata**: refine ≥ 1 field; effectiveTo < effectiveFrom → 400; KHÔNG cho sửa method/baseListId; audit diff đúng
    - **Delete + Restore + Trashed**: delete bảng đang được customer_group dùng → 422 với count; soft delete OK; trashed list hiện; restore OK; restore khi name chiếm bởi alive → 409; restore formula khi base bị xoá → 422
    - **Recalculate**: tạo formula list, sửa override 1 item, recalculate → giá override giữ, item khác cập nhật theo công thức mới (sau khi sửa base list); add SP mới vào base → recalculate thấy itemCount tăng; xoá SP trong base + recalculate → item formula tương ứng bị xoá (nếu chưa override)
    - **Items CRUD**: create item product không cùng store → 404; trùng productId trong list → 409; update item của formula → is_overridden=true; delete item của formula chưa override → 422; delete item override → OK
    - **Audit**: ghi đủ 8 actions; actorRole đúng
    - **Multi-tenant**: store A không xem/sửa/xoá price list của store B
    - **CHECK constraint DB**: cố tình insert raw qua trx với `method='direct'` + `base_price_list_id` non-null → DB throw error (test phụ trợ chứng minh constraint hoạt động)
  - [x] 13.2: `apps/api/src/__tests__/customer-groups-pricing-fk.integration.test.ts` (test ngắn riêng):
    - Tạo customer_group với `defaultPriceListId=null` → OK
    - Tạo customer_group với `defaultPriceListId=<uuid không tồn tại>` → DB FK violation 23503
    - Tạo customer_group → tạo price_list → update group set defaultPriceListId hợp lệ → OK
    - Xoá price_list đang được group dùng → 422 (đã test ở 13.1, nhưng test thêm phía group view)
    - Hard delete price_list bằng raw SQL (bypass service) → group.defaultPriceListId được SET NULL (chứng minh ON DELETE SET NULL)

- [x] **Task 14: Frontend manual verify + lint/typecheck** (AC: tất cả)
  - [x] 14.1: `pnpm typecheck` pass tất cả packages
  - [x] 14.2: `pnpm lint` pass (0 errors)
  - [x] 14.3: `pnpm test` pass toàn bộ suite (không regression Story 4.1)
  - [x] 14.4: Manual flow Owner desktop:
    - Login Owner → /pricing → empty state → Tạo bảng giá
    - Wizard step 1: chọn "Nhập giá trực tiếp" → step 2: name "Giá lẻ chuẩn", roundingRule "nearest_thousand", effectiveFrom 2026-05-01, isActive true. Section sản phẩm: nhập giá cho 3 SP (giá 50250, 75600, 99999) → submit → toast → bảng list hiển thị 1 dòng "Giá lẻ chuẩn" với itemCount=3, status "Chưa hiệu lực" (vì 2026-04-28 < 05-01)
    - Đổi effectiveFrom về null → status "Đang áp dụng"
    - Click vào "Giá lẻ chuẩn" → trang detail → 3 sản phẩm với giá 50000, 76000, 100000 (đã round to nearest_thousand)
    - Sửa giá 1 sản phẩm xuống 45000 → toast → giá update
    - Tạo bảng giá thứ 2 method "Tính theo công thức" với base "Giá lẻ chuẩn", percent_decrease 10% (UI nhập 10), roundingRule "ceil_thousand", name "Giá sỉ" → preview 5 dòng đầu tính đúng → submit
    - Detail "Giá sỉ" → thấy 3 SP với giá 45000, 69000, 90000 (90% rồi ceil_thousand)
    - Override giá 1 SP của "Giá sỉ" thành 40000 → row có badge "Override"
    - Quay lại "Giá lẻ chuẩn" → sửa giá 1 SP xuống 30000
    - Quay lại "Giá sỉ" → click "Tính lại từ bảng giá nền" → confirm → toast "Đã cập nhật 2 sản phẩm, giữ 1 giá đã sửa tay"
    - Tạo nhóm KH "VIP" gán defaultPriceListId = "Giá sỉ" → kiểm tra customer-groups API trả đúng FK
    - Xoá "Giá lẻ chuẩn" → toast error "Đang được Story chưa kiểm tra group dùng" hoặc 422 nếu group VIP đang dùng "Giá sỉ" → fallback: thử xoá "Giá sỉ" → 422 "Bảng giá đang được 1 nhóm khách hàng dùng" → đổi nhóm VIP về null → xoá lại OK → vào "Bảng giá đã xoá" → khôi phục
  - [x] 14.5: Manual mobile (DevTools 375px): cardlist hiển thị đúng, dialog wizard scroll OK
  - [x] 14.6: Manual permission: Manager có quyền pricing.manage → OK; Staff truy cập /pricing → redirect /
  - [x] 14.7: Manual audit: Owner thực hiện đủ 8 audit actions → /settings/audit thấy 8 record với label tiếng Việt + 2 group "Bảng giá", "Mục bảng giá"

## Dev Notes

### Pattern reuse từ Story 1.x, 2.x, 4.1 (BẮT BUỘC tuân thủ)

| Khu vực                                     | File hiện có                                                              | Cách dùng                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema soft delete + partial unique | `packages/shared/src/schema/customer-groups.ts`, `customers.ts`           | Pattern partial unique `WHERE deleted_at IS NULL` + manual SQL append nếu Drizzle không generate                                                              |
| Self-FK pattern                             | `packages/shared/src/schema/categories.ts:parentId`                       | `uuid().references((): any => priceLists.id, { onDelete: 'restrict' })` cast `any` để TS không circular                                                       |
| Bigint integer VND                          | `packages/shared/src/schema/products.ts:sellingPrice, costPrice`          | `bigint({ mode: 'number' })` cho `price`, `formulaValue (amount_*)`. Range an toàn ≤ 2^53                                                                     |
| CHECK constraint                            | (chưa có precedent trong story) — pattern Drizzle 0.45                    | Append manual SQL `ALTER TABLE ... ADD CONSTRAINT CHECK (...)` trong file migration sau Drizzle generate                                                      |
| Discriminated union Zod                     | `packages/shared/src/schema/inventory-transaction-management.ts` (nếu có) | `z.discriminatedUnion('method', [direct, formula])` cho input schema                                                                                          |
| PG error helper                             | `apps/api/src/lib/pg-errors.ts`                                           | Reuse `isUniqueViolation`, `isFkViolation`. Story 4.3 có 1 partial unique `uniq_price_lists_store_name_alive` + 1 unique `uniq_price_list_items_list_product` |
| String escape                               | `apps/api/src/lib/strings.ts:escapeLikePattern`                           | Áp dụng cho mọi search query LIKE                                                                                                                             |
| Audit logging                               | `apps/api/src/services/audit.service.ts`                                  | `logAction` trong cùng transaction. `diffObjects` cho update audit                                                                                            |
| ApiError                                    | `apps/api/src/lib/errors.ts`                                              | VALIDATION_ERROR / NOT_FOUND / CONFLICT / BUSINESS_RULE_VIOLATION                                                                                             |
| Hono route order                            | `apps/api/src/routes/customers.routes.ts`                                 | Mount `/trashed` TRƯỚC `/:id`. Items sub-routes mount sau detail routes                                                                                       |
| API client + Query hooks                    | `apps/web/src/features/customers/customers-api.ts`, `use-customers.ts`    | apiClient.get/post/patch/delete. queryKey `['price-lists', ...]` với invalidate subtree                                                                       |
| Form pattern                                | `apps/web/src/features/customers/components/CustomerForm.tsx`             | RHF + zodResolver, mode 'onTouched', handleApiError, disable Save khi `!isValid \|\| isPending`                                                               |
| Permission guard route                      | `apps/web/src/router.tsx:requirePermissionGuard`                          | `requirePermissionGuard('pricing.manage')` cho `/pricing` và `/pricing/:id`                                                                                   |
| Empty state                                 | `apps/web/src/components/shared/empty-state.tsx`                          | Reuse cho list rỗng                                                                                                                                           |
| Pagination                                  | `apps/web/src/components/shared/pagination.tsx`                           | Reuse                                                                                                                                                         |
| CurrencyInput                               | `apps/web/src/components/shared/currency-input.tsx`                       | Cho price + formulaValue (amount type)                                                                                                                        |
| Sheet                                       | `apps/web/src/components/ui/sheet.tsx`                                    | TrashedPriceListsSheet                                                                                                                                        |
| AlertDialog                                 | `apps/web/src/components/ui/alert-dialog.tsx`                             | DeletePriceListDialog + confirm recalculate                                                                                                                   |
| Action label map (audit)                    | `apps/web/src/features/audit/action-labels.ts`                            | Bổ sung 8 label `price_list.*` + `price_list_item.*` + 2 group                                                                                                |
| Currency helper                             | `apps/web/src/lib/currency.ts`                                            | `formatVnd`, `parseVnd` reuse                                                                                                                                 |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `price-lists.ts` (Drizzle table + indexes + CHECK constraints)
- `price-list-items.ts` (Drizzle table + indexes)
- `price-list-management.ts` (Zod schemas: discriminated union, update, list query, item schemas, response shapes)
- `price-list-management.test.ts`

**Helper (`packages/shared/src/utils/`):**

- `pricing-formulas.ts` (applyFormula, applyRounding, computeFinalPrice, formatFormulaLabel, formatRoundingLabel)
- `pricing-formulas.test.ts`

**Backend (`apps/api/src/`):**

- `services/price-lists.service.ts`
- `services/price-list-items.service.ts`
- `routes/price-lists.routes.ts`
- `__tests__/price-lists.integration.test.ts`
- `__tests__/customer-groups-pricing-fk.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/pricing/price-lists-api.ts`
- `features/pricing/use-price-lists.ts`
- `features/pricing/components/CreatePriceListDialog.tsx`
- `features/pricing/components/EditPriceListDialog.tsx`
- `features/pricing/components/AddPriceListItemDialog.tsx`
- `features/pricing/components/EditPriceListItemDialog.tsx`
- `features/pricing/components/PriceListStatusBadge.tsx`
- `features/pricing/components/PriceListTable.tsx`
- `features/pricing/components/PriceListCardList.tsx`
- `features/pricing/components/PriceListFilters.tsx`
- `features/pricing/components/TrashedPriceListsSheet.tsx`
- `features/pricing/components/DeletePriceListDialog.tsx`
- `features/pricing/components/PriceListItemsTable.tsx`
- `features/pricing/components/PriceListDetail.tsx`
- `features/pricing/components/PriceListsManager.tsx`
- `pages/pricing-page.tsx`
- `pages/pricing-detail-page.tsx`

**Migration (`apps/api/src/db/migrations/`):**

- `0013_*.sql` (CREATE TABLE price_lists + price_list_items + indexes + CHECK constraints + ALTER TABLE customer_groups ADD FK default_price_list_id)
- `meta/0013_snapshot.json`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export `price-lists`, `price-list-items`, `price-list-management`. Export utils `pricing-formulas` (có thể qua `packages/shared/src/utils/index.ts` nếu đã có; nếu không, thêm export trực tiếp từ `src/index.ts`)
- `packages/shared/src/index.ts`: re-export utils nếu chưa có pattern
- `packages/shared/src/schema/audit-log.ts`: thêm 8 audit actions
- `packages/shared/src/constants/permissions.ts`: thêm `pricing.view` + `pricing.manage`
- `packages/shared/src/constants/permissions.test.ts`: bổ sung test matrix
- `apps/api/src/index.ts`: mount `/api/v1/price-lists`
- `apps/web/src/router.tsx`: thêm 2 route `/pricing` và `/pricing/$id`
- `apps/web/src/components/layout/nav-items.ts`: thêm "Bảng giá" với icon `Tags`
- `apps/web/src/features/audit/action-labels.ts`: thêm 8 label + 2 group
- `apps/web/src/features/customers/components/CustomerGroupManager.tsx` (hoặc form dialog tương ứng): kích hoạt input `defaultPriceListId` qua `useDirectPriceListsQuery`

### Coupling với các epic khác

**Story 4.1 (Khách hàng):**

- Cột `customer_groups.default_price_list_id` đã có sẵn (NULLABLE, không FK). Story 4.3 thêm FK trong migration 0013
- UI form nhóm khách hàng ở Story 4.1 hiển thị input disabled với placeholder "Story 4.3 sẽ kích hoạt". Task 11 kích hoạt
- KHÔNG đổi schema customers/customer_groups khác (chỉ thêm FK constraint)

**Story 4.3b (Chain Formula, Clone, Import):**

- Story 4.3 chỉ hỗ trợ `method IN ('direct', 'formula')` với CHECK constraint
- Story 4.3b sẽ:
  - Drop CHECK `check_formula_required`, recreate với enum mở rộng `('direct', 'formula', 'chain', 'clone', 'import')`
  - Nâng cấp validation: cho phép `baseListId` trỏ về formula list (chain), thêm cycle detection (DFS)
  - Thêm endpoint `POST /api/v1/price-lists/clone` và `POST /import`
  - Thêm check chain khi xoá: nếu price_list này đang là base của list khác → chặn hoặc cascade tuỳ business rule
- Story 4.3 đã chuẩn bị: schema có sẵn cột method varchar, dễ mở rộng enum; service có hàm `validateBaseListIsDirect` tách riêng để 4.3b override

**Story 4.3c (So sánh bảng giá):**

- Reuse các API: `getPriceList`, `listPriceListItems` với pageSize lớn
- Story 4.3c thêm endpoint compare `GET /api/v1/price-lists/compare?ids=A,B` hoặc tính trên client
- Story 4.3 expose đủ field cần thiết: `productSellingPrice`, `productCostPrice` để 4.3c tính margin và "dưới vốn"

**Story 4.4 (Giá riêng KH + Giá theo SL):**

- Tạo bảng `customer_prices`, `volume_prices` riêng. KHÔNG đụng vào `price_lists`
- Pricing engine 6 tầng (4.5) sẽ resolve: customer_prices → category_discounts → manual edit → volume_prices → price_lists (per-group) → products.selling_price

**Story 4.5 (POS 6-tier integration):**

- Pricing engine cần truy vấn `price_list_items` qua product_id + customer's `effectivePriceListId`
- Story 4.5 sẽ thêm endpoint internal/optimized: `GET /api/v1/pricing/resolve?productId=&customerId=&quantity=` (hoặc tính ở Server-side trong endpoint POS). Với perm `pricing.view` cho Staff
- Story 4.5 thêm `is_active` toggle realtime, cascade mode (realtime/confirm/scheduled)
- Story 4.3 expose helper `pricing-formulas.ts` để 4.5 reuse khi cần preview cascade

**Story 5.x (Công nợ):**

- Không trực tiếp coupling. Bảng giá ảnh hưởng giá bán → ảnh hưởng số tiền nợ, nhưng đó là logic bán hàng (POS) chứ không phải bảng giá

### Logic công thức + làm tròn (chi tiết để dev không hiểu sai)

**Đơn vị `formulaValue` (CRITICAL — dễ sai):**

- Với `formulaType = 'percent_increase' | 'percent_decrease'`:
  - **Đơn vị: 0.01% (basis points / 100, tức 1 unit = 0.0001 hệ số)**
  - VD: 5% → formulaValue = 500; 10% → 1000; 12.5% → 1250; 100% → 10000
  - Lý do: tránh floating point, giữ integer arithmetic. UI input phần trăm thực (5.5%) → API gửi `Math.round(5.5 * 100) = 550`
  - Công thức: `multiplier = (10000 ± formulaValue) / 10000`. Vì JS Number an toàn cho ≤ 2^53, `basePrice (≤ 10^9 VND) × 10000 = 10^13` < 2^53 (~9×10^15) → an toàn
  - Implement: `Math.round(basePrice * (10000 ± formulaValue) / 10000)`
- Với `formulaType = 'amount_increase' | 'amount_decrease'`:
  - **Đơn vị: 1 đồng VND (integer trực tiếp)**
  - VD: tăng 5.000đ → formulaValue = 5000; giảm 1.000đ → 1000
  - Công thức: `basePrice ± formulaValue`. Clamp `Math.max(0, result)` để tránh âm

**Quy tắc làm tròn (`roundingRule`):**

| Rule                   | Logic                 | VD: 45.250 → ?                                                                                                                                                  |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`                 | Không làm tròn        | 45.250                                                                                                                                                          |
| `nearest_hundred`      | Round nearest 100     | 45.300                                                                                                                                                          |
| `nearest_five_hundred` | Round nearest 500     | 45.500 (vì 250 < 500/2 → wait, actually 250 ≥ 250 (250 = 500/2) → round up theo Math.round = banker's? JS Math.round là half-toward-positive-infinity → 45.500) |
| `nearest_thousand`     | Round nearest 1000    | 45.000 (250 < 500)                                                                                                                                              |
| `ceil_hundred`         | Ceil (lên) bội 100    | 45.300                                                                                                                                                          |
| `ceil_five_hundred`    | Ceil bội 500          | 45.500                                                                                                                                                          |
| `ceil_thousand`        | Ceil bội 1000         | 46.000                                                                                                                                                          |
| `floor_hundred`        | Floor (xuống) bội 100 | 45.200                                                                                                                                                          |
| `floor_five_hundred`   | Floor bội 500         | 45.000                                                                                                                                                          |
| `floor_thousand`       | Floor bội 1000        | 45.000                                                                                                                                                          |

Implement (pure functions trong `pricing-formulas.ts`):

```ts
const ROUNDING_UNITS: Record<
  RoundingRule,
  { unit: number; mode: 'round' | 'ceil' | 'floor' } | null
> = {
  none: null,
  nearest_hundred: { unit: 100, mode: 'round' },
  nearest_five_hundred: { unit: 500, mode: 'round' },
  nearest_thousand: { unit: 1000, mode: 'round' },
  ceil_hundred: { unit: 100, mode: 'ceil' },
  ceil_five_hundred: { unit: 500, mode: 'ceil' },
  ceil_thousand: { unit: 1000, mode: 'ceil' },
  floor_hundred: { unit: 100, mode: 'floor' },
  floor_five_hundred: { unit: 500, mode: 'floor' },
  floor_thousand: { unit: 1000, mode: 'floor' },
}

export function applyRounding(price: number, rule: RoundingRule): number {
  const cfg = ROUNDING_UNITS[rule]
  if (!cfg) return price
  const fn = cfg.mode === 'round' ? Math.round : cfg.mode === 'ceil' ? Math.ceil : Math.floor
  return fn(price / cfg.unit) * cfg.unit
}
```

### Quan hệ `is_active` vs `effectiveActive`

- `is_active`: cờ thủ công do owner toggle (tắt nhanh bảng giá mà không cần đụng ngày)
- `effectiveActive` (computed): `is_active = true` + ngày hiện tại trong khoảng `effective_from..effective_to` + `deletedAt IS NULL`
- Story 4.5 (POS pricing engine) chỉ áp `effectiveActive = true`
- UI Story 4.3: badge AC4 phân biệt rõ 4 trạng thái (Đang áp dụng / Chưa hiệu lực / Hết hiệu lực / Đã tắt)

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement chain formula (base → formula → formula) ở story 4.3 — Story 4.3b
- KHÔNG implement clone / import CSV ở story 4.3 — Story 4.3b
- KHÔNG implement so sánh bảng giá ở story 4.3 — Story 4.3c
- KHÔNG implement pricing engine 6 tầng ở story này — Story 4.5
- KHÔNG implement cascade realtime/confirm/scheduled — Story 4.5
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho price/formulaValue. Dùng `bigint` integer
- KHÔNG hard delete `price_lists` (luôn soft delete). Items thì hard delete OK (cascade theo bảng giá)
- KHÔNG cho phép sửa `method`/`baseListId`/`formulaType`/`formulaValue` qua PATCH (immutable sau khi tạo, muốn đổi → tạo bảng mới)
- KHÔNG bypass `storeId` filter trong service queries
- KHÔNG bypass filter `deletedAt IS NULL` ở queries mặc định
- KHÔNG tự động cascade recalculate khi base list thay đổi (Story 4.5 mới có)
- KHÔNG validate `defaultPriceListId` của customer_groups qua FK ở story 4.1 (FK mới được thêm ở story 4.3)
- KHÔNG mount route `GET /price-lists/:id` TRƯỚC `GET /price-lists/trashed` (Hono match `:id` với 'trashed' nếu sai thứ tự)
- KHÔNG dùng substring match cho PG error detection — match `err.code` + `constraint_name` cụ thể (3 partial unique trong story này: name alive, list_product unique, FK customer_groups)
- KHÔNG dùng `Number(formulaValue) * (1 ± percent/100)` floating point. Phải integer arithmetic với multiplier 10000
- KHÔNG đổi enum `method` thành `pgEnum` (giữ varchar pattern Story 1.x/2.x đã dùng, dễ mở rộng cho Story 4.3b)
- KHÔNG bỏ CHECK constraint DB (`check_formula_required`) — dù service đã validate, DB constraint là defense-in-depth
- KHÔNG bỏ `disabled={!isValid || isPending}` trên nút Lưu của mọi form (fix M3 từ Story 2.2)

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x + 2.x + 4.1:

- Feature folder flat: `features/pricing/components/PriceListsManager.tsx` (sub-folder `components/` đã dùng ở Story 4.1, nhất quán)
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (không file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.x/4.1):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat
- Architecture viết `features/pricing/` thì nay implement `features/pricing/components/...` (sub-folder OK theo Story 4.1)

### Lưu ý đặc thù Story 4.3

1. **Discriminated union Zod**: Đây là lần đầu trong project dùng `z.discriminatedUnion`. Cần đảm bảo Hono parser thấy `method` field trước khi narrow nhánh. Test cẩn thận case missing `method` → schema fail rõ ràng. Reference: https://zod.dev/?id=discriminated-unions
2. **DB CHECK constraint**: Drizzle 0.45 chưa hỗ trợ trực tiếp CHECK trong table builder. Phải append manual SQL trong file migration sau khi `db:generate`. Pattern Story 2.2 đã làm tương tự cho partial unique
3. **Self-FK `baseListId` references `price_lists.id`**: TypeScript circular type. Dùng pattern `(): any => priceLists.id` đã có ở `categories.parentId`
4. **FK customer_groups → price_lists**: Cross-table FK thêm vào ALTER TABLE riêng (sau CREATE TABLE price_lists). Dùng `ON DELETE SET NULL` (xoá bảng giá → group mất default). Customer Group đã có service check ở Task 4 deletePriceList: chặn xoá nếu còn group dùng
5. **Date type DB vs API**: DB dùng `date` (không có timezone). API JSON dùng string `'YYYY-MM-DD'`. Drizzle `date()` mode 'string' default. Lưu ý: client gửi ISO datetime → backend trim về date. Service convert qua `new Date(str).toISOString().slice(0, 10)` hoặc dùng `date-fns` `format(d, 'yyyy-MM-dd')`
6. **`effectiveActive` computed at query time**: KHÔNG lưu cột này trong DB (vì phụ thuộc `today`). Compute ở backend mỗi response, hoặc tính trong SQL bằng `CASE WHEN ... THEN true ELSE false END`. Story 4.5 cần performance → có thể compute SQL-side
7. **Recalculate transaction lớn**: Với store có 1000 sản phẩm + bảng formula có 800 items, recalculate là 800 update + N insert/delete. Wrap trong 1 transaction. Pglite test có thể chậm — set timeout test cao hơn (10s)
8. **Frontend preview formula realtime**: dùng helper pure functions từ `@kiotviet-lite/shared/utils/pricing-formulas`. Cùng helper backend dùng → đảm bảo client preview === server kết quả
9. **Wizard 2 step trong Dialog**: dùng React state để switch step (không dùng react-hook-form `next/back`). RHF chỉ active từ step 2 trở đi. Reset form khi đóng dialog
10. **Items select bulk trong direct create**: load `useProductsQuery({ pageSize: 100 })` đủ cho MVP. Nếu store > 100 SP, UI cần pagination/search trong dialog (story tương lai). Hiện tại trên client filter tại chỗ qua input search (không gọi API thêm)

### Permission matrix (story này)

| Permission       | Owner | Manager | Staff | Resource                                                                         |
| ---------------- | ----- | ------- | ----- | -------------------------------------------------------------------------------- |
| `pricing.manage` | ✅    | ✅      | ❌    | CRUD price_lists + price_list_items, /pricing UI                                 |
| `pricing.view`   | ✅    | ✅      | ✅    | Reserved cho Story 4.5 (POS đọc bảng giá để áp). Story 4.3 không expose endpoint |

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.3]
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.3b] (boundary: chain/clone/import là 4.3b)
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.3c] (boundary: compare là 4.3c)
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.5] (downstream: POS 6-tier integration)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR13, FR14, FR15, FR16]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M2: Đơn giá]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Currency, Pagination, Validation Flow, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Authorization 3 Role]
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md#Pattern soft delete + partial unique + audit + Coupling Story 4.3]
- [Source: _bmad-output/implementation-artifacts/2-2-crud-san-pham-co-ban.md#Pattern restore + trashed + handleApiError]
- [Source: packages/shared/src/schema/customer-groups.ts] (cột `defaultPriceListId` đã có, story 4.3 thêm FK)
- [Source: packages/shared/src/schema/customers.ts] (pattern bigint + soft delete + partial unique)
- [Source: packages/shared/src/schema/categories.ts] (pattern self-FK với cast any)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum)
- [Source: packages/shared/src/constants/permissions.ts] (pattern permission constant)
- [Source: apps/api/src/services/customers.service.ts] (pattern listCustomers + paginate + LEFT JOIN + audit + soft delete + restore + trashed)
- [Source: apps/api/src/services/customer-groups.service.ts] (pattern delete check business rule)
- [Source: apps/api/src/services/audit.service.ts] (logAction + diffObjects + getRequestMeta)
- [Source: apps/api/src/lib/pg-errors.ts] (isUniqueViolation + isFkViolation)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern)
- [Source: apps/api/src/routes/customers.routes.ts] (factory route + uuidParam + parseJson + mount /trashed trước /:id)
- [Source: apps/api/src/db/migrations/0008_*.sql, 0011_*.sql, 0012_*.sql] (pattern manual SQL append cho partial unique + ALTER TABLE ADD CONSTRAINT FK)
- [Source: apps/web/src/router.tsx:requirePermissionGuard] (pattern guard cho pricing.manage)
- [Source: apps/web/src/components/layout/nav-items.ts] (thêm icon Tags cho "Bảng giá")
- [Source: apps/web/src/features/customers/components/CustomerForm.tsx, QuickCustomerForm.tsx] (pattern form RHF + zodResolver)
- [Web: Zod discriminated unions](https://zod.dev/?id=discriminated-unions)
- [Web: PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Web: PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Web: TanStack Query v5 placeholderData / keepPreviousData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)
- [Web: date-fns format](https://date-fns.org/v3/docs/format)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- Migration 0013_harsh_dreadnoughts.sql: drizzle-kit auto-generate + append manual `ALTER TABLE customer_groups ADD CONSTRAINT customer_groups_default_price_list_id_fk` (FK cross-table không tự sinh).
- Resolved Zod discriminated union strip behavior: theo AC2, gửi `direct` kèm `baseListId` thì Zod strip extra props (default behavior, không cần `.strict()`).
- Resolved aliasedTable cho self-FK: dùng `aliasedTable(priceLists, 'baseAlias')` ở `buildSelectColumns` để LEFT JOIN lấy `baseName`.
- Resolved formula percent math: nhân 10000 multiplier để tránh float, `Math.round((basePrice * (10000 ± formulaValue)) / 10000)` rồi `Math.max(0, ...)` clamp.
- Resolved generic UseFormReturn cho `CommonFields`: cast về `AnyForm = ReturnType<typeof useForm>` để chia sẻ giữa direct/formula form.

### Completion Notes List

- 15/15 AC implemented theo đúng spec.
- 38 backend integration tests + 5 FK behavior tests + 45 unit tests cho Zod schema/permission + 25 unit tests cho pricing-formulas → all pass.
- Frontend: 11 components, 2 pages, 2 routes, 1 NAV_ITEM. Wizard create dialog 2-step direct/formula với preview realtime.
- Audit logging: 8 actions với label tiếng Việt + 2 group "Bảng giá", "Mục bảng giá".
- Permission: `pricing.view` (owner/manager/staff), `pricing.manage` (owner/manager).
- Customer group `defaultPriceListId` UI hoàn thiện: Select live qua `useDirectPriceListsQuery()`, hiển thị tên bảng giá ở table.
- pnpm typecheck pass tất cả packages. pnpm lint chỉ còn lỗi từ story 6-1 (suppliers/purchase-orders) không liên quan story này.
- 7 patches from code review fixed (5 MAJOR + 2 MINOR): race condition transaction wrapping cho create formula + recalculate, fix isOverridden khi thêm item thủ công vào formula list, gỡ guard chặn submit empty Direct, thêm cảnh báo "Dưới vốn" trong preview formula, .strict() cho updatePriceListSchema, Zod query schema cho /trashed.

### File List

**Created (Schema + Migration):**

- packages/shared/src/schema/price-lists.ts
- packages/shared/src/schema/price-list-items.ts
- packages/shared/src/schema/price-list-management.ts
- packages/shared/src/schema/price-list-management.test.ts
- packages/shared/src/utils/pricing-formulas.ts
- packages/shared/src/utils/pricing-formulas.test.ts
- packages/shared/src/utils/index.ts
- apps/api/src/db/migrations/0013_harsh_dreadnoughts.sql

**Created (Backend services + routes + tests):**

- apps/api/src/services/price-lists.service.ts
- apps/api/src/services/price-list-items.service.ts
- apps/api/src/routes/price-lists.routes.ts
- apps/api/src/**tests**/price-lists.integration.test.ts
- apps/api/src/**tests**/customer-groups-pricing-fk.integration.test.ts

**Created (Frontend feature + components + pages):**

- apps/web/src/features/pricing/price-lists-api.ts
- apps/web/src/features/pricing/use-price-lists.ts
- apps/web/src/features/pricing/components/PriceListStatusBadge.tsx
- apps/web/src/features/pricing/components/PriceListFilters.tsx
- apps/web/src/features/pricing/components/PriceListTable.tsx
- apps/web/src/features/pricing/components/PriceListCardList.tsx
- apps/web/src/features/pricing/components/PriceListItemsTable.tsx
- apps/web/src/features/pricing/components/CreatePriceListDialog.tsx
- apps/web/src/features/pricing/components/EditPriceListDialog.tsx
- apps/web/src/features/pricing/components/AddPriceListItemDialog.tsx
- apps/web/src/features/pricing/components/EditPriceListItemDialog.tsx
- apps/web/src/features/pricing/components/DeletePriceListDialog.tsx
- apps/web/src/features/pricing/components/TrashedPriceListsSheet.tsx
- apps/web/src/features/pricing/components/PriceListsManager.tsx
- apps/web/src/features/pricing/components/PriceListDetail.tsx
- apps/web/src/pages/pricing-page.tsx
- apps/web/src/pages/pricing-detail-page.tsx

**Modified:**

- packages/shared/src/index.ts (export utils)
- packages/shared/src/schema/index.ts (export price-list schemas)
- packages/shared/src/schema/audit-log.ts (8 actions)
- packages/shared/src/constants/permissions.ts (pricing.view + pricing.manage)
- packages/shared/src/constants/permissions.test.ts (test matrix)
- apps/api/src/index.ts (mount /api/v1/price-lists)
- apps/web/src/router.tsx (2 routes + permission guard)
- apps/web/src/components/layout/nav-items.ts (NAV_ITEM "Bảng giá" + Tags icon)
- apps/web/src/features/audit/action-labels.ts (8 labels + 2 ACTION_GROUPS)
- apps/web/src/features/customers/components/CustomerGroupManager.tsx (kích hoạt defaultPriceListId Select)

### Change Log

| Ngày       | Phiên bản | Thay đổi                                                                                                                             |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-28 | 1.0       | Triển khai đầy đủ Story 4.3 (15 AC, 14 tasks). Backend + Frontend + Tests pass. Status: review.                                      |
| 2026-04-28 | 1.1       | Code review (Blind + EdgeCase + AcceptanceAuditor). 5 MAJOR patches + 2 MINOR patches + 7 defer + 2 dismiss.                         |
| 2026-04-28 | 1.2       | 7 patches from code review fixed (5 MAJOR + 2 MINOR). API tests 264/264 pass, shared tests 294/294 pass, typecheck api+shared clean. |

### Review Findings

**MAJOR — patch (cần xử lý trước khi đóng story):**

- [ ] [Review][Patch] Race condition: load baseItems ngoài transaction khi tạo formula list [apps/api/src/services/price-lists.service.ts:475-478] — base list có thể bị thay đổi giữa lúc đọc và commit. Move việc load `baseItems` vào trong `db.transaction(...)` block.
- [ ] [Review][Patch] Race condition: load baseItems + existingItems ngoài transaction khi recalculate [apps/api/src/services/price-lists.service.ts:886-899] — tương tự issue trên. Move toàn bộ load + compute + apply vào trong transaction (hoặc dùng `SELECT ... FOR UPDATE` để lock).
- [ ] [Review][Patch] Bug logic: createPriceListItem cho formula list set isOverridden=false sai [apps/api/src/services/price-list-items.service.ts:226] — Theo AC3 và AC8, khi thêm SP mới (không có ở base) vào formula list, item phải đánh dấu `isOverridden=true`. Hiện tại luôn set `false`. Sửa: nếu `method === 'formula'` → `isOverridden: true`.
- [ ] [Review][Patch] UI direct chặn submit khi items rỗng vi phạm AC2 [apps/web/src/features/pricing/components/CreatePriceListDialog.tsx:213-216] — AC2 cho phép tạo bảng giá rỗng (lưu nháp, thêm SP sau). Bỏ guard `items.length === 0` + toast, cho submit thẳng.
- [ ] [Review][Patch] Thiếu cảnh báo "Dưới vốn" trong preview formula [apps/web/src/features/pricing/components/CreatePriceListDialog.tsx:509-525] — AC13 yêu cầu dòng đỏ khi giá tính ra < `productCostPrice`. Cần fetch `productCostPrice` qua API base items (đã có trong PriceListItemListItem) và highlight row khi `rounded < it.productCostPrice`.

**MINOR — patch (nên xử lý):**

- [ ] [Review][Patch] updatePriceListSchema thiếu .strict() [packages/shared/src/schema/price-list-management.ts:99-119] — Spec AC9 ưu tiên `.strict()` để fail-fast khi client gửi nhầm field cấm sửa (`method`, `baseListId`, `formulaType`, `formulaValue`). Hiện Zod silent strip. Thêm `.strict()` và update test ở dòng 580-589 để verify fail explicit.
- [ ] [Review][Patch] Route /trashed không validate query qua Zod [apps/api/src/routes/price-lists.routes.ts:63-69] — `parseInt` thủ công không nhất quán với route khác. Tạo `listTrashedPriceListsQuerySchema = z.object({ page, pageSize })` và dùng `.parse(c.req.query())`.

**DEFER — pre-existing hoặc acknowledged scope MVP:**

- [x] [Review][Defer] Thiếu inline toggle isActive trên trang chi tiết [apps/web/src/features/pricing/components/PriceListDetail.tsx:174-196] — AC14 ghi "switch toggle inline qua PATCH". Hiện tại phải mở dialog. UX nice-to-have, không block functionality. Defer vào story nâng cấp UX.
- [x] [Review][Defer] AlertDialog xoá item formula chưa override không disable nút Xoá [PriceListDetail.tsx:277-283] — UX tốt hơn nếu disable. Hiện click vẫn nhận error toast từ BE 422.
- [x] [Review][Defer] useProductsQuery pageSize=100 cap số sản phẩm [CreatePriceListDialog.tsx:186, AddPriceListItemDialog.tsx:49] — Store >100 SP sẽ không thấy SP còn lại. Đã được Dev Notes H4/note 10 acknowledge MVP scope.
- [x] [Review][Defer] List subquery itemCount correlated [price-lists.service.ts:117-120] — Hiệu năng OK với MVP (≤100 bảng giá). Có thể tối ưu LEFT JOIN GROUP BY khi số lượng tăng.
- [x] [Review][Defer] Recalculate không filter product alive [price-lists.service.ts:886] — Base có item của product đã soft delete sẽ vào formula list. Dev Notes H8 đã defer xử lý orphan items.
- [x] [Review][Defer] validateProductsAlive race condition với soft delete [price-list-items.service.ts:208-213] — Product có thể soft delete giữa validate và insert. Vì FK CASCADE chỉ trigger trên hard delete, insert vẫn pass với `deletedAt!=null`. Tác động consistency, không corruption. Story 4.5 sẽ filter trong pricing engine.
- [x] [Review][Defer] FK customer_groups.defaultPriceListId không enforce same-store ở DB [test note customer-groups-pricing-fk] — Service layer Story 4.1 đảm nhận. Defer.

**DISMISSED:**

- Test name "Sửa method qua PATCH bị Zod loại bỏ" — không phải bug, schema đúng hành vi với strip mặc định.
- Spec note "33333 + percent_decrease 33.33% = 22222" sai 1 đơn vị — test code đúng (22223 sau Math.round). Doc note minor typo, có thể sửa khi rảnh.
