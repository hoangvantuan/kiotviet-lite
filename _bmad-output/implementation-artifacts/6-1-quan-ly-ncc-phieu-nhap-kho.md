# Story 6.1: Quản lý NCC & Phiếu nhập kho

Status: in-progress

## Story

As a chủ cửa hàng,
I want quản lý nhà cung cấp và tạo phiếu nhập kho với đầy đủ thông tin sản phẩm, giá, chiết khấu,
so that tồn kho và giá vốn bình quân gia quyền (WAC) luôn chính xác sau mỗi lần nhập hàng đồng thời theo dõi được công nợ phải trả NCC.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `suppliers` và ràng buộc

**Given** hệ thống đã có bảng `stores`, `users`, `audit_logs`, `products`, `product_variants`, `inventory_transactions` và migration framework Drizzle
**When** chạy migration mới của story này
**Then** tạo bảng `suppliers` với cấu trúc:

| Column            | Type                       | Ràng buộc                                                        |
| ----------------- | -------------------------- | ---------------------------------------------------------------- |
| `id`              | `uuid`                     | PK, default `uuidv7()`                                           |
| `store_id`        | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                    |
| `name`            | `varchar(100)`             | NOT NULL                                                         |
| `phone`           | `varchar(20)`              | NULLABLE (NCC có thể không có SĐT)                               |
| `email`           | `varchar(255)`             | NULLABLE                                                         |
| `address`         | `text`                     | NULLABLE                                                         |
| `tax_id`          | `varchar(32)`              | NULLABLE (mã số thuế NCC)                                        |
| `notes`           | `text`                     | NULLABLE                                                         |
| `current_debt`    | `bigint`                   | NOT NULL, default 0 (integer VND, công nợ phải trả NCC)          |
| `purchase_count`  | `integer`                  | NOT NULL, default 0 (số phiếu nhập đã tạo, maintain bởi service) |
| `total_purchased` | `bigint`                   | NOT NULL, default 0 (tổng tiền đã nhập từ NCC, integer VND)      |
| `deleted_at`      | `timestamp with time zone` | NULLABLE (soft delete)                                           |
| `created_at`      | `timestamp with time zone` | NOT NULL, default `now()`                                        |
| `updated_at`      | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                           |

**And** unique index `uniq_suppliers_store_name_alive` trên `(store_id, LOWER(name))` WHERE `deleted_at IS NULL` (tên NCC unique trong store với NCC còn sống)
**And** unique index `uniq_suppliers_store_phone_alive` trên `(store_id, phone)` WHERE `deleted_at IS NULL AND phone IS NOT NULL` (phone unique khi có giá trị, nhiều NCC có thể không có phone cùng lúc)
**And** index `idx_suppliers_store_created` trên `(store_id, created_at DESC)` cho list query mặc định
**And** index `idx_suppliers_store_name_lower` trên `(store_id, LOWER(name))` cho search theo tên
**And** index `idx_suppliers_store_phone` trên `(store_id, phone)` cho search theo phone
**And** ràng buộc: `current_debt`, `total_purchased` integer VND ≥ 0 enforce ở service layer

### AC2: Schema bảng `purchase_orders` và `purchase_order_items`

**Given** đã có bảng `suppliers`, `products`, `product_variants`, `users`
**When** migration story này chạy
**Then** tạo bảng `purchase_orders` với cấu trúc:

| Column                 | Type                       | Ràng buộc                                                                     |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `id`                   | `uuid`                     | PK, default `uuidv7()`                                                        |
| `store_id`             | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT                                 |
| `supplier_id`          | `uuid`                     | NOT NULL, FK → `suppliers.id` ON DELETE RESTRICT                              |
| `code`                 | `varchar(32)`              | NOT NULL (auto-gen `PN-YYYYMMDD-XXXX`)                                        |
| `subtotal`             | `bigint`                   | NOT NULL (Σ thành tiền các dòng SAU chiết khấu dòng, integer VND)             |
| `discount_total`       | `bigint`                   | NOT NULL, default 0 (chiết khấu tổng phiếu giá trị tuyệt đối VND)             |
| `discount_total_type`  | `varchar(16)`              | NOT NULL, default `'amount'` (`'percent'` hoặc `'amount'`)                    |
| `discount_total_value` | `bigint`                   | NOT NULL, default 0 (giá trị input gốc: % \* 100 nếu percent, VND nếu amount) |
| `total_amount`         | `bigint`                   | NOT NULL (tổng cuối cùng = subtotal - discount_total, integer VND)            |
| `paid_amount`          | `bigint`                   | NOT NULL, default 0 (số tiền đã trả NCC, integer VND)                         |
| `payment_status`       | `varchar(16)`              | NOT NULL (`'paid'` / `'unpaid'` / `'partial'`)                                |
| `note`                 | `text`                     | NULLABLE                                                                      |
| `purchase_date`        | `timestamp with time zone` | NOT NULL, default `now()` (ngày nhập, có thể backdate)                        |
| `created_by`           | `uuid`                     | NOT NULL, FK → `users.id`                                                     |
| `created_at`           | `timestamp with time zone` | NOT NULL, default `now()`                                                     |
| `updated_at`           | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                                        |

**And** unique index `uniq_purchase_orders_store_code` trên `(store_id, code)` (mã phiếu unique trong store)
**And** index `idx_purchase_orders_store_date` trên `(store_id, purchase_date DESC)` cho list query mặc định
**And** index `idx_purchase_orders_store_supplier` trên `(store_id, supplier_id)` cho filter theo NCC
**And** index `idx_purchase_orders_store_payment_status` trên `(store_id, payment_status)` cho filter trạng thái thanh toán

**Then** tạo bảng `purchase_order_items` với cấu trúc:

| Column                   | Type                       | Ràng buộc                                                                     |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `id`                     | `uuid`                     | PK, default `uuidv7()`                                                        |
| `purchase_order_id`      | `uuid`                     | NOT NULL, FK → `purchase_orders.id` ON DELETE CASCADE                         |
| `product_id`             | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE RESTRICT                               |
| `variant_id`             | `uuid`                     | NULLABLE, FK → `product_variants.id` ON DELETE RESTRICT                       |
| `product_name_snapshot`  | `varchar(255)`             | NOT NULL (snapshot tên SP tại thời điểm nhập, phòng SP đổi tên/xóa)           |
| `product_sku_snapshot`   | `varchar(64)`              | NOT NULL (snapshot SKU)                                                       |
| `variant_label_snapshot` | `varchar(255)`             | NULLABLE (snapshot label biến thể, ví dụ "Đỏ - L")                            |
| `quantity`               | `integer`                  | NOT NULL, > 0                                                                 |
| `unit_price`             | `bigint`                   | NOT NULL, ≥ 0 (đơn giá nhập per unit, integer VND)                            |
| `discount_amount`        | `bigint`                   | NOT NULL, default 0 (giá trị tuyệt đối chiết khấu dòng VND)                   |
| `discount_type`          | `varchar(16)`              | NOT NULL, default `'amount'` (`'percent'` / `'amount'`)                       |
| `discount_value`         | `bigint`                   | NOT NULL, default 0 (giá trị input gốc: % \* 100 nếu percent, VND nếu amount) |
| `line_total`             | `bigint`                   | NOT NULL (= quantity \* unit_price - discount_amount, integer VND)            |
| `cost_after`             | `bigint`                   | NULLABLE (snapshot WAC sau dòng nhập này, để truy vết)                        |
| `stock_after`            | `integer`                  | NULLABLE (snapshot tồn sau dòng nhập này)                                     |
| `created_at`             | `timestamp with time zone` | NOT NULL, default `now()`                                                     |

**And** index `idx_purchase_order_items_po` trên `(purchase_order_id)` cho join chi tiết phiếu
**And** index `idx_purchase_order_items_product` trên `(product_id, created_at DESC)` cho lịch sử nhập theo SP
**And** index `idx_purchase_order_items_variant` trên `(variant_id, created_at DESC)` (partial WHERE variant_id IS NOT NULL)

**And** ràng buộc cấp service layer:

- `quantity > 0` (đã có Zod), `unit_price >= 0`
- `discount_amount <= quantity * unit_price` (chiết khấu dòng không vượt thành tiền dòng)
- Nếu `product.has_variants = true` → bắt buộc có `variant_id` và variant phải thuộc product đó cùng store
- Nếu `product.has_variants = false` → KHÔNG cho truyền `variant_id`
- Mọi `product_id` / `variant_id` PHẢI thuộc cùng `store_id` của phiếu nhập
- `purchase_order_items` phải có ít nhất 1 dòng (validate ở service tạo phiếu)

### AC3: Auto-gen mã phiếu nhập `PN-YYYYMMDD-XXXX`

**Given** chủ cửa hàng tạo phiếu nhập trong ngày `2026-04-28`
**When** service tạo phiếu mới
**Then** sinh mã `PN-20260428-0001` cho phiếu đầu tiên trong ngày của store
**And** phiếu thứ 2 trong ngày → `PN-20260428-0002`, ...
**And** đầu ngày sau (`2026-04-29`) reset chuỗi → `PN-20260429-0001`
**And** thuật toán: trong transaction, query `MAX(code)` của store WHERE `code LIKE 'PN-YYYYMMDD-%'` → parse số cuối → +1; nếu không có → `0001`. Format `XXXX` zero-pad 4 chữ số.
**And** retry logic: nếu unique constraint `uniq_purchase_orders_store_code` violation (race 2 phiếu cùng giây) → retry tối đa 3 lần với mã kế tiếp
**And** ngày trong code lấy theo `purchase_date` (cho phép backdate), KHÔNG lấy `created_at`. Format theo timezone `Asia/Ho_Chi_Minh` (UTC+7)

### AC4: Service `recordPurchaseOrder` tạo phiếu nhập với WAC + audit

**Given** chủ cửa hàng (Owner/Manager với `inventory.manage`) submit phiếu nhập đầy đủ
**When** gọi service `createPurchaseOrder({ db, actor, input, meta })` trong transaction
**Then** service thực hiện thứ tự:

1. Validate `supplier_id` cùng store + alive (`deleted_at IS NULL`) → nếu không → 404 "Không tìm thấy nhà cung cấp"
2. Validate `items.length >= 1` → nếu không → VALIDATION_ERROR "Phiếu nhập phải có ít nhất 1 sản phẩm"
3. Mỗi item:
   - Lock product `SELECT … FOR UPDATE` (cùng store + alive) → nếu không → 404 "Không tìm thấy sản phẩm"
   - Nếu `product.hasVariants = true` → require `variantId`, lock variant cùng product alive → nếu không → 404 "Không tìm thấy biến thể"
   - Nếu `product.hasVariants = false && variantId !== null` → VALIDATION_ERROR "Sản phẩm không có biến thể"
   - Tính `lineSubtotal = quantity * unit_price` (integer)
   - Tính `discount_amount` từ `discount_type` + `discount_value`:
     - `'amount'` → `discount_amount = discount_value` (đã là VND)
     - `'percent'` → `discount_amount = Math.floor(lineSubtotal * discount_value / 10000)` (`discount_value` lưu phần trăm \* 100, ví dụ 5% → 500; max 100% = 10000)
   - Validate `discount_amount <= lineSubtotal` → nếu không → BUSINESS_RULE_VIOLATION "Chiết khấu dòng vượt quá thành tiền"
   - `line_total = lineSubtotal - discount_amount`
4. Tính `subtotal = Σ line_total`
5. Tính `discount_total` từ `discount_total_type` + `discount_total_value`:
   - `'amount'` → `discount_total = discount_total_value`
   - `'percent'` → `discount_total = Math.floor(subtotal * discount_total_value / 10000)`
   - Validate `discount_total <= subtotal` → nếu không → BUSINESS_RULE_VIOLATION
6. `total_amount = subtotal - discount_total`
7. Validate `paid_amount >= 0 && paid_amount <= total_amount` → nếu không → BUSINESS_RULE_VIOLATION "Số tiền trả không hợp lệ"
8. Tính `payment_status`:
   - `paid_amount === 0` → `'unpaid'`
   - `paid_amount === total_amount` → `'paid'`
   - else → `'partial'`
9. Auto-gen `code` theo AC3 (trong cùng transaction)
10. Insert `purchase_orders` row
11. Với mỗi item, tính WAC và update product/variant theo công thức (xem AC5):
    - Lock đã có (bước 3)
    - Tính `costAfter` = WAC mới
    - Update `products.cost_price = costAfter`
    - Nếu `hasVariants = false`: update `products.current_stock += quantity`
    - Nếu `hasVariants = true`: update `product_variants.stock_quantity += quantity` (giữ `products.current_stock` nguyên, vì SP có biến thể không track stock cấp product)
    - Insert `purchase_order_items` row với snapshot fields + `cost_after`, `stock_after`
    - Insert `inventory_transactions` row: `type='purchase'`, `quantity`, `unit_cost = unit_price`, `cost_after`, `stock_after`, `note=PO code`, `created_by=actor.userId`
12. Update `suppliers.current_debt += (total_amount - paid_amount)` (công nợ tăng nếu chưa trả đủ)
13. Update `suppliers.purchase_count += 1`, `suppliers.total_purchased += total_amount`
14. Audit `action='purchase_order.created'`, `targetType='purchase_order'`, `targetId=<id>`, `changes={ supplierId, code, itemCount, subtotal, discountTotal, totalAmount, paidAmount, paymentStatus }`
15. Trả response `PurchaseOrderDetail` đầy đủ

**And** mọi bước trên trong cùng database transaction. Nếu bất kỳ step nào fail → rollback toàn bộ.
**And** với phiếu có nhiều dòng cùng `(productId, variantId)`: KHÔNG gộp ở client, BACKEND validate dedupe → BUSINESS_RULE_VIOLATION "Sản phẩm xuất hiện nhiều lần trong phiếu nhập, vui lòng gộp dòng" (giảm phức tạp WAC tính dồn). Frontend khuyến cáo gộp ngay khi user thêm dòng trùng.

### AC5: Tính WAC (giá vốn bình quân gia quyền) per item

**Given** phiếu nhập có 1 dòng SP A: 500 viên giá `78.000đ`, tồn hiện tại 200 viên giá vốn `70.000đ`
**When** service tính WAC mới
**Then** áp dụng công thức:

```
costBefore = product.cost_price (hoặc null nếu chưa có)
stockBefore = (hasVariants ? variant.stock_quantity : product.current_stock)
quantity = item.quantity
unitCost = item.unit_price (giá nhập trước chiết khấu, KHÔNG phải net price sau CK)

Nếu costBefore === null HOẶC stockBefore <= 0:
    costAfter = unitCost
Ngược lại:
    costAfter = Math.round((stockBefore * costBefore + quantity * unitCost) / (stockBefore + quantity))

stockAfter = stockBefore + quantity
```

**And** kết quả integer (Math.round về số nguyên gần nhất, .5 làm tròn lên theo JS default)
**And** ví dụ AC: `Math.round((200 * 70000 + 500 * 78000) / 700) = Math.round(74285.7142...) = 74286đ`
**And** nếu phiếu có nhiều dòng cùng `productId` (variant khác nhau): WAC tính per item tuần tự, dòng sau dùng `costAfter` của dòng trước làm `costBefore` (vì update product.cost_price đã commit trong transaction sau mỗi item)
**And** WAC dùng `unit_price` (giá nhập gốc), KHÔNG dùng net price sau chiết khấu. Lý do: chiết khấu dòng/tổng phiếu thuộc về kế toán phải trả NCC, KHÔNG ảnh hưởng giá vốn thực mà ta ghi nhận. Đây là trade-off được PM chấp nhận để giữ logic WAC đơn giản, story tương lai có thể đổi nếu cần.
**And** sản phẩm có biến thể: WAC vẫn lưu ở `products.cost_price` (cấp product) — story 6.x tương lai có thể tách WAC theo variant nếu cần. Story 6.1 chấp nhận hạn chế này (giống Story 2.4).

### AC6: API CRUD nhà cung cấp (suppliers)

**Given** Owner/Manager đã đăng nhập (có permission `inventory.manage`)
**When** thao tác với endpoint `/api/v1/suppliers`
**Then** API hỗ trợ 6 endpoints:

- `GET /api/v1/suppliers?page=&pageSize=&search=&hasDebt=` — list paginated
  - Query Zod `listSuppliersQuerySchema`: `page` int ≥1 default 1, `pageSize` int 1-100 default 20, `search` string optional, `hasDebt` enum `'yes'|'no'|'all'` default `'all'`
  - WHERE filter: `store_id = actor.storeId`, `deleted_at IS NULL`
  - Search: `LOWER(name) LIKE LOWER('%search%') OR phone LIKE '%search%'` với escape wildcard `%`/`_` qua `escapeLikePattern` (reuse từ Story 4.1 `apps/api/src/lib/strings.ts`)
  - `hasDebt='yes'` → `current_debt > 0`; `'no'` → `current_debt = 0`; `'all'` → bỏ qua
  - Sort mặc định `(created_at DESC, name ASC)`
  - Response `{ data: SupplierListItem[], meta: { page, pageSize, total, totalPages } }`

- `GET /api/v1/suppliers/:id` — chi tiết NCC, response `{ data: SupplierDetail }` hoặc 404 (cross-store / soft deleted)

- `POST /api/v1/suppliers` — tạo NCC mới
  - Body Zod `createSupplierSchema`:
    - `name`: trim, 1-100 ký tự, regex `^[\p{L}\p{N}\s\-_&()'./,]+$/u` (Unicode, giống pattern customer name)
    - `phone`: optional null, trim, 8-15 ký tự, regex `^[0-9+]+$` (cho phép số quốc tế; KHÔNG cứng VN)
    - `email`: optional null, format email
    - `address`: optional null, trim max 500
    - `taxId`: optional null, trim max 32, regex `^[A-Za-z0-9-]+$`
    - `notes`: optional null, trim max 1000
  - Service `createSupplier`:
    - Validate name unique (case-insensitive) trong store alive → nếu trùng → 409 CONFLICT field=name
    - Validate phone unique nếu có (alive) → nếu trùng → 409 CONFLICT field=phone
    - Insert + audit `supplier.created` với changes `{ name, phone, email }`
  - Response 201 `{ data: SupplierDetail }`

- `PATCH /api/v1/suppliers/:id` — sửa NCC
  - Body Zod `updateSupplierSchema` (partial, refine ≥ 1 field)
  - Validate ownership + alive → 404 nếu không
  - Validate đổi name unique (excludeId=self) → 409
  - Validate đổi phone unique nếu có (excludeId=self) → 409
  - KHÔNG cho phép sửa `current_debt`, `purchase_count`, `total_purchased` qua endpoint này (read-only, maintain bởi service)
  - Audit `supplier.updated` với diff before/after qua `diffObjects`
  - Response 200 `{ data: SupplierDetail }`

- `DELETE /api/v1/suppliers/:id` — soft delete
  - Service `deleteSupplier`:
    - Validate ownership + alive → 404
    - Kiểm tra `current_debt > 0` → 422 BUSINESS_RULE_VIOLATION "Nhà cung cấp còn công nợ {vnd}đ, không thể xoá"
    - Kiểm tra `purchase_count > 0` (đã có phiếu nhập linked) → 422 "Nhà cung cấp đã có {N} phiếu nhập, không thể xoá. Có thể ẩn bằng cách đặt ghi chú."
    - Defensive try-catch FK violation 23503 (cho race condition future) → throw BUSINESS_RULE_VIOLATION
    - Set `deleted_at = NOW()` + audit `supplier.deleted` với snapshot
  - Response 200 `{ data: { ok: true } }`

- `POST /api/v1/suppliers/:id/restore` — khôi phục NCC đã xoá
  - Validate target có deleted_at → 404 nếu chưa xoá
  - Kiểm tra name không bị NCC sống khác chiếm → 409 nếu trùng
  - Kiểm tra phone không bị NCC sống khác chiếm (nếu có phone) → 409 nếu trùng
  - Set `deleted_at = NULL` + audit `supplier.restored`
  - Response 200 `{ data: SupplierDetail }`

**And** endpoint `GET /api/v1/suppliers/trashed?page=&pageSize=` trả danh sách NCC `deleted_at IS NOT NULL`. Hono mount route `/trashed` TRƯỚC `/:id` để không match nhầm.

**And** mọi endpoint `/api/v1/suppliers/*` yêu cầu `requireAuth` + `requirePermission('inventory.manage')` (Owner + Manager, KHÔNG Staff)

### AC7: API CRUD phiếu nhập kho (purchase-orders)

**Given** Owner/Manager với `inventory.manage`
**When** thao tác với `/api/v1/purchase-orders`
**Then** API hỗ trợ:

- `GET /api/v1/purchase-orders?page=&pageSize=&search=&supplierId=&paymentStatus=&fromDate=&toDate=` — list paginated
  - Query Zod `listPurchaseOrdersQuerySchema`:
    - `page`, `pageSize` (như AC6)
    - `search`: optional string (search theo `code` hoặc `supplier.name`)
    - `supplierId`: optional uuid
    - `paymentStatus`: optional enum `'paid'|'unpaid'|'partial'`
    - `fromDate`, `toDate`: optional ISO 8601 datetime (filter theo `purchase_date`, inclusive)
  - WHERE filter: `store_id`, escape wildcard search, range date
  - LEFT JOIN `suppliers` để lấy `supplierName`
  - Sort `(purchase_date DESC, created_at DESC)`
  - Response `{ data: PurchaseOrderListItem[], meta }`

- `GET /api/v1/purchase-orders/:id` — chi tiết phiếu nhập đầy đủ
  - Trả `PurchaseOrderDetail` chứa: header info + `supplier` (id, name, phone) + `items: PurchaseOrderItemDetail[]` (với product/variant info qua join)
  - Mỗi item có: `id`, `productId`, `variantId`, `productNameSnapshot`, `productSkuSnapshot`, `variantLabelSnapshot`, `quantity`, `unitPrice`, `discountAmount`, `discountType`, `discountValue`, `lineTotal`, `costAfter`, `stockAfter`
  - 404 nếu cross-store

- `POST /api/v1/purchase-orders` — tạo phiếu nhập mới
  - Body Zod `createPurchaseOrderSchema`:
    ```ts
    {
      supplierId: uuid,
      purchaseDate: ISO 8601 datetime (optional, default now),
      items: Array<{
        productId: uuid,
        variantId: uuid | null (optional),
        quantity: int >= 1,
        unitPrice: int >= 0,
        discountType: 'amount' | 'percent' (default 'amount'),
        discountValue: int >= 0 (default 0; nếu percent thì 0-10000 = 0-100%)
      }> (min 1, max 200 items),
      discountTotalType: 'amount' | 'percent' (default 'amount'),
      discountTotalValue: int >= 0 (default 0),
      paidAmount: int >= 0 (default 0),
      note: string optional max 500
    }
    ```
  - Service: thực hiện `createPurchaseOrder` theo AC4 trong transaction
  - Response 201 `{ data: PurchaseOrderDetail }`

- KHÔNG có PATCH/DELETE phiếu nhập trong story 6.1. Phiếu nhập đã tạo IMMUTABLE (vì đã ảnh hưởng tồn kho/WAC). Story 6.x tương lai có thể thêm "huỷ phiếu nhập" với reverse logic. Nếu user nhập sai → tạo phiếu nhập âm (story 7.x) hoặc kiểm kho điều chỉnh (story 6.2).

**And** mọi endpoint `/api/v1/purchase-orders/*` yêu cầu `requireAuth` + `requirePermission('inventory.manage')`

### AC8: Frontend `<SupplierManager>` — CRUD NCC

**Given** Owner/Manager vào trang `/inventory/suppliers`
**When** trang load
**Then** hiển thị `<SupplierManager>` (`apps/web/src/features/suppliers/supplier-manager.tsx`):

- Header: title "Nhà cung cấp", description "Quản lý danh sách NCC và công nợ phải trả", group nút phải:
  - Nút outline "NCC đã xoá" (icon `Trash2`) → mở `<TrashedSuppliersSheet>`
  - Nút primary "Thêm NCC" (icon `Plus`) → mở `<SupplierFormDialog>` mode `create`
- Filters: `<SupplierFilters>` controlled với Input search (icon `Search`, debounce 300ms ở parent), Select công nợ ("Tất cả"/"Có công nợ"/"Không có công nợ")
- Body:
  - Loading → 5 dòng skeleton
  - Error → text destructive
  - Empty (không filter) → `<EmptyState icon={Truck} title="Chưa có nhà cung cấp nào" description="Thêm NCC đầu tiên để tạo phiếu nhập" actionLabel="Thêm NCC" onAction={...} />`
  - Empty (có filter) → `<EmptyState icon={SearchX} title="Không tìm thấy NCC" />`
  - Desktop ≥768px: `<SupplierTable>` cột: Tên (font-medium), SĐT (font-mono text-sm hoặc "—"), Email (text muted hoặc "—"), Công nợ (`<DebtBadge>` reuse từ Story 4.1, KHÔNG có hạn mức nên chỉ 2 state: 0đ xám / >0đ vàng), Số phiếu nhập (number), Tổng đã nhập (`formatVndWithSuffix`), Hành động (Pencil + Trash2 ghost buttons)
  - Mobile <768px: `<SupplierCardList>` mỗi card avatar tròn (chữ cái đầu), tên + phone + công nợ badge, menu 3 chấm (Sửa/Xoá)
- `<Pagination>` reuse từ Story 2.2

**And** `<SupplierFormDialog>` (mode create/edit):

- Form RHF + zodResolver(`createSupplierSchema | updateSupplierSchema`), mode `'onTouched'`
- Section "Thông tin cơ bản":
  - Input `name` (required, autofocus)
  - Input `phone` (optional, inputMode='tel')
  - Input `email` (optional, inputMode='email')
  - Input `address` (textarea, optional, max 500)
  - Input `taxId` (optional, max 32)
  - Input `notes` (textarea, optional, max 1000)
- Read-only info (chỉ mode edit):
  - Công nợ NCC: hiển thị `formatVnd(currentDebt)` + helper "Tự cập nhật từ phiếu nhập"
  - Số phiếu nhập: `purchaseCount` + helper "Phiếu đã tạo cho NCC này"
  - Tổng đã nhập: `formatVnd(totalPurchased)`
- Footer: nút "Hủy" + "Lưu" (disabled khi `!form.formState.isValid || isPending` — fix M3 Story 2.2)
- Submit:
  - Create → `useCreateSupplierMutation`, success → toast "Đã tạo NCC", close
  - Edit → `useUpdateSupplierMutation`, success → toast "Đã cập nhật NCC"
  - Error CONFLICT field=name/phone → form.setError tương ứng

**And** `<DeleteSupplierDialog>` reuse pattern `delete-customer-dialog.tsx`:

- Title "Xoá NCC {name}?"
- Confirm → `useDeleteSupplierMutation`. Error 422 → toast với message từ API.

**And** `<TrashedSuppliersSheet>` reuse pattern `trashed-customers-sheet.tsx`:

- Mở `<Sheet>`, list NCC đã xoá, nút "Khôi phục" mỗi dòng, pagination 50/trang

### AC9: Frontend `<PurchaseOrderForm>` — Tạo phiếu nhập

**Given** chủ cửa hàng vào trang `/inventory/purchase-orders/new`
**When** trang load
**Then** hiển thị form 3 phần:

**Phần 1: Header**

- Mã phiếu (read-only placeholder "PN-YYYYMMDD-XXXX (tự sinh khi lưu)")
- `<SupplierSelect>` (component MỚI):
  - Combobox search NCC theo `useSuppliersQuery({ search })` debounce 300ms
  - Hiển thị: tên NCC + công nợ hiện tại (badge nhỏ nếu > 0)
  - Nút "+ Thêm NCC mới" cuối dropdown → mở `<SupplierFormDialog>` mode create inline; success → tự chọn NCC vừa tạo
  - Empty state khi search 0 kết quả: "Không tìm thấy. [Thêm NCC mới]"
- Date picker `purchaseDate`: default hôm nay, format `dd/MM/yyyy` UI, lưu ISO 8601

**Phần 2: Danh sách SP (`<PurchaseOrderItemsEditor>`)**

- Search bar (top): Input "Tìm SP theo tên/SKU/barcode" + nút "Quét barcode" (icon `Camera`, story 6.1 ẩn nếu device không hỗ trợ camera). Search dùng `useProductsSearchQuery` (reuse từ Story 2.2/2.3)
- Khi user chọn SP từ search:
  - Nếu `product.hasVariants = true` → mở `<VariantPickerDialog>` (component MỚI) cho user chọn variant trước khi thêm vào phiếu
  - Nếu `product.hasVariants = false` → thêm row mới với `quantity=1`, `unitPrice=product.costPrice ?? 0` (gợi ý giá nhập gần nhất), focus ô SL
- Bảng item rows (desktop):
  - Cột: STT, Tên SP (+ variant label nếu có), SKU (font-mono text-xs), SL (Number stepper input min 1), Đơn giá nhập (CurrencyInput reuse Story 2.2), Chiết khấu dòng (Input + Select `'amount'/'percent'`, mặc định amount=0), Thành tiền (auto-compute, read-only `formatVnd`), Xoá (icon X)
  - Helper text dưới row: "Giá vốn hiện tại: X.XXX đ" (small text muted, nếu product.costPrice có)
  - Validate inline: SL ≥ 1, đơn giá ≥ 0, chiết khấu ≤ thành tiền
- Mobile: card layout mỗi item chiếm 1 card đầy đủ controls
- Khi user thêm SP đã có trong danh sách (cùng productId+variantId) → toast warning "Sản phẩm đã có trong phiếu, vui lòng cập nhật số lượng dòng cũ" + KHÔNG thêm dòng mới
- Validate khi submit: ≥ 1 item, mọi item hợp lệ

**Phần 3: Footer (sticky bottom)**

- Tổng tiền hàng (`subtotal` = Σ thành tiền): hiển thị `formatVnd`, font-bold
- Chiết khấu tổng phiếu: Input + Select `'amount'/'percent'`. Nếu percent: input 0-100, lưu `discountTotalValue = percent * 100`
- Tổng cuối cùng (`totalAmount` = subtotal - discountTotal): font-bold lớn
- Trạng thái thanh toán + số tiền đã trả:
  - Select `'unpaid'/'paid'/'partial'`:
    - `'unpaid'` → `paidAmount = 0`
    - `'paid'` → `paidAmount = totalAmount` (auto-set, disable input)
    - `'partial'` → user nhập `paidAmount` qua CurrencyInput (validate 0 < paidAmount < totalAmount)
- Hiển thị "Còn nợ NCC: {totalAmount - paidAmount} đ" (text màu cảnh báo nếu > 0)
- Buttons: "Hủy" (link về `/inventory/purchase-orders`) + "Lưu phiếu nhập" (primary, disabled khi form invalid hoặc `isPending`)

**And** sau submit thành công:

- Toast success "Đã tạo phiếu nhập [code]"
- Hiển thị panel kết quả phụ (dialog hoặc toast extend) với "Giá vốn cập nhật: X SP" (số SP đã update WAC)
- Navigate về `/inventory/purchase-orders/[newId]` (xem chi tiết phiếu vừa tạo, AC10)

### AC10: Frontend `<PurchaseOrderDetail>` — Xem chi tiết phiếu nhập

**Given** chủ cửa hàng click vào 1 phiếu nhập trong list HOẶC vừa tạo phiếu mới
**When** route `/inventory/purchase-orders/:id` mount
**Then** hiển thị `<PurchaseOrderDetailView>`:

- Breadcrumb: "Nhập hàng > Phiếu nhập > PN-..."
- Header card:
  - Mã phiếu (font-bold, font-mono)
  - Ngày nhập (`format(purchaseDate, 'dd/MM/yyyy')`)
  - NCC: tên + phone + link đến `/inventory/suppliers/:id` (story 6.1 không có chi tiết NCC page, fallback edit dialog)
  - Người tạo: tên user
  - Badge trạng thái thanh toán: `paid` (xanh) / `partial` (vàng) / `unpaid` (đỏ)
- Bảng items (desktop): cột STT, Tên SP (+ variant), SKU, SL, Đơn giá nhập, Chiết khấu dòng (`formatVnd(discountAmount)` + label `(X% / cố định)`), Thành tiền, Giá vốn sau (`formatVnd(costAfter)`)
- Mobile: card list mỗi item
- Footer card:
  - Tổng tiền hàng: `formatVnd(subtotal)`
  - Chiết khấu tổng: `formatVnd(discountTotal)` + label `(X% / cố định)`
  - **Tổng thanh toán**: `formatVnd(totalAmount)` (font-bold lớn)
  - Đã trả: `formatVnd(paidAmount)`
  - Còn nợ: `formatVnd(totalAmount - paidAmount)` (text destructive nếu > 0)
- Note section (nếu có)
- Audit summary (read-only): "Tạo lúc DD/MM/YYYY HH:mm bởi [user]"
- KHÔNG có nút Sửa/Xoá (immutable)

### AC11: Frontend `<PurchaseOrderList>` — Lịch sử phiếu nhập

**Given** chủ cửa hàng vào `/inventory/purchase-orders`
**When** trang load
**Then** hiển thị `<PurchaseOrderManager>`:

- Header: title "Phiếu nhập kho", description "Lịch sử phiếu nhập và công nợ NCC", nút primary "Tạo phiếu nhập" (link `/inventory/purchase-orders/new`)
- Filters (`<PurchaseOrderFilters>`):
  - Input search (icon `Search`, placeholder "Tìm theo mã phiếu hoặc tên NCC", debounce 300ms)
  - Select NCC (option "Tất cả NCC" + từng NCC từ `useSuppliersQuery`)
  - Select trạng thái thanh toán ("Tất cả"/"Đã trả"/"Trả 1 phần"/"Chưa trả")
  - Date range picker `fromDate` - `toDate` (preset: Hôm nay / 7 ngày / 30 ngày / Tháng này / Tuỳ chọn)
- Body:
  - Desktop: `<PurchaseOrderTable>` cột Mã phiếu (font-mono), Ngày nhập, NCC (link tooltip), Số SP (count items), Tổng tiền (`formatVndWithSuffix`), Đã trả, Còn nợ, Trạng thái TT (badge)
  - Mobile: `<PurchaseOrderCardList>` mỗi card: code + date (top), NCC + tổng (middle), badge trạng thái (bottom)
  - Click row/card → navigate `/inventory/purchase-orders/:id`
- `<Pagination>`

### AC12: Audit actions mới + Permission

**Given** đã có audit framework
**When** Story 6.1 thêm action mới
**Then** mở rộng `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`) thêm 5 action:

- `'supplier.created'`
- `'supplier.updated'`
- `'supplier.deleted'`
- `'supplier.restored'`
- `'purchase_order.created'`

**And** thêm 5 cặp label tiếng Việt vào `apps/web/src/features/audit/action-labels.ts`:

- `'supplier.created': 'Tạo nhà cung cấp'`
- `'supplier.updated': 'Sửa nhà cung cấp'`
- `'supplier.deleted': 'Xoá nhà cung cấp'`
- `'supplier.restored': 'Khôi phục nhà cung cấp'`
- `'purchase_order.created': 'Tạo phiếu nhập kho'`

**And** thêm 1 ACTION_GROUPS mới: `{ label: 'Nhập hàng', actions: ['supplier.created', 'supplier.updated', 'supplier.deleted', 'supplier.restored', 'purchase_order.created'] }`

**And** thêm permission MỚI `'inventory.manage': ['owner', 'manager']` vào `packages/shared/src/constants/permissions.ts`. Lý do tách riêng (không reuse `products.manage`): NCC + phiếu nhập là module độc lập với SP. Cho phép tương lai phân biệt staff được manage products mà không được tạo phiếu nhập.

**And** Frontend route `/inventory/*` đặt `beforeLoad: requirePermissionGuard('inventory.manage')` (Owner + Manager, KHÔNG Staff)

### AC13: TanStack Query hooks + invalidation

**Given** đã có pattern hook ở Story 2.x/4.x
**When** Story 6.1 mở rộng
**Then** tạo các hook MỚI:

**Suppliers (`apps/web/src/features/suppliers/use-suppliers.ts`):**

- `useSuppliersQuery(query)`: queryKey `['suppliers', query]`, `placeholderData: keepPreviousData`
- `useTrashedSuppliersQuery(query)`: queryKey `['suppliers', 'trashed', query]`
- `useSupplierQuery(id)`: queryKey `['suppliers', id]`, `enabled: !!id`
- `useCreateSupplierMutation()` / `useUpdateSupplierMutation()` / `useDeleteSupplierMutation()` / `useRestoreSupplierMutation()`
- onSuccess invalidate `['suppliers']` toàn bộ subtree

**Purchase Orders (`apps/web/src/features/purchase-orders/use-purchase-orders.ts`):**

- `usePurchaseOrdersQuery(query)`: queryKey `['purchase-orders', query]`, `placeholderData: keepPreviousData`
- `usePurchaseOrderQuery(id)`: queryKey `['purchase-orders', id]`
- `useCreatePurchaseOrderMutation()`: onSuccess invalidate:
  - `['purchase-orders']` (root, tự cascade)
  - `['suppliers']` (vì current_debt + purchase_count đã đổi)
  - `['products']` (vì WAC + stock đã đổi)
  - `['low-stock-count']`, `['low-stock']` (vì stock đổi có thể ảnh hưởng cảnh báo)
  - `['inventory-transactions']` (lịch sử tồn kho)

### AC14: Tích hợp Sidebar/Navigation

**Given** Story 1.3 đã có Sidebar + Mobile nav
**When** Story 6.1 thêm trang mới
**Then** thêm vào `apps/web/src/components/layout/nav-items.ts` group "Nhập hàng" (nếu chưa có):

- `/inventory/suppliers` — "Nhà cung cấp" (icon `Truck`)
- `/inventory/purchase-orders` — "Phiếu nhập kho" (icon `ClipboardList`)
- `/inventory/purchase-orders/new` — không add vào nav, là sub-route

**And** đặt group "Nhập hàng" SAU "Khách hàng" trong Sidebar order

**And** Frontend route trong `apps/web/src/router.tsx`:

- `/inventory/suppliers` → `<SuppliersPage>` (render `<SupplierManager>`)
- `/inventory/purchase-orders` → `<PurchaseOrdersPage>` (render `<PurchaseOrderManager>`)
- `/inventory/purchase-orders/new` → `<PurchaseOrderCreatePage>` (render `<PurchaseOrderForm>` mode create)
- `/inventory/purchase-orders/:id` → `<PurchaseOrderDetailPage>` (render `<PurchaseOrderDetailView>`)
- Tất cả 4 routes có `beforeLoad: requirePermissionGuard('inventory.manage')`

### AC15: Multi-tenant safety + Anti-pattern guard

**Given** ma trận multi-tenant của project
**When** mọi service/route Story 6.1 thực thi
**Then** CHẶT CHẼ filter:

- `suppliers.store_id = actor.storeId` cho mọi query
- `purchase_orders.store_id = actor.storeId`
- `purchase_order_items` join qua `purchase_orders` để filter store
- Mọi `product_id`, `variant_id`, `supplier_id` đầu vào API → service kiểm tra cùng store của actor → nếu không → 404 NOT_FOUND (KHÔNG trả 403 để tránh leak existence)
- Mọi mutation kiểm tra `requirePermission('inventory.manage')` ở route layer
- Frontend route guard `requirePermissionGuard('inventory.manage')`
- KHÔNG bypass filter `deleted_at IS NULL` cho query mặc định (chỉ trashed/restore endpoints query trên `deleted_at IS NOT NULL`)

**And** API trả 403 FORBIDDEN cho Staff khi truy cập bất kỳ endpoint `/api/v1/suppliers/*` hoặc `/api/v1/purchase-orders/*`

## Tasks / Subtasks

### Phase A: Backend Schema + Migration

- [ ] **Task 1: Tạo Drizzle schema `suppliers`, `purchase_orders`, `purchase_order_items`** (AC: #1, #2)
  - [ ] 1.1: Tạo `packages/shared/src/schema/suppliers.ts`:

    ```ts
    import { sql } from 'drizzle-orm'
    import {
      bigint,
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

    import { stores } from './stores.js'

    export const suppliers = pgTable(
      'suppliers',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id, { onDelete: 'restrict' }),
        name: varchar({ length: 100 }).notNull(),
        phone: varchar({ length: 20 }),
        email: varchar({ length: 255 }),
        address: text(),
        taxId: varchar({ length: 32 }),
        notes: text(),
        currentDebt: bigint({ mode: 'number' }).notNull().default(0),
        purchaseCount: integer().notNull().default(0),
        totalPurchased: bigint({ mode: 'number' }).notNull().default(0),
        deletedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        uniqueIndex('uniq_suppliers_store_name_alive')
          .on(table.storeId, sql`LOWER(${table.name})`)
          .where(sql`${table.deletedAt} IS NULL`),
        uniqueIndex('uniq_suppliers_store_phone_alive')
          .on(table.storeId, table.phone)
          .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
        index('idx_suppliers_store_created').on(table.storeId, table.createdAt),
        index('idx_suppliers_store_name_lower').on(table.storeId, sql`LOWER(${table.name})`),
        index('idx_suppliers_store_phone').on(table.storeId, table.phone),
      ],
    )
    ```

  - [ ] 1.2: Tạo `packages/shared/src/schema/purchase-orders.ts`:

    ```ts
    import {
      bigint,
      index,
      pgTable,
      text,
      timestamp,
      uniqueIndex,
      uuid,
      varchar,
    } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'

    import { stores } from './stores.js'
    import { suppliers } from './suppliers.js'
    import { users } from './users.js'

    export const purchaseOrders = pgTable(
      'purchase_orders',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        storeId: uuid()
          .notNull()
          .references(() => stores.id, { onDelete: 'restrict' }),
        supplierId: uuid()
          .notNull()
          .references(() => suppliers.id, { onDelete: 'restrict' }),
        code: varchar({ length: 32 }).notNull(),
        subtotal: bigint({ mode: 'number' }).notNull(),
        discountTotal: bigint({ mode: 'number' }).notNull().default(0),
        discountTotalType: varchar({ length: 16 }).notNull().default('amount'),
        discountTotalValue: bigint({ mode: 'number' }).notNull().default(0),
        totalAmount: bigint({ mode: 'number' }).notNull(),
        paidAmount: bigint({ mode: 'number' }).notNull().default(0),
        paymentStatus: varchar({ length: 16 }).notNull(),
        note: text(),
        purchaseDate: timestamp({ withTimezone: true }).notNull().defaultNow(),
        createdBy: uuid()
          .notNull()
          .references(() => users.id),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        uniqueIndex('uniq_purchase_orders_store_code').on(table.storeId, table.code),
        index('idx_purchase_orders_store_date').on(table.storeId, table.purchaseDate),
        index('idx_purchase_orders_store_supplier').on(table.storeId, table.supplierId),
        index('idx_purchase_orders_store_payment_status').on(table.storeId, table.paymentStatus),
      ],
    )
    ```

  - [ ] 1.3: Tạo `packages/shared/src/schema/purchase-order-items.ts`:

    ```ts
    import { sql } from 'drizzle-orm'
    import { bigint, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
    import { uuidv7 } from 'uuidv7'

    import { products } from './products.js'
    import { productVariants } from './product-variants.js'
    import { purchaseOrders } from './purchase-orders.js'

    export const purchaseOrderItems = pgTable(
      'purchase_order_items',
      {
        id: uuid()
          .primaryKey()
          .$defaultFn(() => uuidv7()),
        purchaseOrderId: uuid()
          .notNull()
          .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
        productId: uuid()
          .notNull()
          .references(() => products.id, { onDelete: 'restrict' }),
        variantId: uuid().references(() => productVariants.id, { onDelete: 'restrict' }),
        productNameSnapshot: varchar({ length: 255 }).notNull(),
        productSkuSnapshot: varchar({ length: 64 }).notNull(),
        variantLabelSnapshot: varchar({ length: 255 }),
        quantity: integer().notNull(),
        unitPrice: bigint({ mode: 'number' }).notNull(),
        discountAmount: bigint({ mode: 'number' }).notNull().default(0),
        discountType: varchar({ length: 16 }).notNull().default('amount'),
        discountValue: bigint({ mode: 'number' }).notNull().default(0),
        lineTotal: bigint({ mode: 'number' }).notNull(),
        costAfter: bigint({ mode: 'number' }),
        stockAfter: integer(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      },
      (table) => [
        index('idx_purchase_order_items_po').on(table.purchaseOrderId),
        index('idx_purchase_order_items_product').on(table.productId, table.createdAt),
        index('idx_purchase_order_items_variant')
          .on(table.variantId, table.createdAt)
          .where(sql`${table.variantId} IS NOT NULL`),
      ],
    )
    ```

  - [ ] 1.4: Export 3 schema mới từ `packages/shared/src/schema/index.ts`
  - [ ] 1.5: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → file `0013_*.sql`. Verify:
    - CREATE TABLE `suppliers` + 5 index (kể cả 2 partial unique với WHERE clause)
    - CREATE TABLE `purchase_orders` + 4 index
    - CREATE TABLE `purchase_order_items` + 3 index (kể cả 1 partial cho variant_id IS NOT NULL)
    - FK đúng: `suppliers → stores RESTRICT`, `purchase_orders → suppliers RESTRICT + stores RESTRICT`, `purchase_orders.created_by → users (no cascade)`, `purchase_order_items → purchase_orders CASCADE + products RESTRICT + variants RESTRICT`
  - [ ] 1.6: Nếu Drizzle 0.45 KHÔNG generate được `WHERE` clause cho partial unique/index → append manual SQL vào file migration (pattern Story 4.1):

    ```sql
    --> statement-breakpoint
    DROP INDEX IF EXISTS "uniq_suppliers_store_name_alive";
    CREATE UNIQUE INDEX "uniq_suppliers_store_name_alive"
      ON "suppliers" ("store_id", LOWER("name"))
      WHERE "deleted_at" IS NULL;
    --> statement-breakpoint
    DROP INDEX IF EXISTS "uniq_suppliers_store_phone_alive";
    CREATE UNIQUE INDEX "uniq_suppliers_store_phone_alive"
      ON "suppliers" ("store_id", "phone")
      WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL;
    --> statement-breakpoint
    DROP INDEX IF EXISTS "idx_purchase_order_items_variant";
    CREATE INDEX "idx_purchase_order_items_variant"
      ON "purchase_order_items" ("variant_id", "created_at")
      WHERE "variant_id" IS NOT NULL;
    ```

  - [ ] 1.7: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB, verify SQL output đúng

- [ ] **Task 2: Zod schemas cho suppliers + purchase-orders** (AC: #6, #7)
  - [ ] 2.1: Tạo `packages/shared/src/schema/supplier-management.ts`:

    ```ts
    import { z } from 'zod'

    const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
    const PHONE_REGEX = /^[0-9+]+$/
    const TAX_ID_REGEX = /^[A-Za-z0-9\-]+$/

    export const supplierNameSchema = z
      .string({ required_error: 'Vui lòng nhập tên nhà cung cấp' })
      .trim()
      .min(1, 'Vui lòng nhập tên nhà cung cấp')
      .max(100, 'Tên NCC tối đa 100 ký tự')
      .regex(NAME_REGEX, 'Tên NCC chứa ký tự không hợp lệ')

    export const supplierPhoneSchema = z
      .string()
      .trim()
      .min(8, 'Số điện thoại phải có ít nhất 8 ký tự')
      .max(15, 'Số điện thoại tối đa 15 ký tự')
      .regex(PHONE_REGEX, 'Số điện thoại chỉ chấp nhận chữ số (và ký tự + ở đầu)')

    export const createSupplierSchema = z.object({
      name: supplierNameSchema,
      phone: supplierPhoneSchema.nullable().optional(),
      email: z.string().trim().email('Email không hợp lệ').nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(),
      taxId: z.string().trim().max(32).regex(TAX_ID_REGEX).nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    })

    export const updateSupplierSchema = z
      .object({
        name: supplierNameSchema.optional(),
        phone: supplierPhoneSchema.nullable().optional(),
        email: z.string().trim().email().nullable().optional(),
        address: z.string().trim().max(500).nullable().optional(),
        taxId: z.string().trim().max(32).regex(TAX_ID_REGEX).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .refine((d) => Object.keys(d).length > 0, {
        message: 'Cần ít nhất một trường để cập nhật',
      })

    export const supplierHasDebtSchema = z.enum(['yes', 'no', 'all'])

    export const listSuppliersQuerySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().optional(),
      hasDebt: supplierHasDebtSchema.default('all'),
    })

    export const supplierListItemSchema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
      taxId: z.string().nullable(),
      notes: z.string().nullable(),
      currentDebt: z.number(),
      purchaseCount: z.number().int(),
      totalPurchased: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })

    export const supplierDetailSchema = supplierListItemSchema.extend({
      storeId: z.string().uuid(),
      deletedAt: z.string().nullable(),
    })

    export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
    export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
    export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>
    export type SupplierListItem = z.infer<typeof supplierListItemSchema>
    export type SupplierDetail = z.infer<typeof supplierDetailSchema>
    export type SupplierHasDebt = z.infer<typeof supplierHasDebtSchema>
    ```

  - [ ] 2.2: Tạo `packages/shared/src/schema/purchase-order-management.ts`:

    ```ts
    import { z } from 'zod'

    export const discountTypeSchema = z.enum(['amount', 'percent'])
    export const paymentStatusSchema = z.enum(['unpaid', 'partial', 'paid'])

    export const purchaseOrderItemInputSchema = z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      quantity: z.number().int().min(1, 'Số lượng phải ≥ 1').max(1_000_000),
      unitPrice: z.number().int().min(0, 'Đơn giá nhập ≥ 0'),
      discountType: discountTypeSchema.default('amount'),
      discountValue: z.number().int().min(0).default(0),
    })

    export const createPurchaseOrderSchema = z.object({
      supplierId: z.string().uuid({ message: 'Vui lòng chọn nhà cung cấp' }),
      purchaseDate: z.string().datetime().optional(),
      items: z
        .array(purchaseOrderItemInputSchema)
        .min(1, 'Phiếu nhập phải có ít nhất 1 sản phẩm')
        .max(200, 'Tối đa 200 dòng SP/phiếu'),
      discountTotalType: discountTypeSchema.default('amount'),
      discountTotalValue: z.number().int().min(0).default(0),
      paidAmount: z.number().int().min(0).default(0),
      note: z.string().trim().max(500).optional(),
    })

    export const listPurchaseOrdersQuerySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().optional(),
      supplierId: z.string().uuid().optional(),
      paymentStatus: paymentStatusSchema.optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
    })

    export const purchaseOrderItemDetailSchema = z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable(),
      productNameSnapshot: z.string(),
      productSkuSnapshot: z.string(),
      variantLabelSnapshot: z.string().nullable(),
      quantity: z.number(),
      unitPrice: z.number(),
      discountAmount: z.number(),
      discountType: discountTypeSchema,
      discountValue: z.number(),
      lineTotal: z.number(),
      costAfter: z.number().nullable(),
      stockAfter: z.number().nullable(),
    })

    export const purchaseOrderListItemSchema = z.object({
      id: z.string().uuid(),
      code: z.string(),
      supplierId: z.string().uuid(),
      supplierName: z.string(),
      itemCount: z.number().int(),
      subtotal: z.number(),
      discountTotal: z.number(),
      totalAmount: z.number(),
      paidAmount: z.number(),
      paymentStatus: paymentStatusSchema,
      purchaseDate: z.string(),
      createdAt: z.string(),
    })

    export const purchaseOrderDetailSchema = purchaseOrderListItemSchema.extend({
      storeId: z.string().uuid(),
      discountTotalType: discountTypeSchema,
      discountTotalValue: z.number(),
      note: z.string().nullable(),
      createdBy: z.string().uuid(),
      createdByName: z.string().nullable(),
      supplier: z.object({
        id: z.string().uuid(),
        name: z.string(),
        phone: z.string().nullable(),
      }),
      items: z.array(purchaseOrderItemDetailSchema),
      updatedAt: z.string(),
    })

    export type DiscountType = z.infer<typeof discountTypeSchema>
    export type PaymentStatus = z.infer<typeof paymentStatusSchema>
    export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>
    export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
    export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>
    export type PurchaseOrderItemDetail = z.infer<typeof purchaseOrderItemDetailSchema>
    export type PurchaseOrderListItem = z.infer<typeof purchaseOrderListItemSchema>
    export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>
    ```

  - [ ] 2.3: Re-export từ `packages/shared/src/schema/index.ts`
  - [ ] 2.4: Co-located test `supplier-management.test.ts` cover:
    - `supplierNameSchema`: rỗng → fail; >100 → fail; tiếng Việt → pass; ký tự đặc biệt cho phép → pass
    - `supplierPhoneSchema`: <8 → fail; >15 → fail; chứa chữ → fail; "0901234567" → pass; "+84901234567" → pass
    - `createSupplierSchema`: chỉ name → pass; name + phone trùng → server check (không validate ở Zod); email "abc" → fail; email "a@b.com" → pass
    - `updateSupplierSchema`: empty object → fail (refine); chỉ phone → pass
    - `listSuppliersQuerySchema`: coerce page/pageSize từ string; default đúng
  - [ ] 2.5: Co-located test `purchase-order-management.test.ts` cover:
    - `purchaseOrderItemInputSchema`: quantity 0 → fail; quantity 1 → pass; unitPrice -1 → fail; unitPrice 0 → pass
    - `createPurchaseOrderSchema`: items rỗng → fail "ít nhất 1"; items 201 → fail "tối đa 200"; supplierId không phải uuid → fail
    - `discountTypeSchema`: 'amount'/'percent' → pass; 'fixed' → fail
    - `paymentStatusSchema`: enum đúng
    - `listPurchaseOrdersQuerySchema`: fromDate/toDate phải ISO → coerce, default

- [ ] **Task 3: Mở rộng audit action enum + permission constant** (AC: #12)
  - [ ] 3.1: Sửa `packages/shared/src/schema/audit-log.ts`: thêm vào `auditActionSchema` enum 5 action mới (xem AC12)
  - [ ] 3.2: Sửa `packages/shared/src/constants/permissions.ts`: thêm `'inventory.manage': ['owner', 'manager']`
  - [ ] 3.3: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - Thêm 5 cặp label tiếng Việt
    - Thêm 1 group "Nhập hàng" vào `ACTION_GROUPS`
  - [ ] 3.4: Cập nhật `packages/shared/src/constants/permissions.test.ts` matrix: Owner + Manager có `inventory.manage`, Staff không có

### Phase B: Backend Service + Routes

- [ ] **Task 4: Suppliers service** (AC: #6, #15)
  - [ ] 4.1: Tạo `apps/api/src/services/suppliers.service.ts` theo pattern `customers.service.ts`:
    - `listSuppliers({ db, storeId, query })`: build WHERE (search escape `%`/`_` qua `escapeLikePattern`, hasDebt filter), pagination, sort `(createdAt DESC, name ASC)`
    - `listTrashedSuppliers({ db, storeId, query })`: tương tự nhưng `deletedAt IS NOT NULL`
    - `getSupplier({ db, storeId, supplierId, includeDeleted? })`: trả `SupplierDetail` hoặc 404
    - `createSupplier({ db, actor, input, meta })`:
      - `ensureNameUnique` (case-insensitive trong store alive) → 409 field=name
      - Nếu `phone` có giá trị: `ensurePhoneUnique` (alive) → 409 field=phone
      - Insert + audit `supplier.created` trong transaction
      - Catch DB 23505 unique violation: phân biệt qua `constraint_name` (`uniq_suppliers_store_name_alive` → field=name; `uniq_suppliers_store_phone_alive` → field=phone) (reuse `pg-errors.ts` từ Story 4.1)
    - `updateSupplier({ db, actor, supplierId, input, meta })`:
      - Validate ownership + alive → 404
      - Validate đổi name unique excludeId → 409
      - Validate đổi phone unique excludeId → 409
      - Update + diff audit `supplier.updated` qua `diffObjects`
    - `deleteSupplier({ db, actor, supplierId, meta })`:
      - Validate ownership + alive → 404
      - Check `current_debt > 0` → 422 "NCC còn công nợ {vnd}đ, không thể xoá"
      - Check `purchase_count > 0` → 422 "NCC đã có {N} phiếu nhập, không thể xoá"
      - Defensive try-catch FK violation 23503 → 422
      - Soft delete `deletedAt = NOW()` + audit `supplier.deleted` với snapshot
    - `restoreSupplier({ db, actor, supplierId, meta })`:
      - Validate target có deletedAt → 404
      - Check name không bị NCC sống khác chiếm → 409
      - Check phone không bị NCC sống khác chiếm (nếu có phone) → 409
      - Set `deletedAt = NULL` + audit `supplier.restored`
  - [ ] 4.2: Helper `toSupplierListItem(row)` và `toSupplierDetail(row)` map Drizzle → response shape
  - [ ] 4.3: Reuse helper `unwrapDriverError`, `getPgErrorCode`, `getPgConstraint`, `isUniqueViolation` từ `apps/api/src/lib/pg-errors.ts` (đã có từ Story 4.1)
  - [ ] 4.4: Reuse `escapeLikePattern` từ `apps/api/src/lib/strings.ts` (đã có từ Story 4.1)

- [ ] **Task 5: Suppliers routes** (AC: #6, #15)
  - [ ] 5.1: Tạo `apps/api/src/routes/suppliers.routes.ts` theo pattern `customers.routes.ts`:
    - `GET /` → `listSuppliers`
    - `GET /trashed` → `listTrashedSuppliers` (mount TRƯỚC `/:id`)
    - `GET /:id` → `getSupplier`
    - `POST /` → `createSupplier`
    - `PATCH /:id` → `updateSupplier`
    - `DELETE /:id` → `deleteSupplier`
    - `POST /:id/restore` → `restoreSupplier`
    - Middleware: `requireAuth` + `requirePermission('inventory.manage')`
    - Hono factory function `createSuppliersRoutes({ db })`
  - [ ] 5.2: Mount vào `apps/api/src/index.ts` sau `/api/v1/customers`:
    ```ts
    app.route('/api/v1/suppliers', createSuppliersRoutes({ db }))
    ```

- [ ] **Task 6: Purchase Orders service** (AC: #3, #4, #5, #7, #15)
  - [ ] 6.1: Tạo `apps/api/src/services/purchase-orders.service.ts`:
    - Helper `generatePurchaseOrderCode({ tx, storeId, purchaseDate })`:
      - Format `purchaseDate` theo Asia/Ho_Chi_Minh timezone → `YYYYMMDD`
      - Query MAX `code` LIKE `PN-YYYYMMDD-%` của store, parse số cuối → +1; nếu không có → 1
      - Format `PN-YYYYMMDD-XXXX` (zero-pad 4 chữ số)
      - Trả code; caller chịu trách nhiệm retry nếu insert fail unique violation
    - Helper `applyDiscount(baseAmount, type, value)`:
      - `'amount'` → `Math.min(value, baseAmount)` (cap không vượt base, defensive)
      - `'percent'` → `Math.floor(baseAmount * value / 10000)` (value lưu percent \* 100)
    - `createPurchaseOrder({ db, actor, input, meta })`: (xem AC4 chi tiết các bước)
      - Validate supplier cùng store + alive → 404
      - Validate items length ≥ 1
      - `db.transaction(async (tx) => { ... })`
      - Trong transaction:
        - Lock products + variants liên quan FOR UPDATE (theo `productId` + `variantId` trong items, dedupe trước)
        - Validate dedupe items: nếu 2 item có cùng `(productId, variantId)` → BUSINESS_RULE_VIOLATION
        - Validate hasVariants vs variantId match
        - Tính lineTotal cho từng item, validate discount ≤ lineSubtotal
        - Tính subtotal, discountTotal, totalAmount
        - Validate paidAmount ≤ totalAmount
        - Determine paymentStatus
        - Generate code (retry tối đa 3 lần với mã +1 nếu unique violation)
        - Insert `purchaseOrders` row
        - Loop items: tính WAC, update product/variant, insert `purchaseOrderItems` + `inventoryTransactions`
        - Update supplier counters: `currentDebt += unpaidPart`, `purchaseCount += 1`, `totalPurchased += totalAmount`
        - Audit `purchase_order.created`
      - Sau transaction: load lại detail qua `getPurchaseOrder` để return
    - `listPurchaseOrders({ db, storeId, query })`:
      - LEFT JOIN suppliers cho supplierName
      - Subquery hoặc aggregate query cho itemCount per PO
      - Filter: search (LOWER code OR LOWER supplier.name), supplierId, paymentStatus, fromDate, toDate
      - Sort `(purchaseDate DESC, createdAt DESC)`
      - Pagination, response `{ items, total }`
    - `getPurchaseOrder({ db, storeId, orderId })`:
      - Load PO row, validate ownership → 404
      - Load supplier (id, name, phone)
      - Load items qua join (LEFT JOIN products + variants để lấy current names; KHÔNG bắt buộc dùng vì có snapshot)
      - Load createdBy user name
      - Trả `PurchaseOrderDetail`
  - [ ] 6.2: Helper `toPurchaseOrderListItem(row, supplierName, itemCount)` và `toPurchaseOrderDetail(row, supplier, items, createdByName)`
  - [ ] 6.3: Concurrency note in code comment: race condition khi 2 phiếu cùng giây cùng store cùng ngày → unique violation `uniq_purchase_orders_store_code` → catch và retry với code kế tiếp (tối đa 3 lần). Sau 3 lần fail → throw `INTERNAL_ERROR` "Không thể sinh mã phiếu, vui lòng thử lại"

- [ ] **Task 7: Purchase Orders routes** (AC: #7, #15)
  - [ ] 7.1: Tạo `apps/api/src/routes/purchase-orders.routes.ts`:
    - `GET /` → `listPurchaseOrders` (envelope meta)
    - `GET /:id` → `getPurchaseOrder`
    - `POST /` → `createPurchaseOrder`
    - Middleware: `requireAuth` + `requirePermission('inventory.manage')`
    - Hono factory function `createPurchaseOrdersRoutes({ db })`
  - [ ] 7.2: Mount vào `apps/api/src/index.ts` sau `/api/v1/suppliers`:
    ```ts
    app.route('/api/v1/purchase-orders', createPurchaseOrdersRoutes({ db }))
    ```

### Phase C: Frontend (apps/web)

- [ ] **Task 8: API client + TanStack Query hooks suppliers** (AC: #8, #13)
  - [ ] 8.1: Tạo `apps/web/src/features/suppliers/suppliers-api.ts` theo pattern `customers-api.ts`:
    - `listSuppliersApi(query)`, `listTrashedSuppliersApi(query)`, `getSupplierApi(id)`, `createSupplierApi(input)`, `updateSupplierApi(id, input)`, `deleteSupplierApi(id)`, `restoreSupplierApi(id)`
    - Build query string helper với `page`, `pageSize`, `search`, `hasDebt`
  - [ ] 8.2: Tạo `apps/web/src/features/suppliers/use-suppliers.ts`:
    - `useSuppliersQuery(query)`: queryKey `['suppliers', query]`, `placeholderData: keepPreviousData`
    - `useTrashedSuppliersQuery(query)`: queryKey `['suppliers', 'trashed', query]`
    - `useSupplierQuery(id)`: queryKey `['suppliers', id]`, `enabled: !!id`
    - `useCreateSupplierMutation()` / `useUpdateSupplierMutation()` / `useDeleteSupplierMutation()` / `useRestoreSupplierMutation()` → invalidate `['suppliers']` toàn bộ subtree
  - [ ] 8.3: Reuse `useDebounced` hook từ `apps/web/src/hooks/use-debounced.ts`

- [ ] **Task 9: SupplierFormDialog + SupplierFilters** (AC: #8)
  - [ ] 9.1: Tạo `apps/web/src/features/suppliers/supplier-form-dialog.tsx` theo pattern `customer-form-dialog.tsx`:
    - Mode `'create' | 'edit'`. Props: `open`, `onOpenChange`, `mode`, `supplier?: SupplierDetail`, `onSupplierCreated?: (s: SupplierDetail) => void` (optional callback cho dùng inline trong PurchaseOrderForm)
    - Form RHF + zodResolver
    - Section "Thông tin cơ bản": name (required), phone (optional, inputMode='tel'), email (optional, inputMode='email'), address (textarea), taxId, notes (textarea)
    - Section "Tài chính" (chỉ mode edit, read-only): công nợ, số phiếu nhập, tổng đã nhập (formatVnd, helper text)
    - Footer: Hủy + Lưu (`disabled={!form.formState.isValid || isPending}` cho cả 2 mode)
    - Submit: pattern handleApiError + setError CONFLICT field=name/phone
    - Mode edit: thêm `key={supplier.id}` vào parent để force remount khi đổi target (fix M13 Story 4.1)
  - [ ] 9.2: Tạo `apps/web/src/features/suppliers/supplier-filters.tsx`:
    - Props: `value: { search, hasDebt }`, `onChange(partial)`
    - Render: Input search (icon Search) + Select công nợ
    - Desktop: flex-row gap-2 flex-wrap; Mobile: nút "Lọc" mở Sheet

- [ ] **Task 10: SupplierTable + SupplierCardList + DeleteSupplierDialog + TrashedSuppliersSheet** (AC: #8)
  - [ ] 10.1: Tạo `apps/web/src/features/suppliers/supplier-table.tsx`:
    - Props: `items`, `onEdit`, `onDelete`
    - Cột: Tên (font-medium), SĐT (font-mono text-sm hoặc "—"), Email (text muted hoặc "—"), Công nợ (`<DebtBadge>` reuse từ Story 4.1, pass `currentDebt` và `effectiveDebtLimit=null`), Số phiếu nhập, Tổng đã nhập (`formatVndWithSuffix`), Hành động
  - [ ] 10.2: Tạo `apps/web/src/features/suppliers/supplier-card-list.tsx`:
    - Card avatar (chữ cái đầu), tên + phone (font-mono), công nợ badge, menu 3 chấm
  - [ ] 10.3: Tạo `apps/web/src/features/suppliers/delete-supplier-dialog.tsx`:
    - Title "Xoá NCC {name}?", description "NCC sẽ được chuyển vào thùng rác. Có thể khôi phục từ mục NCC đã xoá."
    - Confirm: `useDeleteSupplierMutation`. Error 422 → toast với message từ API
  - [ ] 10.4: Tạo `apps/web/src/features/suppliers/trashed-suppliers-sheet.tsx`:
    - Trigger nút "NCC đã xoá" (icon Trash2 outline)
    - `<Sheet>` chứa list NCC đã xoá + nút "Khôi phục" mỗi dòng + pagination 50/trang

- [ ] **Task 11: SupplierManager + SuppliersPage + Route** (AC: #8, #14)
  - [ ] 11.1: Tạo `apps/web/src/features/suppliers/supplier-manager.tsx`:
    - State: searchInput, debouncedSearch, hasDebt, page, pageSize=20, createOpen, editTarget, deleteTarget, trashedOpen
    - `suppliersQuery = useSuppliersQuery(query)`
    - Header: title "Nhà cung cấp", description, group nút (NCC đã xoá, Thêm NCC)
    - Filters block, body (loading/error/empty/table or card list), pagination
    - Dialogs: SupplierFormDialog, DeleteSupplierDialog, TrashedSuppliersSheet
  - [ ] 11.2: Tạo `apps/web/src/pages/suppliers-page.tsx` render `<SupplierManager />`
  - [ ] 11.3: Thêm route `/inventory/suppliers` vào `apps/web/src/router.tsx` với `beforeLoad: requirePermissionGuard('inventory.manage')`
  - [ ] 11.4: Thêm icon `Truck` + entry "Nhà cung cấp" vào `apps/web/src/components/layout/nav-items.ts` group "Nhập hàng" (tạo group mới sau group "Khách hàng")

- [ ] **Task 12: API client + TanStack Query hooks purchase-orders** (AC: #9, #10, #11, #13)
  - [ ] 12.1: Tạo `apps/web/src/features/purchase-orders/purchase-orders-api.ts`:
    - `listPurchaseOrdersApi(query)`, `getPurchaseOrderApi(id)`, `createPurchaseOrderApi(input)`
    - Build query string helper với `page`, `pageSize`, `search`, `supplierId`, `paymentStatus`, `fromDate`, `toDate`
  - [ ] 12.2: Tạo `apps/web/src/features/purchase-orders/use-purchase-orders.ts`:
    - `usePurchaseOrdersQuery(query)`, `usePurchaseOrderQuery(id)`, `useCreatePurchaseOrderMutation()`
    - onSuccess invalidate: `['purchase-orders']`, `['suppliers']`, `['products']`, `['low-stock-count']`, `['low-stock']`, `['inventory-transactions']`

- [ ] **Task 13: SupplierSelect + VariantPickerDialog** (AC: #9)
  - [ ] 13.1: Tạo `apps/web/src/features/purchase-orders/supplier-select.tsx`:
    - Combobox search, debounce 300ms qua `useSuppliersQuery({ search })`
    - Item: tên + công nợ badge nếu > 0
    - Footer dropdown: nút "+ Thêm NCC mới" → mở `<SupplierFormDialog>` mode create inline
    - Props: `value`, `onChange(supplierId)`, `onSupplierCreated?: (s) => void` để parent biết NCC vừa tạo
    - Empty state khi search 0 kết quả
  - [ ] 13.2: Tạo `apps/web/src/features/purchase-orders/variant-picker-dialog.tsx`:
    - Props: `open`, `onOpenChange`, `product: ProductDetail`, `onPicked(variantId, label)`
    - List variants với `useProductVariantsQuery(product.id)` (reuse từ Story 2.3)
    - Mỗi variant: label (Đỏ - L), SKU, tồn kho hiện tại
    - Click variant → callback + close dialog

- [ ] **Task 14: PurchaseOrderItemsEditor** (AC: #9)
  - [ ] 14.1: Tạo `apps/web/src/features/purchase-orders/purchase-order-items-editor.tsx`:
    - Props: `items: PurchaseOrderItemFormState[]` (form state với `tempId` cho key), `onChange(items)`
    - Top: Input search SP debounce 300ms qua `useProductsSearchQuery` (reuse Story 2.2/2.3)
    - Khi chọn SP có variants → mở `<VariantPickerDialog>`; sau pick → thêm row
    - Khi chọn SP không variants → thêm row trực tiếp
    - Validate dedupe: nếu user chọn SP+variant đã có trong list → toast warning, KHÔNG thêm
    - Bảng items (desktop) / Card (mobile): controls quantity (Number input min 1), unitPrice (CurrencyInput), discountValue + discountType select
    - Compute thành tiền (lineTotal) = quantity \* unitPrice - discount per row
    - Hiển thị helper "Giá vốn hiện tại: X.XXX đ" dưới row
    - Nút X xoá row
  - [ ] 14.2: Helper `computeLineTotal(quantity, unitPrice, discountType, discountValue): { lineSubtotal, discountAmount, lineTotal }` ở `apps/web/src/features/purchase-orders/purchase-order-utils.ts`
  - [ ] 14.3: Co-located test `purchase-order-utils.test.ts`:
    - quantity=10, unitPrice=78000, discountType='amount', discountValue=20000 → discountAmount=20000, lineTotal=760000
    - quantity=10, unitPrice=78000, discountType='percent', discountValue=500 (5%) → discountAmount=39000, lineTotal=741000
    - discount > lineSubtotal → discountAmount cap at lineSubtotal (defensive)

- [ ] **Task 15: PurchaseOrderForm + PurchaseOrderCreatePage** (AC: #9)
  - [ ] 15.1: Tạo `apps/web/src/features/purchase-orders/purchase-order-form.tsx`:
    - Form state: `supplierId`, `purchaseDate`, `items[]`, `discountTotalType`, `discountTotalValue`, `paidAmount`, `paymentStatus`, `note`
    - Phần Header: SupplierSelect, DatePicker
    - Phần Items: PurchaseOrderItemsEditor
    - Phần Footer (sticky bottom):
      - Compute: subtotal, discountTotal, totalAmount, remaining = totalAmount - paidAmount
      - Inputs: discountTotalType+Value, paymentStatus select, paidAmount (auto-set khi paid; user nhập khi partial)
    - Buttons: Hủy (link `/inventory/purchase-orders`) + Lưu (disabled khi invalid hoặc isPending)
    - Submit: gọi `useCreatePurchaseOrderMutation()`, success → toast + navigate `/inventory/purchase-orders/[newId]`
    - Validate trước submit: ≥ 1 item, mọi item hợp lệ, supplierId chọn, paidAmount ≤ totalAmount
  - [ ] 15.2: Tạo `apps/web/src/pages/purchase-order-create-page.tsx` render `<PurchaseOrderForm mode="create" />`
  - [ ] 15.3: Thêm route `/inventory/purchase-orders/new` vào `apps/web/src/router.tsx` với guard

- [ ] **Task 16: PurchaseOrderDetailView + PurchaseOrderDetailPage** (AC: #10)
  - [ ] 16.1: Tạo `apps/web/src/features/purchase-orders/purchase-order-detail-view.tsx`:
    - Props: `orderId: string`
    - `usePurchaseOrderQuery(orderId)` → loading skeleton / error / detail
    - Layout: breadcrumb, header card (mã + ngày + NCC + người tạo + badge), bảng items (desktop) hoặc card (mobile), footer summary, note section
    - KHÔNG có nút Sửa/Xoá
  - [ ] 16.2: Tạo `apps/web/src/pages/purchase-order-detail-page.tsx` render `<PurchaseOrderDetailView orderId={params.id} />`
  - [ ] 16.3: Thêm route `/inventory/purchase-orders/$orderId` vào router với guard

- [ ] **Task 17: PurchaseOrderManager + PurchaseOrdersPage** (AC: #11, #14)
  - [ ] 17.1: Tạo `apps/web/src/features/purchase-orders/purchase-order-table.tsx`: cột Mã phiếu (font-mono), Ngày nhập (`format`), NCC (text), Số SP, Tổng tiền, Đã trả, Còn nợ (text destructive nếu > 0), Trạng thái TT (badge). Click row → navigate detail.
  - [ ] 17.2: Tạo `apps/web/src/features/purchase-orders/purchase-order-card-list.tsx`: mobile card layout
  - [ ] 17.3: Tạo `apps/web/src/features/purchase-orders/purchase-order-filters.tsx`:
    - Input search, Select NCC (từ `useSuppliersQuery`), Select trạng thái TT, DateRangePicker với preset
  - [ ] 17.4: Tạo `apps/web/src/features/purchase-orders/purchase-order-manager.tsx`:
    - State: searchInput, debouncedSearch, supplierId, paymentStatus, fromDate, toDate, page, pageSize=20
    - Header: title + nút "Tạo phiếu nhập" (link `/inventory/purchase-orders/new`)
    - Filters block, body, pagination
  - [ ] 17.5: Tạo `apps/web/src/pages/purchase-orders-page.tsx`
  - [ ] 17.6: Thêm route `/inventory/purchase-orders` với guard, thêm nav item "Phiếu nhập kho" (icon `ClipboardList`)

### Phase D: Tests + Manual verify

- [ ] **Task 18: Unit tests Zod schemas + utility helpers** (AC: tất cả Zod)
  - [ ] 18.1: `packages/shared/src/schema/supplier-management.test.ts` (đã mô tả ở 2.4)
  - [ ] 18.2: `packages/shared/src/schema/purchase-order-management.test.ts` (đã mô tả ở 2.5)
  - [ ] 18.3: `apps/web/src/features/purchase-orders/purchase-order-utils.test.ts` (đã mô tả ở 14.3)

- [ ] **Task 19: API integration tests** (AC: #1-#7, #12, #15)
  - [ ] 19.1: `apps/api/src/__tests__/suppliers.integration.test.ts` (Vitest + PGlite, pattern từ `customers.integration.test.ts`):
    - **Create**: Owner OK 201; Manager OK; Staff 403; name trùng → 409 field=name; phone trùng (alive) → 409 field=phone; phone null OK + 2 NCC null phone cùng store OK (partial unique cho phép)
    - **List**: filter store; search escape `%`/`_`; hasDebt filter; pagination meta đúng
    - **Get**: NOT_FOUND khi cross-store; trả đầy đủ field
    - **Update**: PATCH name OK; sửa name trùng → 409; sửa phone trùng → 409; sửa current_debt qua PATCH bị reject (whitelist field)
    - **Delete**: NCC có `current_debt > 0` → 422; NCC có `purchase_count > 0` → 422; NCC sạch → 200, soft delete; trashed list thấy; restore phục hồi; restore khi name/phone trùng → 409
    - **Audit**: 4 action `supplier.*` ghi đầy đủ
    - **Multi-tenant**: store A không xem/sửa/xoá được NCC của store B
  - [ ] 19.2: `apps/api/src/__tests__/purchase-orders.integration.test.ts`:
    - **Create**:
      - Owner OK 201; Staff 403
      - Phiếu 1 SP đơn giản: stock + costPrice cập nhật đúng; inventory_transactions ghi 1 row type='purchase'
      - Phiếu 1 SP có biến thể: variant.stockQuantity cập nhật, products.cost_price cập nhật, products.current_stock GIỮ NGUYÊN
      - WAC formula: ví dụ AC (200 viên × 70k cũ + 500 × 78k mới = 74.286đ) → assert `costAfter` integer chính xác
      - WAC khi `costBefore = null` (lần đầu) → `costAfter = unitCost`
      - Phiếu nhiều SP: subtotal, discountTotal, totalAmount, paymentStatus, supplier.current_debt cập nhật đúng
      - Items rỗng → 422 "≥ 1"; items > 200 → 400 (Zod)
      - SP cross-store → 404
      - Variant không thuộc product → 404
      - SP có variants nhưng không truyền variantId → 400
      - SP không variants nhưng truyền variantId → 400
      - Items có 2 dòng cùng (productId, variantId) → 422 "Sản phẩm xuất hiện nhiều lần"
      - Discount dòng % vượt 100% (10000) → vẫn pass tính toán (cap qua applyDiscount), nhưng nếu amount > lineSubtotal → 422
      - Discount tổng > subtotal → 422
      - paidAmount > totalAmount → 422
      - paidAmount = 0 → paymentStatus='unpaid', supplier.current_debt += totalAmount
      - paidAmount = totalAmount → paymentStatus='paid', supplier.current_debt += 0
      - paidAmount partial → paymentStatus='partial', supplier.current_debt += (totalAmount - paidAmount)
      - Code auto-gen: 2 phiếu cùng ngày → PN-YYYYMMDD-0001 + PN-YYYYMMDD-0002
      - Code auto-gen sang ngày: backdate phiếu sang yesterday → code có YYYYMMDD = yesterday
      - Race code: simulate 2 concurrent transactions cùng code → 1 retry thành công
    - **List**: filter store, search code/supplier name (case-insensitive), supplierId, paymentStatus, fromDate/toDate range, sort `(purchaseDate DESC)`, pagination meta
    - **Get**: NOT_FOUND cross-store; trả đầy đủ items + supplier info + createdByName
    - **Audit**: action `purchase_order.created` với targetType='purchase_order', changes chứa key fields
    - **Multi-tenant**: store A không xem/tạo phiếu cho NCC của store B
  - [ ] 19.3: Verify `pnpm --filter @kiotviet-lite/api test` pass

- [ ] **Task 20: Frontend manual verify + lint/typecheck** (AC: tất cả UI)
  - [ ] 20.1: `pnpm typecheck` pass
  - [ ] 20.2: `pnpm lint` pass
  - [ ] 20.3: `pnpm test` pass toàn bộ
  - [ ] 20.4: Manual flow Owner desktop:
    - Đăng nhập → /inventory/suppliers → empty state → Thêm NCC "Công ty ABC" + phone "0901111111" → table hiện 1 dòng
    - Tạo NCC "Công ty XYZ" với phone trống → OK
    - Tạo NCC "công ty abc" (trùng case-insensitive) → toast error 409 + form.setError name
    - Tạo NCC "Khác" với phone "0901111111" (trùng) → toast error 409 + form.setError phone
    - Sửa "Công ty ABC" → đổi address → save OK → audit ghi
    - /inventory/purchase-orders → empty state → "Tạo phiếu nhập"
    - SupplierSelect: search "ABC" → chọn → header hiện tên + phone
    - Search SP "Bia" (giả định Story 2.x đã seed) → chọn không variant → row thêm với quantity=1, unitPrice=costPrice
    - Sửa quantity=10, unitPrice=20000 → thành tiền=200.000đ
    - Thêm SP có variant → mở VariantPickerDialog → chọn "Đỏ - L" → row thêm
    - Cố thêm cùng SP+variant → toast "đã có trong phiếu"
    - Discount dòng 5% trên row 200k → discountAmount=10k, lineTotal=190k
    - Discount tổng phiếu cố định 5k → totalAmount = subtotal - 5k
    - Trạng thái TT "Trả 1 phần", paidAmount=50k → còn nợ hiển thị
    - Lưu → toast "Đã tạo phiếu PN-..." → navigate detail
    - Trang detail: thấy đầy đủ items, snapshot tên, costAfter
    - Verify supplier.current_debt += (totalAmount - 50k) bằng cách quay lại /inventory/suppliers
    - Verify product.costPrice (WAC) cập nhật đúng theo công thức
    - /inventory/purchase-orders → list hiện phiếu vừa tạo
    - Filter NCC "ABC" → chỉ thấy phiếu liên quan
    - Filter trạng thái TT "Trả 1 phần" → đúng
    - Date range 7 ngày → bao gồm phiếu vừa tạo
    - Click phiếu → quay lại detail
    - Thử xoá NCC "Công ty ABC" → 422 toast "có 1 phiếu nhập, không thể xoá"
  - [ ] 20.5: Manual flow mobile (375px): SupplierManager card list, PurchaseOrderForm responsive (form scroll dọc, items card layout, footer sticky)
  - [ ] 20.6: Manual flow permission: Staff truy cập `/inventory/suppliers` → redirect dashboard. Manager OK
  - [ ] 20.7: Manual flow audit: Owner thực hiện 5 action → /settings/audit → thấy 5+ record với label tiếng Việt + group "Nhập hàng"
  - [ ] 20.8: Manual flow biến thể: SP "Áo" có 3 biến thể → tạo phiếu nhập 2 biến thể khác nhau cùng phiếu → verify variant.stock_quantity tăng đúng + product.cost_price cập nhật WAC trung bình

## Dev Notes

### Pattern reuse từ Story 1.x, 2.x, 4.x (BẮT BUỘC tuân thủ)

| Khu vực                  | File hiện có                                                                                                                           | Cách dùng                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle schema           | `packages/shared/src/schema/customers.ts`, `products.ts`, `inventory-transactions.ts`                                                  | Pattern uuidv7 PK, timestamp `withTimezone`, soft delete với partial unique index `WHERE deleted_at IS NULL`. Dùng `bigint({ mode: 'number' })` cho integer VND |
| Zod schemas              | `packages/shared/src/schema/customer-management.ts`, `inventory-transaction-management.ts`                                             | Tách schema con (`supplierNameSchema`, `supplierPhoneSchema`) reuse trong create + update. Refine update yêu cầu ≥ 1 field. Discount/payment enum dùng `z.enum` |
| WAC tính toán            | `apps/api/src/services/inventory-transactions.service.ts:recordPurchaseTransaction`                                                    | KHÔNG implement lại WAC từ đầu. Service `purchase-orders` GỌI helper hoặc dùng cùng công thức. Ghi `inventory_transactions` row type='purchase' cho mỗi item    |
| Soft delete              | `customers.ts`, `products.ts`                                                                                                          | `deletedAt timestamp nullable` + filter `isNull(table.deletedAt)` ở mọi query mặc định + partial unique index                                                   |
| PG error helpers         | `apps/api/src/lib/pg-errors.ts`                                                                                                        | `unwrapDriverError`, `getPgErrorCode`, `getPgConstraint`, `isUniqueViolation`. Match `err.code === '23505'` + `constraint_name` cụ thể                          |
| String escape            | `apps/api/src/lib/strings.ts:escapeLikePattern`                                                                                        | Áp dụng cho mọi search có `LIKE '%input%'` (suppliers list, purchase-orders list)                                                                               |
| Audit logging            | `apps/api/src/services/audit.service.ts:logAction, diffObjects`                                                                        | `logAction({ db: tx, storeId, actorId, actorRole, action, targetType, targetId, changes, ipAddress, userAgent })`                                               |
| Service transaction      | `apps/api/src/services/customers.service.ts:createCustomer`                                                                            | `db.transaction(async (tx) => { ... await logAction({ db: tx as unknown as Db, ... }) })`                                                                       |
| FOR UPDATE lock          | `apps/api/src/services/inventory-transactions.service.ts:loadProductForUpdate`                                                         | `tx.select().from(products).where(eq(products.id, id)).for('update').limit(1)` để tránh race khi update stock + costPrice                                       |
| Error pattern            | `apps/api/src/lib/errors.ts`                                                                                                           | Throw `ApiError(code, message, details?)`. Codes: VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, CONFLICT, BUSINESS_RULE_VIOLATION                                     |
| Auth + RBAC middleware   | `apps/api/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`                                                                     | `requireAuth` set `c.get('auth') = { userId, storeId, role }`. `requirePermission('inventory.manage')`                                                          |
| Route mount              | `apps/api/src/routes/customers.routes.ts`                                                                                              | Tạo factory function `createSuppliersRoutes({ db })`, `createPurchaseOrdersRoutes({ db })`. Mount sau customers. `/trashed` literal route TRƯỚC `/:id`          |
| API client               | `apps/web/src/lib/api-client.ts`, `apps/web/src/features/customers/customers-api.ts`                                                   | `apiClient.get/post/patch/delete<T>(path, body?)`. Wrap envelope `{ data: T }` hoặc `{ data: T[], meta }`                                                       |
| TanStack Query hooks     | `apps/web/src/features/customers/use-customers.ts`                                                                                     | `useQuery({ queryKey, placeholderData: keepPreviousData })`. Mutation `onSuccess` invalidate                                                                    |
| Form pattern             | `apps/web/src/features/customers/customer-form-dialog.tsx`                                                                             | RHF + zodResolver, mode `'onTouched'`, error inline, `handleApiError` + `asFormSetError`. Disable nút Lưu khi `!isValid \|\| isPending` (cả create và edit)     |
| Permission hook + guard  | `apps/web/src/hooks/use-permission.ts`, `apps/web/src/router.tsx:requirePermissionGuard`                                               | `usePermission('inventory.manage')`. Route đặt guard                                                                                                            |
| Toast                    | `apps/web/src/lib/toast.ts:showSuccess, showError`                                                                                     | UI feedback                                                                                                                                                     |
| Empty state              | `apps/web/src/components/shared/empty-state.tsx`                                                                                       | Reuse cho NCC, phiếu nhập, không kết quả filter                                                                                                                 |
| Confirm dialog           | `apps/web/src/components/ui/alert-dialog.tsx` + `features/customers/delete-customer-dialog.tsx`                                        | Pattern AlertDialog cho xoá                                                                                                                                     |
| Responsive switch        | `apps/web/src/hooks/use-media-query.ts`                                                                                                | `useMediaQuery('(min-width: 768px)')` để switch table/card                                                                                                      |
| Debounce hook            | `apps/web/src/hooks/use-debounced.ts`                                                                                                  | Search debounce 300ms                                                                                                                                           |
| Action label map (audit) | `apps/web/src/features/audit/action-labels.ts`                                                                                         | Bổ sung 5 label `supplier.*` + `purchase_order.created` + 1 group "Nhập hàng"                                                                                   |
| Currency helper          | `apps/web/src/lib/currency.ts:formatVnd, formatVndWithSuffix, parseVnd`                                                                | Format hiển thị + parse input. KHÔNG tạo lại                                                                                                                    |
| Currency input           | `apps/web/src/components/shared/currency-input.tsx`                                                                                    | Dùng cho `unitPrice`, `discountValue` (mode amount), `paidAmount`                                                                                               |
| Pagination               | `apps/web/src/components/shared/pagination.tsx`                                                                                        | Reuse                                                                                                                                                           |
| Sheet                    | `apps/web/src/components/ui/sheet.tsx`                                                                                                 | Cho TrashedSuppliersSheet và Mobile filter                                                                                                                      |
| Combobox                 | `apps/web/src/components/ui/select.tsx` + custom popover (xem `customer-form-dialog.tsx` group select)                                 | Cho SupplierSelect (search NCC). Reuse pattern hoặc thêm primitive nếu cần                                                                                      |
| DateRangePicker          | nếu chưa có → tạo `apps/web/src/components/shared/date-range-picker.tsx` (story 6.1 thêm mới, dùng `react-day-picker` đã có từ shadcn) | Cho filter purchase orders                                                                                                                                      |
| Debt badge               | `apps/web/src/features/customers/debt-badge.tsx`                                                                                       | Reuse với pass `effectiveDebtLimit=null` (NCC không có hạn mức) để chỉ hiện 2 state: 0đ xám / >0đ vàng                                                          |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `suppliers.ts` (Drizzle table)
- `purchase-orders.ts` (Drizzle table)
- `purchase-order-items.ts` (Drizzle table)
- `supplier-management.ts` (Zod schemas)
- `supplier-management.test.ts`
- `purchase-order-management.ts` (Zod schemas)
- `purchase-order-management.test.ts`

**Backend (`apps/api/src/`):**

- `services/suppliers.service.ts`
- `services/purchase-orders.service.ts`
- `routes/suppliers.routes.ts`
- `routes/purchase-orders.routes.ts`
- `__tests__/suppliers.integration.test.ts`
- `__tests__/purchase-orders.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/suppliers/suppliers-api.ts`
- `features/suppliers/use-suppliers.ts`
- `features/suppliers/supplier-form-dialog.tsx`
- `features/suppliers/supplier-filters.tsx`
- `features/suppliers/supplier-table.tsx`
- `features/suppliers/supplier-card-list.tsx`
- `features/suppliers/delete-supplier-dialog.tsx`
- `features/suppliers/trashed-suppliers-sheet.tsx`
- `features/suppliers/supplier-manager.tsx`
- `features/purchase-orders/purchase-orders-api.ts`
- `features/purchase-orders/use-purchase-orders.ts`
- `features/purchase-orders/supplier-select.tsx`
- `features/purchase-orders/variant-picker-dialog.tsx`
- `features/purchase-orders/purchase-order-utils.ts`
- `features/purchase-orders/purchase-order-utils.test.ts`
- `features/purchase-orders/purchase-order-items-editor.tsx`
- `features/purchase-orders/purchase-order-form.tsx`
- `features/purchase-orders/purchase-order-detail-view.tsx`
- `features/purchase-orders/purchase-order-table.tsx`
- `features/purchase-orders/purchase-order-card-list.tsx`
- `features/purchase-orders/purchase-order-filters.tsx`
- `features/purchase-orders/purchase-order-manager.tsx`
- `pages/suppliers-page.tsx`
- `pages/purchase-orders-page.tsx`
- `pages/purchase-order-create-page.tsx`
- `pages/purchase-order-detail-page.tsx`
- `components/shared/date-range-picker.tsx` (nếu chưa có)

**Migration (`apps/api/src/db/migrations/`):**

- `0013_*.sql` (Drizzle generate + manual partial unique WHERE clause append nếu cần)

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export 5 schema mới (`suppliers`, `purchase-orders`, `purchase-order-items`, `supplier-management`, `purchase-order-management`)
- `packages/shared/src/schema/audit-log.ts`: thêm 5 audit action enum
- `packages/shared/src/constants/permissions.ts`: thêm `'inventory.manage': ['owner', 'manager']`
- `packages/shared/src/constants/permissions.test.ts`: mở rộng matrix
- `apps/api/src/index.ts`: mount `/api/v1/suppliers` và `/api/v1/purchase-orders` sau `/api/v1/customers`
- `apps/web/src/features/audit/action-labels.ts`: thêm 5 label + 1 group "Nhập hàng"
- `apps/web/src/router.tsx`: thêm 4 route `/inventory/suppliers`, `/inventory/purchase-orders`, `/inventory/purchase-orders/new`, `/inventory/purchase-orders/$orderId` với guard `inventory.manage`
- `apps/web/src/components/layout/nav-items.ts`: thêm group "Nhập hàng" với 2 entries

### Coupling với các epic khác

**Story 6.2 (Kiểm kho & Lịch sử nhập hàng):**

- Story 6.1 tạo bảng `purchase_orders`, `purchase_order_items`, schema NCC. Story 6.2 sẽ:
  - Thêm bảng `stock_checks`, `stock_check_logs`
  - Trang lịch sử nhập hàng đã làm trong 6.1 (`/inventory/purchase-orders`). Story 6.2 chỉ cần thêm tab/filter theo SP cụ thể nếu PRD yêu cầu
  - Reuse schema `inventory_transactions` (đã có Story 2.4) cho stock check
- Story 6.1 KHÔNG implement kiểm kho UI, KHÔNG tạo phiếu nhập âm/huỷ phiếu

**Story 5.x (Công nợ):**

- Story 6.1 tạo cột `suppliers.current_debt` và update khi tạo phiếu nhập
- Story 5.3 (Phiếu chi trả nợ NCC) sẽ:
  - Tạo bảng `payment_vouchers` (phiếu chi)
  - Service `createPaymentVoucher` cập nhật `suppliers.current_debt -= amount`, allocate FIFO theo phiếu nhập chưa trả
  - Story 6.1 KHÔNG implement endpoint thanh toán riêng. Phiếu nhập tạo với `paidAmount` là điểm thanh toán DUY NHẤT trong 6.1

**Story 2.4 (WAC + inventory_transactions):**

- Schema `inventory_transactions` đã có. Story 6.1 INSERT row type='purchase' cho mỗi item
- WAC formula đã verify trong service `inventory-transactions.service.ts:recordPurchaseTransaction`. Story 6.1 dùng CÙNG công thức nhưng inline trong `createPurchaseOrder` (vì cần batch lock + transaction lớn). KHÔNG gọi `recordPurchaseTransaction` cho từng item vì sẽ tạo nested transaction problem.
- Helper endpoint debug `POST /api/v1/products/:id/inventory/purchase` từ Story 2.4 vẫn dùng được riêng. Story 6.1 KHÔNG xoá endpoint debug này. Note Story 2.4 ghi "deprecate khi 6.1 ra" — cập nhật comment thành "Helper for testing WAC, KHÔNG dùng production. Production dùng `/api/v1/purchase-orders`"

**Story 2.x (Products + Variants):**

- Story 6.1 đọc `products.cost_price`, `products.current_stock`, `product_variants.stock_quantity`. Update các field này trong transaction
- KHÔNG tạo lại pattern lock product/variant, REUSE `loadProductForUpdate`, `loadVariantForUpdate`, `aggregateVariantStock` từ `inventory-transactions.service.ts` (extract ra `apps/api/src/services/products-lock.helper.ts` để 2 service dùng chung — fix L1 tránh duplicate)

**Story 3.x (POS):**

- POS sẽ trừ stock + tạo `inventory_transactions type='sale'`. Story 6.1 KHÔNG đụng tới
- Story 3.x reuse `<SupplierSelect>` nếu cần (ít khả năng), reuse `<VariantPickerDialog>` cho POS variant selection

**Story 7.2 (Trả hàng):**

- Trả hàng cho NCC sẽ tạo `purchase_orders` âm hoặc bảng `purchase_returns` riêng — Story 7.x quyết định. Story 6.1 KHÔNG cản trở.

### Coupling với customer-groups, audit (đã ổn định)

- Reuse pattern `customers.service.ts` 1:1 cho `suppliers.service.ts`
- Reuse `pg-errors.ts`, `strings.ts` (đã có Story 4.1)
- KHÔNG có FK trực tiếp suppliers ↔ customers (2 module độc lập)

### Lưu ý từ review Story 2.2 + 4.1 (rút kinh nghiệm — fix luôn ở story 6.1)

1. **[M1] LIKE wildcard escape**: áp dụng `escapeLikePattern` cho `listSuppliers.search` + `listPurchaseOrders.search`
2. **[M3] Edit form disable nút Lưu khi !isValid**: cả `SupplierFormDialog` mode 'edit' và 'create' phải có `disabled={!form.formState.isValid || isPending}`
3. **[L1] Duplicated PG error helpers**: import từ `pg-errors.ts` (đã có)
4. **[H1] Schema phải đầy đủ cột spec**: kiểm tra cẩn thận `suppliers` đủ 13 cột spec, `purchase_orders` đủ 14 cột, `purchase_order_items` đủ 14 cột. Đặc biệt KHÔNG thiếu `deleted_at` (suppliers cần soft delete) và snapshot fields (purchase_order_items cần snapshot tên/SKU/variant)
5. **[H3] Soft delete đúng**: `deleteSupplier` PHẢI dùng `tx.update(...).set({ deletedAt: now })`, KHÔNG `tx.delete`
6. **[H4] FK ON DELETE rule**: `purchase_orders.supplier_id` ON DELETE RESTRICT (không SET NULL — vì phiếu nhập KHÔNG có ý nghĩa nếu mất NCC); `purchase_order_items.purchase_order_id` ON DELETE CASCADE (xoá phiếu cascade items, nhưng story 6.1 không cho phép xoá phiếu)
7. **[H5] Validation length match DB**: name varchar(100) ↔ Zod max 100, phone varchar(20) ↔ Zod max 15, taxId varchar(32) ↔ Zod max 32. KIỂM TRA KỸ.
8. **[H7] Reusable Dialog wrapper**: `SupplierFormDialog` PHẢI là Dialog wrapper với props `open/onOpenChange/onSupplierCreated`, KHÔNG tách form thuần. Pattern reusable cho dùng inline trong `<SupplierSelect>` của PurchaseOrderForm
9. **[H8] Soft delete + Restore + Trashed list FULL**: implement đầy đủ 3 mục cho suppliers (KHÔNG defer)
10. **[M4] Compute fields response**: PurchaseOrder response phải có `itemCount` (computed) trong list view; detail view có `supplier` object inline
11. **[M5] Mobile responsive**: cả SupplierManager và PurchaseOrderManager phải có card list mobile (`useMediaQuery`)
12. **[M7][M8][M9] Permission consistent**: chỉ 1 permission `inventory.manage` cho TẤT CẢ endpoints suppliers + purchase-orders. KHÔNG tạo permission con (`suppliers.view`, `purchase-orders.view`). Frontend route guard KHỚP backend
13. **[M11] Race condition phone unique**: dựa vào DB partial unique constraint là source of truth, pre-check chỉ best-effort UX. Catch 23505 đầy đủ
14. **[M13] Form remount khi đổi target**: thêm `key={supplier.id}` vào `<SupplierFormDialog>` parent khi mode edit để force remount
15. **WAC formula precise**: dùng `Math.round` (KHÔNG `Math.floor` hay `Math.ceil`). Test case integer arithmetic chính xác từ AC ví dụ

### Permission matrix (story này)

| Permission         | Owner | Manager | Staff | Resource                                                 |
| ------------------ | ----- | ------- | ----- | -------------------------------------------------------- |
| `inventory.manage` | ✅    | ✅      | ❌    | CRUD suppliers + purchase-orders + (future) stock checks |

`inventory.manage` THÊM MỚI ở `packages/shared/src/constants/permissions.ts`.

### Validation đặc biệt

**Tên NCC (`name`):**

- Trim, 1-100, regex Unicode tương tự customer name
- Unique theo `(store_id, LOWER(name))` chỉ trên alive (partial unique)
- Cho phép tái dùng tên sau soft delete

**SĐT NCC (`phone`):**

- Optional (NCC có thể không có SĐT)
- Khi có giá trị: trim, 8-15 ký tự, regex `^[0-9+]+$`
- Unique theo `(store_id, phone)` chỉ trên alive AND phone IS NOT NULL (partial unique 2 điều kiện)
- Cho phép nhiều NCC null phone cùng lúc

**Tax ID:**

- Optional, max 32, regex `^[A-Za-z0-9-]+$`
- KHÔNG validate format MST Việt Nam cụ thể

**WAC formula:**

- `costAfter = Math.round((stockBefore * costBefore + quantity * unitCost) / (stockBefore + quantity))`
- Edge case: `costBefore === null || stockBefore <= 0` → `costAfter = unitCost`
- Edge case: `quantity = 0` → reject ở Zod (min 1) trước khi vào service
- Integer arithmetic: KHÔNG floating point. Math.round về số nguyên gần nhất
- WAC dùng `unitPrice` GỐC (trước chiết khấu), KHÔNG dùng net price sau chiết khấu

**Discount logic:**

- `discountType: 'amount' | 'percent'`
- Khi `'amount'`: `discountAmount = Math.min(discountValue, baseAmount)` (cap defensive ở Math, nhưng service vẫn validate `discountValue <= baseAmount` và throw 422 nếu vượt)
- Khi `'percent'`: `discountAmount = Math.floor(baseAmount * discountValue / 10000)` (value lưu percent \* 100 để giữ precision 2 chữ số thập phân; ví dụ 5.5% → discountValue = 550)
- Validate `discountValue ≥ 0`. Nếu `'percent'`: `discountValue ≤ 10000` (= 100%). Nếu `'amount'`: `discountValue ≤ baseAmount` (validate ở service vì baseAmount tính từ items)

**Payment status logic:**

- `paidAmount === 0` → `'unpaid'` (toàn bộ ghi nợ NCC)
- `paidAmount === totalAmount` → `'paid'` (đã trả đủ)
- `0 < paidAmount < totalAmount` → `'partial'` (trả 1 phần, ghi nợ phần còn lại)
- `paidAmount > totalAmount` → 422 BUSINESS_RULE_VIOLATION (ghi quá → không hợp lệ; story 6.1 không hỗ trợ trả thừa)

**Code auto-gen:**

- Format `PN-YYYYMMDD-XXXX` (PN = purchase note, 8 chữ số ngày, 4 chữ số sequence)
- Date dựa vào `purchaseDate` (cho phép backdate), KHÔNG `created_at`. Format theo timezone Asia/Ho_Chi_Minh (UTC+7)
- Sequence reset mỗi ngày
- Algorithm: trong transaction, query `MAX(code)` pattern → parse → +1; retry 3 lần nếu unique violation
- Pseudo-code:
  ```ts
  function generateCode(tx, storeId, purchaseDate): string {
    const dateStr = format(purchaseDate, 'yyyyMMdd', { timeZone: 'Asia/Ho_Chi_Minh' })
    const prefix = `PN-${dateStr}-`
    const lastCodeRow = await tx
      .select({ code: max(purchaseOrders.code) })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.storeId, storeId), like(purchaseOrders.code, `${prefix}%`)))
    const nextSeq = lastCodeRow.code === null ? 1 : parseInt(lastCodeRow.code.slice(-4), 10) + 1
    return `${prefix}${String(nextSeq).padStart(4, '0')}`
  }
  ```

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement bảng `payment_vouchers` (phiếu chi trả NCC) ở story này. Story 5.3 sẽ làm
- KHÔNG implement kiểm kho ở story này (Story 6.2)
- KHÔNG cho phép sửa/xoá phiếu nhập đã tạo ở story 6.1 (immutable)
- KHÔNG cho phép xoá NCC có công nợ hoặc phiếu nhập (BUSINESS_RULE_VIOLATION)
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG bypass filter `deletedAt IS NULL` trong list/get/update/delete mặc định
- KHÔNG hard delete supplier. Mọi delete là soft delete
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho amount/cost. Dùng `bigint` integer VND
- KHÔNG dùng floating point arithmetic. Math.round/floor/ceil cho integer
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG hard-code action label tiếng Việt trong service. Label chỉ ở frontend
- KHÔNG return thuần `{ ok: true }` từ DELETE/restore không có wrapper. Mọi response API dùng envelope `{ data: T }`
- KHÔNG dùng substring match cho PG error detection. Phải match `err.code === '23505'/'23503'` + `constraint_name`
- KHÔNG dùng search query có `LIKE '%${input}%'` mà KHÔNG escape wildcard `%` `_`
- KHÔNG mount route `GET /suppliers/:id` TRƯỚC `GET /suppliers/trashed` (Hono sẽ match `:id` với `'trashed'`). Đặt route literal trước
- KHÔNG tạo permission con (`suppliers.view`, `purchase-orders.create`). Reuse `inventory.manage`
- KHÔNG dùng nested transaction (gọi `recordPurchaseTransaction` từ `createPurchaseOrder`). Implement WAC inline trong transaction lớn của createPurchaseOrder
- KHÔNG tách WAC theo variant ở story 6.1. WAC vẫn ở `products.cost_price` (cấp product), giống Story 2.4
- KHÔNG cho phép ≥ 2 dòng cùng (productId, variantId) trong cùng phiếu nhập (BUSINESS_RULE_VIOLATION)
- KHÔNG dùng `<= 0` cho compare debt — phải `=== 0` hoặc `> 0` rõ ràng (defensive)
- KHÔNG bỏ `disabled={!form.formState.isValid || isPending}` ở mode edit của form (fix M3 Story 2.2)
- KHÔNG quên `key={supplier.id}` khi remount form edit dialog (fix M13 Story 4.1)
- KHÔNG quên snapshot fields trong `purchase_order_items` (productNameSnapshot, productSkuSnapshot, variantLabelSnapshot). Lý do: SP có thể đổi tên/xoá sau, phiếu nhập cần giữ thông tin tại thời điểm tạo

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x + 2.x + 4.x:

- Feature folder flat: `features/suppliers/supplier-table.tsx`, `features/purchase-orders/purchase-order-form.tsx`
- Pages tại `apps/web/src/pages/*-page.tsx`
- Code-based TanStack Router (không file-based plugin)
- Schema files trong `packages/shared/src/schema/` kebab-case
- Service files `apps/api/src/services/*.service.ts` kebab-case

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x/2.x/4.x):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase
- Schema folder `schema/` thay vì `schemas/` (đã có sẵn từ Story 1.x)

### Latest tech notes

- **Drizzle partial unique index**: pattern manual SQL append đã có ở Story 2.2/4.1. Story 6.1 áp dụng tương tự cho 2 partial unique trên `suppliers`
- **Drizzle bigint mode 'number'**: an toàn cho integer ≤ 2^53. `total_amount`, `subtotal`, `current_debt` tối đa thực tế <100 tỷ VND = 10^11, nằm trong giới hạn
- **Hono route order**: `/trashed` literal trước `/:id` param. `/new` trước `/:id` cho purchase-orders. Áp dụng cho `purchase-orders.routes.ts` (BE) và `router.tsx` (FE)
- **TanStack Query keepPreviousData v5**: dùng `placeholderData: keepPreviousData` thay cho deprecated `keepPreviousData: true`
- **PostgreSQL LIKE escape**: dùng `ESCAPE '\'` trong query hoặc escape `%` `_` ở application layer trước khi gửi xuống. Drizzle với `like()` operator: app phải tự escape input vì Drizzle KHÔNG tự escape wildcard
- **Drizzle FOR UPDATE**: `.for('update')` giữ row lock đến hết transaction. KHẨN CẤP cho race condition khi 2 phiếu nhập cùng product cùng lúc
- **date-fns timezone**: dùng `format` với option `{ timeZone: 'Asia/Ho_Chi_Minh' }` cho code generation. Hoặc package `date-fns-tz` (đã có nếu Story 1.3 dùng)
- **PostgreSQL ON DELETE CASCADE**: `purchase_order_items → purchase_orders ON DELETE CASCADE`. Story 6.1 KHÔNG xoá phiếu, nhưng giữ FK CASCADE để tương lai cleanup test data hoặc story 6.x huỷ phiếu

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-6-nhp-hng-nh-cung-cp.md#Story 6.1]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR8, FR9, FR11, FR12]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#features/inventory/]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Format Patterns, Code Naming, Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Pagination, #Authorization 3 Role]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/inventory-management-specification.md#1. Tạo Phiếu Nhập Kho, #3. Quản lý NCC, #5. Lịch sử Nhập Hàng]
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md#Pattern soft delete + partial unique + audit + form + handleApiError + Coupling + Senior Review]
- [Source: _bmad-output/implementation-artifacts/2-4-don-vi-quy-doi-ton-kho.md#WAC formula + inventory_transactions]
- [Source: _bmad-output/implementation-artifacts/2-3-bien-the-san-pham.md#Pattern variant lock + aggregate stock]
- [Source: _bmad-output/implementation-artifacts/2-2-crud-san-pham-co-ban.md#Pattern soft delete + partial unique + audit + form]
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md#Pattern multi-tenant test setup + RBAC]
- [Source: packages/shared/src/schema/products.ts] (pattern Drizzle schema có index/uniqueIndex + sql LOWER + partial unique WHERE)
- [Source: packages/shared/src/schema/customers.ts] (pattern phone unique trong store)
- [Source: packages/shared/src/schema/inventory-transactions.ts] (pattern type, unitCost, costAfter, stockAfter)
- [Source: packages/shared/src/schema/customer-management.ts] (pattern Zod schema name + create/update/refine)
- [Source: packages/shared/src/schema/audit-log.ts] (pattern auditActionSchema enum)
- [Source: packages/shared/src/constants/permissions.ts] (pattern permission constant)
- [Source: apps/api/src/services/customers.service.ts] (pattern PG error detection helper, ensureNameUnique, transaction wrap, audit, deleteCustomer với count + try-catch FK)
- [Source: apps/api/src/services/inventory-transactions.service.ts] (pattern WAC + lock product/variant + insert inventory_transactions)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, diffObjects helper, getRequestMeta)
- [Source: apps/api/src/routes/customers.routes.ts] (pattern factory route + uuidParam + parseJson + mount /trashed trước /:id)
- [Source: apps/api/src/middleware/rbac.middleware.ts] (`requirePermission`)
- [Source: apps/api/src/lib/pg-errors.ts] (PG error helpers)
- [Source: apps/api/src/lib/strings.ts] (escapeLikePattern)
- [Source: apps/web/src/features/customers/customer-form-dialog.tsx] (pattern form RHF + zodResolver + handleApiError + asFormSetError)
- [Source: apps/web/src/features/customers/customers-manager.tsx] (pattern manager component)
- [Source: apps/web/src/features/customers/use-customers.ts] (pattern TanStack Query hooks + invalidate)
- [Source: apps/web/src/features/customers/customer-filters.tsx] (pattern filters component controlled)
- [Source: apps/web/src/components/shared/empty-state.tsx, pagination.tsx, currency-input.tsx] (reuse)
- [Source: apps/web/src/router.tsx:requirePermissionGuard] (pattern route guard)
- [Source: apps/web/src/lib/currency.ts] (formatVnd, parseVnd reuse)
- [Source: apps/api/src/db/migrations/0008_*.sql, 0011_*.sql] (pattern manual SQL append cho partial unique WHERE clause)
- [Web: Drizzle Indexes — partial unique with WHERE](https://orm.drizzle.team/docs/indexes-constraints)
- [Web: PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Web: PostgreSQL FOR UPDATE](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) — row lock cho race condition
- [Web: TanStack Query v5 placeholderData / keepPreviousData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)
- [Web: date-fns format with timezone](https://date-fns.org/docs/format) — formatting purchaseDate cho code generation

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

### Change Log
