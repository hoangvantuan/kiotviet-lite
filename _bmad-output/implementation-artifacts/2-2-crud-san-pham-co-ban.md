# Story 2.2: CRUD Sản phẩm Cơ bản

Status: review

## Story

As a Manager/Owner,
I want thêm, sửa, xoá, tìm kiếm sản phẩm cơ bản (chưa biến thể, chưa đơn vị quy đổi nâng cao),
so that tôi quản lý được toàn bộ danh mục hàng hoá của cửa hàng và sẵn sàng cho POS bán.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `products`, `inventory_transactions` và ràng buộc

**Given** hệ thống đã có bảng `stores`, `categories` và migration framework Drizzle
**When** chạy migration mới của story này
**Then** tạo bảng `products` với cấu trúc:

| Column            | Type                       | Ràng buộc                                                            |
| ----------------- | -------------------------- | -------------------------------------------------------------------- |
| `id`              | `uuid`                     | PK, default `uuidv7()`                                               |
| `store_id`        | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                        |
| `name`            | `varchar(255)`             | NOT NULL                                                             |
| `sku`             | `varchar(64)`              | NOT NULL                                                             |
| `barcode`         | `varchar(64)`              | NULLABLE                                                             |
| `category_id`     | `uuid`                     | NULLABLE, FK → `categories.id` ON DELETE RESTRICT                    |
| `selling_price`   | `bigint`                   | NOT NULL, default 0, ≥ 0 (integer VND)                               |
| `cost_price`      | `bigint`                   | NULLABLE, ≥ 0 (integer VND)                                          |
| `unit`            | `varchar(32)`              | NOT NULL, default `'Cái'`                                            |
| `image_url`       | `text`                     | NULLABLE                                                             |
| `status`          | `varchar(16)`              | NOT NULL, default `'active'` (enum trong app: `active` / `inactive`) |
| `has_variants`    | `boolean`                  | NOT NULL, default `false`                                            |
| `track_inventory` | `boolean`                  | NOT NULL, default `false`                                            |
| `current_stock`   | `integer`                  | NOT NULL, default 0 (chỉ ý nghĩa khi `track_inventory = true`)       |
| `min_stock`       | `integer`                  | NOT NULL, default 0                                                  |
| `deleted_at`      | `timestamp with time zone` | NULLABLE (soft delete)                                               |
| `created_at`      | `timestamp with time zone` | NOT NULL, default `now()`                                            |
| `updated_at`      | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                               |

**And** unique index `uniq_products_store_sku_alive` trên `(store_id, LOWER(sku))` WHERE `deleted_at IS NULL` (partial unique để cho phép tái sử dụng SKU sau soft delete)
**And** unique index `uniq_products_store_barcode_alive` trên `(store_id, barcode)` WHERE `deleted_at IS NULL AND barcode IS NOT NULL`
**And** index `idx_products_store_status_created` trên `(store_id, status, created_at DESC)` cho list query mặc định
**And** index `idx_products_store_category` trên `(store_id, category_id)` cho filter theo danh mục
**And** index `idx_products_store_name_lower` trên `(store_id, LOWER(name))` cho search
**And** ràng buộc `category_id` phải thuộc cùng `store_id` enforce ở service layer (không enforce ở DB vì Drizzle không hỗ trợ composite FK trực tiếp)

**And** đồng thời tạo bảng `inventory_transactions` để lưu lịch sử biến động tồn kho (chỉ implement minimal cho story 2.2):

| Column       | Type                       | Ràng buộc                                                                         |
| ------------ | -------------------------- | --------------------------------------------------------------------------------- |
| `id`         | `uuid`                     | PK, default `uuidv7()`                                                            |
| `store_id`   | `uuid`                     | NOT NULL, FK → `stores.id`                                                        |
| `product_id` | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE RESTRICT                                   |
| `type`       | `varchar(32)`              | NOT NULL (enum: `initial_stock`, `manual_adjustment`, ... — story 2.2 chỉ dùng 1) |
| `quantity`   | `integer`                  | NOT NULL (số lượng biến động, có thể âm trong tương lai)                          |
| `note`       | `text`                     | NULLABLE                                                                          |
| `created_by` | `uuid`                     | NOT NULL, FK → `users.id`                                                         |
| `created_at` | `timestamp with time zone` | NOT NULL, default `now()`                                                         |

**And** index `idx_inventory_tx_product_created` trên `(product_id, created_at DESC)`

### AC2: Tạo sản phẩm cơ bản (POST /api/v1/products)

**Given** Owner/Manager đã đăng nhập (có permission `products.manage`)
**When** gọi `POST /api/v1/products` với body hợp lệ:

```json
{
  "name": "Cà phê đen đá",
  "sku": "SP-000001",
  "barcode": "8934567890123",
  "categoryId": "<uuid hoặc null>",
  "sellingPrice": 25000,
  "costPrice": 12000,
  "unit": "Ly",
  "imageUrl": "https://r2.example.com/products/abc.jpg",
  "status": "active",
  "trackInventory": true,
  "minStock": 10,
  "initialStock": 50
}
```

**Then** API validate qua `createProductSchema` (Zod):

- `name`: trim, 1-255 ký tự, regex chữ Unicode + số + ký tự thông dụng `- _ & ( ) ' . / , `
- `sku`: optional ở client (nếu trống → service auto-gen format `SP-XXXXXX` 6 chữ số ngẫu nhiên unique trong store), nếu truyền thì 1-64 ký tự, regex `^[A-Za-z0-9_\-./]+$`
- `barcode`: optional, 1-64 ký tự, regex chỉ số/chữ
- `categoryId`: optional uuid hoặc null
- `sellingPrice`: integer ≥ 0 (đơn vị VND, không thập phân)
- `costPrice`: optional integer ≥ 0
- `unit`: optional, default `'Cái'`, 1-32 ký tự
- `imageUrl`: optional URL hợp lệ
- `status`: enum `'active' | 'inactive'`, default `'active'`
- `trackInventory`: boolean, default `false`
- `minStock`: integer ≥ 0, default 0
- `initialStock`: integer ≥ 0, default 0 (chỉ áp dụng khi `trackInventory = true`)

**And** service `createProduct`:

- Resolve SKU: nếu client không truyền → loop tạo `SP-` + 6 số ngẫu nhiên, retry tối đa 5 lần khi trùng → nếu cạn retry throw `INTERNAL_ERROR`
- Validate `categoryId` (nếu có): load `categories.findFirst({ where eq(categories.id, categoryId) })`, kiểm tra `category.storeId === actor.storeId` → nếu không → `NOT_FOUND` "Không tìm thấy danh mục"
- Insert `products` trong transaction
- Nếu `trackInventory = true` và `initialStock > 0`: insert `inventory_transactions` với `type='initial_stock'`, `quantity=initialStock`, `created_by=actor.userId`, đồng thời update `products.current_stock = initialStock`
- Ghi audit `action='product.created'`, `targetType='product'`, `targetId=<id>`, `changes={ name, sku, sellingPrice, categoryId, trackInventory, initialStock }`

**And** trả 201 với envelope `{ data: ProductDetail }` chứa toàn bộ field

### AC3: Validation và lỗi inline trên form

**Given** form tạo sản phẩm đang mở
**When** không điền tên hoặc giá bán rồi nhấn Lưu
**Then** hiển thị lỗi inline dưới field bắt buộc, nút Lưu disable khi `!form.formState.isValid`

**And** trường `sellingPrice` chỉ chấp nhận số: input dùng `inputMode='numeric'`, format khi blur thành dấu chấm phân cách hàng nghìn (VD: `25000` → `25.000`), submit gửi raw integer
**And** SKU trùng → API trả 409 CONFLICT details `{ field: 'sku' }` → form `setError('sku', ...)`, hiển thị toast
**And** Barcode trùng → API trả 409 CONFLICT details `{ field: 'barcode' }` → tương tự
**And** `categoryId` không thuộc store → API 404 → toast "Không tìm thấy danh mục"

### AC4: Liệt kê sản phẩm với search, filter, pagination (GET /api/v1/products)

**Given** Owner/Manager vào trang `/products`
**When** gọi `GET /api/v1/products?page=1&pageSize=20&search=&categoryId=&status=&stockFilter=`
**Then** API validate qua `listProductsQuerySchema`:

- `page`: integer ≥ 1, default 1
- `pageSize`: integer 1-100, default 20
- `search`: optional string, trim
- `categoryId`: optional uuid hoặc literal `'none'` (sản phẩm không có danh mục)
- `status`: optional enum `'active' | 'inactive' | 'all'`, default `'all'`
- `stockFilter`: optional enum `'in_stock' | 'out_of_stock' | 'below_min'`

**And** service `listProducts`:

- Filter chặt chẽ theo `actor.storeId` và `deleted_at IS NULL`
- `search`: nếu có → WHERE `LOWER(name) LIKE LOWER('%search%') OR LOWER(sku) LIKE ... OR barcode = search` (3 cột: name, sku, barcode)
- `categoryId`: nếu `'none'` → WHERE `category_id IS NULL`; nếu uuid → WHERE `category_id = ?`
- `status`: nếu `'active'`/`'inactive'` → WHERE `status = ?`; `'all'` hoặc undefined → bỏ qua
- `stockFilter`: chỉ áp dụng khi `track_inventory = true`:
  - `in_stock`: WHERE `current_stock > 0`
  - `out_of_stock`: WHERE `current_stock = 0`
  - `below_min`: WHERE `current_stock <= min_stock AND min_stock > 0`
- Sort: mặc định `(created_at DESC, name ASC)`
- Trả `{ data: ProductListItem[], meta: { page, pageSize, total, totalPages } }`

**And** mỗi `ProductListItem` chứa: `{ id, name, sku, barcode, categoryId, categoryName, sellingPrice, costPrice, unit, imageUrl, status, trackInventory, currentStock, minStock, hasVariants, createdAt, updatedAt }`. `categoryName` resolve qua LEFT JOIN với bảng `categories`, có thể null nếu sản phẩm không có danh mục
**And** debounce search ở client 300ms trước khi gửi request

### AC5: UI bảng/card responsive cho danh sách

**Given** danh sách sản phẩm đã load thành công
**When** xem trang `/products` trên desktop ≥ 768px
**Then** render `<ProductTable>` với cột: Ảnh thumbnail (40x40, fallback icon `Package`), Tên (font-medium), SKU (font-mono text-xs), Danh mục (chip nhẹ hoặc text), Giá bán (format VND, right align), Tồn kho (chỉ hiện nếu `trackInventory = true`, badge màu theo `stockFilter`), Trạng thái (badge xanh/xám), Thao tác (Sửa, Xoá)

**And** trên mobile < 768px → render `<ProductCardList>`: ảnh trái, info phải (tên + SKU + giá + tồn kho + status badge); tap card → mở edit; menu 3-chấm cho Xoá
**And** dưới bảng: `<Pagination>` hiển thị page hiện tại, tổng trang, tổng số sản phẩm, nút Prev/Next, hỗ trợ nhảy trực tiếp tới page bằng input
**And** badge tồn kho:

- `current_stock = 0` → badge đỏ "Hết hàng"
- `current_stock <= min_stock && min_stock > 0` → badge vàng "Sắp hết"
- còn lại → badge xanh nhẹ với số lượng

### AC6: Search + Filter UI

**Given** trang `/products` đang hiển thị danh sách
**When** người dùng gõ vào ô search
**Then** debounce 300ms rồi cập nhật `search` query, reset về page 1
**And** thanh filter trên cùng có:

- `<Input>` search (icon `Search` bên trái, placeholder "Tìm theo tên, SKU hoặc barcode")
- `<Select>` danh mục: option "Tất cả danh mục" (default), "Chưa phân loại" (mapping `'none'`), rồi từng danh mục cấp 1 (group label) + danh mục cấp 2 (indent)
- `<Select>` trạng thái: "Tất cả", "Đang bán", "Ngừng bán"
- `<Select>` tồn kho: "Tất cả", "Còn hàng", "Hết hàng", "Dưới định mức"
  **And** các filter kết hợp nhau (AND logic ở backend)
  **And** desktop: layout hàng ngang flex-wrap; mobile: layout dọc, có nút "Lọc" mở `<Sheet>` chứa các filter

### AC7: Form tạo / sửa sản phẩm với toggle theo dõi tồn kho

**Given** form tạo hoặc sửa sản phẩm đang mở (`<ProductFormDialog>` desktop hoặc `<Sheet>` mobile)
**When** người dùng tương tác
**Then** form layout 1 cột mobile, 2 cột desktop, các section:

1. **Thông tin cơ bản**: Tên (required), SKU (placeholder gợi ý "Để trống để tự sinh"), Barcode (optional), Danh mục (Select có tree 2 cấp), Đơn vị tính (default "Cái")
2. **Giá**: Giá bán (required, format VND khi blur), Giá vốn (optional, format VND)
3. **Hình ảnh**: 1 ảnh, ≤5MB, jpg/png/webp; component `<ImageUpload>` với drop zone + preview + nút Xoá. Story 2.2 dùng implementation TỐI THIỂU: chấp nhận URL string truyền tay (input text) + nút "Tải ảnh lên" gọi placeholder backend `POST /api/v1/uploads` (chưa hiện thực trong story này, để dummy gửi base64 → trả URL data: hoặc skip, xem Dev Notes mục "Image Upload tạm thời")
4. **Trạng thái**: Toggle Đang bán / Ngừng bán
5. **Theo dõi tồn kho**: Toggle `trackInventory`. Khi bật → unfold thêm 2 field: Tồn kho ban đầu (`initialStock`, chỉ hiện ở mode create), Định mức tối thiểu (`minStock`). Khi tắt → ẩn 2 field, gửi `trackInventory = false`

**And** validation realtime trên blur, error message inline dưới field
**And** mode `'edit'`: pre-fill từ `ProductDetail` API trả; field `initialStock` ẨN HOÀN TOÀN (chỉ dùng khi create); field `currentStock` hiển thị READ-ONLY với chú thích "Cập nhật qua phiếu nhập kho/kiểm kho ở Story 2.4"
**And** submit thành công → toast success "Đã tạo sản phẩm" / "Đã cập nhật sản phẩm", đóng dialog, invalidate `['products']` query

### AC8: Sửa sản phẩm (PATCH /api/v1/products/:id)

**Given** Owner/Manager nhấn icon Edit hoặc tap vào tên sản phẩm
**When** mở form pre-filled rồi sửa và Lưu → gọi `PATCH /api/v1/products/:id`
**Then** API validate qua `updateProductSchema` (tất cả field optional, refine ≥ 1 field):

- Service kiểm tra:
  - Target tồn tại + `target.storeId === actor.storeId` + `target.deletedAt IS NULL` → nếu không → 404
  - Đổi `sku`: kiểm tra unique trong (store, alive products, excludeId=target.id) → 409 CONFLICT field=sku
  - Đổi `barcode`: tương tự
  - Đổi `categoryId`: validate cùng store
  - Story 2.2 KHÔNG cho phép đổi `trackInventory` từ true → false khi `current_stock > 0` → 422 "Vui lòng kiểm kho về 0 trước khi tắt theo dõi tồn kho"
  - Story 2.2 KHÔNG cho phép sửa `currentStock` trực tiếp qua endpoint này (chỉ qua phiếu nhập/kiểm kho ở story 2.4) → schema không nhận `currentStock`
- Update các field thay đổi, ghi audit `action='product.updated'`, `changes` là diff before/after qua `diffObjects`
- Trả 200 với `ProductDetail` mới

### AC9: Xoá mềm và khôi phục sản phẩm

**Given** Owner/Manager nhấn icon Xoá
**When** mở `<AlertDialog>` "Bạn có chắc muốn xoá sản phẩm [tên]?", xác nhận → gọi `DELETE /api/v1/products/:id`
**Then** service `deleteProduct`:

- Target tồn tại + cùng store + chưa bị xoá → nếu không → 404
- Set `deleted_at = NOW()` (soft delete), KHÔNG hard delete
- Sản phẩm bị soft delete TỰ ĐỘNG ẨN khỏi list mặc định (filter `deleted_at IS NULL`) nhưng giữ liên kết với hoá đơn lịch sử (Story 7.1)
- Ghi audit `action='product.deleted'`, `changes={ name, sku, snapshot trước khi xoá }`
- Trả 200 `{ data: { ok: true } }`

**And** thêm endpoint `GET /api/v1/products/trashed?page=&pageSize=` trả danh sách sản phẩm `deleted_at IS NOT NULL` của store → UI tab/sheet "Sản phẩm đã xoá"
**And** thêm endpoint `POST /api/v1/products/:id/restore` set `deleted_at = NULL` → trả `ProductDetail` → audit `action='product.restored'`
**And** UI: trên trang `/products`, có nút phụ "Sản phẩm đã xoá" mở `<Sheet>` liệt kê các sản phẩm đã xoá kèm nút "Khôi phục" mỗi dòng

### AC10: Permission, Multi-tenant Safety và Audit

**Given** ma trận quyền hiện tại
**When** kiểm tra access
**Then** mọi route `/api/v1/products/*` yêu cầu `requireAuth` + `requirePermission('products.manage')` (Owner và Manager, KHÔNG Staff)
**And** mọi service query CHẶT CHẼ filter theo `actor.storeId` và `deleted_at IS NULL` cho query mặc định
**And** Frontend route `/products` đã có `beforeLoad: requirePermissionGuard('products.manage')` từ Story 2.1, KHÔNG cần đổi
**And** audit action mới thêm vào `auditActionSchema`: `'product.created'`, `'product.updated'`, `'product.deleted'`, `'product.restored'`, `'product.stock_initialized'`
**And** action label tiếng Việt thêm vào `apps/web/src/features/audit/action-labels.ts`:

- `'product.created': 'Tạo sản phẩm'`
- `'product.updated': 'Sửa sản phẩm'`
- `'product.deleted': 'Xoá sản phẩm'`
- `'product.restored': 'Khôi phục sản phẩm'`
- `'product.stock_initialized': 'Khởi tạo tồn kho'`
  **And** thêm action group "Sản phẩm" gom 5 action mới

### AC11: Liên kết với danh mục (categories) — defensive integration

**Given** Story 2.1 đã có check defensive trong `deleteCategory` (try-catch FK violation)
**When** Story 2.2 thêm FK `products.category_id → categories.id ON DELETE RESTRICT`
**Then** xoá danh mục đang chứa sản phẩm → DB throw FK violation 23503 → service `deleteCategory` đã catch và throw `BUSINESS_RULE_VIOLATION` với message "Danh mục đang chứa sản phẩm, không thể xoá" (đã có sẵn từ Story 2.1)
**And** BỔ SUNG thêm count chính xác: trước khi delete, query `SELECT count(*) FROM products WHERE category_id = ? AND deleted_at IS NULL` → nếu > 0 → throw `BUSINESS_RULE_VIOLATION` "Danh mục đang chứa X sản phẩm, không thể xoá" (X cụ thể, đáp ứng AC6 Story 2.1 đầy đủ)
**And** category dropdown trong form sản phẩm reuse `useCategoriesQuery` từ Story 2.1, build option list theo cây 2 cấp (cấp 1 dạng group, cấp 2 indent)

### AC12: SKU auto-generation

**Given** form tạo sản phẩm, người dùng để trống ô SKU
**When** submit
**Then** service generate SKU theo format `SP-` + 6 chữ số ngẫu nhiên (000000-999999)
**And** kiểm tra unique trong (store, alive products) bằng query trước insert; nếu trùng → retry tối đa 5 lần với số ngẫu nhiên mới
**And** nếu cạn retry → throw `INTERNAL_ERROR` "Không tạo được SKU duy nhất, vui lòng nhập tay"
**And** UI có nút helper "Sinh SKU" cạnh ô SKU: client gọi helper local `generateRandomSku()` để gợi ý nhanh (không guarantee unique, server vẫn check)

### AC13: Định dạng giá VND

**Given** input `sellingPrice` hoặc `costPrice` trong form
**When** người dùng gõ rồi blur
**Then** format hiển thị thành dạng có dấu chấm phân cách hàng nghìn (VD: `150000` → `150.000`)
**And** value submit lên server vẫn là integer thuần
**And** display giá trong table/card dùng `Intl.NumberFormat('vi-VN')` với suffix `' đ'` (VD: `150.000 đ`)
**And** helper format/parse đặt ở `apps/web/src/lib/currency.ts` (file mới, pure function, có test)

## Tasks / Subtasks

### Phase A: Backend Schema + Migration

- [ ] Task 1: Tạo Drizzle schema `products` và `inventory_transactions` (AC: #1, #2, #11)
  - [ ] 1.1: Tạo `packages/shared/src/schema/products.ts`:

    ```ts
    import { sql } from 'drizzle-orm'
    import {
      bigint,
      boolean,
      index,
      integer,
      pgTable,
      text,
      timestamp,
      uniqueIndex,
      uuid,
      varchar,
    } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'

    import { categories } from './categories.js'
    import { stores } from './stores.js'

    export const products = pgTable(
      'products',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id, { onDelete: 'restrict' }),
        name: varchar({ length: 255 }).notNull(),
        sku: varchar({ length: 64 }).notNull(),
        barcode: varchar({ length: 64 }),
        categoryId: uuid().references(() => categories.id, { onDelete: 'restrict' }),
        sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
        costPrice: bigint({ mode: 'number' }),
        unit: varchar({ length: 32 }).notNull().default('Cái'),
        imageUrl: text(),
        status: varchar({ length: 16 }).notNull().default('active'),
        hasVariants: boolean().notNull().default(false),
        trackInventory: boolean().notNull().default(false),
        currentStock: integer().notNull().default(0),
        minStock: integer().notNull().default(0),
        deletedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        // partial unique vì soft delete: chỉ unique trong sản phẩm còn sống
        uniqueIndex('uniq_products_store_sku_alive')
          .on(table.storeId, sql`LOWER(${table.sku})`)
          .where(sql`${table.deletedAt} IS NULL`),
        uniqueIndex('uniq_products_store_barcode_alive')
          .on(table.storeId, table.barcode)
          .where(sql`${table.deletedAt} IS NULL AND ${table.barcode} IS NOT NULL`),
        index('idx_products_store_status_created').on(table.storeId, table.status, table.createdAt),
        index('idx_products_store_category').on(table.storeId, table.categoryId),
        index('idx_products_store_name_lower').on(table.storeId, sql`LOWER(${table.name})`),
      ],
    )
    ```

  - [ ] 1.2: Tạo `packages/shared/src/schema/inventory-transactions.ts`:

    ```ts
    import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'

    import { products } from './products.js'
    import { stores } from './stores.js'
    import { users } from './users.js'

    export const inventoryTransactions = pgTable(
      'inventory_transactions',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id),
        productId: uuid()
          .notNull()
          .references(() => products.id, { onDelete: 'restrict' }),
        type: varchar({ length: 32 }).notNull(),
        quantity: integer().notNull(),
        note: text(),
        createdBy: uuid()
          .notNull()
          .references(() => users.id),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      },
      (table) => [index('idx_inventory_tx_product_created').on(table.productId, table.createdAt)],
    )
    ```

  - [ ] 1.3: Export 2 schema mới từ `packages/shared/src/schema/index.ts`
  - [ ] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → file `0008_*.sql`. Kiểm tra:
    - CREATE TABLE products + indexes (kể cả 2 partial unique với mệnh đề `WHERE`)
    - CREATE TABLE inventory_transactions + index
    - FK `products.category_id → categories.id ON DELETE RESTRICT`
  - [ ] 1.5: Nếu Drizzle 0.45 KHÔNG generate được `WHERE` clause cho partial unique index → append manual SQL vào file migration:
    ```sql
    DROP INDEX IF EXISTS "uniq_products_store_sku_alive";
    CREATE UNIQUE INDEX "uniq_products_store_sku_alive"
      ON "products" ("store_id", LOWER("sku"))
      WHERE "deleted_at" IS NULL;
    DROP INDEX IF EXISTS "uniq_products_store_barcode_alive";
    CREATE UNIQUE INDEX "uniq_products_store_barcode_alive"
      ON "products" ("store_id", "barcode")
      WHERE "deleted_at" IS NULL AND "barcode" IS NOT NULL;
    ```
  - [ ] 1.6: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB, verify SQL output đúng

- [ ] Task 2: Zod schemas (AC: #2, #3, #4, #8, #12)
  - [ ] 2.1: Tạo `packages/shared/src/schema/product-management.ts`:

    ```ts
    import { z } from 'zod'

    const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
    const SKU_REGEX = /^[A-Za-z0-9_\-./]+$/
    const BARCODE_REGEX = /^[A-Za-z0-9]+$/

    export const productStatusSchema = z.enum(['active', 'inactive'])
    export type ProductStatus = z.infer<typeof productStatusSchema>

    export const productNameSchema = z
      .string({ required_error: 'Vui lòng nhập tên sản phẩm' })
      .trim()
      .min(1, 'Vui lòng nhập tên sản phẩm')
      .max(255, 'Tên sản phẩm tối đa 255 ký tự')
      .regex(NAME_REGEX, 'Tên sản phẩm chứa ký tự không hợp lệ')

    export const productSkuSchema = z
      .string()
      .trim()
      .min(1, 'Mã SKU không được trống')
      .max(64, 'SKU tối đa 64 ký tự')
      .regex(SKU_REGEX, 'SKU chỉ chấp nhận chữ, số và - _ . /')

    export const productBarcodeSchema = z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(BARCODE_REGEX, 'Barcode chỉ chấp nhận chữ và số')

    export const createProductSchema = z.object({
      name: productNameSchema,
      sku: productSkuSchema.optional(),
      barcode: productBarcodeSchema.nullable().optional(),
      categoryId: z.string().uuid('Danh mục không hợp lệ').nullable().optional(),
      sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
      costPrice: z.number().int().min(0).nullable().optional(),
      unit: z.string().trim().min(1).max(32).default('Cái'),
      imageUrl: z.string().url('URL ảnh không hợp lệ').nullable().optional(),
      status: productStatusSchema.default('active'),
      trackInventory: z.boolean().default(false),
      minStock: z.number().int().min(0).default(0),
      initialStock: z.number().int().min(0).default(0),
    })

    export const updateProductSchema = z
      .object({
        name: productNameSchema.optional(),
        sku: productSkuSchema.optional(),
        barcode: productBarcodeSchema.nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        sellingPrice: z.number().int().min(0).optional(),
        costPrice: z.number().int().min(0).nullable().optional(),
        unit: z.string().trim().min(1).max(32).optional(),
        imageUrl: z.string().url().nullable().optional(),
        status: productStatusSchema.optional(),
        trackInventory: z.boolean().optional(),
        minStock: z.number().int().min(0).optional(),
      })
      .refine((d) => Object.keys(d).length > 0, {
        message: 'Cần ít nhất một trường để cập nhật',
      })

    export const stockFilterSchema = z.enum(['in_stock', 'out_of_stock', 'below_min'])

    export const listProductsQuerySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().optional(),
      categoryId: z.union([z.string().uuid(), z.literal('none')]).optional(),
      status: z.enum(['active', 'inactive', 'all']).default('all'),
      stockFilter: stockFilterSchema.optional(),
    })

    export const productListItemSchema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      sku: z.string(),
      barcode: z.string().nullable(),
      categoryId: z.string().uuid().nullable(),
      categoryName: z.string().nullable(),
      sellingPrice: z.number(),
      costPrice: z.number().nullable(),
      unit: z.string(),
      imageUrl: z.string().nullable(),
      status: productStatusSchema,
      trackInventory: z.boolean(),
      currentStock: z.number(),
      minStock: z.number(),
      hasVariants: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })

    export const productDetailSchema = productListItemSchema.extend({
      storeId: z.string().uuid(),
      deletedAt: z.string().nullable(),
    })

    export type CreateProductInput = z.infer<typeof createProductSchema>
    export type UpdateProductInput = z.infer<typeof updateProductSchema>
    export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
    export type ProductListItem = z.infer<typeof productListItemSchema>
    export type ProductDetail = z.infer<typeof productDetailSchema>
    export type StockFilter = z.infer<typeof stockFilterSchema>
    ```

  - [ ] 2.2: Re-export từ `packages/shared/src/schema/index.ts`
  - [ ] 2.3: Co-located test `product-management.test.ts` cover: tên trống, tên >255, SKU regex sai, barcode regex sai, sellingPrice âm, không integer, page/pageSize coerce; valid input đầy đủ; refine update yêu cầu ≥1 field

- [ ] Task 3: Mở rộng audit action enum (AC: #10)
  - [ ] 3.1: Sửa `packages/shared/src/schema/audit-log.ts`: thêm vào `auditActionSchema` enum:
    - `'product.created'`
    - `'product.updated'`
    - `'product.deleted'`
    - `'product.restored'`
    - `'product.stock_initialized'`
  - [ ] 3.2: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - Thêm 5 cặp label tiếng Việt
    - Thêm group `{ label: 'Sản phẩm', actions: ['product.created', 'product.updated', 'product.deleted', 'product.restored', 'product.stock_initialized'] }` vào `ACTION_GROUPS`

### Phase B: Backend Service + Routes

- [ ] Task 4: Products service (AC: #2, #4, #8, #9, #11, #12)
  - [ ] 4.1: Tạo `apps/api/src/services/products.service.ts` với các function:
    - `listProducts({ db, storeId, query }) → { items, total }`: build WHERE conditions theo `query`, LEFT JOIN `categories` để lấy `categoryName`, count + paginate, sort
    - `getProduct({ db, storeId, productId, includeDeleted })`: trả `ProductDetail` hoặc throw 404
    - `createProduct({ db, actor, input, meta })`: resolve SKU (auto-gen nếu trống), validate `categoryId` cùng store, insert + ghi audit + nếu trackInventory && initialStock>0 → insert inventory_transaction + update current_stock
    - `updateProduct({ db, actor, productId, input, meta })`: validate ownership, validate đổi sku/barcode unique (trừ self), validate đổi categoryId cùng store, validate `trackInventory: true → false` chỉ cho khi `current_stock = 0`, update + diff audit
    - `deleteProduct({ db, actor, productId, meta })`: soft delete, audit
    - `restoreProduct({ db, actor, productId, meta })`: validate target có deleted_at, kiểm tra SKU/barcode không bị sản phẩm sống khác chiếm (vì partial unique chỉ enforce alive), nếu trùng → 409 với message rõ ràng "SKU đã được dùng cho sản phẩm khác, vui lòng đổi SKU sản phẩm cũ trước khi khôi phục" → set deletedAt = null, audit
    - `listTrashed({ db, storeId, query })`: tương tự `listProducts` nhưng WHERE `deleted_at IS NOT NULL`
  - [ ] 4.2: Helper `toProductListItem(row, categoryName)` map Drizzle row → `ProductListItem`
  - [ ] 4.3: Helper `generateUniqueSku({ db, storeId, prefix='SP-', maxRetry=5 })`: loop sinh `SP-` + `String(Math.floor(Math.random()*1_000_000)).padStart(6, '0')`, check qua query SELECT 1 WHERE storeId AND LOWER(sku) AND deletedAt IS NULL
  - [ ] 4.4: Catch DB error code 23505 (unique violation) trên 2 partial unique → phân biệt qua `constraint_name` thành `CONFLICT field=sku` hoặc `CONFLICT field=barcode`. Pattern theo `categories.service.ts:isUniqueNameViolation`
  - [ ] 4.5: Catch DB error 23503 (FK violation) khi insert/update với `categoryId` không tồn tại (race condition) → throw `NOT_FOUND` "Không tìm thấy danh mục"
  - [ ] 4.6: Mọi audit log call dùng helper `logAction` với `actorRole: actor.role` trong transaction (pattern từ `categories.service.ts`)

- [ ] Task 5: Cải tiến `categories.service.ts` cho count chính xác (AC: #11)
  - [ ] 5.1: Trong `deleteCategory`: trước try-catch FK, thêm query đếm sản phẩm:
    ```ts
    const productCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.categoryId, targetId), isNull(products.deletedAt)))
    if ((productCount[0]?.count ?? 0) > 0) {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Danh mục đang chứa ${productCount[0]!.count} sản phẩm, không thể xoá`,
      )
    }
    ```
  - [ ] 5.2: Giữ try-catch FK violation 23503 ngoài cùng làm defense-in-depth (cho case race condition giữa count và delete)
  - [ ] 5.3: Cập nhật test `categories.integration.test.ts`: thêm case "Xoá danh mục có sản phẩm sống → 422 với message chứa số đếm chính xác"

- [ ] Task 6: Products routes (AC: #2, #4, #8, #9, #10)
  - [ ] 6.1: Tạo `apps/api/src/routes/products.routes.ts` theo pattern `categories.routes.ts`:

    ```ts
    import { Hono } from 'hono'
    import { z } from 'zod'

    import {
      createProductSchema,
      listProductsQuerySchema,
      updateProductSchema,
    } from '@kiotviet-lite/shared'

    import type { Db } from '../db/index.js'
    import { parseJson } from '../lib/http.js'
    import { requireAuth } from '../middleware/auth.middleware.js'
    import { errorHandler } from '../middleware/error-handler.js'
    import { requirePermission } from '../middleware/rbac.middleware.js'
    import { getRequestMeta } from '../services/audit.service.js'
    import {
      createProduct,
      deleteProduct,
      getProduct,
      listProducts,
      listTrashed,
      restoreProduct,
      updateProduct,
    } from '../services/products.service.js'

    const uuidParam = z.string().uuid('ID không hợp lệ')

    export interface ProductsRoutesDeps { db: Db }

    export function createProductsRoutes({ db }: ProductsRoutesDeps) {
      const app = new Hono()
      app.onError(errorHandler)
      app.use('*', requireAuth)
      app.use('*', requirePermission('products.manage'))

      app.get('/', async (c) => {
        const auth = c.get('auth')
        const query = listProductsQuerySchema.parse(c.req.query())
        const result = await listProducts({ db, storeId: auth.storeId, query })
        return c.json({
          data: result.items,
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
          },
        })
      })

      app.get('/trashed', async (c) => {
        const auth = c.get('auth')
        const query = listProductsQuerySchema.parse(c.req.query())
        const result = await listTrashed({ db, storeId: auth.storeId, query })
        return c.json({ data: result.items, meta: { ... } })
      })

      app.get('/:id', async (c) => {
        const auth = c.get('auth')
        const id = uuidParam.parse(c.req.param('id'))
        const data = await getProduct({ db, storeId: auth.storeId, productId: id })
        return c.json({ data })
      })

      app.post('/', async (c) => {
        const auth = c.get('auth')
        const input = await parseJson(c, createProductSchema)
        const data = await createProduct({ db, actor: auth, input, meta: getRequestMeta(c) })
        return c.json({ data }, 201)
      })

      app.patch('/:id', async (c) => {
        const auth = c.get('auth')
        const id = uuidParam.parse(c.req.param('id'))
        const input = await parseJson(c, updateProductSchema)
        const data = await updateProduct({ db, actor: auth, productId: id, input, meta: getRequestMeta(c) })
        return c.json({ data })
      })

      app.delete('/:id', async (c) => {
        const auth = c.get('auth')
        const id = uuidParam.parse(c.req.param('id'))
        const data = await deleteProduct({ db, actor: auth, productId: id, meta: getRequestMeta(c) })
        return c.json({ data })
      })

      app.post('/:id/restore', async (c) => {
        const auth = c.get('auth')
        const id = uuidParam.parse(c.req.param('id'))
        const data = await restoreProduct({ db, actor: auth, productId: id, meta: getRequestMeta(c) })
        return c.json({ data })
      })

      return app
    }
    ```

  - [ ] 6.2: Mount vào `apps/api/src/index.ts` sau `/api/v1/categories`:
    ```ts
    app.route('/api/v1/products', createProductsRoutes({ db }))
    ```
  - [ ] 6.3: Đặt route `/trashed` TRƯỚC `/:id` để tránh Hono match `/:id` với literal `'trashed'`

### Phase C: Frontend (apps/web)

- [ ] Task 7: Currency helper + tests (AC: #13)
  - [ ] 7.1: Tạo `apps/web/src/lib/currency.ts`:

    ```ts
    const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

    export function formatVnd(value: number | null | undefined): string {
      if (value === null || value === undefined || Number.isNaN(value)) return ''
      return VND_FORMATTER.format(value)
    }

    export function formatVndWithSuffix(value: number | null | undefined): string {
      const s = formatVnd(value)
      return s ? `${s} đ` : ''
    }

    export function parseVnd(input: string): number | null {
      const cleaned = input.replace(/[^\d-]/g, '')
      if (cleaned.length === 0) return null
      const n = Number(cleaned)
      if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) return null
      return n
    }
    ```

  - [ ] 7.2: Co-located test `currency.test.ts`: format integer 0/100/150000/1500000, parse "150.000"/"1.500.000 đ"/" 25,000 "/empty/letters/negative

- [ ] Task 8: API client + TanStack Query hooks (AC: #2, #4, #8, #9)
  - [ ] 8.1: Tạo `apps/web/src/features/products/products-api.ts`:

    ```ts
    import type {
      CreateProductInput,
      ListProductsQuery,
      ProductDetail,
      ProductListItem,
      UpdateProductInput,
    } from '@kiotviet-lite/shared'

    import { apiClient } from '@/lib/api-client'

    interface Envelope<T> {
      data: T
    }
    interface ListEnvelope<T> {
      data: T
      meta: { page: number; pageSize: number; total: number; totalPages: number }
    }

    function buildQuery(q: Partial<ListProductsQuery>): string {
      const params = new URLSearchParams()
      if (q.page) params.set('page', String(q.page))
      if (q.pageSize) params.set('pageSize', String(q.pageSize))
      if (q.search) params.set('search', q.search)
      if (q.categoryId) params.set('categoryId', q.categoryId)
      if (q.status) params.set('status', q.status)
      if (q.stockFilter) params.set('stockFilter', q.stockFilter)
      const s = params.toString()
      return s ? `?${s}` : ''
    }

    export function listProductsApi(query: Partial<ListProductsQuery>) {
      return apiClient.get<ListEnvelope<ProductListItem[]>>(`/api/v1/products${buildQuery(query)}`)
    }
    export function listTrashedProductsApi(query: Partial<ListProductsQuery>) {
      return apiClient.get<ListEnvelope<ProductListItem[]>>(
        `/api/v1/products/trashed${buildQuery(query)}`,
      )
    }
    export function getProductApi(id: string) {
      return apiClient.get<Envelope<ProductDetail>>(`/api/v1/products/${id}`)
    }
    export function createProductApi(input: CreateProductInput) {
      return apiClient.post<Envelope<ProductDetail>>('/api/v1/products', input)
    }
    export function updateProductApi(id: string, input: UpdateProductInput) {
      return apiClient.patch<Envelope<ProductDetail>>(`/api/v1/products/${id}`, input)
    }
    export function deleteProductApi(id: string) {
      return apiClient.delete<Envelope<{ ok: true }>>(`/api/v1/products/${id}`)
    }
    export function restoreProductApi(id: string) {
      return apiClient.post<Envelope<ProductDetail>>(`/api/v1/products/${id}/restore`)
    }
    ```

  - [ ] 8.2: Tạo `apps/web/src/features/products/use-products.ts` (pattern từ `use-categories.ts` + `use-users.ts`):
    - `useProductsQuery(query)`: queryKey `['products', query]`, `keepPreviousData: true` để pagination smooth
    - `useTrashedProductsQuery(query)`: queryKey `['products', 'trashed', query]`
    - `useProductQuery(id)`: queryKey `['products', id]`
    - `useCreateProductMutation()`, `useUpdateProductMutation()`, `useDeleteProductMutation()`, `useRestoreProductMutation()` → invalidate `['products']` toàn bộ subtree
  - [ ] 8.3: Reuse hook debounce ở `staff-manager.tsx:26-33` → cân nhắc trích lên `apps/web/src/hooks/use-debounced.ts`. Nếu trích → cập nhật cả `staff-manager.tsx`

- [ ] Task 9: ProductFormDialog (AC: #3, #7, #8, #12, #13)
  - [ ] 9.1: Tạo `apps/web/src/features/products/product-form-dialog.tsx` theo pattern `category-form-dialog.tsx` + `staff-form-dialog.tsx`:
    - Mode `'create'` hoặc `'edit'`. Props: `open`, `onOpenChange`, `mode`, `product?: ProductDetail`
    - Form react-hook-form + `zodResolver(createProductSchema | updateProductSchema)`, mode `'onTouched'`
    - Section "Thông tin cơ bản":
      - Input `name` (required, autofocus, maxLength 255)
      - Input `sku` (placeholder "Để trống để tự sinh") với nút bên phải "Sinh SKU" gọi `generateRandomSku()` local helper set vào form
      - Input `barcode` (optional)
      - Select `categoryId` build từ `useCategoriesQuery`: option đầu "Không phân loại" (value `__NONE__`), rồi từng cấp 1 với label đậm + cấp 2 indent (sử dụng `buildCategoryTree`); chọn → setValue uuid hoặc null
      - Input `unit` (default "Cái")
    - Section "Giá":
      - 2 input số `sellingPrice`, `costPrice` với component `<CurrencyInput>` (xem 9.2)
    - Section "Hình ảnh":
      - Input text `imageUrl` (URL string) — implementation tối thiểu story 2.2. Story tương lai sẽ thay bằng upload thực
      - Helper text: "Tối đa 1 ảnh. Story 2.2 chỉ hỗ trợ dán URL ảnh."
    - Section "Trạng thái":
      - 2 radio button hoặc Select `status`: Đang bán / Ngừng bán
    - Section "Theo dõi tồn kho":
      - Toggle/Switch `trackInventory` (component `<Switch>` từ shadcn — KIỂM TRA xem đã add chưa, nếu chưa thì `pnpm dlx shadcn@latest add switch`)
      - Conditional fields khi `trackInventory = true`:
        - `initialStock` (chỉ hiện ở mode create, integer ≥ 0)
        - `minStock` (cả 2 mode, integer ≥ 0)
      - Mode edit: hiển thị thêm `currentStock` READ-ONLY với chú thích "Cập nhật qua phiếu nhập kho/kiểm kho ở Story 2.4"
    - Submit:
      - Create: `useCreateProductMutation`, success → toast "Đã tạo sản phẩm", close dialog
      - Edit: `useUpdateProductMutation`, success → toast "Đã cập nhật sản phẩm"
      - Error: pattern `handleApiError` từ `category-form-dialog.tsx:282-303`. Map CONFLICT field=sku/barcode → setError tương ứng
    - Footer: 2 nút "Hủy" và "Lưu" (disable khi `!isValid || isPending`)
  - [ ] 9.2: Tạo helper `apps/web/src/features/products/sku.ts`:

    ```ts
    export function generateRandomSku(): string {
      const n = Math.floor(Math.random() * 1_000_000)
      return `SP-${String(n).padStart(6, '0')}`
    }
    ```

  - [ ] 9.3: Tạo component `apps/web/src/components/shared/currency-input.tsx`:
    - Props: `value: number | null`, `onChange: (v: number | null) => void`, `placeholder`, các Input HTML props
    - Nội bộ giữ string state cho display; format `formatVnd` khi blur; parse `parseVnd` khi blur để gửi number lên onChange; suffix "đ" hiển thị bằng decoration
    - `inputMode='numeric'` để mobile mở keypad số

- [ ] Task 10: ProductTable (desktop) + ProductCardList (mobile) (AC: #5)
  - [ ] 10.1: Tạo `apps/web/src/features/products/product-table.tsx`:
    - Props: `items: ProductListItem[]`, `onEdit(p)`, `onDelete(p)`
    - Cột: Ảnh thumbnail 40x40 (nếu null → icon `Package` tròn xám), Tên (font-medium, truncate), SKU (font-mono text-xs muted), Danh mục (text muted, "—" nếu null), Giá bán (`formatVndWithSuffix`, right align), Tồn kho (helper `<StockBadge>`, ẩn nếu `!trackInventory` thì "∞"), Trạng thái (badge xanh "Đang bán" / xám "Ngừng bán"), Thao tác (Pencil + Trash2 ghost buttons)
  - [ ] 10.2: Tạo `apps/web/src/features/products/product-card-list.tsx`:
    - Mỗi card: ảnh trái 64x64, info phải (Tên + SKU + giá + tồn kho + status badge), menu 3 chấm (Sửa/Xoá)
    - Tap card → onEdit
  - [ ] 10.3: Tạo `apps/web/src/features/products/stock-badge.tsx`:
    - Props: `currentStock: number`, `minStock: number`, `trackInventory: boolean`
    - `!trackInventory` → "∞" muted
    - `currentStock = 0` → badge `bg-red-100 text-red-700` "Hết hàng"
    - `currentStock <= minStock && minStock > 0` → badge `bg-amber-100 text-amber-700` "Sắp hết · {currentStock}"
    - else → badge `bg-emerald-100 text-emerald-700` `{currentStock}`

- [ ] Task 11: Pagination component (AC: #5)
  - [ ] 11.1: Tạo `apps/web/src/components/shared/pagination.tsx`:
    - Props: `page`, `pageSize`, `total`, `totalPages`, `onPageChange(page)`
    - Layout: bên trái text "Hiển thị X-Y / Z sản phẩm", bên phải nút "Trước" + input số jump-to-page + "Sau"
    - Disable Trước khi page=1, Sau khi page=totalPages
    - Mobile: ẩn input jump-to, chỉ giữ text + 2 nút

- [ ] Task 12: ProductFilters component (AC: #6)
  - [ ] 12.1: Tạo `apps/web/src/features/products/product-filters.tsx`:
    - Props: `value: { search, categoryId, status, stockFilter }`, `onChange(partial)`, `categories: CategoryItem[]` (từ `useCategoriesQuery`)
    - Render:
      - Input search (icon `Search`, debounce ở parent — component này chỉ controlled)
      - Select danh mục: option "Tất cả danh mục" (value `__ALL__`), "Chưa phân loại" (value `__NONE__`), rồi từng cấp 1 (label tự nhiên, không dùng `<SelectGroup>` để giữ đơn giản; cấp 2 indent qua spaces đầu label)
      - Select trạng thái: "Tất cả", "Đang bán", "Ngừng bán"
      - Select tồn kho: "Tất cả", "Còn hàng", "Hết hàng", "Dưới định mức"
    - Desktop: layout flex-row gap-2 flex-wrap; Mobile: nút "Lọc" mở `<Sheet>` chứa các Select dọc, search bar luôn hiện ở ngoài

- [ ] Task 13: TrashedProductsSheet (AC: #9)
  - [ ] 13.1: Tạo `apps/web/src/features/products/trashed-products-sheet.tsx`:
    - Trigger: nút "Sản phẩm đã xoá" (icon `Trash2`, variant outline, đặt cạnh nút "Quản lý danh mục" trong header `ProductsManager`)
    - Mở `<Sheet side='right'>` (md+) hoặc `<Sheet side='bottom'>` (mobile)
    - Nội dung: tiêu đề "Sản phẩm đã xoá" + danh sách (dùng `useTrashedProductsQuery`), mỗi dòng: ảnh + tên + SKU + nút "Khôi phục" (dùng `useRestoreProductMutation`)
    - Empty state: "Không có sản phẩm nào bị xoá"
    - Khôi phục thành công → toast "Đã khôi phục sản phẩm", invalidate `['products']` cả 2 subtree

- [ ] Task 14: ProductsManager (AC: #2-#9)
  - [ ] 14.1: Tạo `apps/web/src/features/products/products-manager.tsx` thay thế nội dung cũ của `<ProductsPage>`:
    - State: `searchInput`, `debouncedSearch`, `categoryId`, `status`, `stockFilter`, `page`, `pageSize=20`, `createOpen`, `editTarget`, `deleteTarget`, `trashedOpen`
    - Build `query = { page, pageSize, search: debouncedSearch || undefined, categoryId, status, stockFilter }`
    - `productsQuery = useProductsQuery(query)`
    - `categoriesQuery = useCategoriesQuery()`
    - Header: title "Sản phẩm", description "Quản lý danh sách hàng hoá của cửa hàng", nhóm nút phải:
      - Nút outline "Sản phẩm đã xoá" (icon Trash2) → mở `TrashedProductsSheet`
      - Nút outline "Quản lý danh mục" (icon FolderTree, link `/products/categories`)
      - Nút primary "Thêm sản phẩm" (icon Plus) → mở form mode create
    - Filters block: `<ProductFilters>` controlled
    - Body:
      - `productsQuery.isLoading` → skeleton (5 dòng card xám) HOẶC text "Đang tải…"
      - `isError` → text destructive
      - `data.length === 0`:
        - Nếu chưa filter (debouncedSearch+categoryId+status+stockFilter đều default) → `<EmptyState icon={Package} title="Chưa có sản phẩm nào" description="Thêm sản phẩm đầu tiên để bắt đầu bán hàng" actionLabel="Thêm sản phẩm" onAction={...} />`
        - Nếu đang filter → `<EmptyState icon={SearchX} title="Không tìm thấy sản phẩm" description="Thử bỏ bớt bộ lọc" />` (KHÔNG có nút action)
      - else: desktop → `<ProductTable>`; mobile → `<ProductCardList>`
      - `<Pagination>` ở dưới
    - Dialogs: ProductFormDialog (create/edit), DeleteProductDialog, TrashedProductsSheet
  - [ ] 14.2: Tạo `apps/web/src/features/products/delete-product-dialog.tsx` theo pattern `delete-category-dialog.tsx`:
    - Title "Xoá sản phẩm {name}?", description "Sản phẩm sẽ được chuyển vào thùng rác. Có thể khôi phục từ mục Sản phẩm đã xoá."
    - Confirm: `useDeleteProductMutation`, success → toast "Đã xoá sản phẩm"

- [ ] Task 15: Refactor ProductsPage (AC: #2-#10)
  - [ ] 15.1: Sửa `apps/web/src/pages/products-page.tsx`:
    - XÓA placeholder hiện tại
    - Render `<ProductsManager />`
    - GIỮ comment "// Story 2.1: thêm link tới categories" → đổi thành "// Story 2.2: refactor toàn bộ thành ProductsManager"
  - [ ] 15.2: Đảm bảo route `/products` vẫn ổn (router không cần đổi)
  - [ ] 15.3: Kiểm tra Sidebar/BottomTabBar đã có `/products` với icon Package từ Story 1.3 — KHÔNG cần đổi

### Phase D: Tests + Manual verify

- [ ] Task 16: Unit tests Zod + currency + sku helper (AC: #2, #3, #4, #12, #13)
  - [ ] 16.1: `packages/shared/src/schema/product-management.test.ts`: như mô tả ở 2.3
  - [ ] 16.2: `apps/web/src/lib/currency.test.ts`: format/parse
  - [ ] 16.3: `apps/web/src/features/products/sku.test.ts`: generateRandomSku format đúng `^SP-\d{6}$`, độ dài cố định

- [ ] Task 17: API integration tests (AC: #2, #4, #8, #9, #10, #11)
  - [ ] 17.1: `apps/api/src/__tests__/products.integration.test.ts` (Vitest + PGlite, pattern từ `categories.integration.test.ts`):
    - **Create**: Owner tạo OK 201; Manager OK; Staff 403; auto-gen SKU khi không truyền; SKU trùng → 409 field=sku; barcode trùng → 409 field=barcode; categoryId không cùng store → 404; sellingPrice âm → 400 VALIDATION_ERROR; trackInventory=true + initialStock=50 → tạo `inventory_transactions` 1 dòng và `current_stock=50`
    - **List**: filter theo store; search match name/sku/barcode (case-insensitive); filter categoryId='none' trả sản phẩm không phân loại; filter status='active'; filter stockFilter='out_of_stock'; pagination meta đúng
    - **Get**: NOT_FOUND khi cross-store; trả đầy đủ field
    - **Update**: PATCH name OK; sửa sku trùng → 409; đổi categoryId cross-store → 404; đổi trackInventory true→false khi current_stock>0 → 422
    - **Delete**: soft delete, sau đó GET danh sách KHÔNG thấy; trashed list thấy; restore phục hồi; restore khi sku đã bị sản phẩm khác chiếm → 409
    - **Categories integration**: Story 2.1 deleteCategory với danh mục có 2 sản phẩm sống → 422 message "Danh mục đang chứa 2 sản phẩm, không thể xoá"
    - **Audit**: ghi đủ 5 action mới với actorRole đúng
    - **Multi-tenant**: store A không xem/sửa/xoá được sản phẩm store B
  - [ ] 17.2: Thêm 1 test case vào `categories.integration.test.ts`: deleteCategory có sản phẩm → 422 với count chính xác (verify message contain "2 sản phẩm")

- [ ] Task 18: Frontend manual verify + lint/typecheck (AC: all)
  - [ ] 18.1: `pnpm typecheck` pass tất cả packages
  - [ ] 18.2: `pnpm lint` pass (0 errors)
  - [ ] 18.3: `pnpm test` pass toàn bộ suite (không regression)
  - [ ] 18.4: Manual flow Owner desktop:
    - Đăng nhập → /products → empty state → "Thêm sản phẩm" → form mở → điền tên "Cà phê đen", giá 25000 (blur format thành 25.000), bật trackInventory, initialStock 50, minStock 10 → Lưu → toast → bảng hiện 1 dòng
    - Tạo thêm 30 sản phẩm random → pagination hoạt động (chuyển page, jump-to-page)
    - Search "cà" → debounce → kết quả lọc
    - Filter danh mục → kết quả lọc đúng
    - Filter "Hết hàng" → chỉ thấy sản phẩm current_stock=0
    - Sửa giá sản phẩm → toast → bảng cập nhật
    - Toggle trackInventory true→false khi current_stock>0 → toast error 422
    - Xoá 1 sản phẩm → confirm → toast → biến mất khỏi danh sách
    - Mở "Sản phẩm đã xoá" → thấy → khôi phục → quay lại danh sách chính
  - [ ] 18.5: Manual flow mobile (DevTools 375px): card list hiển thị đúng, sheet filter mở đúng, form trong sheet/dialog scroll được
  - [ ] 18.6: Manual flow permission: Staff truy cập /products → redirect /. Manager OK
  - [ ] 18.7: Manual flow audit: Owner thực hiện đủ 5 action (create/update/delete/restore + create với initialStock>0) → /settings/audit → thấy 5+ record với label tiếng Việt đúng + group "Sản phẩm"
  - [ ] 18.8: Manual flow categories integration: tạo danh mục "Đồ uống", tạo 2 sản phẩm gán vào "Đồ uống" → vào /products/categories → xoá "Đồ uống" → toast error "Danh mục đang chứa 2 sản phẩm, không thể xoá"

### Review Follow-ups (AI)

- [ ] [AI-Review] [M1] Escape ký tự đặc biệt LIKE wildcard trong search query (Medium)
- [ ] [AI-Review] [M2] StockBadge hiển thị "Hết hàng" khi currentStock âm thay vì trạng thái riêng (Medium)
- [ ] [AI-Review] [M3] Edit form: nút Lưu không disable khi form invalid (Medium)
- [ ] [AI-Review] [M4] Spec yêu cầu Toggle Đang bán/Ngừng bán nhưng code dùng Select dropdown (Low)
- [ ] [AI-Review] [L1] Duplicated helper functions giữa products.service.ts và categories.service.ts (Low)
- [ ] [AI-Review] [L2] parseVnd loại bỏ dấu trừ rồi parse, cho phép input "-100" thành 100 (Low)
- [ ] [AI-Review] [L3] Trashed sheet hardcode pageSize=100, không có pagination (Low)
- [ ] [AI-Review] [L4] XSS risk khi render imageUrl trực tiếp vào img src mà không validate domain (Low)

## Senior Developer Review (AI)

Review Date: 2026-04-28
Review Outcome: Approve (with suggestions)
Reviewer: Claude Code Review Agent

### Summary

Implementation chất lượng tốt. Backend service layer bao phủ đầy đủ các AC từ spec. Frontend components tách biệt rõ ràng, pattern nhất quán với Story 2.1. Không có bug logic nghiêm trọng hay lỗ hổng multi-tenant. Có vài điểm cải thiện nhỏ liên quan đến edge case handling và code reuse.

### Findings

#### High Severity

(Không có)

#### Medium Severity

- [ ] [M1] **LIKE wildcard injection trong search** `apps/api/src/services/products.service.ts:277-280` - User nhập `%` hoặc `_` trong search sẽ trở thành LIKE wildcard. Ví dụ search `%` match tất cả sản phẩm, `_` match bất kỳ 1 ký tự. Cần escape `%` thành `\%` và `_` thành `\_` trước khi đưa vào LIKE pattern. Không phải SQL injection (query parameterized), nhưng gây kết quả search sai.

- [ ] [M2] **StockBadge xử lý currentStock âm** `apps/web/src/features/products/stock-badge.tsx:11` - Điều kiện `currentStock <= 0` bắt cả giá trị âm vào "Hết hàng". Spec nói `currentStock = 0` mới là "Hết hàng". Nếu tương lai có stock âm (backorder), badge nên phân biệt. Hiện tại chấp nhận được, nhưng nên dùng `=== 0` thay `<= 0` để đúng spec.

- [ ] [M3] **Edit form không disable nút Lưu khi form invalid** `apps/web/src/features/products/product-form-dialog.tsx:290` - CreateDialog dòng 172 có `disabled={!form.formState.isValid || mutation.isPending}`, nhưng EditDialog dòng 290 chỉ có `disabled={mutation.isPending}`. Spec AC3 nói "nút Lưu disable khi `!form.formState.isValid`" áp dụng cho cả create và edit.

#### Low Severity

- [ ] [L1] **Duplicated helper functions** `apps/api/src/services/products.service.ts:95-129` vs `apps/api/src/services/categories.service.ts:35-70` - Các hàm `unwrapDriverError`, `getPgErrorCode`, `getPgConstraint` copy nguyên văn. Nên extract ra `lib/pg-errors.ts` dùng chung. Không ảnh hưởng runtime nhưng tăng maintenance burden.

- [ ] [L2] **parseVnd bỏ dấu trừ trong regex rồi lại check n < 0** `apps/web/src/lib/currency.ts:14` - Regex `[^\d-]` giữ lại dấu `-`, nhưng nếu user gõ "-100", `cleaned` = "-100", `n` = -100, trả null. Behavior đúng nhưng regex giữ dấu `-` thừa (luôn trả null cho số âm). Nên đổi regex thành `[^\d]` cho rõ ý hơn.

- [ ] [L3] **Trashed sheet hardcode pageSize=100** `apps/web/src/features/products/trashed-products-sheet.tsx:36` - Nếu store có hơn 100 sản phẩm đã xoá, user không thấy hết. Spec AC9 nói endpoint nhận `page` và `pageSize`, nhưng UI sheet không có pagination. Chấp nhận cho MVP nhưng cần note lại.

- [ ] [L4] **XSS risk nhẹ qua imageUrl** `apps/web/src/features/products/product-table.tsx:45` - `imageUrl` render trực tiếp vào `<img src>`. Zod validate `.url()` nên chặn protocol khác `http/https`. Tuy nhiên, không có allowlist domain. Attacker có thể dùng URL tracking pixel. Risk thấp vì chỉ Owner/Manager có quyền tạo sản phẩm, nhưng đáng note cho story upload ảnh tương lai.

- [ ] [L5] **Spec yêu cầu Toggle nhưng code dùng Select cho Status** `apps/web/src/features/products/product-form-dialog.tsx:520-553` - AC7 spec nói "Toggle Đang bán / Ngừng bán" nhưng code dùng `<Select>`. Cả hai đều hoạt động đúng. Select thực tế tốt hơn cho trường hợp này (rõ ràng hơn khi có 2 giá trị có label). Phân loại Low vì không ảnh hưởng chức năng.

#### Deferred

- [x] [D1] **bigint mode: 'number' giới hạn ở Number.MAX_SAFE_INTEGER** `packages/shared/src/schema/products.ts:32` - `bigint({ mode: 'number' })` convert sang JS number, an toàn đến ~9 triệu tỷ VND. Quá đủ cho POS. Nếu tương lai cần currency khác có số lớn hơn, chuyển sang `mode: 'bigint'`. Deferred, pre-existing architecture decision.

- [x] [D2] **Search tiếng Việt không xoá dấu (unaccent)** `apps/api/src/services/products.service.ts:278-280` - LOWER không normalize dấu tiếng Việt. Search "ca phe" không match "Cà phê". Test file dòng 280-281 đã ghi nhận giới hạn này. Cần PostgreSQL extension `unaccent` hoặc full-text search. Thuộc scope riêng, không phải story 2.2.

- [x] [D3] **Dupplicated DB error unwrapping giữa services** - Pre-existing từ categories.service.ts. Sẽ refactor khi có thêm service thứ 3.

### Action Items

Total: 8 (High: 0, Med: 3, Low: 5)
Blocking: 0. Tất cả findings đều non-blocking.

## Dev Notes

### Pattern reuse từ Story 1.x và Story 2.1 (BẮT BUỘC tuân thủ)

| Khu vực                  | File hiện có                                                                               | Cách dùng                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema           | `packages/shared/src/schema/categories.ts`, `users.ts`, `audit-logs.ts`                    | Pattern uuidv7 PK, timestamp `withTimezone`, index/uniqueIndex syntax. Học cách dùng `sql\`LOWER(...)\``cho function-based unique và partial unique với mệnh đề`WHERE` (cần manual SQL append nếu Drizzle 0.45 chưa hỗ trợ) |
| Soft delete              | (mới, story 2.2 lần đầu giới thiệu)                                                        | Cột `deletedAt timestamp nullable` + filter `isNull(products.deletedAt)` ở mọi query mặc định + partial unique index `WHERE deletedAt IS NULL`                                                                              |
| Currency lưu DB          | (mới, story 2.2 lần đầu giới thiệu)                                                        | Dùng `bigint({ mode: 'number' })` lưu integer VND (không thập phân). Architecture quy định: lưu DB integer, API number, UI format `Intl.NumberFormat('vi-VN')` (xem `core-architectural-decisions.md#Format Patterns`)      |
| Zod input validation     | `packages/shared/src/schema/category-management.ts`, `user-management.ts`                  | Trim, min/max + regex, refine cho update schema yêu cầu ≥ 1 field. Tách `productNameSchema` riêng để tái dùng trong create + update                                                                                         |
| Zod query validation     | `packages/shared/src/schema/audit-log.ts:auditLogQuerySchema`                              | `z.coerce.number()` cho query string params, default values, transform optional union → array                                                                                                                               |
| Pagination response      | (mới, story 2.2 lần đầu giới thiệu paginated list cho domain entity)                       | Envelope `{ data: T[], meta: { page, pageSize, total, totalPages } }` theo `core-architectural-decisions.md#Pagination`. `auditLogs` đã dùng pattern tương tự nhưng dùng key `total/page/pageSize`                          |
| Audit logging            | `apps/api/src/services/audit.service.ts`                                                   | `logAction({ db, storeId, actorId, actorRole, action, targetType, targetId, changes, ipAddress, userAgent })`                                                                                                               |
| Service transaction      | `apps/api/src/services/categories.service.ts:createCategory`                               | `db.transaction(async (tx) => { ... await logAction({ db: tx as unknown as Db, ... }) })`                                                                                                                                   |
| Error pattern            | `apps/api/src/lib/errors.ts` + `error-handler.middleware.ts`                               | Throw `ApiError(code, message, details?)`. Codes: VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, CONFLICT, BUSINESS_RULE_VIOLATION                                                                                                 |
| PG error code detection  | `apps/api/src/services/categories.service.ts:isUniqueNameViolation, classifyFkViolation`   | Pattern match `err.code === '23505' / '23503'` + `constraint_name === '...'`. CHẶT CHẼ, không substring match                                                                                                               |
| Auth + RBAC middleware   | `apps/api/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`                         | `requireAuth` set `c.get('auth') = { userId, storeId, role }`. `requirePermission('products.manage')`                                                                                                                       |
| Route mount              | `apps/api/src/index.ts`, `apps/api/src/routes/categories.routes.ts`                        | Tạo factory function `createProductsRoutes({ db })` trả Hono app, mount sau categories                                                                                                                                      |
| API client               | `apps/web/src/lib/api-client.ts`, `apps/web/src/features/categories/categories-api.ts`     | `apiClient.get/post/patch/delete<T>(path, body?)`. Wrap envelope `{ data: T }` hoặc `{ data: T[], meta }`                                                                                                                   |
| TanStack Query hooks     | `apps/web/src/features/categories/use-categories.ts`                                       | `useQuery({ queryKey: ['products', query] })` với `keepPreviousData: true` cho pagination. Mutation `onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] })` (root key invalidate cả subtree)                    |
| Form pattern             | `apps/web/src/features/categories/category-form-dialog.tsx`, `users/staff-form-dialog.tsx` | react-hook-form + zodResolver, mode `'onTouched'`, error inline `text-sm text-destructive`, mapping API error → form.setError. Helper `handleApiError` + `asFormSetError`                                                   |
| Permission hook          | `apps/web/src/hooks/use-permission.ts`                                                     | `usePermission('products.manage')`                                                                                                                                                                                          |
| Route guard              | `apps/web/src/router.tsx:requirePermissionGuard`                                           | Đã có sẵn cho `/products`, không cần đổi                                                                                                                                                                                    |
| Toast                    | `apps/web/src/lib/toast.ts`                                                                | `showSuccess`, `showError`                                                                                                                                                                                                  |
| Empty state              | `apps/web/src/components/shared/empty-state.tsx`                                           | Reuse cho "Chưa có sản phẩm" + "Không tìm thấy sản phẩm"                                                                                                                                                                    |
| Confirm dialog           | `apps/web/src/components/ui/alert-dialog.tsx` + `category/delete-category-dialog.tsx`      | Pattern AlertDialog cho xoá                                                                                                                                                                                                 |
| Responsive switch        | `apps/web/src/hooks/use-media-query.ts`                                                    | `useMediaQuery('(min-width: 768px)')` để switch table/card                                                                                                                                                                  |
| Debounce hook            | `apps/web/src/features/users/staff-manager.tsx:26-33` (`useDebounced`)                     | Cân nhắc trích lên `apps/web/src/hooks/use-debounced.ts` để dùng chung. Story 2.2 sẽ cần                                                                                                                                    |
| Action label map (audit) | `apps/web/src/features/audit/action-labels.ts`                                             | Bổ sung 5 label `product.*` + group "Sản phẩm"                                                                                                                                                                              |
| CategoryTree builder     | `apps/web/src/features/categories/utils.ts:buildCategoryTree`                              | Reuse build option list 2 cấp cho Select danh mục trong form sản phẩm                                                                                                                                                       |
| Sheet                    | `apps/web/src/components/ui/sheet.tsx`                                                     | Cho TrashedProductsSheet và Mobile filter                                                                                                                                                                                   |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `products.ts` (Drizzle table)
- `inventory-transactions.ts` (Drizzle table)
- `product-management.ts` (Zod create/update/list query/list item/detail)
- `product-management.test.ts` (co-located test schema)

**Backend (`apps/api/src/`):**

- `services/products.service.ts`
- `routes/products.routes.ts`
- `__tests__/products.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `lib/currency.ts` + `currency.test.ts`
- `hooks/use-debounced.ts` (trích từ staff-manager) — OPTIONAL (xem Coupling)
- `components/shared/currency-input.tsx`
- `components/shared/pagination.tsx`
- `features/products/products-api.ts`
- `features/products/use-products.ts`
- `features/products/sku.ts` + `sku.test.ts`
- `features/products/stock-badge.tsx`
- `features/products/product-table.tsx`
- `features/products/product-card-list.tsx`
- `features/products/product-filters.tsx`
- `features/products/product-form-dialog.tsx`
- `features/products/delete-product-dialog.tsx`
- `features/products/trashed-products-sheet.tsx`
- `features/products/products-manager.tsx`

**Migration (`apps/api/src/db/migrations/`):**

- `0008_*.sql` (Drizzle generate + manual partial unique WHERE clause append nếu cần)

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export 3 schema mới (`products`, `inventory-transactions`, `product-management`)
- `packages/shared/src/schema/audit-log.ts`: thêm 5 action enum
- `apps/api/src/index.ts`: mount `/api/v1/products` sau `/api/v1/categories`
- `apps/api/src/services/categories.service.ts`: bổ sung count chính xác trong `deleteCategory` (AC #11)
- `apps/api/src/__tests__/categories.integration.test.ts`: thêm test case xoá danh mục có sản phẩm → 422 với count
- `apps/web/src/features/audit/action-labels.ts`: thêm 5 label + group "Sản phẩm"
- `apps/web/src/pages/products-page.tsx`: thay placeholder bằng `<ProductsManager />`
- `apps/web/src/features/users/staff-manager.tsx`: nếu trích `useDebounced` lên hook chung → import từ vị trí mới (xem Coupling)

### Coupling với danh mục (Story 2.1) — bắt buộc đồng bộ

Story 2.2 thêm FK `products.category_id → categories.id ON DELETE RESTRICT`. Hệ quả:

1. Test cũ ở `categories.integration.test.ts` mục "Xoá danh mục cấp 2 không có sản phẩm → 200" KHÔNG bị ảnh hưởng (sản phẩm vẫn không có)
2. Try-catch FK violation 23503 trong `categories.service.ts:deleteCategory` mà Story 2.1 đã viết defensive sẽ HOẠT ĐỘNG khi có sản phẩm liên kết. Story 2.2 BỔ SUNG thêm count chính xác để hiển thị "X sản phẩm" trong message → cần update message format
3. UI categories: hiện tại `delete-category-dialog.tsx` chỉ show generic message từ API. Sau Story 2.2, message API sẽ chứa số đếm rõ ràng. KHÔNG cần đổi UI, chỉ cần trust message backend
4. `useCategoriesQuery` từ Story 2.1 reuse trong form sản phẩm → KHÔNG cần fetch lại API, dùng chung cache key `['categories']`. Khi tạo/sửa danh mục ở `/products/categories`, cache invalidate sẽ tự refresh dropdown trong form sản phẩm

### Lưu ý từ review Story 2.1 (rút kinh nghiệm)

Code review Story 2.1 đã nêu các điểm sau, áp dụng ngay cho Story 2.2:

1. **Detect PG error code chính xác**: KHÔNG substring match `err.message.includes('unique')`. Phải match `err.code === '23505'` + `constraint_name === <tên constraint cụ thể>`. Story 2.2 có 2 partial unique index → cần phân biệt theo constraint name để map đúng `field=sku` vs `field=barcode`
2. **Form Save button disable theo isValid**: AC `disabled={!form.formState.isValid || mutation.isPending}` cho cả create và edit
3. **Error message phân biệt rõ case**: phân biệt "không tồn tại" vs "khác store" vs "khác filter" để UX dễ debug
4. **`asFormSetError` cast adapter**: defer (cồng kềnh nhưng functional). Story 2.2 reuse luôn pattern, không cần refactor
5. **Race condition reorder không enforce orderedIds completeness**: defer (low frequency). Story 2.2 không có reorder
6. **Schema name regex collapse multiple whitespace**: defer (nice-to-have UX). Story 2.2 áp dụng tương tự
7. **Migration cuối file thiếu statement-breakpoint**: defer (không gây lỗi). Story 2.2 chú ý nếu append manual SQL

### Permission matrix (story này)

| Permission        | Owner | Manager | Staff | Resource      |
| ----------------- | ----- | ------- | ----- | ------------- |
| `products.manage` | ✅    | ✅      | ❌    | CRUD products |

`products.manage` đã có sẵn trong `packages/shared/src/constants/permissions.ts`, KHÔNG tạo mới. Story 2.2 dùng chung permission với Story 2.1 (categories cũng là sub-resource của products).

### Validation đặc biệt

**Tên sản phẩm:**

- Trim đầu/cuối, min 1 (sau trim), max 255
- Regex `^[\p{L}\p{N}\s\-_&()'./,]+$/u`: thêm `,` so với danh mục để cho phép tên kiểu "Cà phê, sữa đặc"

**SKU:**

- Trim, 1-64 ký tự, regex `^[A-Za-z0-9_\-./]+$` (ASCII only, không Unicode để dễ in label)
- Auto-gen format `SP-XXXXXX` (6 chữ số, padStart 0)
- Unique theo `(store_id, LOWER(sku))` chỉ trên alive products (partial unique). Cho phép tái sử dụng sau soft delete
- Khi restore: query check sku không bị chiếm bởi sản phẩm sống khác → nếu có → 409 message rõ ràng

**Barcode:**

- Trim, 1-64 ký tự, regex `^[A-Za-z0-9]+$` (chỉ chữ và số, không ký tự đặc biệt vì chuẩn EAN/UPC)
- Optional, nullable
- Unique theo `(store_id, barcode)` chỉ trên alive products + barcode IS NOT NULL

**Giá VND:**

- Lưu DB: `bigint({ mode: 'number' })` integer (đồng VND, không thập phân)
- Server validate: `z.number().int().min(0)`
- Client display: `Intl.NumberFormat('vi-VN').format(value)` + suffix " đ"
- Client input: `<CurrencyInput>` giữ string state, format khi blur, parse khi blur, gửi raw integer trên submit
- KHÔNG dùng float vì sẽ rounding error với phép tính chia/nhân (story tương lai)

**Image upload (tạm thời):**

- Story 2.2: chỉ chấp nhận `imageUrl` dạng string URL hợp lệ (Zod `z.string().url()`)
- Helper text trong form: "Tối đa 1 ảnh, ≤5MB, jpg/png/webp. Story 2.2 chỉ hỗ trợ dán URL ảnh, upload thực sẽ làm ở story tương lai (Cloudflare R2)."
- Backend KHÔNG validate file size/MIME ở story này
- Spec đầy đủ image upload (R2, presigned URL, validate MIME) sẽ là story riêng trong Epic 2 hoặc Epic Hạ tầng

**Track inventory toggle:**

- Khi `trackInventory=true` lúc create → cho phép `initialStock` ≥ 0; nếu > 0 → tạo `inventory_transactions` loại `initial_stock` + audit `product.stock_initialized`
- Khi update từ false → true: cho phép, `initialStock` không nhận qua endpoint update (chỉ qua phiếu nhập kho ở Story 2.4). `current_stock` giữ nguyên (mặc định 0)
- Khi update từ true → false: chỉ cho khi `current_stock = 0`, ngược lại 422
- Khi `trackInventory=false`: UI hiển thị tồn kho là "∞", filter `stockFilter` không áp dụng (sản phẩm không track loại trừ khỏi filter)

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement biến thể, đơn vị quy đổi, WAC, phiếu nhập kho, kiểm kho ở story này (Story 2.3, 2.4)
- KHÔNG hiện thực image upload thật (file system, R2, presigned URL) ở story này — chỉ accept URL string
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG bypass filter `deletedAt IS NULL` trong list/get/update/delete mặc định. Chỉ `restoreProduct` và `listTrashed` query trên `deletedAt IS NOT NULL`
- KHÔNG hard delete sản phẩm. Mọi delete là soft delete để giữ liên kết với hoá đơn lịch sử
- KHÔNG cho phép sửa `currentStock` trực tiếp qua PATCH /products/:id. Chỉ qua phiếu nhập kho/kiểm kho ở Story 2.4 (defensive: schema không nhận field này)
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho giá. Dùng `bigint` integer VND để tránh rounding error
- KHÔNG dùng REST verb sai: restore dùng POST `/products/:id/restore` (action verb, không phải PATCH /products/:id với deletedAt:null vì semantics khác)
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG hard-code action label tiếng Việt trong service. Label chỉ ở frontend `action-labels.ts`. Backend chỉ ghi action key tiếng Anh `product.created`
- KHÔNG return thuần `{ ok: true }` từ DELETE/restore không có wrapper `{ data: ... }`. Mọi response API dùng envelope `{ data: T }`
- KHÔNG dùng substring match cho PG error detection. Phải match `err.code === '23505'/'23503'` + `constraint_name`
- KHÔNG tạo file `components/products/ProductForm.tsx` (architecture docs PascalCase) — dùng kebab-case flat trong `features/products/product-form-dialog.tsx` (variance đã chấp nhận từ Story 1.x/2.1)
- KHÔNG mount `/api/v1/products` không có `requirePermission('products.manage')` ở route group level (DRY)
- KHÔNG fetch danh mục riêng trong form sản phẩm — reuse `useCategoriesQuery` cache `['categories']` từ Story 2.1
- KHÔNG tạo permission mới riêng cho products. Reuse `products.manage` đã có
- KHÔNG mount route `GET /products/:id` TRƯỚC `GET /products/trashed` (Hono sẽ match `:id` với `'trashed'`). Đặt route literal trước

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x + 2.1:

- Feature folder flat (KHÔNG nest `components/`): `features/products/product-table.tsx`
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (KHÔNG file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.1):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase
- Schema folder `schema/` thay vì `schemas/` (đã có sẵn từ Story 1.x)

### Latest tech notes

- **Drizzle partial unique index**: Drizzle 0.45 hỗ trợ `.where(sql\`...\`)`trên`uniqueIndex(...)`. Kiểm tra output migration: nếu thiếu `WHERE`clause → append manual SQL. Tham khảo`apps/api/src/db/migrations/0007_lyrical_joseph.sql:14` đã append manual self-FK
- **Drizzle bigint mode 'number'**: an toàn cho integer ≤ 2^53. Giá VND tối đa hiện thực tế <100 tỷ đồng = 10^11, nằm trong giới hạn. Nếu cần >2^53 phải chuyển sang `mode: 'bigint'` và dùng BigInt thay number — KHÔNG cần ở story này
- **Hono route order**: literal route phải mount TRƯỚC param route (`/trashed` trước `/:id`). Hono match theo thứ tự đăng ký
- **shadcn/ui Switch**: chưa có ở `apps/web/src/components/ui/`, cần `pnpm dlx shadcn@latest add switch` (kiểm tra package shadcn version trong `package.json`)
- **TanStack Query keepPreviousData v5**: dùng `placeholderData: keepPreviousData` thay cho deprecated `keepPreviousData: true`. Import `import { keepPreviousData } from '@tanstack/react-query'`

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-qun-l-hng-ha.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR1, #FR5, #FR7]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M1: Hàng hóa]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Format Patterns (currency, pagination), Code Naming, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Pagination]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Form Patterns (currency input), #Empty States, #Confirmation Patterns, #Feedback Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/inventory-management-specification.md#WAC Display, Lịch sử Nhập hàng] (story 2.2 chỉ lưu inventory_transactions minimal, story 2.4 implement UI WAC + nhập kho)
- [Source: _bmad-output/implementation-artifacts/2-1-quan-ly-danh-muc-san-pham.md#Pattern audit, transaction, RBAC, form, mapping API error, Coupling với products]
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md#Pattern soft delete via isActive, multi-tenant test setup]
- [Source: packages/shared/src/schema/categories.ts] (pattern Drizzle schema có index/uniqueIndex + sql LOWER)
- [Source: packages/shared/src/schema/category-management.ts] (pattern Zod schema name + create/update/refine)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum + auditLogQuerySchema z.coerce + transform optional → array)
- [Source: packages/shared/src/constants/permissions.ts] (`products.manage` đã có)
- [Source: apps/api/src/services/categories.service.ts] (pattern ensureNameUnique, isUniqueNameViolation, classifyFkViolation, transaction wrap, audit)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, diffObjects helper)
- [Source: apps/api/src/services/users.service.ts] (pattern transaction + audit + multi-action audit trong cùng transaction — pattern cho `product.created` + `product.stock_initialized` cùng tx)
- [Source: apps/api/src/routes/categories.routes.ts] (pattern factory route + uuidParam + parseJson)
- [Source: apps/api/src/middleware/rbac.middleware.ts] (`requirePermission`)
- [Source: apps/web/src/features/categories/category-form-dialog.tsx] (pattern form RHF + zodResolver + mapping CONFLICT API error + asFormSetError + handleApiError)
- [Source: apps/web/src/features/categories/categories-manager.tsx] (pattern manager component với query + dialogs state)
- [Source: apps/web/src/features/categories/utils.ts:buildCategoryTree] (reuse build option list 2 cấp)
- [Source: apps/web/src/features/categories/use-categories.ts] (pattern TanStack Query hooks)
- [Source: apps/web/src/features/users/staff-manager.tsx:26-33] (pattern useDebounced — cân nhắc trích lên hooks/)
- [Source: apps/web/src/features/users/staff-table.tsx] (pattern Table + cột thumbnail + actions)
- [Source: apps/web/src/router.tsx:99-104] (route /products đã có guard `products.manage`)
- [Source: apps/web/src/components/shared/empty-state.tsx] (pattern EmptyState)
- [Source: apps/api/src/db/migrations/0007_lyrical_joseph.sql] (pattern manual SQL append cho self-FK)
- [Web: Drizzle Indexes — partial unique with WHERE](https://orm.drizzle.team/docs/indexes-constraints)
- [Web: PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html) cho `WHERE deleted_at IS NULL`
- [Web: TanStack Query v5 placeholderData / keepPreviousData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)
- [Web: Intl.NumberFormat vi-VN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NumberFormat) cho format VND

## Dev Agent Record

### Agent Model Used

(điền khi bắt đầu implement)

### Debug Log References

(điền khi bắt đầu implement)

### Completion Notes List

(điền khi hoàn thành)

### File List

(điền khi hoàn thành)

### Change Log

(điền khi hoàn thành)
