# Story 4.4: Giá riêng khách hàng & Giá theo số lượng

Status: review-fixed

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a chủ cửa hàng,
I want thiết lập giá riêng cho từng khách hàng VIP và giá ưu đãi theo số lượng mua,
so that có chính sách giá linh hoạt cho từng đối tượng và khuyến khích khách mua số lượng lớn.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `customer_prices`, `volume_prices` và FK kích hoạt

**Given** hệ thống đã có bảng `stores`, `products`, `customers`, `audit_logs`, `price_lists` (Story 4.1 + 4.3)
**When** chạy migration mới của story 4.4
**Then** tạo bảng `customer_prices`:

| Column        | Type                       | Ràng buộc                                       |
| ------------- | -------------------------- | ----------------------------------------------- |
| `id`          | `uuid`                     | PK, default `uuidv7()`                          |
| `store_id`    | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT   |
| `customer_id` | `uuid`                     | NOT NULL, FK → `customers.id` ON DELETE CASCADE |
| `product_id`  | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE CASCADE  |
| `price`       | `bigint`                   | NOT NULL, ≥ 0 (mode 'number', integer VND)      |
| `note`        | `varchar(255)`             | NULLABLE (lý do đặt giá riêng, optional)        |
| `created_at`  | `timestamp with time zone` | NOT NULL, default `now()`                       |
| `updated_at`  | `timestamp with time zone` | NOT NULL, default `now()`, auto-update          |

**And** unique index `uniq_customer_prices_customer_product` trên `(customer_id, product_id)` (mỗi cặp KH × SP có 1 giá riêng duy nhất)
**And** index `idx_customer_prices_store_customer` trên `(store_id, customer_id)` cho query "lấy mọi giá riêng của 1 KH"
**And** index `idx_customer_prices_product` trên `(product_id)` cho pricing engine Story 4.5 query "SP này có giá riêng của KH X không"
**And** ràng buộc: `customer_prices.store_id` phải bằng `customers.store_id` và `products.store_id` (enforce ở service layer)
**And** KHÔNG có cột `deleted_at`. Hard delete khi user xoá: row biến mất hoàn toàn (giá riêng không cần lịch sử ở MVP, audit log lưu snapshot là đủ)

**Then** tạo bảng `volume_prices`:

| Column       | Type                       | Ràng buộc                                                |
| ------------ | -------------------------- | -------------------------------------------------------- |
| `id`         | `uuid`                     | PK, default `uuidv7()`                                   |
| `store_id`   | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT            |
| `product_id` | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE CASCADE           |
| `min_qty`    | `integer`                  | NOT NULL, ≥ 1 (số lượng tối thiểu để hưởng giá tier này) |
| `price`      | `bigint`                   | NOT NULL, ≥ 0 (mode 'number', integer VND)               |
| `created_at` | `timestamp with time zone` | NOT NULL, default `now()`                                |
| `updated_at` | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                   |

**And** unique index `uniq_volume_prices_product_min_qty` trên `(product_id, min_qty)` (mỗi SP không có 2 tier cùng min_qty)
**And** index `idx_volume_prices_product` trên `(product_id)` cho pricing engine Story 4.5 (load tất cả tier của 1 SP để chọn tier phù hợp)
**And** index `idx_volume_prices_store_product` trên `(store_id, product_id)` cho list query
**And** check constraint `check_volume_prices_min_qty_positive`: `min_qty >= 1` (không cho phép `min_qty = 0` hay âm; tier 1 luôn bắt đầu từ 1)
**And** KHÔNG có cột `deleted_at`. Hard delete (giống `customer_prices`)

**Then** không cần ALTER TABLE nào khác, không thêm cột mới vào `customers` hay `products`

### AC2: Tạo giá riêng KH (POST /api/v1/customer-prices)

**Given** Owner/Manager đã đăng nhập (có permission `pricing.manage`)
**When** gọi `POST /api/v1/customer-prices` với body:

```json
{
  "customerId": "<uuid>",
  "productId": "<uuid>",
  "price": 45000,
  "note": "Khách VIP, giảm cho hợp đồng dài hạn"
}
```

**Then** API validate qua `createCustomerPriceSchema` (Zod):

- `customerId`: uuid bắt buộc
- `productId`: uuid bắt buộc
- `price`: integer ≥ 0, max `9_999_999_999_999` (giống `priceSchema` Story 4.3)
- `note`: optional, trim, max 255 ký tự, nullable

**And** service `createCustomerPrice`:

- Validate `customerId` cùng store + alive (`customers.deleted_at IS NULL`) → nếu không → `NOT_FOUND` "Không tìm thấy khách hàng"
- Validate `productId` cùng store + alive (`products.deleted_at IS NULL`) → nếu không → `NOT_FOUND` "Không tìm thấy sản phẩm"
- Insert row vào `customer_prices` với `store_id = actor.storeId` trong transaction
- Catch DB unique violation 23505 với constraint `uniq_customer_prices_customer_product` → throw 409 CONFLICT details `{ field: 'productId' }` "Khách hàng đã có giá riêng cho sản phẩm này"
- Ghi audit `action='customer_price.created'`, `targetType='customer_price'`, `targetId=<id>`, `changes={ customerId, productId, price, note }`

**And** trả 201 với envelope `{ data: CustomerPriceListItem }` chứa: `id`, `customerId`, `customerName`, `productId`, `productName`, `productSku`, `productImageUrl`, `productSellingPrice`, `productCostPrice`, `price`, `note`, `createdAt`, `updatedAt`

**And** UI cảnh báo (KHÔNG block): nếu `price < productCostPrice` thì hiện toast warning "Giá thấp hơn giá vốn ({vnd}đ). Bạn có chắc?". Backend KHÔNG block (Story 4.4b sẽ thêm PIN flow cho dưới vốn trong POS)

### AC3: Liệt kê giá riêng KH (GET /api/v1/customer-prices)

**Given** Owner/Manager xem trang giá riêng
**When** gọi `GET /api/v1/customer-prices?page=1&pageSize=20&customerId=&productId=&search=`
**Then** API validate qua `listCustomerPricesQuerySchema`:

- `page`: int ≥ 1, default 1
- `pageSize`: int 1-100, default 20
- `customerId`: optional uuid (lọc theo 1 KH cụ thể, dùng cho tab giá riêng trong trang chi tiết KH)
- `productId`: optional uuid (lọc theo 1 SP cụ thể)
- `search`: optional string, trim (search theo tên KH HOẶC tên SP HOẶC SKU sản phẩm)

**And** service `listCustomerPrices`:

- Filter chặt chẽ theo `actor.storeId`
- LEFT JOIN `customers` để lấy `customerName`, `customerPhone`
- LEFT JOIN `products` để lấy `productName`, `productSku`, `productImageUrl`, `productSellingPrice`, `productCostPrice`
- WHERE `customers.deleted_at IS NULL AND products.deleted_at IS NULL` (không hiện row có KH/SP đã xoá; sẽ hiển thị placeholder hoặc tự cleanup, xem Dev Notes H1)
- Filter `customerId`, `productId` nếu có
- Search filter: WHERE `LOWER(customers.name) LIKE LOWER('%search%') OR LOWER(products.name) LIKE LOWER('%search%') OR LOWER(products.sku) LIKE LOWER('%search%')` ESCAPE wildcard `%` `_` qua `escapeLikePattern`
- Sort: mặc định `(createdAt DESC, customerName ASC)`
- Trả `{ data: CustomerPriceListItem[], meta: { page, pageSize, total, totalPages } }`

**And** mỗi `CustomerPriceListItem`:

```typescript
{
  id: uuid,
  customerId: uuid,
  customerName: string,
  customerPhone: string,
  productId: uuid,
  productName: string,
  productSku: string,
  productImageUrl: string | null,
  productSellingPrice: number,
  productCostPrice: number | null,
  price: number,
  note: string | null,
  createdAt: string,
  updatedAt: string,
}
```

### AC4: Sửa giá riêng KH (PATCH /api/v1/customer-prices/:id)

**Given** Owner/Manager click sửa 1 row giá riêng
**When** gọi `PATCH /api/v1/customer-prices/:id` body `{ "price": 42000, "note": "Cập nhật giá tháng 5" }`
**Then** API validate qua `updateCustomerPriceSchema` (refine ≥ 1 field):

- Cho phép sửa: `price`, `note`
- KHÔNG cho phép sửa: `customerId`, `productId` (immutable, muốn đổi → xoá + tạo mới). Schema `.strict()` loại bỏ
- Validate ownership (cùng store)
- UPDATE + audit `customer_price.updated` với diff before/after qua `diffObjects`
- Trả 200 với `CustomerPriceListItem` mới

### AC5: Xoá giá riêng KH (DELETE /api/v1/customer-prices/:id)

**Given** Owner/Manager click xoá 1 row giá riêng
**When** gọi `DELETE /api/v1/customer-prices/:id`
**Then** service `deleteCustomerPrice`:

- Validate ownership (cùng store) → nếu không → 404
- Hard delete row
- Ghi audit `customer_price.deleted` với snapshot before (giữ trace để recovery thủ công nếu cần)
- Trả 200 `{ data: { ok: true } }`

### AC6: Tạo / cập nhật bulk volume prices cho 1 sản phẩm (PUT /api/v1/volume-prices/products/:productId)

**Given** Owner/Manager mở dialog "Giá theo số lượng" của 1 SP
**When** gọi `PUT /api/v1/volume-prices/products/:productId` body:

```json
{
  "tiers": [
    { "minQty": 1, "price": 50000 },
    { "minQty": 10, "price": 45000 },
    { "minQty": 50, "price": 40000 },
    { "minQty": 100, "price": 35000 },
    { "minQty": 200, "price": 30000 }
  ]
}
```

**Then** API validate qua `replaceVolumePricesSchema`:

- `tiers`: array `{ minQty: integer ≥ 1, price: integer ≥ 0 }`
- `tiers.length`: 0-5 (cho phép gửi mảng rỗng để xoá hết tier; gửi 6 tier → fail "Tối đa 5 mức giá theo số lượng cho mỗi sản phẩm")
- Trong `tiers`: KHÔNG có `minQty` trùng nhau → `superRefine` fail "Số lượng tối thiểu không được trùng nhau"
- Trong `tiers`: nếu sort theo `minQty` ASC thì `price` phải DESC nghiêm ngặt (giá giảm dần khi số lượng tăng) → `superRefine` fail "Giá phải giảm dần khi số lượng tăng" (Story 4.4 enforce strict descending; KHÔNG cho phép `>=` để tránh tier vô nghĩa)

**And** service `replaceVolumePricesForProduct`:

- Validate `productId` cùng store + alive → nếu không → 404
- Trong 1 transaction:
  - DELETE FROM `volume_prices` WHERE `product_id = :productId AND store_id = :storeId`
  - INSERT batch các tier mới (sort `minQty` ASC trước khi insert để consistent)
- Ghi audit `volume_prices.replaced` với `changes={ productId, tierCountBefore, tierCountAfter, tiers: [{ minQty, price }, ...] }` (snapshot mới)
- Trả 200 `{ data: { productId, tiers: VolumePriceTier[] } }` với tiers sorted by minQty ASC

**And** validation lỗi → trả 400 VALIDATION_ERROR với `details` trỏ về index tier sai

### AC7: Liệt kê volume prices của 1 SP (GET /api/v1/volume-prices/products/:productId)

**Given** UI mở dialog/section "Giá theo số lượng" của 1 SP
**When** gọi `GET /api/v1/volume-prices/products/:productId`
**Then** service `listVolumePricesForProduct`:

- Validate `productId` cùng store + alive → nếu không → 404
- SELECT FROM `volume_prices` WHERE `product_id = :productId AND store_id = :storeId`
- Sort `min_qty ASC`
- Trả 200 `{ data: { productId, productName, productSku, productSellingPrice, productCostPrice, tiers: VolumePriceTier[] } }`

**And** mỗi `VolumePriceTier`: `{ id: uuid, minQty: number, price: number, createdAt: string, updatedAt: string }`

**And** nếu không có tier nào → trả `tiers: []` (không 404)

### AC8: Liệt kê tất cả SP có volume prices (GET /api/v1/volume-prices)

**Given** Owner/Manager xem trang quản lý giá theo SL tổng quát
**When** gọi `GET /api/v1/volume-prices?page=1&pageSize=20&search=`
**Then** API validate qua `listVolumePricesQuerySchema` (page, pageSize 1-100, search). Service:

- Filter chặt chẽ theo `actor.storeId`
- Group theo `product_id`, lấy danh sách SP CÓ ÍT NHẤT 1 tier (không liệt kê SP chưa setup)
- LEFT JOIN `products` để lấy productName/SKU/imageUrl/sellingPrice/costPrice
- WHERE `products.deleted_at IS NULL`
- Search: `LOWER(products.name) LIKE LOWER('%search%') OR LOWER(products.sku) LIKE LOWER('%search%')` ESCAPE wildcard
- Compute mỗi row: `tierCount` (count tier của SP), `minPrice` (giá thấp nhất), `maxPrice` (giá cao nhất), `topTiers` (3 tier đầu sort by minQty ASC, để preview)
- Sort `productName ASC`, paginate
- Trả `{ data: VolumePricesListItem[], meta }`

**And** `VolumePricesListItem`:

```typescript
{
  productId: uuid,
  productName: string,
  productSku: string,
  productImageUrl: string | null,
  productSellingPrice: number,
  productCostPrice: number | null,
  tierCount: number,
  minPrice: number,
  maxPrice: number,
  topTiers: VolumePriceTier[],  // 3 tier đầu
}
```

### AC9: Permission, Multi-tenant, Audit

**Given** ma trận permission đã có `pricing.manage` (Owner+Manager) và `pricing.view` (Owner+Manager+Staff) từ Story 4.3
**When** kiểm tra access cho story 4.4
**Then** mọi route `/api/v1/customer-prices/*` và `/api/v1/volume-prices/*` middleware: `requireAuth` + `requirePermission('pricing.manage')`. Story 4.5 (POS) sẽ dùng `pricing.view` cho Staff khi resolve giá

**And** mọi service query CHẶT CHẼ filter theo `actor.storeId`
**And** thêm audit actions vào `auditActionSchema`:

- `'customer_price.created'`
- `'customer_price.updated'`
- `'customer_price.deleted'`
- `'volume_prices.replaced'` (1 action duy nhất cho bulk replace, KHÔNG track từng tier)

**And** thêm action labels tiếng Việt vào `apps/web/src/features/audit/action-labels.ts`:

- `'customer_price.created': 'Tạo giá riêng KH'`
- `'customer_price.updated': 'Sửa giá riêng KH'`
- `'customer_price.deleted': 'Xoá giá riêng KH'`
- `'volume_prices.replaced': 'Cập nhật giá theo số lượng'`

**And** thêm 2 group vào `ACTION_GROUPS`: "Giá riêng KH" (3 actions trên), "Giá theo số lượng" (1 action)

### AC10: UI tab "Giá riêng" trong trang chi tiết khách hàng

**Given** Story 4.2 (Trang chi tiết KH) đang ở backlog, story 4.4 KHÔNG triển khai trang chi tiết KH đầy đủ
**When** Story 4.4 cần UI quản lý giá riêng KH
**Then** triển khai page mới `/pricing/customer-prices` (KHÔNG đụng trang chi tiết KH):

- Header: title "Giá riêng khách hàng", description "Quản lý giá đặc biệt cho từng cặp khách hàng × sản phẩm"
- Toolbar: nút Primary "Thêm giá riêng" → mở `<CreateCustomerPriceDialog>`
- Filters: Input search (debounce 300ms), Select customer (load `useCustomersQuery({ pageSize: 100 })`, option "Tất cả KH"), Select product (load `useProductsQuery({ pageSize: 100 })`, option "Tất cả SP")
- Body desktop ≥ 768px: `<CustomerPricesTable>` cột: KH (name + phone bên dưới text-xs muted), SP (image + name + SKU), Giá lẻ chuẩn (formatVnd, right align), Giá riêng (formatVnd, font-medium, right align), Chênh lệch (% so với giá lẻ, badge xanh nếu ≤ giá lẻ, đỏ nếu > giá lẻ), Ghi chú (truncate), Thao tác (Pencil + Trash2 ghost buttons)
- Body mobile < 768px: `<CustomerPricesCardList>` card mỗi row: avatar KH + tên KH/phone, dưới đó là tên SP + giá riêng + chênh lệch
- Empty state: `<EmptyState icon={UserCog} title="Chưa có giá riêng KH" description="Thêm giá riêng để áp dụng chính sách đặc biệt cho khách hàng VIP" actionLabel="Thêm giá riêng" />`
- `<Pagination>` cuối trang (reuse từ story 2.2/4.1)

**And** Sidebar/BottomTabBar nav-items: KHÔNG thêm item mới ở root. Đặt link "Giá riêng KH" và "Giá theo số lượng" như sub-link trong trang `/pricing` (header có TabBar 3 tab: "Bảng giá" / "Giá riêng KH" / "Giá theo SL"). Lý do: tránh sidebar quá dài, gom các page liên quan đơn giá lại

**And** trong tương lai khi Story 4.2 (Trang chi tiết KH) triển khai: trang đó sẽ có 1 tab "Giá riêng" reuse `<CustomerPricesTable customerId={customer.id} />` (component hỗ trợ filter sẵn). Story 4.4 chỉ implement page list tổng quát + filter

### AC11: UI dialog tạo/sửa giá riêng KH (`<CreateCustomerPriceDialog>`, `<EditCustomerPriceDialog>`)

**Given** click "Thêm giá riêng" trên page `/pricing/customer-prices`
**When** Dialog mở
**Then** form fields:

- Combobox `customerId` (required): search KH theo tên/phone (reuse pattern Combobox từ POS Story 3.1 hoặc dùng `<Select>` của shadcn với danh sách KH alive `useCustomersQuery({ pageSize: 200 })`)
  - Display option: name + phone bên cạnh
  - Disabled trong mode `edit` (không cho đổi customer sau khi tạo)
- Combobox `productId` (required): search SP theo tên/SKU (`useProductsQuery({ pageSize: 200 })`)
  - Display option: image + name + SKU
  - Khi chọn SP → preview helper text "Giá lẻ chuẩn: {productSellingPrice}đ • Giá vốn: {productCostPrice}đ" (productCostPrice ẩn nếu null)
  - Disabled trong mode `edit`
- CurrencyInput `price` (required, ≥ 0): nhập giá riêng
- Textarea `note` (optional, max 255): ghi chú lý do
- Real-time warning section (chỉ hiện khi có cả `productId` + `price`):
  - Nếu `price < productCostPrice`: warning đỏ "⚠ Giá thấp hơn giá vốn ({vnd}đ)" + suggestion "Bạn có chắc muốn đặt giá dưới vốn?"
  - Nếu `price > productSellingPrice`: info xám "ℹ Giá cao hơn giá lẻ chuẩn ({vnd}đ tăng)"
  - KHÔNG block submit, chỉ cảnh báo
- Footer: "Hủy" + Primary "Lưu" (disable khi `!isValid || isPending`)

**And** Submit:

- Mode `create`: gọi `useCreateCustomerPriceMutation`. Map CONFLICT field=productId → form.setError('productId', 'Khách hàng đã có giá riêng cho sản phẩm này. Hãy sửa thay vì tạo mới.')
- Mode `edit`: gọi `useUpdateCustomerPriceMutation`. Chỉ gửi field thay đổi (`price`, `note`)

**And** RHF + zodResolver(createCustomerPriceSchema | updateCustomerPriceSchema). Mode 'onTouched'

### AC12: UI quản lý "Giá theo số lượng" cho 1 SP (`<VolumePricesDialog>`)

**Given** Owner/Manager đang ở trang `/products/:id` HOẶC trang `/pricing/volume-prices`
**When** click "Cấu hình giá theo SL" cho 1 SP
**Then** mở `<VolumePricesDialog>` props `{ productId, productName, productSku, productSellingPrice, productCostPrice, open, onOpenChange }`:

- Header: "Giá theo số lượng cho {productName}" + chip SKU
- Helper text: "Cấu hình tối đa 5 mức giá theo số lượng. Số lượng tối thiểu phải tăng dần, giá phải giảm dần."
- Section dynamic list 0-5 tier rows, mỗi row:
  - NumberInput `minQty` (≥ 1, integer)
  - CurrencyInput `price` (≥ 0)
  - Button icon `Trash2` xoá row
- Nút "+ Thêm mức giá" (disable khi đã có 5 tier)
- Real-time validation hiển thị inline:
  - `minQty` trùng nhau → row đỏ "Số lượng tối thiểu trùng tier khác"
  - Giá KHÔNG giảm dần (sort theo minQty ASC) → highlight hai row sai "Giá phải nhỏ hơn tier trước"
  - Giá < productCostPrice → warning vàng "Tier này dưới giá vốn"
- Preview table: ngay dưới list, hiển thị bảng "Khoảng SL → Giá":
  - Tier 1: "1-9 cái: 50.000đ" (hiển thị range bằng cách lấy minQty của tier sau - 1; tier cuối: "≥ minQty cái: ...")
  - Auto sort theo minQty ASC khi render
- Footer: "Hủy" + Primary "Lưu" (disable khi `!isValid || isPending`)

**And** Submit:

- Gọi `useReplaceVolumePricesMutation(productId, { tiers })`. Sort tiers theo `minQty` ASC trước khi gửi
- Success: toast "Đã cập nhật {N} mức giá" + invalidate query `['volume-prices', productId]` và `['volume-prices']`
- Map VALIDATION_ERROR theo `details.field` (vd `tiers.2.price`) → form.setError đúng row + field

**And** State management trong dialog: dùng RHF với `useFieldArray` cho `tiers`. zodResolver(`replaceVolumePricesSchema`)

**And** Khi mở dialog: load `useVolumePricesForProductQuery(productId)` → init `tiers` từ data (nếu có) hoặc default `[{ minQty: 1, price: productSellingPrice }]` (1 tier khởi đầu = giá lẻ chuẩn)

### AC13: UI page tổng quát "Giá theo số lượng" (`/pricing/volume-prices`)

**Given** Owner/Manager xem trang quản lý giá theo SL
**When** navigate đến tab "Giá theo SL" trong `/pricing` (URL `/pricing/volume-prices`)
**Then** trang render `<VolumePricesManager>`:

- Header (chung trong tab `/pricing`): TabBar 3 tab "Bảng giá", "Giá riêng KH", "Giá theo SL"
- Toolbar: nút Primary "Thiết lập giá theo SL" → mở `<SelectProductDialog>` (chọn SP chưa có volume_prices từ list `useProductsQuery({ pageSize: 100 })`) → sau khi chọn → mở `<VolumePricesDialog>` cho SP đó. Nếu SP đã có tiers → vẫn cho mở để chỉnh
- Filters: Input search (debounce, search theo SP)
- Body desktop ≥ 768px: `<VolumePricesTable>` cột: SP (image + name + SKU), Số mức (`tierCount` chip), Khoảng giá (`{formatVnd(minPrice)} → {formatVnd(maxPrice)}`), Preview 3 tier đầu (chuỗi compact "1+: 50k • 10+: 45k • 50+: 40k"), Thao tác (Pencil mở dialog edit + Trash2 xoá toàn bộ tiers)
- Body mobile: `<VolumePricesCardList>`
- Empty state: `<EmptyState icon={Layers} title="Chưa có giá theo SL" description="Thiết lập giá ưu đãi cho khách mua số lượng lớn" actionLabel="Thiết lập giá theo SL" />`
- `<Pagination>` cuối trang

**And** Xoá toàn bộ tiers của 1 SP: gọi `replaceVolumePricesMutation(productId, { tiers: [] })` → toast "Đã xoá giá theo số lượng" + invalidate

### AC14: Frontend route + nav

**Given** routing đã có `/pricing` và `/pricing/$id` từ Story 4.3
**When** thêm route mới
**Then** thêm 2 route con vào `apps/web/src/router.tsx`:

```ts
const pricingCustomerPricesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/pricing/customer-prices',
  beforeLoad: requirePermissionGuard('pricing.manage'),
  component: CustomerPricesPage,
})
const pricingVolumePricesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/pricing/volume-prices',
  beforeLoad: requirePermissionGuard('pricing.manage'),
  component: VolumePricesPage,
})
```

**And** Mount sub-routes TRƯỚC `pricingDetailRoute` (`/pricing/$id`) trong `routeTree` để Hono/TanStack Router không match `/pricing/customer-prices` với `:id = customer-prices`. Tham khảo pattern Story 4.3 mount `/trashed` trước `/:id`

**And** Tab navigation trong `<PricingPageLayout>`: thêm `<Tabs>` ở header với 3 trigger:

- "Bảng giá" → `/pricing` (route hiện tại) hoặc `/pricing/lists`
- "Giá riêng KH" → `/pricing/customer-prices`
- "Giá theo SL" → `/pricing/volume-prices`

`active` state dựa vào `useLocation().pathname.startsWith('/pricing/customer-prices')`, etc.

**And** KHÔNG thay đổi `nav-items.ts` (giữ nguyên 1 entry "Bảng giá" → `/pricing`). Sub-tab điều hướng nội bộ qua `<Tabs>`

## Tasks / Subtasks

### Phase A: Schema + Migration

- [x] **Task 1: Drizzle schema `customer_prices`, `volume_prices`** (AC: #1)
  - [x] 1.1: Tạo `packages/shared/src/schema/customer-prices.ts`:
    - Bảng `customerPrices` với cột theo AC1, FK `customerId` (CASCADE), `productId` (CASCADE), `storeId` (RESTRICT)
    - Indexes: `uniq_customer_prices_customer_product` (unique), `idx_customer_prices_store_customer`, `idx_customer_prices_product`
    - KHÔNG có `deletedAt` (hard delete)
  - [x] 1.2: Tạo `packages/shared/src/schema/volume-prices.ts`:
    - Bảng `volumePrices` với cột theo AC1, FK `productId` (CASCADE), `storeId` (RESTRICT)
    - Indexes: `uniq_volume_prices_product_min_qty` (unique), `idx_volume_prices_product`, `idx_volume_prices_store_product`
    - CHECK constraint `check_volume_prices_min_qty_positive` qua `check()` helper Drizzle 0.45 (pattern Story 4.3 `check_formula_required`)
  - [x] 1.3: Export 2 schema mới từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → file `0016_sleepy_odin.sql`. Verify:
    - CREATE TABLE customer_prices + 3 indexes + 3 FK
    - CREATE TABLE volume_prices + 3 indexes + 1 CHECK + 2 FK
    - CASCADE behaviour cho `customer_id` / `product_id`
  - [x] 1.5: Drizzle generate được CHECK constraint inline trong CREATE TABLE, không cần manual SQL
  - [x] 1.6: Migration sẽ được apply tự động qua PGlite trong integration test

- [x] **Task 2: Zod schemas + types** (AC: #2-#8)
  - [ ] 2.1: Tạo `packages/shared/src/schema/customer-price-management.ts`:
    - Reuse `priceSchema` từ `price-list-management.ts` (`z.number().int().min(0).max(9_999_999_999_999)`)
    - `customerPriceNoteSchema = z.string().trim().max(255).nullable().optional()`
    - `createCustomerPriceSchema = z.object({ customerId: z.string().uuid(), productId: z.string().uuid(), price: priceSchema, note: customerPriceNoteSchema }).strict()`
    - `updateCustomerPriceSchema = z.object({ price: priceSchema.optional(), note: customerPriceNoteSchema }).strict().refine((d) => Object.keys(d).length > 0, { message: 'Cần ít nhất một trường để cập nhật' })`
    - `listCustomerPricesQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), customerId: z.string().uuid().optional(), productId: z.string().uuid().optional(), search: z.string().trim().optional() })`
    - `customerPriceListItemSchema`: zod object với mọi field theo AC3
    - Export types: `CreateCustomerPriceInput`, `UpdateCustomerPriceInput`, `ListCustomerPricesQuery`, `CustomerPriceListItem`
  - [ ] 2.2: Tạo `packages/shared/src/schema/volume-price-management.ts`:
    - `volumeMinQtySchema = z.number().int().min(1, 'Số lượng tối thiểu phải ≥ 1').max(1_000_000)`
    - `volumePriceTierInputSchema = z.object({ minQty: volumeMinQtySchema, price: priceSchema })`
    - `replaceVolumePricesSchema = z.object({ tiers: z.array(volumePriceTierInputSchema).max(5, 'Tối đa 5 mức giá theo số lượng cho mỗi sản phẩm').default([]) }).superRefine((data, ctx) => { ... })`:
      - Check duplicate `minQty`: tạo `Set`, nếu có trùng → ctx.addIssue({ path: ['tiers', i, 'minQty'], message: 'Số lượng tối thiểu không được trùng nhau' })
      - Sort copy theo `minQty` ASC → check `tiers[i+1].price < tiers[i].price` strict descending; sai → ctx.addIssue({ path: ['tiers', i+1, 'price'], message: 'Giá phải giảm dần khi số lượng tăng' })
    - `listVolumePricesQuerySchema`: page, pageSize, search
    - Response shapes: `volumePriceTierSchema = { id, minQty, price, createdAt, updatedAt }`, `volumePricesForProductSchema = { productId, productName, productSku, productSellingPrice, productCostPrice, tiers: VolumePriceTier[] }`, `volumePricesListItemSchema` (theo AC8)
    - Export types
  - [ ] 2.3: Re-export 2 schema mới từ `packages/shared/src/schema/index.ts`
  - [ ] 2.4: Co-located test `customer-price-management.test.ts`:
    - `createCustomerPriceSchema`: customerId/productId không phải uuid → fail; price âm → fail; price 0 → pass; note 256 ký tự → fail (max 255)
    - `updateCustomerPriceSchema`: empty object → fail; chỉ price → pass; gửi customerId → fail (strict)
    - `listCustomerPricesQuerySchema`: coerce page/pageSize từ string; default đúng
  - [ ] 2.5: Co-located test `volume-price-management.test.ts`:
    - `replaceVolumePricesSchema`:
      - 0 tier → pass (cho phép xoá hết)
      - 5 tier hợp lệ → pass; 6 tier → fail "Tối đa 5"
      - 2 tier `minQty` trùng → fail
      - 3 tier giá KHÔNG giảm dần (1+: 50k, 10+: 45k, 50+: 45k) → fail "Giá phải giảm dần"
      - 3 tier OK (1+: 50k, 10+: 45k, 50+: 40k) → pass
      - 1 tier có `minQty=0` → fail (≥ 1)
      - 1 tier có `price` âm → fail

- [x] **Task 3: Mở rộng audit action enum** (AC: #9)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts`: thêm 4 action `'customer_price.created'`, `'customer_price.updated'`, `'customer_price.deleted'`, `'volume_prices.replaced'` vào `auditActionSchema`
  - [x] 3.2: KHÔNG cần thêm permission mới (reuse `pricing.manage` + `pricing.view` từ Story 4.3)
  - [x] 3.3: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - 4 cặp label tiếng Việt
    - Thêm 2 ACTION_GROUPS: "Giá riêng KH" (3 actions `customer_price.*`) và "Giá theo số lượng" (1 action `volume_prices.replaced`)

### Phase B: Backend Service + Routes

- [x] **Task 4: Customer Prices service** (AC: #2-#5, #9)
  - [ ] 4.1: Tạo `apps/api/src/services/customer-prices.service.ts` theo pattern `price-list-items.service.ts`:
    - Helper `toCustomerPriceListItem(row)` map row → `CustomerPriceListItem`
    - `listCustomerPrices({ db, storeId, query })`: build conditions (customerId, productId, search escape `%/_`), LEFT JOIN customers + LEFT JOIN products, WHERE `customers.deletedAt IS NULL AND products.deletedAt IS NULL`, paginate, sort `(createdAt DESC, customers.name ASC)`
    - `getCustomerPrice({ db, storeId, id })`: ownership + alive customer/product → throw 404
    - `createCustomerPrice({ db, actor, input, meta })`:
      - Validate `customerId` cùng store + alive (1 query: `SELECT id FROM customers WHERE id = ? AND store_id = ? AND deleted_at IS NULL`) → throw NOT_FOUND
      - Validate `productId` cùng store + alive → throw NOT_FOUND
      - Insert + audit `customer_price.created` trong transaction
      - Catch DB unique violation 23505 với constraint `uniq_customer_prices_customer_product` qua `isUniqueViolation` helper → throw CONFLICT field=productId "Khách hàng đã có giá riêng cho sản phẩm này"
    - `updateCustomerPrice({ db, actor, id, input, meta })`: validate ownership, refine ≥ 1 field, update + diff audit `customer_price.updated`
    - `deleteCustomerPrice({ db, actor, id, meta })`: validate ownership, hard delete + audit `customer_price.deleted` với snapshot before
  - [ ] 4.2: Reuse `escapeLikePattern` từ `apps/api/src/lib/strings.ts`
  - [ ] 4.3: Reuse `isUniqueViolation` từ `apps/api/src/lib/pg-errors.ts`

- [x] **Task 5: Volume Prices service** (AC: #6-#8, #9)
  - [ ] 5.1: Tạo `apps/api/src/services/volume-prices.service.ts`:
    - `listVolumePrices({ db, storeId, query })`: SELECT `product_id` GROUP BY product_id có MIN/MAX/COUNT, LEFT JOIN products để lấy productName/SKU/imageUrl/sellingPrice/costPrice. WHERE `products.deletedAt IS NULL`. Search filter qua products. Sort productName ASC. Paginate. Sub-query lấy `topTiers` (3 tier đầu sort minQty ASC) qua subquery hoặc một query phụ riêng (đơn giản: load full tiers cho các product_id trong page, group ở JS layer)
    - `listVolumePricesForProduct({ db, storeId, productId })`: validate product cùng store + alive → 404; SELECT FROM volume_prices WHERE product_id, store_id, ORDER BY min_qty ASC; load product info; trả `{ productId, productName, productSku, productSellingPrice, productCostPrice, tiers }`
    - `replaceVolumePricesForProduct({ db, actor, productId, input, meta })`:
      - Validate product cùng store + alive → throw NOT_FOUND
      - Trong 1 transaction:
        - Load tiers hiện tại để lấy `tierCountBefore` cho audit
        - DELETE FROM volume_prices WHERE product_id AND store_id
        - Sort `input.tiers` theo minQty ASC trước khi insert
        - Bulk INSERT (nếu tiers.length > 0)
      - Audit `volume_prices.replaced` với `changes={ productId, tierCountBefore, tierCountAfter, tiers: [{ minQty, price }, ...] }` (snapshot mới)
      - Trả `{ productId, tiers }` đã sorted minQty ASC
  - [ ] 5.2: Helper `toVolumePriceTier(row)` map Drizzle row → `VolumePriceTier`

- [x] **Task 6: Routes `customer-prices.routes.ts` + `volume-prices.routes.ts`** (AC: #2-#9)
  - [ ] 6.1: Tạo `apps/api/src/routes/customer-prices.routes.ts` theo pattern `price-lists.routes.ts`:
    - GET `/` → listCustomerPrices (envelope `{ data, meta }`)
    - GET `/:id` → getCustomerPrice
    - POST `/` → createCustomerPrice
    - PATCH `/:id` → updateCustomerPrice
    - DELETE `/:id` → deleteCustomerPrice
    - Middleware: `requireAuth` + `requirePermission('pricing.manage')`
    - Hono factory `createCustomerPricesRoutes({ db })`
  - [ ] 6.2: Tạo `apps/api/src/routes/volume-prices.routes.ts`:
    - GET `/` → listVolumePrices (envelope `{ data, meta }`)
    - GET `/products/:productId` → listVolumePricesForProduct
    - PUT `/products/:productId` → replaceVolumePricesForProduct
    - Middleware: `requireAuth` + `requirePermission('pricing.manage')`
    - Hono factory `createVolumePricesRoutes({ db })`
  - [ ] 6.3: Mount vào `apps/api/src/index.ts` SAU `/api/v1/price-lists`:
    ```ts
    app.route('/api/v1/customer-prices', createCustomerPricesRoutes({ db }))
    app.route('/api/v1/volume-prices', createVolumePricesRoutes({ db }))
    ```

### Phase C: Frontend (apps/web)

- [ ] **Task 7: API client + TanStack Query hooks** (AC: #2-#13)
  - [ ] 7.1: Tạo `apps/web/src/features/pricing/customer-prices-api.ts` theo pattern `price-lists-api.ts`:
    - `listCustomerPricesApi(query)`, `getCustomerPriceApi(id)`, `createCustomerPriceApi(input)`, `updateCustomerPriceApi(id, input)`, `deleteCustomerPriceApi(id)`
    - Build query string: `page`, `pageSize`, `customerId`, `productId`, `search`
  - [ ] 7.2: Tạo `apps/web/src/features/pricing/volume-prices-api.ts`:
    - `listVolumePricesApi(query)`, `getVolumePricesForProductApi(productId)`, `replaceVolumePricesForProductApi(productId, input)`
  - [ ] 7.3: Tạo `apps/web/src/features/pricing/use-customer-prices.ts`:
    - `useCustomerPricesQuery(query)`: queryKey `['customer-prices', 'list', query]`, `placeholderData: keepPreviousData`
    - `useCustomerPriceQuery(id)`: queryKey `['customer-prices', id]`, enabled khi id truthy
    - Mutations: `useCreateCustomerPriceMutation`, `useUpdateCustomerPriceMutation`, `useDeleteCustomerPriceMutation` → invalidate `['customer-prices']` subtree
  - [ ] 7.4: Tạo `apps/web/src/features/pricing/use-volume-prices.ts`:
    - `useVolumePricesQuery(query)`: queryKey `['volume-prices', 'list', query]`
    - `useVolumePricesForProductQuery(productId)`: queryKey `['volume-prices', productId]`, enabled khi productId truthy
    - `useReplaceVolumePricesMutation()` → invalidate `['volume-prices']` subtree

- [ ] **Task 8: Form dialogs cho Customer Prices** (AC: #11)
  - [ ] 8.1: Tạo `apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx`:
    - Props: `open`, `onOpenChange`, `defaultCustomerId?: string`, `defaultProductId?: string` (cho future use trong trang chi tiết KH)
    - Combobox customer (load `useCustomersQuery({ pageSize: 200 })`), Combobox product (load `useProductsQuery({ pageSize: 200 })`)
    - CurrencyInput price, Textarea note
    - Real-time warning section (price vs costPrice/sellingPrice)
    - Submit: `useCreateCustomerPriceMutation`. Map CONFLICT field=productId → form.setError
    - RHF + zodResolver(createCustomerPriceSchema). Mode 'onTouched'. Reset form khi close
  - [ ] 8.2: Tạo `apps/web/src/features/pricing/components/EditCustomerPriceDialog.tsx`:
    - Props: `open`, `onOpenChange`, `customerPrice: CustomerPriceListItem`
    - Disabled customerId + productId fields (read-only display tên KH + tên SP)
    - Editable: CurrencyInput price, Textarea note
    - Submit: `useUpdateCustomerPriceMutation`
  - [ ] 8.3: Tạo `apps/web/src/features/pricing/components/DeleteCustomerPriceDialog.tsx`:
    - AlertDialog "Xoá giá riêng cho {customerName} - {productName}?" + handle 422 toast (nếu có)

- [ ] **Task 9: List components + Manager cho Customer Prices** (AC: #10)
  - [ ] 9.1: Tạo `apps/web/src/features/pricing/components/CustomerPricesTable.tsx`:
    - Props: `data: CustomerPriceListItem[]`, `onEdit`, `onDelete`
    - Cột theo AC10. Compute `priceDelta = (price - productSellingPrice) / productSellingPrice * 100` (% chênh lệch)
    - Badge logic: ≤ giá lẻ → xanh; > giá lẻ → đỏ; = giá lẻ → xám
  - [ ] 9.2: Tạo `apps/web/src/features/pricing/components/CustomerPricesCardList.tsx` (mobile)
  - [ ] 9.3: Tạo `apps/web/src/features/pricing/components/CustomerPricesFilters.tsx`:
    - Input search (parent debounce 300ms), Select customer, Select product
  - [ ] 9.4: Tạo `apps/web/src/features/pricing/components/CustomerPricesManager.tsx`:
    - State: filters, page, dialogs (create/edit/delete)
    - `useCustomerPricesQuery(apiQuery)` debounce search 300ms
    - Render header + filters + table/cardlist + pagination + dialogs
  - [ ] 9.5: Tạo `apps/web/src/pages/customer-prices-page.tsx` render `<CustomerPricesManager />`

- [ ] **Task 10: Volume Prices dialog + manager** (AC: #12, #13)
  - [ ] 10.1: Tạo `apps/web/src/features/pricing/components/VolumePricesDialog.tsx`:
    - Props: `open`, `onOpenChange`, `productId`, `productName`, `productSku`, `productSellingPrice`, `productCostPrice`
    - Load `useVolumePricesForProductQuery(productId, { enabled: open })` để init tiers
    - RHF + `useFieldArray` cho `tiers`. zodResolver(replaceVolumePricesSchema)
    - List 0-5 tier rows. Nút "+ Thêm mức giá" (disable khi đã 5 tier)
    - Real-time validation hiển thị inline lỗi RHF (formState.errors.tiers[i])
    - Preview section: render bảng "Khoảng SL → Giá" (sort tiers theo minQty ASC, ghép range)
    - Footer: Hủy + Lưu (disable `!isValid || isPending`)
    - Submit: sort tiers ASC, gọi `useReplaceVolumePricesMutation` → toast + invalidate
  - [ ] 10.2: Tạo `apps/web/src/features/pricing/components/VolumePricesTable.tsx` (cột theo AC13)
  - [ ] 10.3: Tạo `apps/web/src/features/pricing/components/VolumePricesCardList.tsx`
  - [ ] 10.4: Tạo `apps/web/src/features/pricing/components/SelectProductForVolumePricesDialog.tsx`:
    - Combobox sản phẩm (load `useProductsQuery({ pageSize: 200 })`)
    - Submit → callback parent mở `<VolumePricesDialog>` cho SP đã chọn
  - [ ] 10.5: Tạo `apps/web/src/features/pricing/components/VolumePricesManager.tsx`:
    - State: filters, page, dialogs (select product, edit, confirm delete)
    - `useVolumePricesQuery(apiQuery)` debounce search 300ms
    - Render toolbar + table/cardlist + pagination + dialogs
  - [ ] 10.6: Tạo `apps/web/src/pages/volume-prices-page.tsx` render `<VolumePricesManager />`

- [ ] **Task 11: Tab navigation trong /pricing + routing** (AC: #14)
  - [ ] 11.1: Tạo `apps/web/src/features/pricing/components/PricingTabsHeader.tsx`:
    - Props: không có (component đọc `useLocation` từ TanStack Router)
    - Render `<Tabs>` với 3 trigger: "Bảng giá" (`/pricing`), "Giá riêng KH" (`/pricing/customer-prices`), "Giá theo SL" (`/pricing/volume-prices`)
    - Compute active từ `pathname`: nếu pathname startsWith `/pricing/customer-prices` → tab 2; startsWith `/pricing/volume-prices` → tab 3; else tab 1
    - Click tab → `navigate({ to: ... })` của TanStack Router
  - [ ] 11.2: Sửa `apps/web/src/pages/pricing-page.tsx` (Story 4.3) để render `<PricingTabsHeader />` ở đầu, dưới đó là `<PriceListsManager />` hiện tại
  - [ ] 11.3: Trang `customer-prices-page.tsx` và `volume-prices-page.tsx` cũng render `<PricingTabsHeader />` ở đầu để consistency
  - [ ] 11.4: Sửa `apps/web/src/router.tsx`:
    - Thêm import `CustomerPricesPage`, `VolumePricesPage`
    - Tạo 2 route `pricingCustomerPricesRoute` và `pricingVolumePricesRoute` theo AC14
    - **CRITICAL**: Mount 2 route mới TRƯỚC `pricingDetailRoute` trong `routeTree`. Nếu không, TanStack Router có thể match `/pricing/customer-prices` với param `:id = customer-prices`
    - Verify pattern bằng test thủ công: navigate `/pricing/customer-prices` → load đúng page, KHÔNG gọi `/api/v1/price-lists/customer-prices`

### Phase D: Tests + Manual verify

- [ ] **Task 12: Unit tests cho schemas + helpers** (AC: tất cả)
  - [ ] 12.1: `packages/shared/src/schema/customer-price-management.test.ts` (mô tả ở 2.4)
  - [ ] 12.2: `packages/shared/src/schema/volume-price-management.test.ts` (mô tả ở 2.5)

- [x] **Task 13: API integration tests** (AC: #1-#9)
  - [ ] 13.1: `apps/api/src/__tests__/customer-prices.integration.test.ts` (Vitest + PGlite, pattern từ `price-lists.integration.test.ts`):
    - **Setup**: tạo store + owner + manager + staff + 2 customers + 5 products
    - **Create**: Owner OK 201; Manager OK; Staff 403; customerId không cùng store → 404; productId không cùng store → 404; trùng (customerId, productId) → 409 field=productId; price âm → 400 schema
    - **List**: filter store; filter customerId; filter productId; search escape `%`; pagination; loại trừ row có customer/product đã bị soft delete
    - **Update**: refine ≥ 1 field; KHÔNG cho sửa customerId/productId (strict reject); audit diff đúng
    - **Delete**: hard delete; audit ghi snapshot before
    - **Audit**: ghi đủ 3 actions; actorRole đúng
    - **Multi-tenant**: store A không xem/sửa/xoá customer_price của store B
    - **Cascade DELETE**: xoá customer (hard delete bypass soft delete) → customer_prices của customer đó tự bị xoá theo (CASCADE)
  - [ ] 13.2: `apps/api/src/__tests__/volume-prices.integration.test.ts`:
    - **Setup**: store + owner + manager + staff + 3 products
    - **Replace 0 tier**: gửi `tiers: []` → DELETE all + audit `volume_prices.replaced` với `tierCountAfter=0`
    - **Replace 5 tier OK**: 1+:50k, 10+:45k, 50+:40k, 100+:35k, 200+:30k → 200, sort ASC trả về
    - **Replace 6 tier**: gửi 6 tier → 400 "Tối đa 5"
    - **Duplicate minQty**: 2 tier minQty=10 → 400 "không được trùng nhau"
    - **Price không giảm dần**: (1+:50k, 10+:45k, 50+:45k) → 400 "Giá phải giảm dần"
    - **MinQty=0**: 1 tier minQty=0 → 400 (≥1)
    - **DB CHECK constraint**: cố tình INSERT raw với min_qty=0 → DB throw error (test phụ trợ)
    - **Replace cùng productId 2 lần**: cả 2 lần đều thành công, lần 2 ghi đè hoàn toàn lần 1 (DELETE + INSERT)
    - **List**: filter store; loại sản phẩm đã soft delete; group đúng; topTiers chỉ có 3 đầu; tierCount/minPrice/maxPrice đúng
    - **Get for product**: product không cùng store → 404; product alive nhưng chưa có tier → trả `tiers: []`
    - **Permission**: Manager OK; Staff 403
    - **Multi-tenant**: store A không thấy volume_prices của store B
    - **Cascade**: hard delete product → volume_prices của product đó bị xoá theo

- [ ] **Task 14: Frontend manual verify + lint/typecheck** (AC: tất cả)
  - [ ] 14.1: `pnpm typecheck` pass tất cả packages
  - [ ] 14.2: `pnpm lint` pass (0 errors)
  - [ ] 14.3: `pnpm test` pass toàn bộ suite (không regression Story 4.3)
  - [ ] 14.4: Manual flow Owner desktop:
    - Login Owner → /pricing → thấy TabBar 3 tab
    - Click tab "Giá riêng KH" → navigate `/pricing/customer-prices` → empty state → click "Thêm giá riêng"
    - Dialog: chọn KH "Nguyễn Văn A", chọn SP "Coca Cola 330ml" (giá lẻ 15.000đ, vốn 10.000đ), nhập price 12.000đ, note "Khách thân thiết" → preview thấy "Giảm 20% so với giá lẻ" → submit → toast → bảng list hiển thị 1 row
    - Tạo thêm 1 row trùng (cùng KH + SP) → form hiển thị error "Khách hàng đã có giá riêng cho sản phẩm này"
    - Tạo 1 row với price=5.000đ (< giá vốn 10.000đ) → preview hiện cảnh báo đỏ "Dưới giá vốn" → vẫn submit OK (Story 4.4 không block)
    - Sửa row đầu tiên xuống 11.000đ → toast → table cập nhật
    - Xoá row → confirm → toast → row biến mất
    - Click tab "Giá theo SL" → navigate `/pricing/volume-prices` → empty state → click "Thiết lập giá theo SL" → chọn SP "Bia Saigon" (giá lẻ 12.000đ) → mở dialog
    - Dialog VolumePricesDialog: tier mặc định `minQty=1, price=12.000đ`. Click "+ Thêm mức giá" → tier 2 `minQty=10, price=11.000`. Thêm 3 tier nữa: 50/10.000, 100/9.000, 200/8.000 → click "+ Thêm" → button DISABLE (đã 5 tier)
    - Sửa tier 3 thành `minQty=10, price=10.000` → row có lỗi đỏ "minQty trùng tier khác" → submit disable
    - Sửa lại đúng (50/10.000) → preview "1-9: 12.000đ • 10-49: 11.000đ • 50-99: 10.000đ • 100-199: 9.000đ • ≥ 200: 8.000đ" → submit → toast → list manager hiển thị 1 row
    - Sửa tier 4 thành `price=12.000đ` (không giảm dần) → submit fail → form error
    - Xoá tất cả tier → submit `tiers: []` → toast "Đã xoá giá theo số lượng" → row biến mất khỏi list manager
  - [ ] 14.5: Manual mobile (DevTools 375px): cardlist hiển thị đúng, dialog VolumePrices scroll OK, tab navigation responsive
  - [ ] 14.6: Manual permission: Manager có quyền pricing.manage → OK; Staff truy cập `/pricing/customer-prices` → redirect `/`
  - [ ] 14.7: Manual audit: Owner thực hiện đủ 4 audit actions → /settings/audit thấy 4 record với label tiếng Việt + 2 group "Giá riêng KH", "Giá theo số lượng"
  - [ ] 14.8: Manual route order: navigate `/pricing/customer-prices` → load CustomerPricesPage; navigate `/pricing/<random-uuid>` → load PricingDetailPage. KHÔNG bị nhầm match

## Dev Notes

### Pattern reuse từ Story 4.1, 4.3 (BẮT BUỘC tuân thủ)

| Khu vực                           | File hiện có                                                                | Cách dùng                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Drizzle schema bigint integer VND | `packages/shared/src/schema/price-list-items.ts:price`                      | `bigint({ mode: 'number' })` cho `price` cả 2 bảng. Range an toàn ≤ 2^53                                |
| CHECK constraint helper           | `packages/shared/src/schema/price-lists.ts:check_formula_required`          | Dùng `check()` từ `drizzle-orm/pg-core` cho `check_volume_prices_min_qty_positive`                      |
| FK CASCADE pattern                | `packages/shared/src/schema/price-list-items.ts:onDelete: 'cascade'`        | `customer_prices.customerId/productId` CASCADE; `volume_prices.productId` CASCADE                       |
| Discriminated/refine validation   | `packages/shared/src/schema/price-list-management.ts:createPriceListSchema` | Pattern `superRefine` cho cross-field validation (volume tiers giảm dần, không trùng minQty)            |
| PG error helper                   | `apps/api/src/lib/pg-errors.ts`                                             | `isUniqueViolation(err, 'uniq_customer_prices_customer_product')` để map → CONFLICT                     |
| String escape                     | `apps/api/src/lib/strings.ts:escapeLikePattern`                             | Áp dụng cho mọi search query LIKE (search KH/SP)                                                        |
| Audit logging                     | `apps/api/src/services/audit.service.ts`                                    | `logAction` trong cùng transaction. `diffObjects` cho update audit                                      |
| ApiError                          | `apps/api/src/lib/errors.ts`                                                | VALIDATION_ERROR / NOT_FOUND / CONFLICT / BUSINESS_RULE_VIOLATION                                       |
| Hono route                        | `apps/api/src/routes/price-lists.routes.ts`                                 | Hono factory function `createCustomerPricesRoutes({ db })`. uuidParam param, parseJson body             |
| API client                        | `apps/web/src/features/pricing/price-lists-api.ts`                          | apiClient.get/post/patch/delete + buildQueryString helper                                               |
| Query hooks pattern               | `apps/web/src/features/pricing/use-price-lists.ts`                          | queryKey `['customer-prices', ...]` + `keepPreviousData`. Mutation invalidate subtree                   |
| Form pattern                      | `apps/web/src/features/customers/components/CustomerForm.tsx`               | RHF + zodResolver, mode 'onTouched', handleApiError, disable Save khi `!isValid \|\| isPending`         |
| useFieldArray pattern             | (chưa có precedent rõ trong project) — pattern RHF chuẩn                    | Cho `<VolumePricesDialog>` với 0-5 tier rows. Reference: https://react-hook-form.com/docs/usefieldarray |
| Permission guard route            | `apps/web/src/router.tsx:requirePermissionGuard`                            | `requirePermissionGuard('pricing.manage')` cho 2 route mới                                              |
| Empty state                       | `apps/web/src/components/shared/empty-state.tsx`                            | Reuse cho list rỗng                                                                                     |
| Pagination                        | `apps/web/src/components/shared/pagination.tsx`                             | Reuse                                                                                                   |
| CurrencyInput                     | `apps/web/src/components/shared/currency-input.tsx`                         | Cho price                                                                                               |
| AlertDialog                       | `apps/web/src/components/ui/alert-dialog.tsx`                               | Confirm xoá customer_price + clear all volume tiers                                                     |
| Tabs                              | `apps/web/src/components/ui/tabs.tsx` (shadcn)                              | TabBar 3 tab trong `/pricing` layout                                                                    |
| Currency helper                   | `apps/web/src/lib/currency.ts`                                              | `formatVnd`, `parseVnd` reuse                                                                           |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `customer-prices.ts` (Drizzle table + 3 indexes + 3 FK)
- `volume-prices.ts` (Drizzle table + 3 indexes + 1 CHECK + 2 FK)
- `customer-price-management.ts` (Zod create/update/list schemas + response types)
- `customer-price-management.test.ts`
- `volume-price-management.ts` (Zod replace schema với superRefine + response types)
- `volume-price-management.test.ts`

**Backend (`apps/api/src/`):**

- `services/customer-prices.service.ts`
- `services/volume-prices.service.ts`
- `routes/customer-prices.routes.ts`
- `routes/volume-prices.routes.ts`
- `__tests__/customer-prices.integration.test.ts`
- `__tests__/volume-prices.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/pricing/customer-prices-api.ts`
- `features/pricing/volume-prices-api.ts`
- `features/pricing/use-customer-prices.ts`
- `features/pricing/use-volume-prices.ts`
- `features/pricing/components/CreateCustomerPriceDialog.tsx`
- `features/pricing/components/EditCustomerPriceDialog.tsx`
- `features/pricing/components/DeleteCustomerPriceDialog.tsx`
- `features/pricing/components/CustomerPricesTable.tsx`
- `features/pricing/components/CustomerPricesCardList.tsx`
- `features/pricing/components/CustomerPricesFilters.tsx`
- `features/pricing/components/CustomerPricesManager.tsx`
- `features/pricing/components/VolumePricesDialog.tsx`
- `features/pricing/components/VolumePricesTable.tsx`
- `features/pricing/components/VolumePricesCardList.tsx`
- `features/pricing/components/SelectProductForVolumePricesDialog.tsx`
- `features/pricing/components/VolumePricesManager.tsx`
- `features/pricing/components/PricingTabsHeader.tsx`
- `pages/customer-prices-page.tsx`
- `pages/volume-prices-page.tsx`

**Migration (`apps/api/src/db/migrations/`):**

- `0015_*.sql` (CREATE TABLE customer_prices + volume_prices + indexes + CHECK + FKs)
- `meta/0015_snapshot.json`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export `customer-prices`, `volume-prices`, `customer-price-management`, `volume-price-management`
- `packages/shared/src/schema/audit-log.ts`: thêm 4 audit actions
- `apps/api/src/index.ts`: mount `/api/v1/customer-prices` và `/api/v1/volume-prices`
- `apps/web/src/router.tsx`: thêm 2 route `/pricing/customer-prices` và `/pricing/volume-prices`. Mount TRƯỚC `pricingDetailRoute`
- `apps/web/src/pages/pricing-page.tsx`: thêm `<PricingTabsHeader />` ở đầu (giữ nguyên `<PriceListsManager />` đã có)
- `apps/web/src/features/audit/action-labels.ts`: thêm 4 label + 2 group

### Coupling với các epic khác

**Story 4.1 (Khách hàng) — done:**

- Cột `customers.id` đã có làm FK target cho `customer_prices.customer_id`
- Cascade delete: nếu hard delete customer (story 4.1 chỉ soft delete, không hard) → customer_prices CASCADE xoá. Soft delete customer → customer_prices vẫn tồn tại nhưng query LIST loại bỏ qua `customers.deleted_at IS NULL` filter (xem H1 dưới)

**Story 4.2 (Trang chi tiết KH) — backlog:**

- Story 4.4 KHÔNG triển khai trang chi tiết KH. Story 4.2 sau này sẽ có tab "Giá riêng" reuse `<CustomerPricesTable customerId={customer.id} />` và `<CreateCustomerPriceDialog defaultCustomerId={customer.id} />`. Story 4.4 thiết kế component tách rời để 4.2 reuse được

**Story 4.3 (Bảng giá Direct/Formula) — review:**

- KHÔNG đụng vào `price_lists` / `price_list_items`. Hệ thống 6 tầng giá Story 4.5 sẽ orchestrate
- Reuse `priceSchema` (integer VND), `pricing.manage` permission, audit pattern, escapeLikePattern, isUniqueViolation từ pattern Story 4.3 đã chuẩn hoá
- Reuse trang `/pricing` làm parent, thêm 2 sub-route mới qua TabBar

**Story 4.3b (Chain Formula, Clone, Import) — backlog:**

- Không liên quan trực tiếp

**Story 4.3c (So sánh bảng giá) — backlog:**

- Không liên quan trực tiếp

**Story 4.4b (Chiết khấu danh mục & Kiểm soát sửa giá) — backlog:**

- Story 4.4b sẽ tạo bảng `category_discounts` (KHÔNG đụng `customer_prices`/`volume_prices`)
- Story 4.4b sẽ thêm permission/PIN flow cho POS sửa giá dưới vốn — không liên quan story 4.4

**Story 4.5 (POS 6-tier integration) — backlog:**

- Pricing engine 6 tầng sẽ resolve theo thứ tự: (1) `customer_prices` → (2) `category_discounts` → (3) manual edit → (4) `volume_prices` → (5) `price_list_items` qua `customer_groups.default_price_list_id` → (6) `products.selling_price`
- Story 4.4 expose 2 query helper cho 4.5:
  - `findCustomerPriceForCustomerProduct(customerId, productId)` → trả 1 row hoặc null
  - `findVolumePriceForProductQty(productId, quantity)` → trả tier có max `min_qty <= quantity` hoặc null
- Story 4.5 sẽ thêm endpoint `GET /api/v1/pricing/resolve` cho Staff (perm `pricing.view`). Story 4.4 KHÔNG triển khai endpoint này

**Story 5.x (Công nợ) — backlog:**

- Không trực tiếp coupling

### Logic priority (giải thích để dev không hiểu sai)

**6 tầng giá ưu tiên (Story 4.5 sẽ implement, Story 4.4 chỉ chuẩn bị data):**

| Tầng | Tên                    | Bảng / Field                                                    | Story implement  |
| ---- | ---------------------- | --------------------------------------------------------------- | ---------------- |
| 1    | Giá riêng KH           | `customer_prices` (customerId + productId → price)              | **Story 4.4**    |
| 2    | Chiết khấu danh mục    | `category_discounts` (Story 4.4b)                               | Story 4.4b       |
| 3    | Giá chỉnh tay (manual) | Field `unitPrice` trong order item (POS Story 3.x/4.5 set)      | Story 4.5        |
| 4    | Giá theo số lượng      | `volume_prices` (productId + minQty → price)                    | **Story 4.4**    |
| 5    | Bảng giá nhóm KH       | `price_list_items` join `customer_groups.default_price_list_id` | Story 4.3 + 4.5  |
| 6    | Giá bán lẻ             | `products.selling_price`                                        | Story 2.2 (done) |

**Story 4.4 ONLY persists data (tầng 1 và 4). Pricing engine resolve thứ tự là Story 4.5.**

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement pricing engine 6 tầng ở story 4.4 — Story 4.5
- KHÔNG implement category_discounts (tầng 2) ở story 4.4 — Story 4.4b
- KHÔNG implement PIN flow / kiểm soát sửa giá nhân viên ở story 4.4 — Story 4.4b
- KHÔNG implement endpoint `/api/v1/pricing/resolve` cho POS — Story 4.5
- KHÔNG cho phép > 5 tier volume_prices (validate ở Zod + UI)
- KHÔNG cho phép `min_qty = 0` hoặc âm (DB CHECK + Zod)
- KHÔNG cho phép giá KHÔNG giảm dần (Zod superRefine, không relax thành `>=`)
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho price. Dùng `bigint` integer VND
- KHÔNG block submit khi `price < productCostPrice` ở backend story 4.4 — chỉ warning UI. Story 4.4b sẽ thêm PIN flow cho POS
- KHÔNG soft delete `customer_prices` / `volume_prices` (hard delete OK, audit log lưu trace)
- KHÔNG bypass `storeId` filter trong service queries
- KHÔNG bypass `customers.deleted_at IS NULL` / `products.deleted_at IS NULL` filter trong list query
- KHÔNG cho phép sửa `customer_id` / `product_id` qua PATCH (immutable, dùng `.strict()` Zod loại bỏ)
- KHÔNG track từng tier riêng trong audit. Dùng 1 action `volume_prices.replaced` với snapshot (gọn, dễ đọc)
- KHÔNG mount `/pricing/customer-prices` SAU `/pricing/$id` trong router (TanStack Router match `:id = customer-prices` nếu sai thứ tự — pattern lỗi tương tự Hono Story 4.3 `/trashed`)
- KHÔNG dùng substring match cho PG error detection — match `err.code` + `constraint_name` cụ thể (1 unique constraint trong story này: `uniq_customer_prices_customer_product`)
- KHÔNG bỏ `disabled={!isValid || isPending}` trên nút Lưu của mọi form
- KHÔNG quên xử lý orphan rows khi customer/product bị soft delete (xem H1)
- KHÔNG submit volume_prices KHÔNG sort theo minQty ASC từ client. Server sort lại defensive nhưng client cũng phải sort

### Project Structure Notes

Tuân theo pattern hiện tại Story 4.1 + 4.3:

- Feature folder flat: `features/pricing/components/CustomerPricesManager.tsx` (gom cả customer-prices + volume-prices vào `pricing/` thay vì tạo `customer-prices/` riêng — vì cùng concept "đơn giá", người dùng đi qua trang `/pricing` chung)
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (không file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.x/4.1/4.3):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat
- Architecture viết `features/pricing/` thì nay implement `features/pricing/components/...` — thêm customer-prices + volume-prices vào cùng feature folder, không tách riêng

### Lưu ý đặc thù Story 4.4

**H1 — Orphan rows khi customer/product soft delete:**

- `customer_prices.customer_id` FK CASCADE chỉ trigger khi HARD delete customer. Story 4.1 chỉ SOFT delete (`deleted_at = NOW()`) → row customer_prices vẫn tồn tại
- Solution Story 4.4: list query LEFT JOIN + WHERE `customers.deleted_at IS NULL AND products.deleted_at IS NULL` → orphan rows ẨN khỏi UI
- Khi restore customer (Story 4.1 có endpoint restore) → customer_prices của customer đó lại HIỆN trở lại tự nhiên (vì JOIN filter bỏ qua orphan)
- KHÔNG cần cleanup job ở story 4.4. Nếu cần cleanup orphan trong tương lai (sau khi business confirm) → tạo migration riêng hoặc cron job. **Defer xử lý orphan**

**H2 — Volume prices preview tier ranges:**

- Khi UI hiển thị "1-9: 12.000đ • 10-49: 11.000đ", range cuối tier i = `tiers[i+1].minQty - 1`. Tier cuối hiển thị "≥ minQty"
- Nếu chỉ có 1 tier `minQty=1, price=X` → hiển thị "Mọi số lượng: Xđ" hoặc "≥ 1: Xđ"
- Helper pure function `formatVolumeTierRange(tiers, index): string` đặt trong `apps/web/src/features/pricing/utils/volume-tier-format.ts` để reuse + test

**H3 — useFieldArray với RHF:**

- Mỗi tier row có id RHF tự sinh (`field.id`) làm React `key`. KHÔNG dùng `index` làm key (gây bug khi remove)
- Khi append/remove tier → trigger validation lại toàn bộ array để superRefine update lỗi mọi row liên quan (vd thêm tier 4 với price > tier 3 → tier 4 hiển thị lỗi NGAY)
- `formState.isValid` reflect đúng kết quả superRefine

**H4 — Cảnh báo "dưới giá vốn" UI-only:**

- Story 4.4 KHÔNG block creation/edit khi price < productCostPrice. Chỉ warning đỏ trong dialog
- Lý do: chủ cửa hàng có lý do hợp lệ (KH VIP, hợp đồng, clearance). Block sẽ làm chính sách giá kém linh hoạt
- Story 4.4b sẽ thêm PIN flow ở POS (KHI BÁN, không phải khi cài đặt giá)

**H5 — TabBar trong /pricing:**

- TanStack Router match `pathname` với `currentPath`. Khi user trên `/pricing/customer-prices` → tab 2 active
- KHÔNG dùng `<Link>` từ shadcn; dùng `<Link>` của TanStack Router để giữ SPA navigation
- Active state: `pathname === '/pricing'` → tab 1; `pathname.startsWith('/pricing/customer-prices')` → tab 2; `pathname.startsWith('/pricing/volume-prices')` → tab 3; còn lại (vd `/pricing/<uuid>`) → tab 1

**H6 — Replace strategy cho volume_prices:**

- API `PUT /api/v1/volume-prices/products/:productId` thay thế HOÀN TOÀN tiers của 1 SP. Lý do:
  - UI thường edit toàn bộ list (không có flow "thêm 1 tier"/"sửa 1 tier" độc lập)
  - Race condition: nếu 2 user mở dialog cùng lúc → user save sau ghi đè user save trước. Acceptable cho MVP (chỉ Owner+Manager truy cập, ít người dùng)
- KHÔNG triển khai POST/PATCH/DELETE riêng cho từng tier ở story 4.4 (over-engineering)
- Audit `volume_prices.replaced` ghi snapshot mới (không diff vì replace toàn bộ): `changes={ productId, tierCountBefore, tierCountAfter, tiers: [...] }`

**H7 — Concurrency cho replaceVolumePricesForProduct:**

- DELETE + INSERT trong 1 transaction → atomicity OK
- Không dùng `SELECT ... FOR UPDATE` ở story 4.4 (MVP). Nếu future cần lock → có thể thêm (nhưng pglite test có thể chậm)

**H8 — Validate price < productCostPrice ở backend:**

- Story 4.4 KHÔNG validate. UI cảnh báo là đủ. Story 4.4b sẽ enforce cho POS (PIN flow)
- Audit log vẫn ghi giá thật (không che giấu) → owner có thể review lịch sử bất thường

**H9 — UX tabs vs sidebar:**

- Quyết định trong AC10/AC14: KHÔNG thêm 2 entry vào sidebar nav-items. Lý do giảm tải sidebar (đã 8 entries)
- Tabs trong `/pricing` là pattern phổ biến (Settings nested tabs, Customer detail tabs Story 4.2 sẽ dùng). Trade-off: phải nhớ vào /pricing rồi mới thấy 3 tab — chấp nhận được

**H10 — Reuse `priceSchema` từ Story 4.3:**

- `packages/shared/src/schema/price-list-management.ts` đã export `priceSchema` (integer VND ≥ 0, max 9_999_999_999_999)
- Story 4.4 import dùng lại, KHÔNG redefine

### Permission matrix (story này)

| Permission       | Owner | Manager | Staff | Resource                                                                                                                  |
| ---------------- | ----- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `pricing.manage` | ✅    | ✅      | ❌    | CRUD customer_prices, replace volume_prices, /pricing/customer-prices + /pricing/volume-prices UI                         |
| `pricing.view`   | ✅    | ✅      | ✅    | Reserved cho Story 4.5 (POS pricing engine resolve giá riêng KH + giá theo SL). Story 4.4 không expose endpoint cho Staff |

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.4]
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.4b] (boundary: chiết khấu danh mục + PIN là 4.4b)
- [Source: _bmad-output/planning-artifacts/epics/epic-4-khch-hng-h-thng-n-gi.md#Story 4.5] (downstream: POS 6-tier integration)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR17, FR18] (giá riêng KH, giá theo SL)
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR20] (6 tầng ưu tiên)
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M2: Đơn giá]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Currency, Pagination, Validation Flow, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Authorization 3 Role]
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md#Pattern soft delete + partial unique + Coupling Story 4.3]
- [Source: _bmad-output/implementation-artifacts/4-3-bang-gia-direct-formula.md#Pattern bigint price, CHECK constraint, escapeLikePattern, audit, route order]
- [Source: packages/shared/src/schema/customers.ts] (FK target cho customer_prices.customer_id)
- [Source: packages/shared/src/schema/products.ts] (FK target cho cả 2 bảng product_id)
- [Source: packages/shared/src/schema/price-lists.ts] (pattern check() helper, bigint, soft delete reference)
- [Source: packages/shared/src/schema/price-list-items.ts] (pattern bigint price, FK CASCADE)
- [Source: packages/shared/src/schema/price-list-management.ts] (export `priceSchema` reuse)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum)
- [Source: packages/shared/src/constants/permissions.ts] (đã có `pricing.manage` + `pricing.view` từ Story 4.3)
- [Source: apps/api/src/services/customers.service.ts] (pattern listCustomers + paginate + LEFT JOIN)
- [Source: apps/api/src/services/price-list-items.service.ts] (pattern toItem + ensurePriceListAlive + crud)
- [Source: apps/api/src/services/price-lists.service.ts] (pattern ownership validation + audit)
- [Source: apps/api/src/services/audit.service.ts] (logAction + diffObjects + getRequestMeta)
- [Source: apps/api/src/lib/pg-errors.ts] (isUniqueViolation)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern)
- [Source: apps/api/src/routes/price-lists.routes.ts] (factory route + uuidParam + parseJson)
- [Source: apps/api/src/db/migrations/0013_*.sql, 0014_*.sql] (pattern manual SQL append cho CHECK + FK)
- [Source: apps/web/src/router.tsx:requirePermissionGuard, route order pattern] (pattern guard cho pricing.manage + mount sub-routes trước :id)
- [Source: apps/web/src/components/layout/nav-items.ts] (KHÔNG thêm entry mới, dùng tab nội bộ)
- [Source: apps/web/src/features/customers/components/CustomerForm.tsx] (pattern form RHF + zodResolver)
- [Source: apps/web/src/features/pricing/components/CreatePriceListDialog.tsx] (pattern dialog + RHF + form.setError + handleApiError)
- [Source: apps/web/src/features/pricing/components/PriceListsManager.tsx] (pattern manager state + filters + pagination + dialogs)
- [Source: apps/web/src/features/pricing/use-price-lists.ts] (pattern queryKey + invalidate subtree)
- [Source: apps/web/src/components/shared/currency-input.tsx, empty-state.tsx, pagination.tsx] (reuse)
- [Web: React Hook Form useFieldArray](https://react-hook-form.com/docs/usefieldarray) (cho VolumePricesDialog)
- [Web: Zod superRefine](https://zod.dev/?id=superrefine) (cho cross-field validation tiers giảm dần)
- [Web: PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Web: TanStack Router code-based routing](https://tanstack.com/router/latest/docs/framework/react/guide/code-based-routing) (mount sub-routes trước :id)

## Dev Agent Record

### Agent Model Used

(điền khi dev-story chạy)

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **2026-04-29 Review Follow-up**: Fix 8/8 patches từ code review (4 MEDIUM + 4 LOW). Tests `customer-prices.integration` và `volume-prices.integration` chạy 46/46 pass. Typecheck `api` + `web` đều OK. Files thay đổi:
  - `apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx` (Patch 1, 7)
  - `apps/web/src/features/pricing/components/EditCustomerPriceDialog.tsx` (Patch 2)
  - `apps/web/src/features/pricing/components/VolumePricesDialog.tsx` (Patch 3, 6)
  - `apps/web/src/features/pricing/components/VolumePricesTable.tsx` (Patch 4)
  - `apps/web/src/features/pricing/components/VolumePricesCardList.tsx` (Patch 4 — consistent UX mobile)
  - `apps/web/src/features/pricing/components/VolumePricesManager.tsx` (Patch 4 — handler + AlertDialog confirm)
  - `apps/api/src/services/customer-prices.service.ts` (Patch 5 — defensive storeId filter trong UPDATE)
  - `apps/api/src/services/volume-prices.service.ts` (Patch 8 — cast `::int` cho min/max)

### Review Findings

Code review adversarial completed 2026-04-29 (3 lớp: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Tổng 14 findings sau dedupe: 0 decision-needed, 8 patch (4 MEDIUM, 4 LOW), 4 defer (pre-existing/MVP-acceptable), 2 dismiss.

**`patch` findings (cần fix):**

- [x] [Review][Patch][MEDIUM] AC11 violation `CreateCustomerPriceDialog` Save button operator precedence sai [apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx:242] — `disabled={mutation.isPending || !form.formState.isValid && form.formState.isSubmitted}` thiếu ngoặc, intent thực sự là `!isValid || isPending` theo spec AC11. Fix: `disabled={mutation.isPending || !form.formState.isValid}`. **FIXED 2026-04-29**.
- [x] [Review][Patch][MEDIUM] AC11 violation `EditCustomerPriceDialog` Save button không check `!isValid` [apps/web/src/features/pricing/components/EditCustomerPriceDialog.tsx:131] — Spec yêu cầu disable khi `!isValid || isPending`. Code chỉ check `isPending`. Fix: `disabled={mutation.isPending || !form.formState.isValid}`. **FIXED 2026-04-29**.
- [x] [Review][Patch][MEDIUM] AC12 violation `VolumePricesDialog` không seed 1 tier mặc định khi mở [apps/web/src/features/pricing/components/VolumePricesDialog.tsx:82-84] — Spec AC12 yêu cầu init `[{ minQty: 1, price: productSellingPrice }]` khi SP chưa có tier. Code reset thành `tiers: []`. Fix: thay default thành `[{ minQty: 1, price: productSellingPrice ?? 0 }]`. **FIXED 2026-04-29**: seed tier mặc định cả khi `detail.tiers` rỗng (sau khi load từ API) lẫn khi `detail` chưa có (dùng prop `productSellingPrice` fallback).
- [x] [Review][Patch][MEDIUM] AC13 violation `VolumePricesTable` thiếu nút Trash2 xoá toàn bộ tiers [apps/web/src/features/pricing/components/VolumePricesTable.tsx:75-79] — Spec AC13 + Task 10.5 yêu cầu cột Thao tác có Pencil + Trash2. Code chỉ có Pencil. Fix: thêm `onClearAll` prop, button Trash2 gọi `replaceVolumePricesMutation(productId, { tiers: [] })` qua AlertDialog confirm. **FIXED 2026-04-29**: thêm prop `onClear` cho cả VolumePricesTable + VolumePricesCardList; VolumePricesManager xử lý confirm qua AlertDialog + gọi `useReplaceVolumePricesMutation` với `tiers: []`.
- [x] [Review][Patch][LOW] Defensive: UPDATE customer_prices không filter storeId [apps/api/src/services/customer-prices.service.ts:348] — Đã check ownership trước, nhưng UPDATE WHERE chỉ `eq(id)`. Fix: `where(and(eq(customerPrices.id, id), eq(customerPrices.storeId, actor.storeId)))` để defensive race condition. **FIXED 2026-04-29**.
- [x] [Review][Patch][LOW] AC11 form mode `VolumePricesDialog` dùng 'onChange' thay vì 'onTouched' [apps/web/src/features/pricing/components/VolumePricesDialog.tsx:67] — Spec không bắt buộc nhưng các form khác trong codebase dùng 'onTouched'. Đổi để consistency. **FIXED 2026-04-29**.
- [x] [Review][Patch][LOW] `handleApiError` trong CreateCustomerPriceDialog VALIDATION_ERROR fall-through gọi cả `form.setError` và `showError` [apps/web/src/features/pricing/components/CreateCustomerPriceDialog.tsx:302-314] — Sau loop set field errors nên `return` thay vì rơi xuống `showError(err.message)` (dual signal). Fix: thêm `return` sau loop. **FIXED 2026-04-29**.
- [x] [Review][Patch][LOW] `volume-prices.service.ts:121-122` cast `min/max ::bigint` thay vì `::int` [apps/api/src/services/volume-prices.service.ts:121-122] — Hoạt động vì có `Number()` mapping nhưng inconsistent với `count(*)::int`. Fix: đổi cast thành `::int` hoặc thêm comment. **FIXED 2026-04-29**.

**`defer` findings (pre-existing hoặc MVP-acceptable):**

- [x] [Review][Defer][LOW] Race condition `ensureProductAlive`/`ensureCustomerAlive` ngoài transaction [apps/api/src/services/customer-prices.service.ts:243-244, volume-prices.service.ts:248] — deferred, MVP-acceptable, FK CASCADE + DB CHECK guard race; không có test cho race nhưng spec H7 chấp nhận risk này.
- [x] [Review][Defer][LOW] Concurrency 2 user replace volume_prices cùng productId [apps/api/src/services/volume-prices.service.ts:241-320] — deferred, spec H7 chấp nhận race "ai save sau ghi đè ai save trước" cho MVP. Không cần SELECT FOR UPDATE.
- [x] [Review][Defer][LOW] Migration naming spec đề 0015 nhưng thực tế 0016 [apps/api/src/db/migrations/0016_sleepy_odin.sql] — deferred, do thứ tự dev tạo migration song song với Story 6-2 (0015 là stock-checks). Không ảnh hưởng functionality.
- [x] [Review][Defer][LOW] Performance `listCustomerPrices` 2 queries (data + count) đều innerJoin lặp lại [apps/api/src/services/customer-prices.service.ts:128-143] — deferred, pattern chuẩn của project, MVP scale OK. Có thể optimize bằng window function hoặc CTE sau.

**Dismissed (2):**

- DISMISSED: `customer_prices` thiếu DB CHECK constraint cho `price >= 0` — Zod là source of truth, route validate trước khi insert. Không cần.
- DISMISSED: Spec H4 cảnh báo dưới giá vốn UI-only — Code đúng spec (warning trong UI, không block backend).

**Coverage tổng quát:**

- AC1 schema + migration: PASS
- AC2 POST customer-prices: PASS (test 27 case OK; minor patch xử lý dưới)
- AC3 GET list customer-prices: PASS (innerJoin equivalent LEFT JOIN khi FK CASCADE đảm bảo)
- AC4 PATCH customer-prices: PASS (defensive storeId trong WHERE — patch low)
- AC5 DELETE customer-prices: PASS
- AC6 PUT volume-prices replace atomic: PASS
- AC7 GET volume-prices for product: PASS
- AC8 GET volume-prices list: PASS
- AC9 permission/multi-tenant/audit 4 actions: PASS
- AC10 UI customer-prices page: PASS
- AC11 dialogs create/edit/delete: PARTIAL (2 patches button disabled logic)
- AC12 VolumePricesDialog: PARTIAL (1 patch default tier seed)
- AC13 page volume-prices: PARTIAL (1 patch trash button)
- AC14 routing: PASS

### File List
