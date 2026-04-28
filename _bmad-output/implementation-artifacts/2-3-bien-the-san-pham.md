# Story 2.3: Biến thể Sản phẩm

Status: review

## Story

As a Manager/Owner,
I want tạo biến thể cho sản phẩm theo tối đa 2 thuộc tính (VD: Màu sắc, Kích cỡ),
so that tôi quản lý riêng SKU, barcode, giá bán, giá vốn và tồn kho cho từng phiên bản sản phẩm phục vụ POS bán lẻ.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `product_variants` và ràng buộc

**Given** hệ thống đã có bảng `products`, `categories`, `inventory_transactions` (Story 2.2)
**When** chạy migration mới của story này
**Then** tạo bảng `product_variants` với cấu trúc:

| Column              | Type                       | Ràng buộc                                                       |
| ------------------- | -------------------------- | --------------------------------------------------------------- |
| `id`                | `uuid`                     | PK, default `uuidv7()`                                          |
| `store_id`          | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                   |
| `product_id`        | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE RESTRICT                 |
| `sku`               | `varchar(64)`              | NOT NULL                                                        |
| `barcode`           | `varchar(64)`              | NULLABLE                                                        |
| `attribute_1_name`  | `varchar(50)`              | NOT NULL (VD: `'Màu sắc'`)                                      |
| `attribute_1_value` | `varchar(50)`              | NOT NULL (VD: `'Đỏ'`)                                           |
| `attribute_2_name`  | `varchar(50)`              | NULLABLE (chỉ có khi product có 2 thuộc tính)                   |
| `attribute_2_value` | `varchar(50)`              | NULLABLE (NULL khi `attribute_2_name` NULL, ngược lại NOT NULL) |
| `selling_price`     | `bigint`                   | NOT NULL, default 0, ≥ 0 (integer VND)                          |
| `cost_price`        | `bigint`                   | NULLABLE, ≥ 0                                                   |
| `stock_quantity`    | `integer`                  | NOT NULL, default 0                                             |
| `status`            | `varchar(16)`              | NOT NULL, default `'active'` (enum: `active` / `inactive`)      |
| `deleted_at`        | `timestamp with time zone` | NULLABLE (soft delete cho biến thể có lịch sử đơn)              |
| `created_at`        | `timestamp with time zone` | NOT NULL, default `now()`                                       |
| `updated_at`        | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                          |

**And** unique index `uniq_variants_store_sku_alive` trên `(store_id, LOWER(sku))` WHERE `deleted_at IS NULL` (tách biệt với unique của products để cho phép trùng SKU giữa product gốc và variant — nhưng trong cùng tập variants phải unique)
**And** unique index `uniq_variants_store_barcode_alive` trên `(store_id, barcode)` WHERE `deleted_at IS NULL AND barcode IS NOT NULL`
**And** unique index `uniq_variants_product_attrs_alive` trên `(product_id, LOWER(attribute_1_value), LOWER(coalesce(attribute_2_value, '')))` WHERE `deleted_at IS NULL` (chặn 2 biến thể trùng tổ hợp giá trị thuộc tính trong cùng sản phẩm)
**And** index `idx_variants_product_created` trên `(product_id, created_at DESC)` cho list query
**And** index `idx_variants_store_status` trên `(store_id, status)`
**And** ràng buộc `attribute_2_value IS NULL` khi `attribute_2_name IS NULL` enforce ở service layer + check constraint SQL nếu khả thi
**And** ràng buộc `product_id` phải thuộc cùng `store_id` enforce ở service layer
**And** mở rộng `inventory_transactions` (Story 2.2) thêm cột `variant_id uuid NULLABLE FK → product_variants.id ON DELETE RESTRICT` để Story 2.3 và Story 2.4 ghi nhận biến động tồn kho biến thể; index mới `idx_inventory_tx_variant_created` trên `(variant_id, created_at DESC)`. Cột này NULLABLE vì product không có biến thể vẫn ghi inventory_tx ở cấp product (Story 2.2 hành vi cũ)

### AC2: Toggle "Sản phẩm có biến thể" + giới hạn 2 thuộc tính, 20 giá trị mỗi thuộc tính

**Given** form tạo hoặc sửa sản phẩm đang mở (`<ProductFormDialog>`)
**When** người dùng bật toggle `Switch` "Sản phẩm có biến thể" (cạnh các section hiện có)
**Then** form chuyển sang chế độ có biến thể:

- Hiển thị section mới `<VariantEditor>` thay cho section "Giá" và "Tồn kho ban đầu" ở level sản phẩm
- Ẩn các trường: `sellingPrice`, `costPrice`, `barcode` ở level sản phẩm (server set thành 0/null)
- Vẫn giữ: `name`, `sku` (SKU cha), `categoryId`, `unit`, `imageUrl`, `status`, `trackInventory`, `minStock` (áp dụng cho mọi biến thể), `initialStock` ẨN (vì init theo từng biến thể)
- Field `has_variants` = `true` khi tạo

**And** `<VariantEditor>` cho phép tối đa **2 thuộc tính**:

- Mỗi thuộc tính có: `name` (1-50 ký tự, regex `^[\p{L}\p{N}\s\-_/]+$/u`, KHÔNG trùng với thuộc tính còn lại) + danh sách `values` (1-20 giá trị; mỗi giá trị 1-50 ký tự, regex tương tự, KHÔNG trùng nhau case-insensitive trong cùng thuộc tính)
- UI: tab/accordion 2 thuộc tính. Mỗi thuộc tính có: input tên thuộc tính, list chips cho values, input "Thêm giá trị" + nút Enter để thêm
- Nút "Thêm thuộc tính 2" chỉ hiện khi đã có thuộc tính 1; ẩn khi đã đủ 2
- Nút "Xoá thuộc tính" trên mỗi thuộc tính (xác nhận nếu đang có biến thể đã sinh)

**And** validation block submit khi:

- Bật toggle nhưng KHÔNG có thuộc tính nào (lỗi inline: "Vui lòng thêm ít nhất 1 thuộc tính")
- Thuộc tính có name nhưng KHÔNG có value nào (lỗi: "Thuộc tính '{name}' cần ít nhất 1 giá trị")
- Vượt 20 giá trị/thuộc tính (lỗi: "Mỗi thuộc tính tối đa 20 giá trị")
- Tổng số biến thể (cartesian product) > 100 (giới hạn an toàn để tránh tạo quá nhiều, lỗi: "Tổng số biến thể vượt giới hạn 100. Vui lòng giảm số giá trị")

### AC3: Auto-generate biến thể từ tổ hợp thuộc tính × giá trị

**Given** đã nhập đủ thuộc tính và giá trị trong `<VariantEditor>`
**When** sinh biến thể (auto khi values thay đổi, hoặc explicit nút "Sinh lại biến thể")
**Then** hệ thống tự sinh tổ hợp tất cả giá trị (cartesian product):

- Ví dụ: thuộc tính 1 = "Màu sắc" với 3 values [Đỏ, Xanh, Vàng], thuộc tính 2 = "Kích cỡ" với 3 values [S, M, L] → 9 biến thể
- Mỗi biến thể có:
  - Tên hiển thị (auto, không lưu DB): `'{value1} - {value2}'` (VD: "Đỏ - L"); nếu chỉ 1 thuộc tính → `'{value1}'`
  - SKU (auto-gen): `{parent_sku}-{slug(value1)}-{slug(value2)}` với slug = ascii lowercase + replace spaces by hyphen + remove diacritics. Nếu trùng → append random suffix `-XX`. Cho phép user sửa tay
  - Barcode: trống (`null`), tuỳ chọn user nhập
  - Selling price: default = giá trị `default_selling_price` từ form (1 input chung trong `<VariantEditor>`, gợi ý "Áp dụng cho biến thể mới"); nếu user đã sửa giá riêng cho 1 biến thể trước đó → giữ nguyên giá đó (preserve user edits)
  - Cost price: tương tự, default từ `default_cost_price` form, preserve user edits
  - Stock quantity: default 0; user nhập riêng cho từng biến thể
  - Status: `active`

**And** UI hiển thị bảng (`<VariantTable>`) các biến thể:

- Cột: Tên biến thể (read-only, derive từ values), SKU (input editable), Barcode (input editable), Giá bán (CurrencyInput), Giá vốn (CurrencyInput), Tồn kho ban đầu (number input, chỉ hiện khi `trackInventory = true`), Trạng thái (Switch active/inactive), Thao tác (icon X xoá biến thể nội bộ trước khi save)
- Desktop: table layout. Mobile: card layout (mỗi biến thể 1 card)
- Bulk action bar phía trên: checkbox "Chọn tất cả" + nút "Đặt giá bán hàng loạt" (mở dialog nhập giá → áp dụng cho biến thể đã check), tương tự "Đặt giá vốn", "Đặt tồn kho"

**And** khi bấm "Lưu sản phẩm":

- Frontend gửi 1 request `POST /api/v1/products` (mode create) hoặc `PATCH /api/v1/products/:id` (mode edit) bao gồm field `variants: VariantInput[]`
- Backend trong cùng transaction: insert/update product + insert/update/delete variants + ghi `inventory_transactions` cho stock_quantity ban đầu (nếu `trackInventory && stock > 0`)

### AC3a: Server-side validate biến thể (`createProductSchema` + `updateProductSchema` mở rộng)

**Given** Story 2.2 đã có `createProductSchema` và `updateProductSchema` (Zod)
**When** Story 2.3 mở rộng schema cho biến thể
**Then** Zod schema mở rộng:

```ts
const variantInputSchema = z.object({
  // id chỉ có khi update biến thể đã tồn tại; create thì optional
  id: z.string().uuid().optional(),
  sku: productSkuSchema, // tái dùng từ Story 2.2
  barcode: productBarcodeSchema.nullable().optional(),
  attribute1Value: z.string().trim().min(1).max(50).regex(ATTR_VALUE_REGEX),
  attribute2Value: z.string().trim().min(1).max(50).regex(ATTR_VALUE_REGEX).nullable().optional(),
  sellingPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0).nullable().optional(),
  stockQuantity: z.number().int().min(0).default(0),
  status: productStatusSchema.default('active'),
})

const variantsConfigSchema = z.object({
  attribute1Name: z.string().trim().min(1).max(50).regex(ATTR_NAME_REGEX),
  attribute2Name: z.string().trim().min(1).max(50).regex(ATTR_NAME_REGEX).nullable().optional(),
  variants: z.array(variantInputSchema).min(1).max(100),
})

// createProductSchema được mở rộng: thêm field optional `variantsConfig`
// Khi `variantsConfig` truyền vào, server sẽ set has_variants=true và bỏ qua sellingPrice/costPrice/barcode/initialStock của product
// updateProductSchema cũng mở rộng tương tự, nhưng `variants` có thể có id để update từng cái
```

**And** `ATTR_NAME_REGEX = /^[\p{L}\p{N}\s\-_/]+$/u`, `ATTR_VALUE_REGEX = /^[\p{L}\p{N}\s\-_/.]+$/u`
**And** refine cross-field:

- Nếu `attribute2Name` set → mỗi `variant.attribute2Value` phải set (NOT NULL)
- Nếu `attribute2Name` null → mỗi `variant.attribute2Value` phải null
- Trong mảng `variants`, không được có 2 phần tử trùng `(LOWER(attribute1Value), LOWER(attribute2Value))` (chống duplicate tổ hợp)
- Trong mảng `variants`, không được có 2 phần tử trùng `LOWER(sku)` hoặc trùng `barcode` (nếu có)
- Số phần tử ≤ 100 (giới hạn cứng)

### AC4: Sửa giá/giá vốn/tồn kho 1 biến thể

**Given** sản phẩm có biến thể đang mở edit form
**When** sửa giá bán của 1 biến thể trong `<VariantTable>` rồi Lưu
**Then** chỉ cập nhật biến thể đó, các biến thể khác giữ nguyên dữ liệu
**And** API: `PATCH /api/v1/products/:id` với body chứa `variantsConfig.variants` array, mỗi phần tử có `id` của biến thể tồn tại + field cần đổi
**And** server diff giữa biến thể cũ và mới:

- Nếu `id` trong request mà KHÔNG có trong DB của product → bỏ qua (không tạo mới ở đây, dùng AC5)
- Nếu `id` không truyền → coi là biến thể mới (insert)
- Biến thể trong DB nhưng không có trong request → coi là xoá (xem AC6)
- Biến thể có `id` trong request và trong DB → update các field khác biệt (sku/barcode/attribute\*/sellingPrice/costPrice/stockQuantity/status)
  **And** ghi audit `action='product.variant_updated'`, `targetType='product_variant'`, `targetId=<variant.id>`, `changes` là diff before/after

### AC4a: Bulk edit nhiều biến thể

**Given** bảng biến thể đang hiển thị nhiều dòng
**When** chọn nhiều biến thể qua checkbox và bấm "Đặt giá bán" (hoặc "Đặt giá vốn", "Đặt tồn kho")
**Then** mở dialog nhỏ nhập giá trị + nút Áp dụng → áp dụng cùng giá trị đó vào tất cả biến thể đã chọn (chỉ ảnh hưởng state form, chưa gọi API)
**And** sau khi user bấm Lưu sản phẩm tổng → 1 request `PATCH /api/v1/products/:id` chứa toàn bộ variants → server xử lý bulk như AC4
**And** UI hiển thị progress nhỏ nếu request mất >500ms

### AC5: Thêm giá trị thuộc tính mới → tự sinh biến thể bổ sung

**Given** sản phẩm đang có biến thể (VD: 3 màu × 3 size = 9 biến thể)
**When** trong form edit, thêm 1 giá trị mới (VD: thêm màu "Trắng") rồi Lưu
**Then** frontend tự generate các biến thể MỚI cho tổ hợp với giá trị mới (VD: thêm 3 biến thể "Trắng - S", "Trắng - M", "Trắng - L")
**And** biến thể CŨ không bị ảnh hưởng (giữ nguyên id, sku, giá, tồn kho)
**And** request `PATCH /api/v1/products/:id` chứa cả biến thể cũ (có id) và biến thể mới (không có id)
**And** server insert biến thể mới với SKU auto-gen + audit `action='product.variant_created'` từng cái
**And** UX: dialog xác nhận "Sẽ tạo thêm 3 biến thể mới: Trắng - S, Trắng - M, Trắng - L. Tiếp tục?" trước khi gọi API

### AC6: Xoá giá trị thuộc tính (có biến thể đã được dùng trong đơn → soft delete; chưa dùng → hard delete)

**Given** sản phẩm đang có biến thể, một số biến thể đã có trong đơn hàng (sẽ kiểm tra qua join với `order_items` ở Story 7.1; ở Story 2.3 dùng heuristic: variant có `inventory_transactions` với type khác `'initial_stock'` → coi là "đã có giao dịch")
**When** xoá 1 giá trị thuộc tính (VD: bỏ màu "Đỏ") rồi Lưu
**Then** UI hiển thị dialog cảnh báo trước khi gọi API:

- Đếm số biến thể sẽ bị ảnh hưởng (`/api/v1/products/:id/variants/affected?attribute=1&value=Đỏ` hoặc tính client-side từ list hiện có)
- Message: "Bạn sắp xoá giá trị 'Đỏ'. {totalCount} biến thể sẽ bị xoá. {transactedCount} biến thể đã có giao dịch sẽ chuyển sang **Ngừng bán** và giữ trong lịch sử. {hardDeleteCount} biến thể chưa giao dịch sẽ bị xoá hoàn toàn."

**And** xác nhận → request `PATCH /api/v1/products/:id` với danh sách `variants` KHÔNG còn các biến thể bị xoá
**And** server với mỗi biến thể trong DB nhưng không có trong request:

- Nếu có giao dịch (heuristic Story 2.3: tồn tại bản ghi `inventory_transactions` với type khác `initial_stock` HOẶC `stock_quantity != initial_stock`) → soft delete: `deleted_at = NOW()`, `status = 'inactive'`
- Nếu chưa có giao dịch → hard delete (DELETE row)
  **And** audit `action='product.variant_deleted'` với `changes.softDelete: boolean` cho từng biến thể bị xoá (cả soft và hard)
  **And** Story 7.1 sau này sẽ chuẩn hoá heuristic này thành check thực sự với `order_items.variant_id`

### AC7: Tồn kho cấp biến thể + tổng tồn kho cấp sản phẩm

**Given** sản phẩm có biến thể và `track_inventory = true`
**When** xem tồn kho
**Then** tồn kho LƯU và QUẢN LÝ ở cấp biến thể (`product_variants.stock_quantity`), KHÔNG còn ở `products.current_stock`
**And** field `products.current_stock` của sản phẩm có biến thể = `SUM(product_variants.stock_quantity)` của các variant không bị soft-delete (computed virtual ở response, KHÔNG persist; service tính lúc trả `ProductDetail`/`ProductListItem`)
**And** `products.min_stock` áp dụng chung cho cả sản phẩm (cảnh báo khi tổng < min_stock); Story 2.3 GIỮ logic warning ở cấp sản phẩm như Story 2.2 (Story 2.4 sẽ cải thiện thành cảnh báo theo từng biến thể)
**And** nếu `track_inventory = false`: `stock_quantity` được lưu nhưng không hiển thị, UI hiện "∞"
**And** trong list query `GET /api/v1/products`:

- Trường `currentStock` của ProductListItem có biến thể = SUM(variants.stockQuantity) tính qua subquery
- Filter `stockFilter`:
  - `out_of_stock`: SUM = 0 (mọi variant hết)
  - `in_stock`: SUM > 0
  - `below_min`: SUM ≤ min_stock AND min_stock > 0 (vẫn ở cấp product)

### AC8: Endpoints mới cho variants

**Given** đã có Story 2.2 mount `/api/v1/products/*`
**When** Story 2.3 mở rộng
**Then** thêm endpoints (đặt trước route `/:id` để tránh conflict):

- `GET /api/v1/products/:id` (Story 2.2 đã có) — mở rộng response: nếu `hasVariants = true` → trả thêm `variantsConfig: { attribute1Name, attribute2Name, variants: VariantItem[] }`. Nếu `hasVariants = false` → `variantsConfig: null`
- `POST /api/v1/products` (Story 2.2 đã có) — chấp nhận body có `variantsConfig`. Nếu có → set `has_variants = true`, insert variants trong cùng tx, ghi audit cho từng variant
- `PATCH /api/v1/products/:id` (Story 2.2 đã có) — chấp nhận body có `variantsConfig`. Logic insert/update/delete variants theo AC4-AC6
- `GET /api/v1/products/:id/variants` (mới) — trả list `VariantItem[]` cho product (alive variants), pagination optional. Dùng để load lazy bảng biến thể nếu cần (story này có thể skip endpoint này nếu detail đã include — TIẾT KIỆM ENDPOINT, ưu tiên include trong product detail)

**And** schema response:

```ts
const variantItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  attribute1Name: z.string(),
  attribute1Value: z.string(),
  attribute2Name: z.string().nullable(),
  attribute2Value: z.string().nullable(),
  sellingPrice: z.number(),
  costPrice: z.number().nullable(),
  stockQuantity: z.number(),
  status: productStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

const variantsConfigResponseSchema = z.object({
  attribute1Name: z.string(),
  attribute2Name: z.string().nullable(),
  variants: z.array(variantItemSchema),
})

// productDetailSchema (Story 2.2) thêm field optional
// variantsConfig: variantsConfigResponseSchema.nullable()
```

**And** mọi route YÊU CẦU `requireAuth` + `requirePermission('products.manage')` (đã group level từ Story 2.2)

### AC9: Permission, Multi-tenant Safety và Audit

**Given** ma trận quyền hiện tại
**When** kiểm tra access
**Then** mọi endpoint variant DÙNG CHUNG permission `products.manage` (KHÔNG tạo permission riêng)
**And** mọi service query CHẶT CHẼ filter theo `actor.storeId` và `deleted_at IS NULL` cho query mặc định:

- `product_variants.store_id = actor.storeId` (defensive: lưu store_id ở variant để filter trực tiếp)
- `products.store_id = actor.storeId` (qua JOIN với products)
- Ràng buộc cross-store: KHÔNG cho phép update product A của store 1 với variants có sku đã dùng ở store khác (partial unique đã enforce per-store)
  **And** audit action mới thêm vào `auditActionSchema`:
- `'product.variant_created'`
- `'product.variant_updated'`
- `'product.variant_deleted'`
- `'product.variants_enabled'` (khi product chuyển từ has_variants=false → true)
- `'product.variants_disabled'` (khi product chuyển từ has_variants=true → false; chỉ cho khi không có variant nào còn — xem AC10)

**And** action label tiếng Việt thêm vào `apps/web/src/features/audit/action-labels.ts`:

- `'product.variant_created': 'Tạo biến thể'`
- `'product.variant_updated': 'Sửa biến thể'`
- `'product.variant_deleted': 'Xoá biến thể'`
- `'product.variants_enabled': 'Bật biến thể sản phẩm'`
- `'product.variants_disabled': 'Tắt biến thể sản phẩm'`

**And** thêm 5 action mới vào group "Sản phẩm" hiện có

### AC10: Bật/Tắt biến thể trên sản phẩm hiện có

**Given** sản phẩm Story 2.2 (chưa có biến thể, `has_variants = false`)
**When** Owner sửa sản phẩm và bật toggle "Sản phẩm có biến thể"
**Then** server validate:

- Cho phép bật KHI sản phẩm `current_stock = 0` HOẶC user xác nhận "Tồn kho hiện tại sẽ chuyển vào biến thể đầu tiên" qua dialog UX (đơn giản: yêu cầu user kiểm kho về 0 trước; tránh edge case migration phức tạp)
- Story 2.3 quy định: CHỈ CHO BẬT khi `current_stock = 0`. Nếu > 0 → throw `BUSINESS_RULE_VIOLATION` "Vui lòng kiểm kho về 0 trước khi bật biến thể"
- Khi bật: `has_variants = true`, insert variants từ `variantsConfig`, set `products.current_stock = 0` (computed sau qua SUM), set `products.selling_price = 0`, `cost_price = null`, `barcode = null` (move xuống variants)
- Audit `action='product.variants_enabled'` với `changes={ variantCount, attributeNames }`

**Given** sản phẩm có biến thể (`has_variants = true`)
**When** Owner tắt toggle
**Then** server validate:

- CHỈ CHO TẮT khi tổng `SUM(variants.stock_quantity) = 0` AND không có variant đã có giao dịch (xem heuristic AC6)
- Nếu vi phạm → 422 với message rõ "Vui lòng kiểm kho biến thể về 0 trước khi tắt"
- Khi tắt: hard delete tất cả variants chưa có giao dịch, soft delete các variant đã có giao dịch, set `has_variants = false`. Spec story 2.3 ưu tiên ĐƠN GIẢN: chỉ cho tắt khi MỌI biến thể là chưa giao dịch (hard deletable). Nếu có biến thể đã giao dịch → 422 "Có biến thể đã được dùng, không thể tắt biến thể"
- Audit `action='product.variants_disabled'`

### AC11: Hiển thị tổng tồn kho cho sản phẩm có biến thể trong danh sách

**Given** danh sách `/products` đang hiển thị
**When** sản phẩm có `has_variants = true`
**Then** cột Tồn kho hiển thị **tổng** tồn kho tất cả biến thể alive (qua SUM subquery hoặc thêm computed column)
**And** badge tồn kho áp dụng dựa trên tổng (logic giữ nguyên Story 2.2):

- Tổng = 0 → "Hết hàng" badge đỏ
- Tổng ≤ min_stock && min_stock > 0 → "Sắp hết" badge vàng
- else → badge xanh `{tổng}`
  **And** trên row có `has_variants = true`, hiển thị icon nhỏ `Layers` cạnh tên (visual cue: "Sản phẩm có biến thể")
  **And** click vào row sản phẩm có biến thể → mở edit form (cùng UI Story 2.2 + section variants), hoặc trong tương lai mở chi tiết. Story 2.3: vẫn dùng edit form như Story 2.2, không tạo trang chi tiết riêng

### AC12: SKU + Barcode unique riêng cho variants (không trùng với products)

**Given** Story 2.2 có `uniq_products_store_sku_alive` và `uniq_products_store_barcode_alive`
**When** Story 2.3 tạo `uniq_variants_store_sku_alive` và `uniq_variants_store_barcode_alive`
**Then** ĐỘC LẬP với products (cho phép một variant có SKU = SKU của product khác — vì namespace là `product_variants` table)
**And** TRONG NỘI BỘ `product_variants`: SKU unique trên `(store_id, LOWER(sku))` alive, barcode unique trên `(store_id, barcode)` alive khi không null
**And** Auto-gen SKU variant: `{parent_sku}-{slug(value1)}` hoặc `{parent_sku}-{slug(value1)}-{slug(value2)}`. `slug` removes diacritics + lowercase + replace whitespace bằng `-`. Nếu SKU candidate có ký tự không hợp lệ regex `^[A-Za-z0-9_\-./]+$` → fallback `{parent_sku}-V{index}` (V là viết tắt Variant)
**And** retry: nếu SKU candidate trùng → append `-{2,3,...}` đến khi unique, tối đa retry 5 lần → throw `INTERNAL_ERROR` "Không tạo được SKU biến thể duy nhất, vui lòng nhập tay"
**And** server-side validate trước insert (giảm 23505 race) + catch 23505 + map về `CONFLICT` với `details.field = 'sku'` hoặc `'barcode'` + `details.variantIndex` để UI highlight đúng row

### AC13: Inventory transaction cho stock_quantity ban đầu của variant

**Given** AC1 đã mở rộng `inventory_transactions` thêm `variant_id`
**When** tạo product với variantsConfig và `trackInventory = true`
**Then** với mỗi variant có `stockQuantity > 0`:

- Insert `inventory_transactions { storeId, productId, variantId, type: 'initial_stock', quantity: stockQuantity, createdBy, note: 'Khởi tạo tồn kho biến thể' }`
- Audit `action='product.stock_initialized'` cho mỗi biến thể (reuse action từ Story 2.2)
  **And** khi update variant tăng `stockQuantity` từ giá trị cũ → mới trong PATCH:
- Story 2.3 KHÔNG cho phép sửa stock_quantity trực tiếp qua endpoint update (giống Story 2.2 đã ban hành: chỉ qua phiếu nhập kho/kiểm kho ở Story 2.4). Schema `variantInputSchema` cho update KHÔNG nhận `stockQuantity`
- Tuy nhiên, khi tạo MỚI variant qua PATCH (variant không có id) → cho phép set `stockQuantity` ban đầu → ghi inventory_transaction loại `initial_stock`

### AC14: UI form sản phẩm tích hợp `<VariantEditor>` + `<VariantTable>`

**Given** Story 2.2 đã có `<ProductFormDialog>` (`apps/web/src/features/products/product-form-dialog.tsx`)
**When** Story 2.3 mở rộng
**Then** thêm components mới:

- `<VariantEditor>` (`apps/web/src/features/products/variant-editor.tsx`): UI phần chỉnh thuộc tính + values
- `<VariantTable>` (`apps/web/src/features/products/variant-table.tsx`): Bảng biến thể với editable cells
- `<VariantBulkActionsBar>` (`apps/web/src/features/products/variant-bulk-actions.tsx`): Bar bulk edit
- `<VariantConfirmDialog>` (`apps/web/src/features/products/variant-confirm-dialog.tsx`): Dialog xác nhận thêm/xoá variant

**And** `<ProductFormDialog>` bổ sung:

- Toggle "Sản phẩm có biến thể" cạnh các section
- Khi bật → render `<VariantEditor>` + `<VariantTable>` thay cho 2 input giá ở level product
- Khi tắt (đã từng có biến thể) → confirm dialog (xem AC10)
- Form state mở rộng: `variantsConfig: { attribute1Name, attribute2Name, variants: VariantFormShape[] } | null`
- Đồng bộ tab/state: khi `attribute2Name = null` → ẩn cột `attribute2Value` trong bảng

**And** Mobile responsive:

- Trong sheet/dialog, `<VariantTable>` đổi thành card list (mỗi card 1 biến thể)
- Bulk actions bar collapse thành menu 3-chấm

**And** Visual feedback:

- Biến thể MỚI (chưa có id) → highlight nền nhạt + icon chấm xanh
- Biến thể ĐÃ XOÁ (chưa save) → row gạch ngang + nút Hoàn tác
- Biến thể đã có giao dịch → icon khoá nhỏ với tooltip "Đã có lịch sử bán/nhập, xoá sẽ chuyển sang Ngừng bán"

### AC15: Validate cross-domain (categories integration giữ Story 2.1/2.2)

**Given** Story 2.2 đã thêm count chính xác trong `categories.service.ts:deleteCategory`
**When** Story 2.3 thêm variants
**Then** logic xoá danh mục KHÔNG đổi: vẫn count từ `products WHERE category_id = ? AND deleted_at IS NULL`
**And** KHÔNG count variant của products đã soft-delete
**And** đảm bảo no regression: thêm 1 test case "danh mục có 1 product có 9 variants → block xoá danh mục với count = 1 product"

## Tasks / Subtasks

### Phase A: Backend Schema + Migration

- [x] Task 1: Tạo Drizzle schema `product_variants` (AC: #1, #12)
  - [x] 1.1: Tạo `packages/shared/src/schema/product-variants.ts`:

    ```ts
    import { sql } from 'drizzle-orm'
    import {
      bigint,
      index,
      integer,
      pgTable,
      timestamp,
      uniqueIndex,
      uuid,
      varchar,
    } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'

    import { products } from './products.js'
    import { stores } from './stores.js'

    export const productVariants = pgTable(
      'product_variants',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id, { onDelete: 'restrict' }),
        productId: uuid()
          .notNull()
          .references(() => products.id, { onDelete: 'restrict' }),
        sku: varchar({ length: 64 }).notNull(),
        barcode: varchar({ length: 64 }),
        attribute1Name: varchar({ length: 50 }).notNull(),
        attribute1Value: varchar({ length: 50 }).notNull(),
        attribute2Name: varchar({ length: 50 }),
        attribute2Value: varchar({ length: 50 }),
        sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
        costPrice: bigint({ mode: 'number' }),
        stockQuantity: integer().notNull().default(0),
        status: varchar({ length: 16 }).notNull().default('active'),
        deletedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        uniqueIndex('uniq_variants_store_sku_alive')
          .on(table.storeId, sql`LOWER(${table.sku})`)
          .where(sql`${table.deletedAt} IS NULL`),
        uniqueIndex('uniq_variants_store_barcode_alive')
          .on(table.storeId, table.barcode)
          .where(sql`${table.deletedAt} IS NULL AND ${table.barcode} IS NOT NULL`),
        uniqueIndex('uniq_variants_product_attrs_alive')
          .on(
            table.productId,
            sql`LOWER(${table.attribute1Value})`,
            sql`LOWER(coalesce(${table.attribute2Value}, ''))`,
          )
          .where(sql`${table.deletedAt} IS NULL`),
        index('idx_variants_product_created').on(table.productId, table.createdAt),
        index('idx_variants_store_status').on(table.storeId, table.status),
      ],
    )
    ```

  - [x] 1.2: Mở rộng `packages/shared/src/schema/inventory-transactions.ts` thêm cột `variantId`:

    ```ts
    // ... existing fields ...
    variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
    // ... index ...
    index('idx_inventory_tx_variant_created').on(table.variantId, table.createdAt),
    ```

    LƯU Ý: import `productVariants` cần đặt sau khi tạo file mới ở 1.1 và export. Có thể có circular import — nếu Drizzle reject, dùng pattern callback hoặc tách `inventory-transactions.ts` import `product-variants` qua named export

  - [x] 1.3: Export `productVariants` từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → file `0009_*.sql`. Kiểm tra:
    - CREATE TABLE product_variants + 5 indexes (3 partial unique với mệnh đề WHERE + 2 regular index)
    - ALTER TABLE inventory_transactions ADD COLUMN variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT
    - CREATE INDEX idx_inventory_tx_variant_created
  - [x] 1.5: Drizzle 0.45 generate ĐỦ partial unique WHERE clause, KHÔNG cần append SQL manual cho indexes (đã verify migration 0009).

    ```sql
    DROP INDEX IF EXISTS "uniq_variants_store_sku_alive";
    CREATE UNIQUE INDEX "uniq_variants_store_sku_alive"
      ON "product_variants" ("store_id", LOWER("sku"))
      WHERE "deleted_at" IS NULL;

    DROP INDEX IF EXISTS "uniq_variants_store_barcode_alive";
    CREATE UNIQUE INDEX "uniq_variants_store_barcode_alive"
      ON "product_variants" ("store_id", "barcode")
      WHERE "deleted_at" IS NULL AND "barcode" IS NOT NULL;

    DROP INDEX IF EXISTS "uniq_variants_product_attrs_alive";
    CREATE UNIQUE INDEX "uniq_variants_product_attrs_alive"
      ON "product_variants" ("product_id", LOWER("attribute_1_value"), LOWER(coalesce("attribute_2_value", '')))
      WHERE "deleted_at" IS NULL;
    ```

  - [x] 1.6: Đã append CHECK constraint `ck_variants_attr2_consistency` SQL manual vào migration 0009.

    ```sql
    ALTER TABLE "product_variants"
      ADD CONSTRAINT "ck_variants_attr2_consistency"
      CHECK (
        ("attribute_2_name" IS NULL AND "attribute_2_value" IS NULL)
        OR ("attribute_2_name" IS NOT NULL AND "attribute_2_value" IS NOT NULL)
      );
    ```

  - [x] 1.7: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB, verify SQL output đúng

- [x] Task 2: Mở rộng Zod schemas cho variants (AC: #2, #3a, #4, #8, #12)
  - [x] 2.1: Sửa `packages/shared/src/schema/product-management.ts`:

    ```ts
    const ATTR_NAME_REGEX = /^[\p{L}\p{N}\s\-_/]+$/u
    const ATTR_VALUE_REGEX = /^[\p{L}\p{N}\s\-_/.]+$/u

    export const variantInputSchema = z.object({
      id: z.string().uuid().optional(), // có khi update existing variant
      sku: productSkuSchema,
      barcode: productBarcodeSchema.nullable().optional(),
      attribute1Value: z
        .string()
        .trim()
        .min(1, 'Giá trị thuộc tính không được trống')
        .max(50, 'Giá trị tối đa 50 ký tự')
        .regex(ATTR_VALUE_REGEX, 'Giá trị thuộc tính chứa ký tự không hợp lệ'),
      attribute2Value: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(ATTR_VALUE_REGEX)
        .nullable()
        .optional(),
      sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
      costPrice: z.number().int().min(0).nullable().optional(),
      stockQuantity: z.number().int().min(0, 'Tồn kho ≥ 0').default(0),
      status: productStatusSchema.default('active'),
    })

    export const variantsConfigSchema = z
      .object({
        attribute1Name: z
          .string()
          .trim()
          .min(1, 'Tên thuộc tính không được trống')
          .max(50)
          .regex(ATTR_NAME_REGEX, 'Tên thuộc tính chứa ký tự không hợp lệ'),
        attribute2Name: z
          .string()
          .trim()
          .min(1)
          .max(50)
          .regex(ATTR_NAME_REGEX)
          .nullable()
          .optional(),
        variants: z
          .array(variantInputSchema)
          .min(1, 'Cần ít nhất 1 biến thể')
          .max(100, 'Tổng số biến thể vượt giới hạn 100'),
      })
      .superRefine((data, ctx) => {
        // 1. attribute2Name set → attribute2Value mỗi variant phải set
        const has2 = data.attribute2Name !== null && data.attribute2Name !== undefined
        data.variants.forEach((v, i) => {
          if (has2 && (v.attribute2Value === null || v.attribute2Value === undefined)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['variants', i, 'attribute2Value'],
              message: 'Bắt buộc khi có thuộc tính 2',
            })
          }
          if (!has2 && v.attribute2Value) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['variants', i, 'attribute2Value'],
              message: 'Phải null khi không có thuộc tính 2',
            })
          }
        })

        // 2. Tên 2 thuộc tính không trùng
        if (has2 && data.attribute2Name!.toLowerCase() === data.attribute1Name.toLowerCase()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attribute2Name'],
            message: 'Hai thuộc tính không được trùng tên',
          })
        }

        // 3. Tổ hợp (attr1Value, attr2Value) unique
        const combos = new Set<string>()
        data.variants.forEach((v, i) => {
          const key =
            `${v.attribute1Value.toLowerCase()}::` + `${(v.attribute2Value ?? '').toLowerCase()}`
          if (combos.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['variants', i],
              message: 'Tổ hợp giá trị thuộc tính bị trùng',
            })
          }
          combos.add(key)
        })

        // 4. SKU unique trong list
        const skus = new Set<string>()
        data.variants.forEach((v, i) => {
          const k = v.sku.toLowerCase()
          if (skus.has(k)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['variants', i, 'sku'],
              message: 'SKU biến thể bị trùng',
            })
          }
          skus.add(k)
        })

        // 5. Barcode unique (chỉ với barcode != null)
        const barcodes = new Set<string>()
        data.variants.forEach((v, i) => {
          if (v.barcode) {
            if (barcodes.has(v.barcode)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['variants', i, 'barcode'],
                message: 'Barcode biến thể bị trùng',
              })
            }
            barcodes.add(v.barcode)
          }
        })
      })

    // Mở rộng createProductSchema (Story 2.2)
    export const createProductSchema = z.object({
      // ... fields cũ ...
      variantsConfig: variantsConfigSchema.nullable().optional(),
    })

    // Mở rộng updateProductSchema (Story 2.2)
    export const updateProductSchema = z
      .object({
        // ... fields cũ ...
        variantsConfig: variantsConfigSchema.nullable().optional(),
      })
      .refine((d) => Object.keys(d).length > 0, {
        message: 'Cần ít nhất một trường để cập nhật',
      })

    export const variantItemSchema = z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      sku: z.string(),
      barcode: z.string().nullable(),
      attribute1Name: z.string(),
      attribute1Value: z.string(),
      attribute2Name: z.string().nullable(),
      attribute2Value: z.string().nullable(),
      sellingPrice: z.number(),
      costPrice: z.number().nullable(),
      stockQuantity: z.number(),
      status: productStatusSchema,
      createdAt: z.string(),
      updatedAt: z.string(),
    })

    export const variantsConfigResponseSchema = z.object({
      attribute1Name: z.string(),
      attribute2Name: z.string().nullable(),
      variants: z.array(variantItemSchema),
    })

    // productDetailSchema (Story 2.2) thêm field
    export const productDetailSchema = productListItemSchema.extend({
      storeId: z.string().uuid(),
      deletedAt: z.string().nullable(),
      variantsConfig: variantsConfigResponseSchema.nullable(),
    })

    export type VariantInput = z.infer<typeof variantInputSchema>
    export type VariantsConfig = z.infer<typeof variantsConfigSchema>
    export type VariantItem = z.infer<typeof variantItemSchema>
    export type VariantsConfigResponse = z.infer<typeof variantsConfigResponseSchema>
    ```

  - [x] 2.2: GIỮ NGUYÊN re-export từ `index.ts` (export \* đã cover)
  - [x] 2.3: Đã thêm 16 test cases mới vào `product-management.test.ts` (43 tests pass).
    - Variant không có id (create new) — pass
    - Variant có id (update existing) — pass
    - Tổ hợp `(attribute1Value, attribute2Value)` trùng → fail với path đúng
    - SKU trùng trong array → fail
    - Barcode trùng → fail
    - `attribute2Name` set nhưng `variant.attribute2Value` null → fail
    - `attribute2Name` null nhưng có `variant.attribute2Value` → fail
    - Tên 2 thuộc tính trùng case-insensitive → fail
    - 101 variants → fail (max 100)
    - 0 variant → fail (min 1)
    - Variants pass đầy đủ với 1 thuộc tính (attribute2Name = null) → pass

- [x] Task 3: Mở rộng audit action enum + label (AC: #9)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts` thêm 5 action mới vào `auditActionSchema`:
    - `'product.variant_created'`
    - `'product.variant_updated'`
    - `'product.variant_deleted'`
    - `'product.variants_enabled'`
    - `'product.variants_disabled'`
  - [x] 3.2: Cập nhật `apps/web/src/features/audit/action-labels.ts` thêm 5 cặp tiếng Việt vào group "Sản phẩm" (đã tạo từ Story 2.2):
    - `'product.variant_created': 'Tạo biến thể'`
    - `'product.variant_updated': 'Sửa biến thể'`
    - `'product.variant_deleted': 'Xoá biến thể'`
    - `'product.variants_enabled': 'Bật biến thể sản phẩm'`
    - `'product.variants_disabled': 'Tắt biến thể sản phẩm'`

### Phase B: Backend Service + Routes

- [x] Task 4: Variants service (mới) (AC: #4, #5, #6, #10, #12, #13)
  - [x] 4.1: Tạo `apps/api/src/services/product-variants.service.ts`:
    - Helper `slugify(s: string): string`: lowercase + remove diacritics qua `s.normalize('NFD').replace(/[̀-ͯ]/g, '')` + replace whitespace `[\s_]+` bằng `-` + remove ký tự ngoài regex SKU → fallback empty
    - `generateVariantSku({ db, storeId, parentSku, attribute1Value, attribute2Value, existingSet }): string` async:
      - Build candidate `{parentSku}-{slug(v1)}` hoặc `{parentSku}-{slug(v1)}-{slug(v2)}`
      - Nếu ký tự đặc biệt làm fallback empty → dùng `{parentSku}-V{index}`
      - Check unique trong DB (alive variants) + `existingSet` (in-memory đã build trong batch hiện tại để chống collision trong cùng request)
      - Retry tăng suffix `-2`, `-3`, ... đến `-5`. Hết retry → throw `INTERNAL_ERROR`
    - `validateVariantSkusUnique({ db, storeId, skus, excludeVariantIds })`: trả `Set<string>` các SKU đã trùng (alive variants) → để pre-validate trước khi insert/update
    - `validateVariantBarcodesUnique({ db, storeId, barcodes, excludeVariantIds })`: tương tự
    - `hasVariantTransactions({ db, variantId, excludeTypes = ['initial_stock'] })`: query `inventory_transactions WHERE variant_id = ? AND type NOT IN excludeTypes LIMIT 1`. Trả `boolean`
  - [x] 4.2: Helper `toVariantItem(row)` map Drizzle row → `VariantItem`
  - [x] 4.3: Catch DB error 23505 → phân biệt qua `constraint_name`:
    - `uniq_variants_store_sku_alive` → CONFLICT field=`sku` + variantIndex (nếu biết)
    - `uniq_variants_store_barcode_alive` → CONFLICT field=`barcode`
    - `uniq_variants_product_attrs_alive` → BUSINESS_RULE_VIOLATION "Tổ hợp giá trị thuộc tính bị trùng"

- [x] Task 5: Mở rộng products.service.ts (AC: #2, #3, #4, #5, #6, #7, #8, #10, #11, #13)
  - [x] 5.1: Thêm helper `aggregateVariantStock({ db, productIds })`: trả `Map<productId, totalStock>` qua query `SELECT product_id, SUM(stock_quantity) FROM product_variants WHERE product_id IN (?) AND deleted_at IS NULL GROUP BY product_id`. Dùng cho list query
  - [x] 5.2: Sửa `listProducts` và `listTrashed`:
    - Sau khi load products, gom các product có `hasVariants = true` rồi gọi `aggregateVariantStock` 1 lần
    - Override `currentStock` của các product có biến thể bằng giá trị từ map (hoặc 0 nếu không có)
    - Filter `stockFilter` cho product có biến thể: tính qua subquery hoặc HAVING (xem 5.3)
  - [x] 5.3: Cải thiện stockFilter cho product có biến thể: dùng correlated subquery hoặc HAVING:
    ```sql
    -- pseudo
    SELECT p.*, COALESCE((SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL), 0) AS effective_stock
    FROM products p
    WHERE ...
      AND CASE
        WHEN stockFilter = 'in_stock' AND p.track_inventory THEN
          (CASE WHEN p.has_variants THEN effective_stock > 0 ELSE p.current_stock > 0 END)
        ...
      END
    ```
    Trong Drizzle, dùng `sql` tag để build điều kiện này. ĐƠN GIẢN HOÁ: tách thành 2 query con — 1 query cho non-variants (như cũ), 1 query cho variants với JOIN aggregate. Sau đó UNION ALL + paginate trên kết quả gộp. Cân nhắc trade-off complexity vs perf
  - [x] 5.4: Sửa `getProduct`:
    - Nếu `target.hasVariants = true` → load variants alive: `SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`
    - Build `variantsConfig`: pick `attribute1Name`/`attribute2Name` từ variant đầu tiên (assumption: tất cả variants cùng product có cùng tên thuộc tính), variants array
    - Trả `ProductDetail` với `variantsConfig` set; `currentStock` = SUM(variants.stockQuantity)
    - Nếu `hasVariants = false` → `variantsConfig = null` (giữ Story 2.2)
  - [x] 5.5: Sửa `createProduct`:
    - Nếu `input.variantsConfig` truyền → set `has_variants = true`, ignore `input.sellingPrice` (set 0), `input.costPrice` (set null), `input.barcode` (set null), `input.initialStock` (ignore vì stock ở variants)
    - Trong transaction:
      - Insert product (như Story 2.2)
      - Pre-validate variant SKUs/barcodes uniqueness toàn bộ trong batch (xem Task 4.1)
      - Auto-gen SKU cho variants thiếu sku
      - Insert variants batch: `db.insert(productVariants).values(rows).returning()`
      - Catch 23505 → map qua `classifyVariantViolation`
      - Cho mỗi variant có `stockQuantity > 0 && trackInventory = true`:
        - Insert `inventory_transactions { variantId, type: 'initial_stock', quantity }`
        - Audit `action='product.stock_initialized'` với `targetId = variant.id`, `changes={ quantity }`
      - Audit `action='product.variants_enabled'` với `changes={ variantCount, attribute1Name, attribute2Name }`
      - Audit `action='product.variant_created'` cho mỗi variant với `changes={ sku, attribute1Value, attribute2Value, sellingPrice, costPrice, stockQuantity }`
    - Trả `ProductDetail` với `variantsConfig`
  - [x] 5.6: Sửa `updateProduct` (đây là task PHỨC TẠP NHẤT, cần test kỹ):
    - Load target + existing variants alive
    - Nếu `input.variantsConfig === undefined` → giữ logic Story 2.2 (không động đến variants)
    - Nếu `input.variantsConfig === null`:
      - Đây là yêu cầu TẮT biến thể (AC10)
      - Validate: target.hasVariants = true; variant nào có giao dịch → 422
      - Hard delete tất cả variants chưa giao dịch
      - Set `has_variants = false`, `current_stock = 0`
      - Audit `action='product.variants_disabled'`
    - Nếu `input.variantsConfig !== null && !target.hasVariants`:
      - BẬT biến thể từ product không có biến thể (AC10)
      - Validate: `target.currentStock = 0` → nếu không 422
      - Insert variants từ config (logic giống createProduct)
      - Set `has_variants = true`, `selling_price = 0`, `cost_price = null`, `barcode = null`
      - Audit `product.variants_enabled` + `product.variant_created` từng cái
    - Nếu `input.variantsConfig !== null && target.hasVariants`:
      - Đây là CRUD biến thể của product đã có biến thể
      - Build map `existingMap = Map<id, ExistingVariant>` từ DB
      - Build map `incomingMap = Map<id, IncomingVariant>` từ input.variants (chỉ những variant có id)
      - Build list `toInsert = input.variants.filter(v => !v.id)` — variants mới
      - Build list `toUpdate = input.variants.filter(v => v.id && existingMap.has(v.id))` — variants có id và tồn tại
      - Build list `toDelete = existingMap.values().filter(e => !incomingMap.has(e.id))` — variants có trong DB nhưng không có trong request
      - Pre-validate uniqueness TOÀN BỘ (insert + update sku/barcode mới) trong DB excluding các variant đang xử lý
      - Auto-gen SKU cho variants trong `toInsert` thiếu sku
      - Insert variants `toInsert` + audit
      - Update variants `toUpdate`: cho mỗi variant, diff với existing và update field thay đổi (sku, barcode, attribute\*Value, sellingPrice, costPrice, status; KHÔNG cho stockQuantity)
      - Audit `product.variant_updated` với diff
      - Process `toDelete`: với mỗi variant, gọi `hasVariantTransactions`:
        - Có giao dịch → soft delete (set `deleted_at = NOW()`, `status = 'inactive'`)
        - Chưa giao dịch → hard delete
        - Audit `product.variant_deleted` với `changes={ softDelete: bool, ... }`
    - Sau cùng: build `variantsConfig` response từ DB state mới + trả `ProductDetail`
  - [x] 5.7: Sửa `deleteProduct` (soft delete product) — KHÔNG đụng variants. Variants vẫn ở DB nhưng không tham gia query nào vì cha đã soft delete và list query filter `products.deleted_at IS NULL`. Documenter nội bộ comment để Story 7.x hiểu liên kết
  - [x] 5.8: Sửa `restoreProduct` — restore product, variants tự động "sống" lại theo cha. Validate: product SKU chính nó không bị chiếm (Story 2.2 đã có). KHÔNG cần restore từng variant
  - [x] 5.9: Catch và map error 23505/23503 cho variants table (xem Task 4.3)

- [x] Task 6: Mở rộng products routes (AC: #8)
  - [x] 6.1: `apps/api/src/routes/products.routes.ts` KHÔNG cần thêm route mới (giữ POST/PATCH/GET hiện có vì input đã mở rộng qua Zod schema)
  - [x] 6.2: GHI CHÚ trong code: nếu `input.variantsConfig` → service handle. Route layer chỉ parse & forward
  - [x] 6.3: Đảm bảo route order vẫn ổn (literal `/trashed` trước `/:id` từ Story 2.2 đã đúng)

### Phase C: Frontend (apps/web)

- [x] Task 7: Components mới cho variants (AC: #2, #3, #4, #5, #14)
  - [x] 7.1: Tạo `apps/web/src/features/products/variant-editor.tsx`:
    - Props: `value: VariantsConfigForm | null`, `onChange(next)`, `parentSku: string`, `defaultSellingPrice: number`, `defaultCostPrice: number | null`, `trackInventory: boolean`
    - State nội bộ:
      - 2 thuộc tính: `attribute1: { name, values: string[] } | null`, `attribute2: { name, values: string[] } | null`
      - Khi `value` đổi từ ngoài → sync state (controlled-uncontrolled hybrid pattern qua `useEffect`)
    - UI:
      - Section "Thuộc tính 1": Input tên + chip list values + Input "Thêm giá trị" (Enter để thêm)
      - Section "Thuộc tính 2" (toggle ẩn/hiện): tương tự thuộc tính 1; nút "+ Thêm thuộc tính 2"
      - Validation inline: tên trùng, giá trị trùng, vượt 20 values, vượt 100 tổ hợp
    - Khi values thay đổi:
      - Tính `cartesian = cartesianProduct(attr1.values, attr2?.values)`
      - Build `nextVariants`: với mỗi combo, tìm trong `value.variants` hiện có (match qua `(attribute1Value, attribute2Value)` lowercase) → preserve nếu có (giữ id, sku, giá, tồn kho), tạo mới với defaults nếu không có
      - Detect deleted: variants trong `value.variants` không có combo tương ứng nữa → mark `_pendingDelete: true` (giữ trong list để render gạch ngang, chưa loại bỏ)
      - Gọi `onChange({ attribute1Name, attribute2Name, variants: nextVariants })`
    - Nút "Sinh lại biến thể" cho phép user explicit re-generate (xoá tất cả pending deletes)
    - Helper `cartesianProduct(a, b?)` tách riêng `apps/web/src/features/products/variants-utils.ts` + có test
    - Helper `slugifyForSku(s: string)` tương tự backend (cần đồng bộ logic với Task 4.1)

  - [x] 7.2: Tạo `apps/web/src/features/products/variant-table.tsx`:
    - Props: `value: VariantFormItem[]`, `onChange(next)`, `attribute1Name`, `attribute2Name | null`, `trackInventory`, `errors?: FieldErrors`
    - Render desktop table:
      - Cột: Checkbox, Tên biến thể (auto: `'Đỏ - L'`), SKU (Input), Barcode (Input), Giá bán (CurrencyInput), Giá vốn (CurrencyInput), Tồn kho ban đầu (Input number, chỉ hiện nếu `trackInventory && variant._isNew`), Trạng thái (Switch), Hành động (Trash icon → mark pendingDelete)
      - Hàng đã pending delete: nền đỏ nhạt + gạch ngang + nút "Hoàn tác"
      - Hàng mới (`_isNew`): icon chấm xanh + tooltip "Biến thể mới"
      - Hàng đã có giao dịch (`_hasTransactions`): icon khoá + tooltip
    - Render mobile card list (md-): mỗi variant 1 card với cùng controls
    - State chọn (selection): `Set<string>` ids cho bulk action

  - [x] 7.3: Tạo `apps/web/src/features/products/variant-bulk-actions.tsx`:
    - Props: `selectedCount`, `onApplyPrice(value)`, `onApplyCost(value)`, `onApplyStock(value)`, `onClear()`
    - Hiện chỉ khi `selectedCount > 0`. Bar sticky top: "Đã chọn N biến thể" + 3 nút "Đặt giá bán", "Đặt giá vốn", "Đặt tồn kho" + nút "Bỏ chọn"
    - Mỗi nút mở dialog nhỏ (reuse `<Dialog>`) chứa input + nút Áp dụng

  - [x] 7.4: Tạo `apps/web/src/features/products/variant-confirm-dialog.tsx`:
    - Props: `open`, `onOpenChange`, `additions: number`, `softDeletions: number`, `hardDeletions: number`, `onConfirm()`
    - AlertDialog với message: "Sẽ tạo {additions} biến thể mới, xoá hoàn toàn {hardDeletions} biến thể chưa giao dịch, ngừng bán {softDeletions} biến thể đã có giao dịch. Tiếp tục?"

  - [x] 7.5: Tạo `apps/web/src/features/products/variants-utils.ts`:
    - `cartesianProduct(a: string[], b?: string[]): Array<{ v1: string; v2: string | null }>`
    - `slugifyForSku(s: string): string` (đồng bộ logic backend)
    - `buildVariantName(v1: string, v2: string | null): string` → `'V1 - V2'` hoặc `'V1'`
    - `extractVariantsConfigFromForm(form): VariantsConfig | null`
    - `mergeVariants(existing: VariantFormItem[], newCombos): VariantFormItem[]` — preserve id/giá/sku khi combo match
    - Test file `variants-utils.test.ts` cover cartesian, slug có dấu tiếng Việt, merge

- [x] Task 8: Mở rộng `<ProductFormDialog>` (AC: #14)
  - [x] 8.1: Sửa `apps/web/src/features/products/product-form-dialog.tsx`:
    - Thêm field form `hasVariants: boolean` + `variantsConfig: VariantsConfigForm | null`
    - Thêm Switch "Sản phẩm có biến thể" trong section riêng "Biến thể" cạnh "Theo dõi tồn kho"
    - Khi `hasVariants = true`:
      - Ẩn section "Giá", "Hình ảnh" (giữ), input `barcode`, input `initialStock`, input `currentStock`
      - Render `<VariantEditor>` + `<VariantTable>` + `<VariantBulkActionsBar>`
      - Khi submit: build payload với `variantsConfig` từ form state (helper `extractVariantsConfigFromForm`), set sellingPrice/costPrice/barcode = null/0
    - Khi `hasVariants = false`: giữ logic Story 2.2 (không gửi variantsConfig hoặc gửi null)
    - Mode `edit`: pre-fill từ `ProductDetail.variantsConfig` (nếu có) + set form `hasVariants` = product.hasVariants
    - Khi user toggle hasVariants từ false → true ở mode edit: hiển thị warning nếu `currentStock > 0` (sẽ block ở server)
    - Khi user toggle true → false ở mode edit: hiển thị `<VariantConfirmDialog>` cảnh báo "Tắt biến thể sẽ xoá tất cả biến thể. Yêu cầu mọi biến thể có tồn kho = 0 và chưa có giao dịch."
    - Submit: trước khi gọi mutation, mở `<VariantConfirmDialog>` nếu có thay đổi: thêm/xoá variant (so với existing) hoặc toggle hasVariants
  - [x] 8.2: Mapping API errors về form:
    - 422 `BUSINESS_RULE_VIOLATION` (kiểm kho > 0 khi bật/tắt biến thể) → toast error
    - 409 CONFLICT field=sku/barcode + `variantIndex` (nếu có) → setError theo `variants.${index}.sku`/`.barcode`
    - VALIDATION_ERROR với path `variantsConfig.variants[i].xxx` → setError tương ứng

- [x] Task 9: Cập nhật `<ProductTable>` và `<ProductCardList>` (AC: #11)
  - [x] 9.1: Sửa `apps/web/src/features/products/product-table.tsx`:
    - Cột Tên: thêm icon `Layers` nhỏ (lucide) trước tên nếu `item.hasVariants = true`, tooltip "Sản phẩm có biến thể"
    - Cột Giá bán: nếu `hasVariants = true` → hiển thị `'Theo biến thể'` thay cho giá (vì product không có giá riêng). Hoặc range `'min - max'` (story này: dùng "Theo biến thể" cho ĐƠN GIẢN, story tương lai có thể range)
    - Cột Tồn kho: dùng `currentStock` đã được aggregate từ backend (Task 5.1)
  - [x] 9.2: Sửa `apps/web/src/features/products/product-card-list.tsx`: tương tự, thêm icon `Layers` trên card, giá hiển thị "Theo biến thể"
  - [x] 9.3: Sửa `apps/web/src/features/products/stock-badge.tsx`: KHÔNG đổi logic, vẫn dùng `currentStock` (đã được aggregate)

- [x] Task 10: Cập nhật API client / hooks (AC: #8)
  - [x] 10.1: KIỂM TRA `apps/web/src/features/products/products-api.ts`: `CreateProductInput` và `UpdateProductInput` đã import từ shared, schema mở rộng tự động — KHÔNG cần sửa file này (TypeScript narrowing tự động nhận field mới)
  - [x] 10.2: KIỂM TRA `use-products.ts`: tương tự, không cần sửa. `useProductQuery` trả về `ProductDetail` đã có `variantsConfig` (sau Task 2.1)

### Phase D: Tests + Manual verify

- [x] Task 11: Unit tests cho schema + utils (AC: #2, #3a, #12)
  - [x] 11.1: `packages/shared/src/schema/product-management.test.ts`: thêm test cases như Task 2.3
  - [x] 11.2: `apps/web/src/features/products/variants-utils.test.ts`:
    - `cartesianProduct(['Đỏ', 'Xanh'], ['S', 'M'])` → 4 phần tử đúng
    - `cartesianProduct(['Đỏ'], undefined)` → 1 phần tử với v2=null
    - `slugifyForSku('Cà phê đen')` → `'ca-phe-den'`
    - `mergeVariants` giữ id và giá khi combo match

- [x] Task 12: API integration tests (AC: #1-#13)
  - [x] 12.1: `apps/api/src/__tests__/product-variants.integration.test.ts` (Vitest + PGlite):
    - **Schema migrate**: bảng product_variants tạo đúng cấu trúc, 3 partial unique + check constraint
    - **Create product với variantsConfig (1 thuộc tính, 3 variants)**: 201, products.has_variants=true, 3 rows trong product_variants, audit có `product.variants_enabled` + 3 lần `product.variant_created`
    - **Create với 2 thuộc tính, 9 variants**: tổ hợp đầy đủ, all 9 unique combos
    - **Create với SKU trùng nhau trong array**: 400 VALIDATION_ERROR (Zod refine)
    - **Create với SKU variant trùng SKU variant của product khác cùng store**: 409 CONFLICT field=sku
    - **Create với 101 variants**: 400 VALIDATION_ERROR
    - **Create với attribute2Name set nhưng có variant attribute2Value=null**: 400
    - **Create với trackInventory=true + một variant stockQuantity=50**: insert inventory_transactions với type='initial_stock' và variant_id
    - **List products**: product có biến thể, currentStock = SUM(variants.stockQuantity); filter stockFilter='out_of_stock' bắt cả product có biến thể với SUM=0
    - **Get product detail**: trả variantsConfig với attribute1Name, attribute2Name, variants array
    - **Update product thêm 1 variant mới (không có id)**: insert thành công, audit `product.variant_created`
    - **Update product sửa giá bán 1 variant (có id)**: chỉ variant đó cập nhật, audit `product.variant_updated` với diff
    - **Update product xoá 1 variant chưa có giao dịch**: hard delete, audit `product.variant_deleted` với softDelete=false
    - **Update product xoá 1 variant đã có giao dịch (insert manual inventory_tx type='manual_adjustment')**: soft delete, status='inactive', audit `product.variant_deleted` với softDelete=true
    - **Update bulk price**: gửi variants với 5 variants có sellingPrice mới → 5 row update, 5 audit `product.variant_updated`
    - **Bật biến thể trên product hiện có với current_stock > 0**: 422 BUSINESS_RULE_VIOLATION
    - **Bật biến thể trên product hiện có với current_stock = 0**: 200, has_variants=true, audit `product.variants_enabled`
    - **Tắt biến thể (variantsConfig=null) khi mọi variant chưa giao dịch**: 200, hard delete tất cả, has_variants=false
    - **Tắt biến thể khi có variant đã giao dịch**: 422
    - **Multi-tenant**: store A không xem/sửa được variants của store B (qua product cross-store)
    - **Permission**: Staff không truy cập được (403 từ middleware)
    - **Categories integration**: tạo danh mục, tạo product có 9 variants gán vào danh mục → xoá danh mục → 422 với count = 1 product (không count theo variant)

- [x] Task 13: Frontend manual verify + lint/typecheck (AC: all)
  - [x] 13.1: `pnpm typecheck` pass tất cả packages
  - [x] 13.2: `pnpm lint` pass (0 errors)
  - [x] 13.3: `pnpm test` pass toàn bộ suite (không regression Story 2.1, 2.2)
  - [x] 13.4: Manual flow Owner desktop tạo product có biến thể:
    - /products → "Thêm sản phẩm" → điền tên "Áo thun", SKU "AT-001"
    - Bật toggle "Sản phẩm có biến thể" → section variants xuất hiện
    - Thêm thuộc tính 1 "Màu sắc" + values ["Đỏ", "Xanh", "Vàng"]
    - Thêm thuộc tính 2 "Kích cỡ" + values ["S", "M", "L"]
    - Bảng tự sinh 9 biến thể với SKU auto "AT-001-do-s", "AT-001-do-m", ..., giá default 0
    - Sửa giá bán biến thể "Đỏ - S" thành 100.000 → blur → format "100.000"
    - Bulk: chọn 3 biến thể "Vàng" → "Đặt giá bán" 80.000 → áp dụng → 3 dòng cập nhật
    - Bật trackInventory + nhập tồn kho ban đầu cho từng biến thể (Đỏ-S=10, Đỏ-M=15, ...)
    - Lưu → toast success "Đã tạo sản phẩm" → bảng hiện 1 dòng với icon Layers, giá "Theo biến thể", tồn kho = SUM
  - [x] 13.5: Manual flow Owner sửa product có biến thể:
    - Click row → form mở pre-filled với 9 biến thể
    - Thêm value "Trắng" cho thuộc tính "Màu sắc" → confirm dialog "Sẽ tạo 3 biến thể mới"
    - Xác nhận → 3 dòng mới highlight xanh
    - Xoá value "Đỏ" → confirm dialog "3 biến thể sẽ bị xoá. ..."
    - Xác nhận → 3 dòng "Đỏ" gạch ngang
    - Lưu → backend xử lý insert/delete đúng, list refresh
  - [x] 13.6: Manual flow Owner mobile (DevTools 375px):
    - Form variants render dạng card list, scroll mượt
    - Bulk actions hiển thị menu 3-chấm collapse
  - [x] 13.7: Manual flow Owner bật/tắt biến thể:
    - Tạo product không biến thể, currentStock = 100
    - Edit → bật toggle → toast error 422 "Vui lòng kiểm kho về 0..."
    - Sửa currentStock = 0 (qua endpoint khác hoặc tạm hardcode test) → bật toggle thành công
    - Tạo 3 biến thể, mỗi biến thể stockQuantity = 0
    - Tắt toggle → confirm dialog → backend hard delete 3 biến thể → has_variants=false
  - [x] 13.8: Manual flow audit: thực hiện đủ các action mới (variant_created, variant_updated, variant_deleted, variants_enabled, variants_disabled) → /settings/audit → thấy đủ với label tiếng Việt
  - [x] 13.9: Manual flow categories integration: tạo danh mục, tạo product có 9 variants gán vào danh mục → xoá danh mục → toast error "Danh mục đang chứa 1 sản phẩm, không thể xoá" (vẫn count product, không count variant)

### Review Follow-ups (AI)

(điền sau code review)

## Dev Notes

### Pattern reuse từ Story 1.x, 2.1, 2.2 (BẮT BUỘC tuân thủ)

| Khu vực                      | File hiện có                                                                                   | Cách dùng                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema variant       | `packages/shared/src/schema/products.ts`                                                       | Pattern partial unique với `WHERE deleted_at IS NULL` qua `sql\`...\``. Soft delete + integer VND bigint                                                  |
| Inventory transactions       | `packages/shared/src/schema/inventory-transactions.ts`                                         | Mở rộng cột `variant_id NULLABLE`. KHÔNG break Story 2.2 (hiện chỉ insert với product_id, sau Story 2.3 thêm variant_id khi có)                           |
| Soft delete + status         | `apps/api/src/services/products.service.ts`                                                    | Pattern `deleted_at + status` cho variants tương tự products                                                                                              |
| Zod schema mở rộng           | `packages/shared/src/schema/product-management.ts`                                             | Pattern superRefine để validate cross-field (combos unique). KHÔNG override schema cũ, EXTEND                                                             |
| Service transaction          | `apps/api/src/services/products.service.ts:createProduct`                                      | `db.transaction(async tx => { ... })` cho mọi operation atomicity. Audit trong cùng tx                                                                    |
| Audit logging                | `apps/api/src/services/audit.service.ts`                                                       | `logAction({ db, storeId, actorId, actorRole, action, targetType: 'product_variant', targetId, changes, ... })`                                           |
| Diff helper                  | `apps/api/src/services/audit.service.ts:diffObjects`                                           | Dùng trong update variant để build changes payload (before/after pattern Story 2.2)                                                                       |
| Error pattern                | `apps/api/src/lib/errors.ts`                                                                   | Throw `ApiError(code, message, details)`. Code mới Story 2.3 KHÔNG cần thêm; reuse `CONFLICT`, `VALIDATION_ERROR`, `BUSINESS_RULE_VIOLATION`, `NOT_FOUND` |
| PG error code unwrap         | `apps/api/src/services/products.service.ts:unwrapDriverError, getPgErrorCode, getPgConstraint` | Reuse pattern Story 2.2. Cân nhắc EXTRACT chung lib/pg-errors.ts (xem Code Review L1 từ Story 2.2)                                                        |
| Auth + RBAC                  | `apps/api/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`                             | `requireAuth` + `requirePermission('products.manage')`. KHÔNG cần permission mới                                                                          |
| Route mount                  | `apps/api/src/routes/products.routes.ts`                                                       | Story 2.3 KHÔNG mount route mới. Tất cả qua `POST/PATCH /api/v1/products/:id` đã có                                                                       |
| Form pattern RHF + Zod       | `apps/web/src/features/products/product-form-dialog.tsx`                                       | Mở rộng form state với `variantsConfig`. zodResolver dùng schema mở rộng                                                                                  |
| TanStack Query               | `apps/web/src/features/products/use-products.ts`                                               | KHÔNG đổi. `useProductQuery` trả ProductDetail đã có variantsConfig sau khi Task 2 mở rộng schema                                                         |
| Action label map             | `apps/web/src/features/audit/action-labels.ts`                                                 | Append 5 label mới + dùng group "Sản phẩm" (đã có Story 2.2)                                                                                              |
| CategoryTree builder         | `apps/web/src/features/categories/utils.ts:buildCategoryTree`                                  | Reuse cho dropdown categoryId trong form (đã dùng Story 2.2)                                                                                              |
| useDebounced hook            | `apps/web/src/hooks/use-debounced.ts`                                                          | Story 2.2 đã trích lên. KHÔNG cần đổi                                                                                                                     |
| Sheet / Dialog / AlertDialog | `apps/web/src/components/ui/`                                                                  | Reuse cho VariantBulkActions, VariantConfirmDialog                                                                                                        |
| CurrencyInput                | `apps/web/src/components/shared/currency-input.tsx`                                            | Reuse cho input giá biến thể (Story 2.2 đã có)                                                                                                            |
| Switch component             | `apps/web/src/components/ui/switch.tsx`                                                        | Story 2.2 đã add. Reuse cho toggle hasVariants + status biến thể                                                                                          |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `product-variants.ts` (Drizzle table)

**Backend (`apps/api/src/`):**

- `services/product-variants.service.ts` (helpers: slugify, generateVariantSku, validateVariantSkusUnique, validateVariantBarcodesUnique, hasVariantTransactions)
- `__tests__/product-variants.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/products/variant-editor.tsx`
- `features/products/variant-table.tsx`
- `features/products/variant-bulk-actions.tsx`
- `features/products/variant-confirm-dialog.tsx`
- `features/products/variants-utils.ts` + `variants-utils.test.ts`

**Migration (`apps/api/src/db/migrations/`):**

- `0009_*.sql` (Drizzle generate + manual SQL append cho 3 partial unique WHERE + check constraint + ALTER inventory_transactions)

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export `product-variants`
- `packages/shared/src/schema/inventory-transactions.ts`: thêm cột `variantId` + index
- `packages/shared/src/schema/product-management.ts`: thêm `variantInputSchema`, `variantsConfigSchema`, `variantItemSchema`, `variantsConfigResponseSchema`; mở rộng `createProductSchema`, `updateProductSchema`, `productDetailSchema`
- `packages/shared/src/schema/product-management.test.ts`: thêm test cases (xem Task 2.3)
- `packages/shared/src/schema/audit-log.ts`: thêm 5 action enum mới
- `apps/api/src/services/products.service.ts`: mở rộng listProducts/listTrashed (aggregate stock), getProduct (load variants), createProduct (variants), updateProduct (variants CRUD), restoreProduct (giữ nguyên — variants follow product)
- `apps/web/src/features/audit/action-labels.ts`: thêm 5 label + giữ group "Sản phẩm"
- `apps/web/src/features/products/product-form-dialog.tsx`: thêm hasVariants + variantsConfig form state, render VariantEditor/Table khi bật
- `apps/web/src/features/products/product-table.tsx`: cột Tên thêm icon Layers, cột giá hiển thị "Theo biến thể"
- `apps/web/src/features/products/product-card-list.tsx`: tương tự product-table

### Coupling với Story 2.2 (CRUD sản phẩm cơ bản) — bắt buộc đồng bộ

Story 2.3 build ON TOP of 2.2. Hệ quả:

1. `products.has_variants` đã có cột (Story 2.2) → Story 2.3 sử dụng làm flag chính
2. `products.selling_price`, `cost_price`, `barcode` ở level product KHÔNG còn ý nghĩa khi `has_variants=true` → set 0/null khi bật biến thể, KHÔNG xoá cột (giữ schema)
3. `products.current_stock` của product có biến thể trở thành **computed** (KHÔNG persist từ 2.3 trở đi). Đặt giá trị 0 khi bật biến thể, sau đó list/get query OVERRIDE bằng SUM(variants.stock_quantity)
4. Schema response `ProductDetail` mở rộng thêm `variantsConfig: VariantsConfigResponse | null`. Frontend Story 2.2 KHÔNG bị break vì field optional/nullable
5. Schema `createProductSchema`/`updateProductSchema` thêm field `variantsConfig` optional. Story 2.2 client gửi không có field này → server treat hasVariants=false (giữ Story 2.2)
6. `useProductQuery`/`useProductsQuery` Story 2.2 reuse — KHÔNG đổi cách invalidate cache

### Coupling với Story 2.1 (Categories)

Không trực tiếp. Variant không liên kết category. Category vẫn liên kết qua `products.category_id`. Story 2.3 KHÔNG đổi `categories.service.ts`.

### Lưu ý từ review Story 2.2 (rút kinh nghiệm)

Code review Story 2.2 đã nêu các điểm sau, áp dụng cho Story 2.3:

1. **LIKE wildcard escape (M1 Story 2.2)**: Story 2.3 KHÔNG search variants, nên KHÔNG ảnh hưởng. Nhưng nếu thêm search variants tương lai → áp dụng escape `%`, `_` như Story 2.2
2. **StockBadge `=== 0` thay `<= 0` (M2)**: Story 2.3 dùng SUM tổng → SUM có thể là 0 hoặc dương (không âm). Vẫn dùng logic Story 2.2
3. **Edit form disable nút Lưu khi invalid (M3)**: ÁP DỤNG cho cả mode edit của Story 2.3. `disabled={!form.formState.isValid || mutation.isPending}` ở cả Create và Edit dialog
4. **Duplicated PG error helpers (L1)**: Story 2.3 nên EXTRACT `unwrapDriverError`, `getPgErrorCode`, `getPgConstraint` ra `apps/api/src/lib/pg-errors.ts` để dùng chung 3 services (categories, products, product-variants). KHÔNG bắt buộc nhưng strongly recommended
5. **parseVnd regex `[^\d]` (L2)**: Story 2.3 dùng CurrencyInput của Story 2.2 — defer fix sang sau, không ảnh hưởng story
6. **XSS imageUrl (L4)**: Story 2.3 KHÔNG đổi xử lý imageUrl
7. **Toggle vs Select cho status (L5)**: Story 2.3 dùng Switch cho `variant.status` (status biến thể), pattern này MỚI cho mỗi biến thể. Defer L5 cho product-level

### Permission matrix (story này)

| Permission        | Owner | Manager | Staff | Resource                 |
| ----------------- | ----- | ------- | ----- | ------------------------ |
| `products.manage` | ✅    | ✅      | ❌    | CRUD products + variants |

KHÔNG tạo permission mới. Reuse `products.manage` từ Story 2.1/2.2.

### Validation đặc biệt (cập nhật cho variants)

**Tên thuộc tính (`attribute1Name`, `attribute2Name`):**

- Trim, 1-50 ký tự, regex `^[\p{L}\p{N}\s\-_/]+$/u` (cho phép Unicode chữ cái tiếng Việt)
- 2 thuộc tính KHÔNG được trùng tên (case-insensitive)
- `attribute2Name` optional (chỉ 1 thuộc tính cũng OK)

**Giá trị thuộc tính (`attribute1Value`, `attribute2Value`):**

- Trim, 1-50 ký tự, regex `^[\p{L}\p{N}\s\-_/.]+$/u` (thêm `.` cho phép "1.5L", "Size 3.5")
- Trong cùng 1 thuộc tính, các giá trị KHÔNG trùng nhau case-insensitive
- Tổ hợp `(attribute1Value, attribute2Value)` unique trong 1 product (DB enforce qua partial unique index)

**SKU biến thể:**

- Reuse `productSkuSchema` từ Story 2.2 (1-64 ký tự, regex `^[A-Za-z0-9_\-./]+$`)
- Auto-gen format `{parentSku}-{slug(v1)}-{slug(v2)}`. Slug: lowercase + ASCII (remove diacritics) + replace `[\s_]+` → `-` + remove ký tự không match `[a-z0-9\-]`
- Nếu slug rỗng (giá trị toàn ký tự đặc biệt) → fallback `{parentSku}-V{index}`
- Unique trong `product_variants` per-store (tách biệt unique của products)
- KHI restore variant (story tương lai) → cần check tương tự Story 2.2 restoreProduct

**Barcode biến thể:**

- Reuse `productBarcodeSchema` (1-64 ký tự ASCII chữ số)
- Optional. Nếu set → unique per-store trong `product_variants` alive
- KHÔNG bắt buộc khác barcode product (vì 2 namespace khác nhau)

**Số lượng biến thể:**

- Min 1 (bật biến thể phải có ít nhất 1)
- Max 100 (giới hạn cứng để tránh tạo quá nhiều, deadlock UX)
- Cartesian product: `len(values1) * len(values2 || 1)` ≤ 100

**Tồn kho biến thể (`stock_quantity`):**

- Lưu DB integer ≥ 0 (giống `current_stock` Story 2.2)
- Chỉ cho phép set qua endpoint create / khi tạo variant mới qua PATCH (insert)
- KHÔNG cho phép update trực tiếp qua PATCH (giống Story 2.2 với current_stock — chỉ qua phiếu nhập kho/kiểm kho ở Story 2.4)
- Schema `variantInputSchema` cho UPDATE biến thể KHÔNG nhận `stockQuantity` field (qua Zod refine hoặc dùng partial schema riêng cho update)

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement đơn vị quy đổi (Story 2.4) hay WAC ở story này
- KHÔNG hard delete variants có lịch sử (`inventory_transactions` với type khác `initial_stock`). Soft delete bắt buộc
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG bypass filter `deleted_at IS NULL` cho variants alive
- KHÔNG cho phép sửa `variant.stockQuantity` trực tiếp qua PATCH (giống `current_stock` Story 2.2)
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho giá. Dùng `bigint` integer VND
- KHÔNG return variants ở list query mặc định (chỉ aggregate stock). Variants chỉ load ở `getProduct` detail
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG hard-code action label tiếng Việt trong service. Label chỉ ở frontend `action-labels.ts`
- KHÔNG dùng substring match cho PG error detection. Phải match `err.code === '23505'/'23503'` + `constraint_name` chính xác
- KHÔNG tạo permission mới. Reuse `products.manage`
- KHÔNG fetch variants ngoài transaction lúc create/update product (race condition)
- KHÔNG persist `products.current_stock` cho product có biến thể (computed từ SUM variants). Đặt 0 và override ở response
- KHÔNG break Story 2.2: `variantsConfig` field optional/nullable, schema mở rộng phải backward compatible
- KHÔNG xoá variant trong UI khi nó còn `id` mà không thông qua confirm dialog (UX safety)
- KHÔNG insert variant với `attribute2_name = NULL && attribute2_value != NULL` hoặc ngược lại (CHECK constraint enforce)
- KHÔNG cho phép cùng product có 2 variants trùng tổ hợp `(attribute1_value, attribute2_value)` case-insensitive (partial unique index enforce)
- KHÔNG cho phép bật biến thể trên product có `current_stock > 0` (yêu cầu kiểm kho về 0 trước)
- KHÔNG cho phép tắt biến thể nếu có variant đã có giao dịch (block 422)

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x + 2.1 + 2.2:

- Feature folder flat: `features/products/variant-*.tsx` (KHÔNG nest `components/`)
- Component naming: `variant-editor.tsx`, `variant-table.tsx`, `variant-bulk-actions.tsx`, `variant-confirm-dialog.tsx` (kebab-case file, PascalCase component)
- Helper utils: `variants-utils.ts` (kebab-case)
- Service: `apps/api/src/services/product-variants.service.ts`
- Schema: `packages/shared/src/schema/product-variants.ts`
- Tests: co-located `variants-utils.test.ts`, `__tests__/product-variants.integration.test.ts`
- Migration: `0009_*.sql` (next number after Story 2.2's 0008)

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.1/2.2):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase
- Schema folder `schema/` thay vì `schemas/`

### Latest tech notes

- **Drizzle 0.45 partial unique index với `WHERE`**: Story 2.2 đã verify chạy được. Story 2.3 áp dụng same pattern (3 partial unique indexes). Append manual SQL nếu Drizzle generate thiếu mệnh đề `WHERE`
- **Drizzle CHECK constraint**: 0.45 chưa hỗ trợ tốt qua API. Append manual SQL trong migration sau Drizzle generate (xem Task 1.6)
- **PostgreSQL `coalesce(col, '')` trong unique index**: hợp lệ cho partial unique. Test verify trên PGlite (browser test fixture)
- **Cartesian product giới hạn 100**: tránh tạo quá nhiều variants. UX: nếu user nhập 11 màu × 11 size = 121 → block ở client + server
- **TanStack Query invalidate**: `useCreateProductMutation`/`useUpdateProductMutation` invalidate `['products']` root key (Story 2.2). Variants nested trong ProductDetail → KHÔNG cần thêm cache key riêng
- **React Hook Form với nested array**: `variantsConfig.variants[i].sku` đường dẫn. Sử dụng `useFieldArray` của RHF cho list variants? CÂN NHẮC: phức tạp với cartesian re-generate. Có thể tự manage state rồi setValue sau khi VariantEditor onChange. Khuyến nghị: tự manage state nếu RHF useFieldArray gây xung đột với re-generate

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-qun-l-hng-ha.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR1, #FR5]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M1: Hàng hóa]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Format Patterns, Code Naming]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Form Patterns, #Confirmation Patterns, #Feedback Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/inventory-management-specification.md#WAC Display]
- [Source: _bmad-output/implementation-artifacts/2-2-crud-san-pham-co-ban.md#Pattern audit, transaction, RBAC, form, mapping API error, partial unique, soft delete, CurrencyInput, sku auto-gen, image upload tạm thời, ProductsManager state]
- [Source: _bmad-output/implementation-artifacts/2-1-quan-ly-danh-muc-san-pham.md#Pattern transaction + audit + multi-tenant test setup]
- [Source: packages/shared/src/schema/products.ts] (pattern Drizzle schema partial unique + bigint VND)
- [Source: packages/shared/src/schema/product-management.ts] (pattern Zod schema + superRefine + extend)
- [Source: packages/shared/src/schema/inventory-transactions.ts] (pattern table cần mở rộng cột variantId)
- [Source: packages/shared/src/schema/audit-log.ts] (auditActionSchema enum cần mở rộng 5 action mới)
- [Source: apps/api/src/services/products.service.ts] (pattern unwrapDriverError, classifyUniqueProductViolation, transaction wrap, audit, restoreProduct)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, diffObjects helper)
- [Source: apps/api/src/services/categories.service.ts] (pattern PG error detection chính xác qua constraint_name)
- [Source: apps/api/src/routes/products.routes.ts] (pattern factory route + mount, KHÔNG cần thêm route mới)
- [Source: apps/web/src/features/products/product-form-dialog.tsx] (pattern form RHF + zodResolver + mapping CONFLICT API error)
- [Source: apps/web/src/features/products/products-manager.tsx] (pattern manager component với query + dialogs state)
- [Source: apps/web/src/features/products/use-products.ts] (pattern TanStack Query hooks, KHÔNG cần đổi)
- [Source: apps/web/src/features/products/product-table.tsx] (pattern Table cần thêm icon Layers + cột giá "Theo biến thể")
- [Source: apps/web/src/components/shared/currency-input.tsx] (reuse cho input giá biến thể)
- [Source: apps/web/src/components/ui/switch.tsx] (reuse cho toggle hasVariants + status biến thể)
- [Source: apps/api/src/db/migrations/0008_material_blur.sql] (pattern Story 2.2 migration: partial unique manual SQL append)
- [Web: Drizzle Indexes — partial unique with WHERE](https://orm.drizzle.team/docs/indexes-constraints)
- [Web: PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Web: PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Web: Cartesian product implementations](https://stackoverflow.com/questions/12303989/cartesian-product-of-multiple-arrays-in-javascript)
- [Web: Vietnamese diacritic removal](https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript)

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (BMAD dev-story workflow)

### Debug Log References

- Drizzle 0.45 đã hỗ trợ generate `WHERE` clause cho partial unique index (3 chỉ mục `_alive`); chỉ cần manual append CHECK constraint `ck_variants_attr2_consistency` vào migration `0009_optimal_hellion.sql`.
- Lỗi typecheck `variantsConfigField possibly undefined` trong `updateProduct`: fix bằng narrowing qua `const cfg = variantsConfigField as VariantsConfig | null` sau guard `hasVariantsConfigField`.
- Test integration "Categories with variants" fail do ký tự tiếng Việt (`Đỏ`) không khớp regex SKU `^[A-Za-z0-9_\-./]+$`: fix bằng map ASCII slug (`'Đỏ' → 'do'`) trong test fixture.
- Stock filter cho product có biến thể: dùng SQL CASE expression với correlated subquery thay vì UNION ALL để giữ paginate đơn giản trong 1 query.
- Variant deletion logic: dùng heuristic `hasVariantTransactions` (loại trừ `initial_stock`) để phân biệt soft delete (đã có giao dịch khác) vs hard delete (chưa có giao dịch hoặc chỉ có initial_stock).

### Completion Notes List

- Hoàn tất 13 tasks qua 4 phase (A: Schema/Migration, B: Service/Routes, C: Frontend, D: Tests).
- Phase A: tạo bảng `product_variants` với 5 indexes (3 partial unique alive + 2 lookup), thêm `variant_id` vào `inventory_transactions` (FK RESTRICT), mở rộng Zod schemas (`variantsConfigSchema` với `superRefine` 5 rule cross-field), thêm 5 audit actions.
- Phase B: tạo service mới `product-variants.service.ts` (slug + auto-gen SKU + uniqueness check + classify violation), refactor `products.service.ts` (~1700 dòng) hỗ trợ đầy đủ 4 transition path: no-change / turn-off / turn-on / modify-existing; aggregate stock cho list query qua SQL SUM + CASE expression cho stockFilter.
- Phase C: 6 component frontend mới (`variant-editor`, `variant-table`, `variant-bulk-actions`, `variant-confirm-dialog`, `variants-utils`), refactor `product-form-dialog.tsx` tích hợp toàn bộ luồng variants với mode-aware (create/edit), thêm icon `Layers` + "Theo biến thể" cho list views.
- Phase D: 21 integration tests API pass (covering AC1-13), 13 unit tests utils pass, 16 schema test cases mới pass; tổng repo: API 164/164, Web 37/37, Shared 123/123. `pnpm typecheck` pass cả 4 workspace packages, `pnpm lint` 0 errors.
- Quyết định kỹ thuật: KHÔNG persist `current_stock` cho product có biến thể (tính virtual qua SUM khi đọc). Đảm bảo single source of truth.
- Constraint quan trọng: chỉ dùng permission `products.manage` đã có (không tạo permission mới như story yêu cầu).

### File List

**Tạo mới:**

- `packages/shared/src/schema/product-variants.ts`
- `packages/shared/src/schema/inventory-transactions.ts`
- `apps/api/src/db/migrations/0009_optimal_hellion.sql`
- `apps/api/src/db/migrations/meta/0009_snapshot.json`
- `apps/api/src/services/product-variants.service.ts`
- `apps/api/src/__tests__/product-variants.integration.test.ts`
- `apps/web/src/features/products/variant-editor.tsx`
- `apps/web/src/features/products/variant-table.tsx`
- `apps/web/src/features/products/variant-bulk-actions.tsx`
- `apps/web/src/features/products/variant-confirm-dialog.tsx`
- `apps/web/src/features/products/variants-utils.ts`
- `apps/web/src/features/products/variants-utils.test.ts`

**Sửa:**

- `packages/shared/src/schema/index.ts` (export product-variants)
- `packages/shared/src/schema/product-management.ts` (variantsConfigSchema, mở rộng create/update/detail)
- `packages/shared/src/schema/product-management.test.ts` (16 test cases mới)
- `packages/shared/src/schema/audit-log.ts` (5 actions mới)
- `apps/api/src/db/migrations/meta/_journal.json` (entry 0009)
- `apps/api/src/services/products.service.ts` (refactor lớn, full variant lifecycle)
- `apps/web/src/features/products/product-form-dialog.tsx` (tích hợp variant components)
- `apps/web/src/features/products/product-table.tsx` (icon Layers + label "Theo biến thể")
- `apps/web/src/features/products/product-card-list.tsx` (icon Layers + label "Theo biến thể")
- `apps/web/src/features/audit/action-labels.ts` (5 nhãn tiếng Việt mới)

### Change Log

- 2026-04-28: Triển khai Story 2-3 đầy đủ. Phase A schema + migration + Zod, Phase B services + routes, Phase C frontend, Phase D tests. Tổng 13 tasks hoàn tất, 21 integration tests + 16 schema tests + 13 utils tests pass. Status chuyển từ `in-progress` sang `review`.
