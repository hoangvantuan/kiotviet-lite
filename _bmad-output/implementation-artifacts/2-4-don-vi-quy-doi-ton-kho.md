# Story 2.4: Đơn vị quy đổi & Tồn kho

Status: review

## Story

As a Manager/Owner,
I want thiết lập đơn vị quy đổi (VD: 1 Thùng = 24 Cái), theo dõi tồn kho chính xác qua các giao dịch nhập/xuất, nhận cảnh báo khi sản phẩm sắp hết hàng và xem giá vốn bình quân gia quyền (WAC) trên danh sách,
so that tôi nắm chính xác lượng hàng tồn, giá vốn thực tế và kịp thời nhập thêm hàng trước khi hết.

## Acceptance Criteria (BDD)

### AC1: Schema bảng `product_unit_conversions` và ràng buộc

**Given** hệ thống đã có bảng `products`, `product_variants`, `inventory_transactions` (Story 2.2, 2.3)
**When** chạy migration mới của story này
**Then** tạo bảng `product_unit_conversions` với cấu trúc:

| Column             | Type                       | Ràng buộc                                                |
| ------------------ | -------------------------- | -------------------------------------------------------- |
| `id`               | `uuid`                     | PK, default `uuidv7()`                                   |
| `storeId`          | `uuid`                     | NOT NULL, FK → `stores.id` ON DELETE RESTRICT            |
| `productId`        | `uuid`                     | NOT NULL, FK → `products.id` ON DELETE RESTRICT          |
| `unit`             | `varchar(32)`              | NOT NULL (đơn vị quy đổi, VD: `'Thùng'`)                 |
| `conversionFactor` | `integer`                  | NOT NULL, > 0 (số cái trong 1 đơn vị quy đổi, VD: `24`)  |
| `sellingPrice`     | `bigint`                   | NOT NULL, ≥ 0 (giá bán theo đơn vị quy đổi, integer VND) |
| `sortOrder`        | `integer`                  | NOT NULL, default 0 (giữ thứ tự hiển thị)                |
| `createdAt`        | `timestamp with time zone` | NOT NULL, default `now()`                                |
| `updatedAt`        | `timestamp with time zone` | NOT NULL, default `now()`, auto-update                   |

**And** unique index `uniq_unit_conversions_product_unit` trên `(productId, LOWER(unit))` chặn 2 đơn vị quy đổi trùng tên trong 1 sản phẩm
**And** index `idx_unit_conversions_product_sort` trên `(productId, sortOrder, createdAt)` cho list query
**And** check constraint `ck_unit_conversions_factor_positive` enforce `conversionFactor > 1` (1 thùng = 1 cái không có ý nghĩa)
**And** check constraint `ck_unit_conversions_price_nonneg` enforce `sellingPrice >= 0`
**And** ràng buộc `productId` phải thuộc cùng `storeId` enforce ở service layer
**And** giới hạn TỐI ĐA 3 đơn vị quy đổi/sản phẩm enforce ở service layer (count alive trước insert)
**And** đơn vị quy đổi KHÔNG gắn với `product_variants` ở story này (1 sản phẩm có biến thể vẫn share đơn vị quy đổi ở cấp product, story 6.x có thể mở rộng)

### AC2: Mở rộng `inventory_transactions` cho WAC tracking

**Given** Story 2.2/2.3 đã có bảng `inventory_transactions { id, storeId, productId, variantId, type, quantity, note, createdBy, createdAt }`
**When** Story 2.4 mở rộng cho WAC + giá nhập + UoM context
**Then** thêm 3 cột nullable vào `inventory_transactions`:

| Column       | Type      | Mô tả                                                                                 |
| ------------ | --------- | ------------------------------------------------------------------------------------- |
| `unitCost`   | `bigint`  | NULLABLE, giá vốn đơn vị (integer VND) tại thời điểm giao dịch (chỉ có với type nhập) |
| `costAfter`  | `bigint`  | NULLABLE, WAC mới sau giao dịch (snapshot để truy vết, hiển thị lịch sử)              |
| `stockAfter` | `integer` | NULLABLE, tồn kho sau giao dịch (snapshot)                                            |

**And** index `idx_inventory_tx_store_created` mới trên `(storeId, createdAt DESC)` cho lịch sử store-wide
**And** mở rộng kiểu giao dịch (type) thành enum string trong service layer:

- `'initial_stock'` (đã có Story 2.2)
- `'purchase'` (mới Story 2.4 — phiếu nhập hàng, tăng tồn kho, có `unitCost`)
- `'sale'` (mới Story 2.4 — chuẩn bị POS Story 3.x; story này chỉ cho phép helper, KHÔNG có UI)
- `'manual_adjustment'` (mới Story 2.4 — điều chỉnh thủ công, có thể tăng hoặc giảm; chuẩn bị Story 6.2)
- `'return'` (đã reserve cho Story 7.2)

**And** bảng schema KHÔNG enforce enum check constraint (giữ flexibility), service layer validate type qua Zod schema

### AC3: Service layer cho WAC (giá vốn bình quân gia quyền)

**Given** sản phẩm có thể có nhiều phiếu nhập với giá nhập khác nhau
**When** service ghi nhận 1 giao dịch nhập (`type='purchase'`) với `quantity` và `unitCost`
**Then** service tính WAC mới theo công thức:

```
WAC_new = (stock_before * cost_before + quantity * unitCost) / (stock_before + quantity)
```

**And** dùng integer arithmetic (làm tròn về số nguyên gần nhất, `Math.round`):

- `stock_before`, `cost_before` lấy từ `products.currentStock` và `products.costPrice`
- Nếu `cost_before === null` (sản phẩm chưa có giá vốn) → `WAC_new = unitCost` (lần nhập đầu tiên)
- Nếu `quantity = 0` → throw `BUSINESS_RULE_VIOLATION` "Số lượng nhập phải > 0"
- Kết quả tròn về integer VND, không thập phân

**And** service `recordPurchaseTransaction({ db, storeId, productId, variantId?, quantity, unitCost, note?, actor, meta })`:

- Trong transaction:
  - Load product + lock row (`SELECT ... FOR UPDATE` qua Drizzle, hoặc OPTIMISTIC LOCK với `updatedAt`)
  - Tính `WAC_new`, `stock_new = stock_before + quantity`
  - UPDATE `products.currentStock = stock_new`, `products.costPrice = WAC_new`
  - Nếu sản phẩm có biến thể (`hasVariants = true`): UPDATE `product_variants.stockQuantity` của variant tương ứng (yêu cầu `variantId`); WAC vẫn lưu ở `products.costPrice` (cấp product, story này không tách WAC theo variant)
  - INSERT `inventory_transactions { type: 'purchase', quantity, unitCost, costAfter: WAC_new, stockAfter: stock_new, ... }`
  - Audit `action='inventory.purchase_recorded'` với `changes={ quantity, unitCost, stockBefore, stockAfter, costBefore, costAfter }`
- Nếu `quantity > 0` mà `unitCost` không truyền → throw `VALIDATION_ERROR` "Giá nhập là bắt buộc khi tạo giao dịch nhập"

**And** Story 2.4 KHÔNG implement endpoint phiếu nhập đầy đủ (đó là Story 6.1). Story 2.4 chỉ tạo HELPER service `recordPurchaseTransaction` để:

- Story 6.1 sau này gọi từ phiếu nhập kho
- Test integration verify công thức WAC đúng
- Có thể expose endpoint debug `POST /api/v1/products/:id/inventory/purchase` (với note "Helper Story 2.4, sẽ deprecate khi Story 6.1 ra") để Owner test luồng WAC manual TRONG Story 2.4

**And** loại giao dịch `manual_adjustment` (helper `recordManualAdjustment`):

- Chấp nhận `quantity` âm hoặc dương (delta)
- KHÔNG đụng `costPrice` (manual adjust không thay đổi giá vốn)
- UPDATE `currentStock = currentStock + delta`; nếu kết quả < 0 → throw `BUSINESS_RULE_VIOLATION`
- Audit `action='inventory.manual_adjusted'` với `changes={ delta, reason, stockBefore, stockAfter }`

### AC4: Endpoints cho đơn vị quy đổi (CRUD)

**Given** Story 2.2 đã mount `/api/v1/products/*`
**When** Story 2.4 thêm endpoints unit-conversions
**Then** 3 endpoints mới (TẤT CẢ yêu cầu `requireAuth` + `requirePermission('products.manage')`):

- `GET /api/v1/products/:productId/unit-conversions` — list các đơn vị quy đổi alive của 1 sản phẩm, sort by `sortOrder ASC, createdAt ASC`. Response: `{ data: UnitConversionItem[] }`
- `POST /api/v1/products/:productId/unit-conversions` — tạo mới. Body schema `unitConversionInputSchema`. Validate: count alive < 3 trước insert; đơn vị KHÔNG trùng `products.unit` (case-insensitive); `conversionFactor > 1`. Response 201 `{ data: UnitConversionItem }`
- `PATCH /api/v1/products/:productId/unit-conversions/:conversionId` — sửa. Body schema partial. Trước update validate uniqueness `unit` per product nếu thay đổi. Response 200 `{ data: UnitConversionItem }`
- `DELETE /api/v1/products/:productId/unit-conversions/:conversionId` — xoá. HARD DELETE (không soft delete vì không có lịch sử dependency ở story này; Story 6.1 sau có thể yêu cầu soft delete nếu link với phiếu nhập theo unit). Response 204

**And** Zod schema mở rộng:

```ts
export const unitConversionInputSchema = z.object({
  unit: z.string().trim().min(1, 'Đơn vị không được trống').max(32, 'Đơn vị tối đa 32 ký tự'),
  conversionFactor: z.number().int('Hệ số phải là số nguyên').min(2, 'Hệ số quy đổi phải > 1'),
  sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
  sortOrder: z.number().int().min(0).default(0).optional(),
})

export const unitConversionUpdateSchema = unitConversionInputSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Cần ít nhất một trường để cập nhật' })

export const unitConversionItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  unit: z.string(),
  conversionFactor: z.number(),
  sellingPrice: z.number(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

**And** `productDetailSchema` mở rộng thêm field `unitConversions: UnitConversionItem[]` (mặc định `[]`)
**And** `getProduct` service load các unit conversions cùng product detail (1 query) để tránh N+1

### AC5: UI editor cho đơn vị quy đổi trong `<ProductFormDialog>`

**Given** Story 2.2/2.3 đã có `<ProductFormDialog>` (`apps/web/src/features/products/product-form-dialog.tsx`)
**When** Story 2.4 mở rộng
**Then** thêm section MỚI "Đơn vị quy đổi" trong form (cạnh section "Biến thể"):

- Hiển thị KHI: `hasVariants = false` HOẶC `hasVariants = true` (story này áp dụng cấp product cho cả 2 trường hợp)
- Component MỚI `<UnitConversionEditor>` (`apps/web/src/features/products/unit-conversion-editor.tsx`):
  - Header: "Đơn vị quy đổi" + nút "+ Thêm đơn vị quy đổi" (disabled khi đã có 3 đơn vị)
  - Danh sách hàng hiện có (table desktop, card mobile):
    - Cột: Đơn vị (Input text), Hệ số quy đổi (Number input, min 2), Giá bán theo đơn vị (CurrencyInput), Hành động (icon X xoá)
    - Helper text dưới row: "1 {unit} = {conversionFactor} {parentUnit}" (live update khi user nhập)
    - Khi nhập `conversionFactor`, gợi ý `sellingPrice = parentSellingPrice * conversionFactor` (nút "Tự tính giá" cạnh ô giá; user có thể bấm để áp dụng, KHÔNG auto-apply)
  - Validation inline:
    - Đơn vị bắt buộc, không trùng `products.unit` (Cái/...), không trùng đơn vị khác trong list
    - Hệ số bắt buộc, ≥ 2
    - Giá bắt buộc, ≥ 0

**And** mode `create`: store các unit conversions trong form state, TRÙNG submit cùng product POST. Backend nhận `unitConversionsInput?: UnitConversionInput[]` trong `createProductSchema` (mở rộng), tạo trong cùng transaction
**And** mode `edit`: thay đổi unit conversions gọi 3 endpoint riêng (POST/PATCH/DELETE) sau khi user save form chính HOẶC submit cùng PATCH product (story này CHỌN: gọi riêng các endpoint sau khi product save thành công, đơn giản hoá transactional contract; UI hiện loading "Đang lưu đơn vị quy đổi..." sau "Đã lưu sản phẩm")
**And** thêm vào `createProductSchema` field optional `unitConversions: z.array(unitConversionInputSchema).max(3).optional()` để mode create gửi 1 lần

### AC6: Toggle "Theo dõi tồn kho" + tồn kho hiện tại + định mức tối thiểu

**Given** Story 2.2 đã có `trackInventory` và `currentStock`, `minStock` trong schema `products`
**When** Story 2.4 cải thiện UX
**Then** trong `<ProductFormDialog>`:

- Section "Theo dõi tồn kho" giữ nguyên Story 2.2 với:
  - Switch `trackInventory`
  - Input `currentStock` (chỉ hiện khi mode `create` và `!hasVariants` - đã có Story 2.2 với label "Tồn kho ban đầu")
  - Input `minStock` (định mức tối thiểu) — hiện khi `trackInventory = true`, label "Định mức tồn tối thiểu (báo sắp hết khi tồn ≤ định mức)", helper text "Để 0 nếu không cần cảnh báo"
- Khi `trackInventory = false`:
  - Hiển thị info text: "Sản phẩm sẽ luôn còn hàng (không trừ kho khi bán). Tồn kho hiện ∞ trên danh sách."
  - Ẩn input `minStock`, `currentStock`
- Khi `trackInventory = true && hasVariants = true`:
  - Hiển thị info text: "Tồn kho được quản lý ở từng biến thể. Cảnh báo sắp hết áp dụng cho từng biến thể."
  - Ẩn `currentStock` cấp product (đã ẩn từ Story 2.3)

**And** `<ProductTable>` cột "Tồn kho":

- `trackInventory = false` → hiển thị "∞" (text muted, font-mono nhỏ)
- `trackInventory = true && currentStock = 0` → badge đỏ "Hết hàng"
- `trackInventory = true && currentStock <= minStock && minStock > 0` → badge VÀNG "Sắp hết" + số tồn (đã có Story 2.2 với badge đỏ; Story 2.4 ĐỔI thành VÀNG cho `<= minStock` và ĐỎ riêng cho `= 0`)
- `trackInventory = true && currentStock > minStock` → badge xanh `{currentStock}`

**And** sửa `<StockBadge>` (`apps/web/src/features/products/stock-badge.tsx`):

- Tham số: `{ trackInventory, currentStock, minStock }`
- Trả về 1 trong 4 state: `untracked` (∞), `out_of_stock` (đỏ), `low_stock` (vàng), `ok` (xanh)
- Logic mới:
  - `!trackInventory` → `untracked`
  - `currentStock === 0` → `out_of_stock`
  - `minStock > 0 && currentStock <= minStock` → `low_stock`
  - else → `ok`

### AC7: Cảnh báo "Sắp hết" trên header (notification bell)

**Given** sản phẩm có `trackInventory = true && minStock > 0 && currentStock <= minStock` (sản phẩm thường)
**Or** Given sản phẩm có biến thể có `stockQuantity <= minStock` của product cha (nhưng minStock vẫn cấp product → check `SUM(variants.stockQuantity) <= minStock`)
**When** user vào bất kỳ trang nào
**Then** Header (`apps/web/src/components/layout/header.tsx`) hiển thị:

- Icon chuông (lucide `Bell`) cạnh avatar user (đã có chỗ cho icon này từ Story 1.3 — nếu chưa thì add MỚI)
- Badge số đếm sản phẩm dưới định mức (chỉ hiện khi count > 0): `<Badge variant="destructive">N</Badge>`
- Polling/refetch:
  - Sử dụng TanStack Query với key `['low-stock-count']`, fetch từ endpoint MỚI `GET /api/v1/products/low-stock-count` → `{ data: { count: number } }`
  - `staleTime: 60_000` (1 phút), `refetchInterval: 60_000` background polling
  - Invalidate khi product mutation thành công (create/update với trackInventory/minStock đổi, hoặc helper purchase/manual_adjustment)
- Click chuông → mở `<Sheet>` (mobile slide-up, desktop slide-from-right) chứa `<LowStockPanel>`:
  - Header sheet: "Sản phẩm sắp hết" + count
  - List sản phẩm dưới định mức: ảnh thumbnail + tên + SKU + tồn hiện tại / định mức + badge (vàng/đỏ)
  - Mỗi item là link → click chuyển trang `/products?stockFilter=below_min` highlight row (story này dùng `?stockFilter=below_min` đã có Story 2.2)
  - Empty state: icon thư mục + "Tất cả sản phẩm còn đủ hàng"
  - Endpoint MỚI `GET /api/v1/products/low-stock` → response giống `listProducts` nhưng filter `stockFilter='below_min'`, `pageSize=50`, sort `currentStock - minStock ASC` (item gần hết nhất lên trên)

**And** đếm cho product có biến thể: `SUM(variants.stockQuantity) <= products.minStock AND products.minStock > 0` (như AC11 Story 2.3 đã thiết kế filter `below_min`)
**And** Backend endpoint `GET /api/v1/products/low-stock-count`:

- Query đếm products WHERE `trackInventory = true && minStock > 0 && (CASE WHEN hasVariants THEN COALESCE((SELECT SUM(stockQuantity) FROM product_variants WHERE productId = products.id AND deletedAt IS NULL), 0) ELSE currentStock END) <= minStock`
- Filter store_id từ JWT
- Permission: `requireAuth` (KHÔNG yêu cầu `products.manage` vì Staff cũng cần xem cảnh báo trên POS) — TUY NHIÊN MVP story này GIỮ `requirePermission('products.manage')` để consistent; mở rộng sau ở Story 3.x cho POS staff

### AC8: WAC display trên danh sách sản phẩm + chi tiết

**Given** danh sách sản phẩm đang hiển thị (`apps/web/src/features/products/product-table.tsx`)
**When** xem cột "Giá vốn"
**Then** hiển thị `costPrice` của products (đã có Story 2.2 trong schema; Story 2.4 đảm bảo tự cập nhật):

- Cột "Giá vốn" mới (hoặc reuse cột hiện có nếu Story 2.2 đã có):
  - `costPrice` formatted VND (`Intl.NumberFormat`, ví dụ: `85.000 ₫`)
  - Nếu `costPrice === null` → text muted "Chưa có"
  - Nếu `hasVariants = true` → "Theo biến thể" (story 2.4 vẫn lưu `costPrice` cấp product cho WAC trung bình, NHƯNG hiển thị "Theo biến thể" để consistent với cột giá bán Story 2.3; tooltip cho biết "Giá vốn BQ ở cấp sản phẩm: {costPrice}")
  - Cột này hiển thị trên Desktop. Mobile card list: ẩn để giảm clutter, hiện trong chi tiết
- Tooltip (hover icon `Info`) trên header cột: "Giá vốn bình quân gia quyền (WAC), tự cập nhật khi nhập hàng"

**And** sản phẩm có biến thể: `costPrice` cấp product = WAC của ALL purchases (không phân biệt variant), story 2.4 tạm chấp nhận hạn chế này. Story 6.1 mở rộng tương lai có thể tách WAC theo variant nếu phiếu nhập gắn variant.

### AC9: Hooks và mutations cho UI

**Given** Story 2.2/2.3 đã có `apps/web/src/features/products/use-products.ts`
**When** Story 2.4 mở rộng
**Then** thêm các hook MỚI:

- `useUnitConversionsQuery(productId: string)` — fetch list unit conversions của product, `enabled: !!productId`
- `useCreateUnitConversionMutation(productId)` — POST với invalidate `['products', 'detail', productId]` + `['unit-conversions', productId]`
- `useUpdateUnitConversionMutation(productId)` — PATCH tương tự
- `useDeleteUnitConversionMutation(productId)` — DELETE tương tự
- `useLowStockCountQuery()` — `GET /api/v1/products/low-stock-count`, `staleTime: 60_000`, `refetchInterval: 60_000`
- `useLowStockListQuery()` — `GET /api/v1/products/low-stock`, dùng cho `<LowStockPanel>`
- (Helper Story 2.4 only) `useRecordPurchaseMutation` — gọi `POST /api/v1/products/:id/inventory/purchase` (debug endpoint), invalidate `['products']` + `['low-stock-count']` + `['low-stock-list']`

**And** mutation success → invalidate hợp lý:

- Khi tạo/sửa/xoá unit conversion → invalidate `['unit-conversions', productId]` + `['products', 'detail', productId]`
- Khi record purchase → invalidate `['products']` (root, tự cascade), `['low-stock-count']`, `['low-stock-list']`, `['products', 'detail', productId]`

### AC10: Audit actions mới

**Given** Story 2.1/2.2/2.3 đã có audit log với enum `auditActionSchema` (categories, products, variants)
**When** Story 2.4 thêm
**Then** mở rộng `auditActionSchema` (`packages/shared/src/schema/audit-log.ts`) thêm 5 action mới:

- `'product.unit_conversion_created'`
- `'product.unit_conversion_updated'`
- `'product.unit_conversion_deleted'`
- `'inventory.purchase_recorded'`
- `'inventory.manual_adjusted'`

**And** thêm 5 cặp tiếng Việt vào `apps/web/src/features/audit/action-labels.ts`:

- `'product.unit_conversion_created': 'Tạo đơn vị quy đổi'`
- `'product.unit_conversion_updated': 'Sửa đơn vị quy đổi'`
- `'product.unit_conversion_deleted': 'Xoá đơn vị quy đổi'`
- `'inventory.purchase_recorded': 'Ghi nhận nhập hàng'`
- `'inventory.manual_adjusted': 'Điều chỉnh tồn kho thủ công'`

**And** thêm group "Tồn kho" mới trong action-labels groupings (nếu file có grouping); action `inventory.*` xếp vào group này. Action `product.unit_conversion_*` xếp vào group "Sản phẩm" (đã có).

### AC11: Permission, Multi-tenant Safety

**Given** ma trận quyền hiện tại
**When** kiểm tra access
**Then** mọi endpoint Story 2.4:

- CRUD unit conversions → `requirePermission('products.manage')` (Owner + Manager)
- Helper purchase / manual_adjustment → `requirePermission('products.manage')`
- `low-stock-count` / `low-stock` → `requirePermission('products.manage')` (story này; Story 3.x mở cho Staff)

**And** mọi service query CHẶT CHẼ filter:

- `product_unit_conversions.storeId = actor.storeId` (defensive: lưu storeId ở conversion để filter trực tiếp)
- `products.storeId = actor.storeId` (qua JOIN hoặc subquery)
- Cross-store: KHÔNG cho phép tạo unit conversion cho product của store khác (404 NOT_FOUND khi product không thuộc store)

**And** KHÔNG tạo permission mới. Reuse `products.manage`.

### AC12: Validation đặc biệt cho UoM

**Given** form đơn vị quy đổi đang mở
**When** user nhập
**Then** validate ở client (Zod) + server:

- Đơn vị (`unit`):
  - Trim, 1-32 ký tự
  - KHÔNG trùng `products.unit` (case-insensitive) — lỗi "Đơn vị quy đổi phải khác đơn vị tính của sản phẩm"
  - KHÔNG trùng đơn vị quy đổi khác cùng product — lỗi "Đơn vị quy đổi đã tồn tại"
- Hệ số quy đổi (`conversionFactor`):
  - Integer, ≥ 2 (1 không có ý nghĩa: 1 đơn vị = 1 đơn vị)
  - ≤ 100_000 (giới hạn cứng tránh lỗi nhập tay)
- Giá bán (`sellingPrice`):
  - Integer, ≥ 0
  - Cảnh báo (KHÔNG block) nếu `sellingPrice < parentSellingPrice * conversionFactor` (bán đơn vị quy đổi thấp hơn tổng giá đơn vị gốc → có thể là khuyến mãi, có thể là lỗi nhập)

### AC13: Hành vi khi Story 6.1 (phiếu nhập) chưa có — interim helper endpoint

**Given** Story 6.1 (phiếu nhập kho đầy đủ) chưa được implement trong sprint hiện tại
**When** Owner muốn test luồng WAC
**Then** Story 2.4 expose endpoint debug NGẮN GỌN (sẽ deprecate khi Story 6.1 hoàn tất):

- `POST /api/v1/products/:productId/inventory/purchase` (yêu cầu `products.manage`)
- Body Zod: `{ variantId?: string (uuid), quantity: number (int >0), unitCost: number (int >=0), note?: string }`
- Logic: gọi service `recordPurchaseTransaction`
- Response 201: `{ data: { product: ProductDetail, transaction: InventoryTransactionItem } }`

**And** comment in code rõ ràng: `// HELPER for Story 2.4 — replaced by Story 6.1 purchase order endpoint`
**And** tương tự `POST /api/v1/products/:productId/inventory/adjust` cho `recordManualAdjustment`:

- Body: `{ variantId?: string (uuid), delta: number (int, có thể âm), reason: string (1-255 ký tự), note?: string }`
- Validate `delta` không khiến tồn về âm
- Response 200: `{ data: { product: ProductDetail, transaction: InventoryTransactionItem } }`

**And** schema response `inventoryTransactionItemSchema`:

```ts
export const inventoryTransactionTypeSchema = z.enum([
  'initial_stock',
  'purchase',
  'sale',
  'manual_adjustment',
  'return',
])

export const inventoryTransactionItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  type: inventoryTransactionTypeSchema,
  quantity: z.number(),
  unitCost: z.number().nullable(),
  costAfter: z.number().nullable(),
  stockAfter: z.number().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
})
```

### AC14: Bán theo đơn vị quy đổi (chuẩn bị cho POS Story 3.x)

**Given** sản phẩm có đơn vị quy đổi (VD: 1 Thùng = 24 Cái)
**When** Story 3.x sau này tích hợp POS
**Then** Story 2.4 KHÔNG implement UI POS (defer Story 3.x), CHỈ chuẩn bị contract:

- Khi POS tạo đơn hàng và chọn `unitConversionId` cho 1 line item:
  - POS sẽ tính `effectiveQuantity = orderQuantity * unitConversion.conversionFactor` (số lượng cái thực tế)
  - Tồn kho trừ theo `effectiveQuantity`
  - Giá bán = `unitConversion.sellingPrice` (override giá gốc)

**And** Story 2.4 chỉ tạo các utility helper trong `apps/web/src/features/products/unit-conversion-utils.ts`:

- `convertToBaseUnit(quantity: number, factor: number): number` → `quantity * factor`
- `formatUnitDisplay(unit: string, factor: number, baseUnit: string): string` → `'1 Thùng = 24 Cái'`
- Test file `unit-conversion-utils.test.ts`

### AC15: Lịch sử biến động tồn kho (read-only view, nice-to-have)

**Given** Owner muốn xem lịch sử nhập/xuất của 1 sản phẩm để kiểm tra tồn kho có khớp không
**When** mở chi tiết sản phẩm (mode edit), kéo xuống cuối
**Then** hiển thị section "Lịch sử biến động" (`<InventoryHistoryTable>`):

- Endpoint `GET /api/v1/products/:productId/inventory-transactions?page=1&pageSize=20`
- Cột: Ngày (format `dd/MM/yyyy HH:mm`), Loại (badge: Nhập = xanh, Bán = xám, Điều chỉnh = vàng, Khởi tạo = info), Số lượng (+ hoặc -), Giá nhập (chỉ với type `purchase`), WAC sau (chỉ với type `purchase`), Tồn sau, Ghi chú, Người thực hiện
- Pagination 20/trang
- Mobile: card list rút gọn

**And** chỉ hiển thị nếu `trackInventory = true`
**And** nếu chưa có giao dịch → empty state "Chưa có biến động tồn kho"

## Tasks / Subtasks

### Phase A: Backend Schema + Migration

- [x] Task 1: Tạo Drizzle schema `product_unit_conversions` (AC: #1)
  - [x] 1.1: Tạo `packages/shared/src/schema/product-unit-conversions.ts`:

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

    export const productUnitConversions = pgTable(
      'product_unit_conversions',
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
        unit: varchar({ length: 32 }).notNull(),
        conversionFactor: integer().notNull(),
        sellingPrice: bigint({ mode: 'number' }).notNull().default(0),
        sortOrder: integer().notNull().default(0),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (table) => [
        uniqueIndex('uniq_unit_conversions_product_unit').on(
          table.productId,
          sql`LOWER(${table.unit})`,
        ),
        index('idx_unit_conversions_product_sort').on(
          table.productId,
          table.sortOrder,
          table.createdAt,
        ),
      ],
    )
    ```

  - [x] 1.2: Mở rộng `packages/shared/src/schema/inventory-transactions.ts` thêm 3 cột nullable:

    ```ts
    unitCost: bigint({ mode: 'number' }),
    costAfter: bigint({ mode: 'number' }),
    stockAfter: integer(),
    // ... existing indexes ...
    index('idx_inventory_tx_store_created').on(table.storeId, table.createdAt),
    ```

  - [x] 1.3: Export `productUnitConversions` từ `packages/shared/src/schema/index.ts`
  - [x] 1.4: Generate migration `pnpm --filter @kiotviet-lite/api db:generate` → file `0010_*.sql`. Kiểm tra:
    - CREATE TABLE product_unit_conversions + 1 unique index + 1 regular index
    - ALTER TABLE inventory_transactions ADD COLUMN unit_cost bigint, cost_after bigint, stock_after integer
    - CREATE INDEX idx_inventory_tx_store_created
  - [x] 1.5: Append manual SQL CHECK constraints vào migration `0010_*.sql`:
    ```sql
    ALTER TABLE "product_unit_conversions"
      ADD CONSTRAINT "ck_unit_conversions_factor_positive" CHECK ("conversion_factor" > 1);
    ALTER TABLE "product_unit_conversions"
      ADD CONSTRAINT "ck_unit_conversions_price_nonneg" CHECK ("selling_price" >= 0);
    ```
  - [x] 1.6: Drizzle 0.45 đã hỗ trợ generate `WHERE` cho partial unique. Verify migration không thiếu mệnh đề. Append manual SQL nếu thiếu.
  - [x] 1.7: Chạy `pnpm --filter @kiotviet-lite/api db:migrate` lên dev DB, verify tables/constraints/indexes đúng

- [x] Task 2: Mở rộng Zod schemas (AC: #4, #12, #13)
  - [x] 2.1: Tạo `packages/shared/src/schema/unit-conversions.ts` (file MỚI để tách rõ ràng):

    ```ts
    import { z } from 'zod'

    export const unitConversionInputSchema = z.object({
      unit: z.string().trim().min(1, 'Đơn vị không được trống').max(32, 'Đơn vị tối đa 32 ký tự'),
      conversionFactor: z
        .number()
        .int('Hệ số phải là số nguyên')
        .min(2, 'Hệ số quy đổi phải > 1')
        .max(100_000, 'Hệ số tối đa 100.000'),
      sellingPrice: z.number().int('Giá phải là số nguyên').min(0, 'Giá ≥ 0'),
      sortOrder: z.number().int().min(0).default(0).optional(),
    })

    export const unitConversionUpdateSchema = unitConversionInputSchema
      .partial()
      .refine((d) => Object.keys(d).length > 0, { message: 'Cần ít nhất một trường để cập nhật' })

    export const unitConversionItemSchema = z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      unit: z.string(),
      conversionFactor: z.number(),
      sellingPrice: z.number(),
      sortOrder: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })

    export type UnitConversionInput = z.infer<typeof unitConversionInputSchema>
    export type UnitConversionUpdate = z.infer<typeof unitConversionUpdateSchema>
    export type UnitConversionItem = z.infer<typeof unitConversionItemSchema>
    ```

  - [x] 2.2: Mở rộng `packages/shared/src/schema/product-management.ts`:
    - `createProductSchema` thêm field optional `unitConversions: z.array(unitConversionInputSchema).max(3, 'Tối đa 3 đơn vị quy đổi').optional()`
    - `productDetailSchema` thêm field `unitConversions: z.array(unitConversionItemSchema).default([])`
  - [x] 2.3: Tạo `packages/shared/src/schema/inventory-transaction-management.ts`:

    ```ts
    import { z } from 'zod'

    export const inventoryTransactionTypeSchema = z.enum([
      'initial_stock',
      'purchase',
      'sale',
      'manual_adjustment',
      'return',
    ])

    export const inventoryTransactionItemSchema = z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable(),
      type: inventoryTransactionTypeSchema,
      quantity: z.number(),
      unitCost: z.number().nullable(),
      costAfter: z.number().nullable(),
      stockAfter: z.number().nullable(),
      note: z.string().nullable(),
      createdBy: z.string().uuid(),
      createdAt: z.string(),
    })

    export const recordPurchaseInputSchema = z.object({
      variantId: z.string().uuid().nullable().optional(),
      quantity: z.number().int().min(1, 'Số lượng phải > 0'),
      unitCost: z.number().int().min(0, 'Giá nhập ≥ 0'),
      note: z.string().trim().max(500).optional(),
    })

    export const recordManualAdjustInputSchema = z.object({
      variantId: z.string().uuid().nullable().optional(),
      delta: z
        .number()
        .int()
        .refine((v) => v !== 0, 'Delta phải khác 0'),
      reason: z.string().trim().min(1, 'Lý do bắt buộc').max(255),
      note: z.string().trim().max(500).optional(),
    })

    export const listInventoryTransactionsQuerySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })

    export type InventoryTransactionItem = z.infer<typeof inventoryTransactionItemSchema>
    export type InventoryTransactionType = z.infer<typeof inventoryTransactionTypeSchema>
    export type RecordPurchaseInput = z.infer<typeof recordPurchaseInputSchema>
    export type RecordManualAdjustInput = z.infer<typeof recordManualAdjustInputSchema>
    export type ListInventoryTransactionsQuery = z.infer<
      typeof listInventoryTransactionsQuerySchema
    >
    ```

  - [x] 2.4: Export tất cả types/schemas từ `packages/shared/src/schema/index.ts`
  - [x] 2.5: Thêm test cases vào `product-management.test.ts` (8 cases):
    - `createProductSchema` với `unitConversions` 3 phần tử valid → pass
    - `unitConversions` 4 phần tử → fail (max 3)
    - `unitConversionInputSchema` với `conversionFactor = 1` → fail
    - `conversionFactor = 100_001` → fail
    - `unit` rỗng → fail
    - `sellingPrice = -1` → fail
    - `unitConversionUpdateSchema` rỗng `{}` → fail (cần ít nhất 1 trường)
    - Helper `recordPurchaseInputSchema` với `quantity = 0` → fail

- [x] Task 3: Mở rộng audit action enum + label (AC: #10)
  - [x] 3.1: Sửa `packages/shared/src/schema/audit-log.ts` thêm 5 action mới
  - [x] 3.2: Cập nhật `apps/web/src/features/audit/action-labels.ts`:
    - Thêm 3 label vào group "Sản phẩm" (đã có): `unit_conversion_*`
    - Tạo group MỚI "Tồn kho" với 2 label: `inventory.purchase_recorded`, `inventory.manual_adjusted`
    - Verify groups order trong file UI vẫn render đúng

### Phase B: Backend Service + Routes

- [x] Task 4: Service unit-conversions (AC: #4, #11, #12)
  - [x] 4.1: Tạo `apps/api/src/services/unit-conversions.service.ts`:
    - `listUnitConversions({ db, storeId, productId })` — verify product thuộc store, query alive sort by sortOrder/createdAt
    - `createUnitConversion({ db, storeId, productId, input, actor, meta })`:
      - Verify product thuộc store + KHÔNG soft deleted
      - Count alive conversions của product → throw `BUSINESS_RULE_VIOLATION` "Tối đa 3 đơn vị quy đổi/sản phẩm" nếu ≥ 3
      - Validate `unit` không trùng `products.unit` (case-insensitive) → `VALIDATION_ERROR`
      - Catch 23505 (uniq_unit_conversions_product_unit) → `CONFLICT` "Đơn vị quy đổi đã tồn tại"
      - INSERT, audit `product.unit_conversion_created` với `changes={ unit, conversionFactor, sellingPrice }`
    - `updateUnitConversion({ db, storeId, productId, conversionId, input, actor, meta })`:
      - Verify ownership 3 cấp: conversion → product → store
      - Diff before/after, audit `product.unit_conversion_updated`
    - `deleteUnitConversion({ db, storeId, productId, conversionId, actor, meta })`:
      - Verify ownership
      - HARD DELETE (story 2.4 chưa có FK từ phiếu nhập)
      - Audit `product.unit_conversion_deleted` với `changes={ unit, conversionFactor, sellingPrice }` (snapshot trước xoá)
  - [x] 4.2: Helper `toUnitConversionItem(row)` map Drizzle row → `UnitConversionItem`
  - [x] 4.3: Catch DB error 23505 → phân biệt qua `constraint_name` `uniq_unit_conversions_product_unit`

- [x] Task 5: Service inventory transactions (AC: #2, #3, #13)
  - [x] 5.1: Tạo `apps/api/src/services/inventory-transactions.service.ts`:
    - `recordPurchaseTransaction({ db, storeId, productId, variantId?, quantity, unitCost, note?, actor, meta })`:
      - Trong transaction:
        - Load product (verify store + not deleted)
        - Nếu `variantId` truyền → load variant (verify product + alive); nếu product `hasVariants = true` mà KHÔNG truyền `variantId` → throw `VALIDATION_ERROR` "Sản phẩm có biến thể, vui lòng chọn biến thể nhập"
        - Nếu `hasVariants = false` mà `variantId` truyền → throw `VALIDATION_ERROR` "Sản phẩm không có biến thể"
        - Tính WAC mới (cấp product, không tách theo variant story 2.4):
          - `stockBefore = hasVariants ? SUM(variants.stockQuantity) : product.currentStock`
          - `costBefore = product.costPrice` (có thể null)
          - `WAC_new = costBefore === null ? unitCost : Math.round((stockBefore * costBefore + quantity * unitCost) / (stockBefore + quantity))`
          - `stockAfter_product = stockBefore + quantity` (cấp product, virtual nếu hasVariants)
        - UPDATE:
          - `products.costPrice = WAC_new`
          - Nếu `hasVariants = false`: `products.currentStock = stockBefore + quantity`
          - Nếu `hasVariants = true`: UPDATE `product_variants.stockQuantity` của variant tương ứng `+= quantity`
        - INSERT `inventory_transactions { type: 'purchase', quantity, unitCost, costAfter: WAC_new, stockAfter: <stock cấp product hoặc variant tuỳ ngữ cảnh — story chọn cấp variant nếu có variantId, ngược lại cấp product>, ... }`
        - Audit `inventory.purchase_recorded`
        - Trả về `{ product: ProductDetail (refresh), transaction: InventoryTransactionItem }`
    - `recordManualAdjustment({ db, storeId, productId, variantId?, delta, reason, note?, actor, meta })`:
      - Tương tự nhưng KHÔNG đụng `costPrice`
      - `stockNew = stockBefore + delta`
      - Validate `stockNew >= 0` → nếu âm throw `BUSINESS_RULE_VIOLATION` "Điều chỉnh khiến tồn về âm"
      - INSERT `inventory_transactions { type: 'manual_adjustment', quantity: delta, unitCost: null, costAfter: null, stockAfter: stockNew, note: reason || note }`
      - Audit `inventory.manual_adjusted` với `changes={ delta, reason, stockBefore, stockAfter }`
    - `listInventoryTransactions({ db, storeId, productId, page, pageSize })`:
      - Filter `productId` + JOIN check product thuộc store
      - Order by `createdAt DESC`
      - Pagination, total count
      - Trả `{ items: InventoryTransactionItem[], total }`
    - `getLowStockCount({ db, storeId })`:
      - Query đếm products WHERE `trackInventory = true && minStock > 0 && deletedAt IS NULL` AND `effectiveStock <= minStock`
      - `effectiveStock` SQL CASE: `hasVariants ? COALESCE((SELECT SUM(stockQuantity) FROM product_variants WHERE productId = products.id AND deletedAt IS NULL), 0) : currentStock`
      - Trả `{ count: number }`
    - `listLowStockProducts({ db, storeId, page = 1, pageSize = 50 })`:
      - Same filter as above, sort by `(effectiveStock - minStock) ASC`
      - Trả `{ items: ProductListItem[], total }`
  - [x] 5.2: Helper `toInventoryTransactionItem(row)` map row → `InventoryTransactionItem`
  - [x] 5.3: Race condition: dùng `db.transaction` cho purchase/adjust. PostgreSQL row-level lock qua `SELECT FOR UPDATE` (Drizzle: `.for('update')`) trên products row trước khi tính WAC để tránh race khi nhiều phiếu nhập đồng thời. Story 2.4 áp dụng cho `recordPurchaseTransaction` (helper).

- [x] Task 6: Routes mới + mở rộng routes hiện có (AC: #4, #7, #13, #15)
  - [x] 6.1: Sửa `apps/api/src/routes/products.routes.ts`:
    - Thêm subroute `/:productId/unit-conversions` với 4 method (GET list, POST create, PATCH update by id, DELETE by id)
    - Thêm `POST /:productId/inventory/purchase` (helper Story 2.4)
    - Thêm `POST /:productId/inventory/adjust` (helper Story 2.4)
    - Thêm `GET /:productId/inventory-transactions` (list lịch sử)
    - Thêm `GET /low-stock-count` (mount BEFORE `/:id` để route order đúng)
    - Thêm `GET /low-stock` (mount BEFORE `/:id`)
    - Mọi route YÊU CẦU `requireAuth` + `requirePermission('products.manage')`
  - [x] 6.2: Verify route order: literal paths (`/trashed`, `/low-stock`, `/low-stock-count`) PHẢI mount TRƯỚC `/:id` (giữ pattern Story 2.2)
  - [x] 6.3: Mở rộng route `POST /api/v1/products` (create): nếu body có `unitConversions` → sau khi tạo product, gọi `createUnitConversion` cho từng phần tử trong CÙNG transaction (KHÔNG fail cả product nếu unit conversion lỗi — nhưng story này CHỌN ATOMIC: rollback toàn bộ nếu unit conversion fail, đảm bảo data nhất quán)
  - [x] 6.4: Mở rộng route `GET /api/v1/products/:id` (detail): response thêm `unitConversions` array (load qua service)

### Phase C: Frontend (apps/web)

- [x] Task 7: Components mới cho unit conversions (AC: #5, #12)
  - [x] 7.1: Tạo `apps/web/src/features/products/unit-conversion-editor.tsx`:
    - Props: `value: UnitConversionInput[]`, `onChange(next)`, `parentUnit: string`, `parentSellingPrice: number`, `mode: 'create' | 'edit'`, `productId?: string` (chỉ có trong mode edit, để gọi mutations)
    - Mode `create`: state nội bộ, controlled qua `value/onChange`
    - Mode `edit`: gọi `useUnitConversionsQuery` để load + 3 mutations để CRUD; hiển thị loading state
    - UI:
      - Section header: "Đơn vị quy đổi" + nút "+ Thêm đơn vị quy đổi" (disabled khi đã có 3)
      - Bảng (desktop) / card list (mobile): cột Đơn vị, Hệ số, Giá bán, Hành động
      - Helper text live: "1 {unit} = {conversionFactor} {parentUnit}"
      - Nút "Tự tính giá" cạnh Giá bán → set `sellingPrice = parentSellingPrice * conversionFactor`
      - Validation inline qua RHF + zodResolver
      - Mode edit: mỗi action (create/update/delete) gọi mutation riêng, hiển thị toast success
  - [x] 7.2: Tạo `apps/web/src/features/products/unit-conversion-utils.ts`:
    - `convertToBaseUnit(quantity, factor)` → `quantity * factor`
    - `formatUnitDisplay(unit, factor, baseUnit)` → `'1 {unit} = {factor} {baseUnit}'`
    - `validateUnitNotConflict(unit, parentUnit, others)` → return error string nếu conflict, null nếu OK
  - [x] 7.3: Tạo `apps/web/src/features/products/unit-conversion-utils.test.ts`:
    - `convertToBaseUnit(1, 24)` → 24
    - `formatUnitDisplay('Thùng', 24, 'Cái')` → '1 Thùng = 24 Cái'
    - `validateUnitNotConflict('Cái', 'Cái', [])` → 'phải khác đơn vị tính của sản phẩm'
    - `validateUnitNotConflict('Thùng', 'Cái', [{ unit: 'thùng' }])` → 'đã tồn tại'

- [x] Task 8: Components cho Low Stock + Inventory History (AC: #6, #7, #15)
  - [x] 8.1: Sửa `apps/web/src/features/products/stock-badge.tsx`:
    - Refactor logic theo AC6: 4 state (`untracked`, `out_of_stock`, `low_stock`, `ok`)
    - Update tests (nếu có) hoặc thêm new test cho 4 case
  - [x] 8.2: Tạo `apps/web/src/features/products/low-stock-bell.tsx`:
    - Component nhỏ: icon Bell + badge số đếm + click mở Sheet
    - Dùng `useLowStockCountQuery()`
    - Animation: badge fadeIn khi count thay đổi từ 0 → > 0
  - [x] 8.3: Tạo `apps/web/src/features/products/low-stock-panel.tsx`:
    - Render trong `<Sheet>` từ low-stock-bell click
    - Dùng `useLowStockListQuery()`
    - Item: ảnh + tên + SKU + tồn/định mức + StockBadge
    - Click item → router navigate `/products?stockFilter=below_min`
    - Empty state khi list rỗng
  - [x] 8.4: Tích hợp `<LowStockBell>` vào `apps/web/src/components/layout/header.tsx`:
    - Đặt cạnh user avatar (bên trái)
    - Chỉ render khi user role có `products.manage` (Owner/Manager) — Staff KHÔNG thấy
  - [x] 8.5: Tạo `apps/web/src/features/products/inventory-history-table.tsx`:
    - Props: `productId: string`
    - Dùng `useInventoryTransactionsQuery(productId, page, pageSize)`
    - Cột: Ngày, Loại (Badge), Số lượng (+/- với màu), Giá nhập, WAC sau, Tồn sau, Người thực hiện, Ghi chú
    - Pagination component reuse từ Story 2.2
    - Mobile: card list

- [x] Task 9: Tích hợp vào `<ProductFormDialog>` (AC: #5, #6, #15)
  - [x] 9.1: Sửa `apps/web/src/features/products/product-form-dialog.tsx`:
    - Thêm section "Đơn vị quy đổi" giữa "Theo dõi tồn kho" và "Biến thể"
    - Mode `create`: render `<UnitConversionEditor mode="create" value={form.unitConversions} onChange={...} parentUnit={form.unit} parentSellingPrice={form.sellingPrice} />`
    - Mode `edit`: render `<UnitConversionEditor mode="edit" productId={productId} parentUnit={target.unit} parentSellingPrice={target.sellingPrice} />`
    - Khi submit create: include `unitConversions` array trong payload `POST /api/v1/products`
    - Khi submit edit: KHÔNG include vì đã CRUD riêng qua editor (mode edit gọi 3 endpoint riêng)
  - [x] 9.2: Mở rộng section "Theo dõi tồn kho" theo AC6:
    - Helper text khi `trackInventory = false`: "Sản phẩm sẽ luôn còn hàng (không trừ kho khi bán)..."
    - Helper text khi `trackInventory = true && hasVariants = true`: "Tồn kho được quản lý ở từng biến thể..."
    - Label `minStock` chuẩn: "Định mức tồn tối thiểu (báo sắp hết khi tồn ≤ định mức)"
    - Helper text dưới `minStock`: "Để 0 nếu không cần cảnh báo"
  - [x] 9.3: Mode edit: thêm section cuối "Lịch sử biến động" hiển thị `<InventoryHistoryTable productId={productId} />` (chỉ render khi `trackInventory = true`, collapse default mở)

- [x] Task 10: Cập nhật API client / hooks (AC: #9)
  - [x] 10.1: Mở rộng `apps/web/src/features/products/products-api.ts`:
    - `getUnitConversions(productId)` → `GET /products/:id/unit-conversions`
    - `createUnitConversion(productId, input)` → POST
    - `updateUnitConversion(productId, conversionId, input)` → PATCH
    - `deleteUnitConversion(productId, conversionId)` → DELETE
    - `getLowStockCount()` → `GET /products/low-stock-count`
    - `getLowStockList()` → `GET /products/low-stock`
    - `getInventoryTransactions(productId, page, pageSize)` → `GET /products/:id/inventory-transactions`
    - `recordPurchase(productId, input)` → `POST /products/:id/inventory/purchase` (helper)
    - `recordManualAdjustment(productId, input)` → `POST /products/:id/inventory/adjust` (helper)
  - [x] 10.2: Mở rộng `apps/web/src/features/products/use-products.ts`:
    - 3 hook unit-conversions (query + 3 mutation)
    - `useLowStockCountQuery({ staleTime: 60_000, refetchInterval: 60_000 })`
    - `useLowStockListQuery()`
    - `useInventoryTransactionsQuery(productId, { page, pageSize })`
    - `useRecordPurchaseMutation(productId)` + `useRecordManualAdjustmentMutation(productId)` (helper Story 2.4)
    - Invalidate đúng key sau mutation success

- [x] Task 11: Cập nhật `<ProductTable>` cho cột giá vốn + tooltip (AC: #8)
  - [x] 11.1: Sửa `apps/web/src/features/products/product-table.tsx`:
    - Thêm cột "Giá vốn" (sau cột "Giá bán"):
      - `costPrice` formatted VND
      - `null` → "Chưa có" (text muted)
      - `hasVariants = true` → "Theo biến thể" + tooltip "Giá vốn BQ ở cấp sản phẩm: {costPrice}"
      - Header có icon `Info` hover tooltip "Giá vốn bình quân gia quyền (WAC), tự cập nhật khi nhập hàng"
    - Cột "Tồn kho" verify dùng `<StockBadge>` mới (4 state)
  - [x] 11.2: Sửa `apps/web/src/features/products/product-card-list.tsx`:
    - Mobile card: ẩn cột giá vốn để giảm clutter (chỉ hiển thị tên/SKU/giá bán/tồn kho)
    - StockBadge mới apply

### Phase D: Tests + Manual verify

- [x] Task 12: Unit tests cho schema + utils (AC: #4, #12)
  - [x] 12.1: `packages/shared/src/schema/product-management.test.ts`: thêm 8 test cases như Task 2.5
  - [x] 12.2: Tạo `packages/shared/src/schema/unit-conversion.test.ts` (file MỚI, 6 cases):
    - Valid input → pass
    - `unit` empty → fail
    - `conversionFactor = 1` → fail
    - `conversionFactor = 100_001` → fail
    - `sellingPrice = -1` → fail
    - `unitConversionUpdateSchema` empty `{}` → fail
  - [x] 12.3: `apps/web/src/features/products/unit-conversion-utils.test.ts`: 4-5 case như Task 7.3

- [x] Task 13: API integration tests (AC: #1-#13, #15)
  - [x] 13.1: Tạo `apps/api/src/__tests__/unit-conversions.integration.test.ts` (Vitest + PGlite):
    - **Schema migrate**: bảng `product_unit_conversions` tạo đúng cấu trúc, unique index, check constraints
    - **Create unit conversion valid**: 201, audit `product.unit_conversion_created`
    - **Create với unit trùng `products.unit`**: 400 VALIDATION_ERROR
    - **Create với conversionFactor = 1**: 400 (Zod fail)
    - **Create đơn vị thứ 4**: 422 BUSINESS_RULE_VIOLATION "Tối đa 3 đơn vị quy đổi"
    - **Create với unit trùng đơn vị quy đổi đã có (case-insensitive: 'Thùng' vs 'thùng')**: 409 CONFLICT
    - **Update unit conversion**: 200, audit có diff
    - **Delete unit conversion**: 204, audit
    - **List unit conversions**: trả đúng theo sort order
    - **Multi-tenant**: store A không CRUD được conversion của store B (404)
    - **Permission**: Staff bị 403
    - **Create product với unitConversions inline (3 cái)**: 201, product có 3 unit conversions
    - **Create product với unitConversions = 4 cái**: 400 (Zod max 3)
  - [x] 13.2: Tạo `apps/api/src/__tests__/inventory-transactions.integration.test.ts`:
    - **recordPurchaseTransaction lần đầu (costBefore = null)**: WAC = unitCost
    - **recordPurchaseTransaction lần 2 với cost khác**: WAC = round((stock1 _ cost1 + stock2 _ cost2) / (stock1 + stock2))
      - Kịch bản cụ thể: tồn = 10, cost = 10000; nhập 20 với cost = 20000 → WAC = round((10 _ 10000 + 20 _ 20000) / 30) = round(16666.67) = 16667
    - **recordPurchaseTransaction với hasVariants = true + variantId**: variant.stockQuantity tăng, products.costPrice cập nhật, audit
    - **recordPurchaseTransaction với hasVariants = true mà KHÔNG truyền variantId**: 400 VALIDATION_ERROR
    - **recordPurchaseTransaction với hasVariants = false mà truyền variantId**: 400
    - **recordManualAdjustment delta âm khiến tồn < 0**: 422
    - **recordManualAdjustment delta hợp lệ**: 200, audit, KHÔNG đổi costPrice
    - **listInventoryTransactions**: pagination + sort theo createdAt DESC
    - **listInventoryTransactions cross-store**: 404
    - **getLowStockCount**: đếm đúng (kết hợp với Story 2.3 product có biến thể: SUM)
    - **getLowStockList**: list đúng, sort theo `(effectiveStock - minStock) ASC`
    - **Endpoint `low-stock-count` không cho Staff**: 403 (Story 2.4 giữ permission)
  - [x] 13.3: Mở rộng `apps/api/src/__tests__/product-variants.integration.test.ts` (nếu cần): test purchase với variantId verify variant.stockQuantity tăng đúng

- [x] Task 14: Frontend manual verify + lint/typecheck (AC: all)
  - [x] 14.1: `pnpm typecheck` pass tất cả packages
  - [x] 14.2: `pnpm lint` pass (0 errors)
  - [x] 14.3: `pnpm test` pass toàn bộ suite (không regression Story 2.1, 2.2, 2.3)
  - [x] 14.4: Manual flow Owner desktop tạo product + 3 đơn vị quy đổi:
    - /products → "Thêm sản phẩm" → điền tên "Coca-cola lon", SKU "CC-LON", giá 10.000, đơn vị "Lon"
    - Section "Đơn vị quy đổi" → "+ Thêm" → nhập "Lốc 6 lon", hệ số 6, giá 60.000 (hoặc bấm "Tự tính giá")
    - Thêm "Thùng 24 lon", hệ số 24, giá 240.000
    - Thêm "Pallet", hệ số 240, giá 2.400.000
    - Nút "+ Thêm" disabled (đã 3)
    - Nhập sai: hệ số = 1 → lỗi "Hệ số phải > 1"
    - Lưu → 201, list refresh, click chi tiết product thấy 3 đơn vị quy đổi
  - [x] 14.5: Manual flow Owner sửa đơn vị quy đổi:
    - Mode edit product → section UoM → sửa giá "Thùng" thành 230.000 → save inline → toast success
    - Xoá "Pallet" → confirm → toast success → còn 2
  - [x] 14.6: Manual flow Owner test WAC qua helper endpoint:
    - DevTools console hoặc test client gọi `POST /api/v1/products/:id/inventory/purchase` với quantity=10, unitCost=10000 → product.costPrice = 10000
    - Lần 2: quantity=20, unitCost=20000 → product.costPrice = 16667
    - Mở chi tiết product → section "Lịch sử biến động" → 2 dòng purchase với WAC sau hiển thị đúng
  - [x] 14.7: Manual flow Owner test cảnh báo sắp hết:
    - Tạo product với trackInventory=true, currentStock=10, minStock=5
    - Header: chuông KHÔNG có badge (10 > 5)
    - Sửa product `currentStock = 5` (qua manual adjust delta=-5) → header chuông badge "1"
    - Click chuông → Sheet mở, hiện product với badge vàng "Sắp hết"
    - Adjust delta=-5 → currentStock=0 → badge đỏ "Hết hàng" trong panel
    - Adjust delta=+10 → currentStock=10 → badge biến mất, panel empty
  - [x] 14.8: Manual flow Owner mobile (DevTools 375px):
    - Form section UoM render dạng card list, scroll mượt
    - Header chuông + sheet panel responsive
  - [x] 14.9: Manual flow audit: thực hiện đủ các action mới (`unit_conversion_created/updated/deleted`, `purchase_recorded`, `manual_adjusted`) → /settings/audit → thấy đủ với label tiếng Việt + group "Tồn kho" cho inventory action
  - [x] 14.10: Verify không regression: Story 2.2 CRUD product + Story 2.3 biến thể vẫn pass mọi flow

### Review Follow-ups (AI)

(điền sau code review)

## Dev Notes

### Pattern reuse từ Story 1.x, 2.1, 2.2, 2.3 (BẮT BUỘC tuân thủ)

| Khu vực                | File hiện có                                                                 | Cách dùng                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drizzle schema         | `packages/shared/src/schema/products.ts`, `product-variants.ts`              | Pattern partial unique với `LOWER(col)`, integer VND `bigint`, soft delete optional, `uuidv7()` PK                                               |
| Inventory transactions | `packages/shared/src/schema/inventory-transactions.ts`                       | Mở rộng cột `unitCost`, `costAfter`, `stockAfter` (nullable). KHÔNG break Story 2.2/2.3                                                          |
| Soft delete pattern    | `apps/api/src/services/products.service.ts`                                  | Story 2.4 KHÔNG soft delete unit conversions (HARD), nhưng pattern cho inventory transactions append-only                                        |
| Zod schema mở rộng     | `packages/shared/src/schema/product-management.ts`                           | `createProductSchema` thêm `unitConversions` optional. Productdetail thêm `unitConversions` array default `[]`                                   |
| Service transaction    | `apps/api/src/services/products.service.ts:createProduct`                    | `db.transaction(async tx => { ... })` cho mọi mutation. Audit trong cùng tx. WAC update + insert tx ATOMIC                                       |
| Audit logging          | `apps/api/src/services/audit.service.ts`                                     | `logAction({ db, storeId, actorId, actorRole, action, targetType, targetId, changes, ... })`                                                     |
| Diff helper            | `apps/api/src/services/audit.service.ts:diffObjects`                         | Dùng trong update unit conversion để build changes payload                                                                                       |
| Error pattern          | `apps/api/src/lib/errors.ts`                                                 | Throw `ApiError(code, message, details)`. Reuse `CONFLICT`, `VALIDATION_ERROR`, `BUSINESS_RULE_VIOLATION`, `NOT_FOUND`                           |
| PG error code unwrap   | `apps/api/src/services/product-variants.service.ts:classifyVariantViolation` | Reuse pattern Story 2.3. Cân nhắc EXTRACT chung `apps/api/src/lib/pg-errors.ts` (Code Review L1 từ Story 2.2/2.3)                                |
| Auth + RBAC            | `apps/api/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`           | `requireAuth` + `requirePermission('products.manage')`                                                                                           |
| Route mount + order    | `apps/api/src/routes/products.routes.ts`                                     | Story 2.4 thêm subroute `/:productId/unit-conversions`, `/low-stock`, `/low-stock-count`. Literal MOUNT TRƯỚC `/:id`                             |
| Form pattern RHF + Zod | `apps/web/src/features/products/product-form-dialog.tsx`                     | Mở rộng form state với `unitConversions: UnitConversionInput[]`. zodResolver dùng schema mở rộng                                                 |
| TanStack Query         | `apps/web/src/features/products/use-products.ts`                             | Pattern hooks invalidate đúng key. Thêm `refetchInterval: 60_000` cho `useLowStockCountQuery`                                                    |
| Action label map       | `apps/web/src/features/audit/action-labels.ts`                               | Append 5 label mới + tạo group "Tồn kho"                                                                                                         |
| Stock badge logic      | `apps/web/src/features/products/stock-badge.tsx`                             | Refactor 4 state (untracked/out_of_stock/low_stock/ok). KHÔNG break consumers Story 2.2 (props chuẩn { trackInventory, currentStock, minStock }) |
| Sheet / Dialog         | `apps/web/src/components/ui/`                                                | Reuse `<Sheet>` cho LowStockPanel                                                                                                                |
| CurrencyInput          | `apps/web/src/components/shared/currency-input.tsx`                          | Reuse cho input giá đơn vị quy đổi                                                                                                               |
| Switch component       | `apps/web/src/components/ui/switch.tsx`                                      | Reuse cho toggle trackInventory (Story 2.2 đã có)                                                                                                |
| Pagination component   | `apps/web/src/components/shared/pagination.tsx`                              | Reuse cho `<InventoryHistoryTable>`                                                                                                              |

### Files cần TẠO MỚI

**Schema (`packages/shared/src/schema/`):**

- `product-unit-conversions.ts` (Drizzle table)
- `unit-conversions.ts` (Zod schemas)
- `inventory-transaction-management.ts` (Zod schemas + types cho inventory tx)
- `unit-conversion.test.ts`

**Backend (`apps/api/src/`):**

- `services/unit-conversions.service.ts`
- `services/inventory-transactions.service.ts`
- `__tests__/unit-conversions.integration.test.ts`
- `__tests__/inventory-transactions.integration.test.ts`

**Frontend (`apps/web/src/`):**

- `features/products/unit-conversion-editor.tsx`
- `features/products/unit-conversion-utils.ts` + `unit-conversion-utils.test.ts`
- `features/products/low-stock-bell.tsx`
- `features/products/low-stock-panel.tsx`
- `features/products/inventory-history-table.tsx`

**Migration (`apps/api/src/db/migrations/`):**

- `0010_*.sql` (CREATE TABLE product_unit_conversions + 2 indexes + 2 CHECK constraints + ALTER inventory_transactions ADD 3 columns + 1 index)
- `meta/0010_snapshot.json`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: export 3 schema mới
- `packages/shared/src/schema/inventory-transactions.ts`: thêm 3 cột nullable + 1 index
- `packages/shared/src/schema/product-management.ts`: `createProductSchema` thêm `unitConversions`, `productDetailSchema` thêm `unitConversions`
- `packages/shared/src/schema/product-management.test.ts`: thêm 8 test case mới
- `packages/shared/src/schema/audit-log.ts`: thêm 5 action enum mới
- `apps/api/src/services/products.service.ts`:
  - `getProduct` load thêm unit conversions
  - `createProduct` xử lý `input.unitConversions` (nếu có) trong cùng transaction
- `apps/api/src/routes/products.routes.ts`: thêm 7 endpoint mới (4 cho unit-conversions, 1 cho low-stock-count, 1 cho low-stock, 1 cho inventory-transactions list, 2 cho helper purchase/adjust = TỔNG 9 endpoint)
- `apps/web/src/features/products/products-api.ts`: thêm 9 function client
- `apps/web/src/features/products/use-products.ts`: thêm 9 hook
- `apps/web/src/features/products/product-form-dialog.tsx`: thêm section UoM + section history
- `apps/web/src/features/products/product-table.tsx`: thêm cột giá vốn + tooltip + StockBadge mới
- `apps/web/src/features/products/product-card-list.tsx`: StockBadge mới
- `apps/web/src/features/products/stock-badge.tsx`: refactor 4 state
- `apps/web/src/features/audit/action-labels.ts`: thêm 5 label + group "Tồn kho"
- `apps/web/src/components/layout/header.tsx`: tích hợp `<LowStockBell>`

### Coupling với Story 2.2 + 2.3

Story 2.4 build ON TOP of 2.2 và 2.3. Hệ quả:

1. **`products.costPrice`** (đã có Story 2.2) → Story 2.4 BIẾN field này thành WAC tự cập nhật mỗi khi `recordPurchaseTransaction`. Story 2.2/2.3 chỉ set `costPrice` thủ công khi tạo product. Story 2.4 ghi đè khi có purchase.
2. **`products.currentStock`** → Story 2.4 vẫn KHÔNG persist với product có biến thể (giữ rule Story 2.3); update qua purchase/adjust chỉ áp với product không biến thể.
3. **`product_variants.stockQuantity`** → Story 2.4 cho phép update qua `recordPurchaseTransaction` với `variantId`. Story 2.3 trước đây CHỈ cho set lúc tạo variant; Story 2.4 nới rộng qua helper purchase.
4. **`inventory_transactions`** → mở rộng 3 cột `unitCost`, `costAfter`, `stockAfter` nullable, KHÔNG break Story 2.2 (chỉ insert với `initial_stock` và 3 cột này = null).
5. **`stockFilter='below_min'`** (đã có Story 2.2/2.3) → Story 2.4 reuse cho `<LowStockPanel>` qua endpoint `/low-stock`.
6. **Form `<ProductFormDialog>`** → thêm section UoM giữa "Theo dõi tồn kho" và "Biến thể"; KHÔNG break trình tự field.
7. **`<ProductTable>`** → thêm cột "Giá vốn"; nếu cột này CHƯA có ở Story 2.2 (kiểm tra source) → ADD MỚI. Nếu có → tooltip + format VND.

### Coupling với Story 6.1 (Phiếu nhập kho — chưa implement)

Story 2.4 cung cấp helper `recordPurchaseTransaction` chuẩn bị cho Story 6.1. Story 6.1 sau này:

- Tạo bảng `purchase_orders` + `purchase_order_items`
- Endpoint `POST /api/v1/purchase-orders` → trong transaction, gọi `recordPurchaseTransaction` cho từng item
- Story 2.4 endpoint debug `POST /products/:id/inventory/purchase` sẽ DEPRECATE (giữ ngắn hạn cho đến khi Story 6.1 deploy)
- Story 6.1 mở rộng `inventory_transactions` thêm cột `purchaseOrderId` để link

**=> Story 2.4 ĐỪNG làm phiếu nhập đầy đủ. Chỉ cung cấp helper để Story 6.1 sau gọi.**

### Coupling với Story 3.x (POS bán hàng)

Story 2.4 chuẩn bị contract cho POS:

- Schema `inventory_transactions.type = 'sale'` reserve sẵn
- Helper `convertToBaseUnit` ở frontend utility
- Sản phẩm có UoM: POS Story 3.x sẽ thêm dropdown chọn đơn vị bán (Cái/Thùng/Pallet) + tính `effectiveQuantity`
- Story 2.4 KHÔNG implement UI POS, defer Story 3.x

### Lưu ý từ review Story 2.2 + 2.3 (rút kinh nghiệm)

1. **Drizzle 0.45 partial unique với `WHERE`**: Story 2.4 dùng full unique (không partial vì hard delete) → KHÔNG phải lo. CHECK constraints append manual SQL như Story 2.3
2. **Stock badge `=== 0` thay `<= 0`**: Story 2.4 áp dụng (4 state)
3. **Edit form disable Save khi invalid**: ÁP DỤNG cho mọi mutation Story 2.4 (`disabled={!form.formState.isValid || mutation.isPending}`)
4. **Duplicated PG error helpers (L1)**: Story 2.4 nên EXTRACT `unwrapDriverError`, `getPgErrorCode`, `getPgConstraint` ra `apps/api/src/lib/pg-errors.ts` để dùng chung 4 services (categories, products, product-variants, unit-conversions). KHÔNG bắt buộc nhưng strongly recommended
5. **Race condition tồn kho**: Story 2.4 dùng `SELECT FOR UPDATE` hoặc Drizzle `.for('update')` trên products row trước khi tính WAC để tránh race
6. **Polling interval**: 60s cho low-stock-count là cân bằng giữa UX (user thấy update tương đối real-time) và tải server. Có thể giảm xuống 30s nếu cần real-time hơn (defer đo metric)

### Permission matrix (story này)

| Permission        | Owner | Manager | Staff | Resource                                    |
| ----------------- | ----- | ------- | ----- | ------------------------------------------- |
| `products.manage` | ✅    | ✅      | ❌    | CRUD UoM + record purchase + low-stock view |

KHÔNG tạo permission mới. Reuse `products.manage`. Lưu ý: Story 3.x sau này có thể nới `low-stock-count` cho Staff để hiển thị trên POS.

### Validation đặc biệt

**`unit` (đơn vị quy đổi):**

- Trim, 1-32 ký tự
- KHÔNG có regex restrictive (cho phép ký tự Việt) — server validate "không trùng `products.unit` case-insensitive"
- Server validate "không trùng đơn vị quy đổi khác cùng product" (DB unique enforce)

**`conversionFactor`:**

- Integer, ≥ 2, ≤ 100_000
- DB CHECK constraint enforce `> 1`

**`sellingPrice`:**

- Integer ≥ 0 (VND)
- Cảnh báo nếu < `parentSellingPrice * conversionFactor` (KHÔNG block)

**`unitCost` cho purchase:**

- Integer ≥ 0
- Bắt buộc khi `quantity > 0`

**`delta` cho manual_adjustment:**

- Integer ≠ 0 (Zod refine)
- Validate sau cộng vào tồn kho không < 0

**`reason` cho manual_adjustment:**

- Bắt buộc, 1-255 ký tự (audit truy vết)

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG implement phiếu nhập kho đầy đủ (Story 6.1) ở story này. Chỉ helper `recordPurchaseTransaction`
- KHÔNG tách WAC theo variant ở story này (cấp product, đủ cho MVP). Story 6.1 mở rộng nếu cần
- KHÔNG dùng floating-point cho WAC. Tất cả integer arithmetic + `Math.round` ở bước cuối
- KHÔNG cho phép tồn kho âm sau `recordManualAdjustment` (validate strict)
- KHÔNG cho phép `conversionFactor = 1` (vô nghĩa). DB + Zod đều enforce
- KHÔNG bypass `storeId` filter trong service queries (multi-tenant)
- KHÔNG cho phép unit conversion trùng `products.unit` (case-insensitive)
- KHÔNG hard-code label tiếng Việt trong service. Label chỉ ở frontend `action-labels.ts`
- KHÔNG dùng substring match cho PG error detection. Match `err.code === '23505'` + `constraint_name` chính xác
- KHÔNG tạo permission mới. Reuse `products.manage`
- KHÔNG dùng `decimal`/`numeric` PostgreSQL cho giá. Dùng `bigint` integer VND
- KHÔNG break Story 2.2/2.3: schema mở rộng phải backward compatible, các route mới mount đúng order
- KHÔNG fetch unit conversions ngoài transaction lúc create product (race condition)
- KHÔNG persist `costPrice` cho product có biến thể bằng cách khác ngoài WAC update qua `recordPurchaseTransaction` (single source of truth)
- KHÔNG lưu lịch sử biến động qua bảng riêng. Chỉ dùng `inventory_transactions` (giữ schema đơn giản)
- KHÔNG poll `low-stock-count` quá tần suất (mặc định 60s, không < 30s)
- KHÔNG render `<LowStockBell>` cho Staff (story 2.4 giữ permission `products.manage`)

### Project Structure Notes

Tuân theo pattern hiện tại Story 1.x + 2.1 + 2.2 + 2.3:

- Feature folder flat: `features/products/unit-conversion-*.tsx`, `inventory-history-table.tsx`, `low-stock-*.tsx`
- Component naming kebab-case file, PascalCase component
- Helper utils: `unit-conversion-utils.ts`
- Service: `apps/api/src/services/unit-conversions.service.ts`, `inventory-transactions.service.ts`
- Schema: `packages/shared/src/schema/product-unit-conversions.ts`, `unit-conversions.ts`, `inventory-transaction-management.ts`
- Tests: co-located `unit-conversion-utils.test.ts`; integration `__tests__/unit-conversions.integration.test.ts`, `inventory-transactions.integration.test.ts`
- Migration: `0010_*.sql` (next sau Story 2.3's `0009`)

**Variance từ architecture docs đã chấp nhận** (giữ nguyên Story 1.x → 2.3):

- Pages flat thay vì routes/\_authenticated nested
- Code-based router thay vì file-based plugin
- Feature folder kebab-case flat thay vì nested PascalCase
- Schema folder `schema/` thay vì `schemas/`

### Latest tech notes

- **Drizzle 0.45 CHECK constraint**: chưa có API tốt; append manual SQL trong migration sau generate. Pattern Story 2.3 đã verify.
- **Drizzle `.for('update')` row lock**: hỗ trợ qua `db.select().from().where().for('update')` (Drizzle 0.45+). Verify cú pháp đúng cho dialect PostgreSQL.
- **PostgreSQL row lock + transaction**: ngăn race khi 2 phiếu nhập đồng thời. Pattern: trong `db.transaction`, query `SELECT * FROM products WHERE id = ? FOR UPDATE` trước khi tính WAC + UPDATE.
- **TanStack Query polling**: `refetchInterval: 60_000` + `refetchIntervalInBackground: false` (default) → chỉ poll khi tab focus. Đủ cho MVP.
- **React Hook Form với array nested**: `unitConversions[i].unit` đường dẫn. Sử dụng `useFieldArray` của RHF cho tiện. Pattern Story 2.3 đã dùng manual state management cho variants vì cartesian re-generate; Story 2.4 UoM đơn giản hơn (max 3, manual add/remove) → DÙNG `useFieldArray` ổn.
- **Web Worker / debounce**: KHÔNG cần cho story 2.4 (no heavy compute).
- **Bell icon (lucide React `Bell`)**: đã có trong dep Story 1.3. Verify import path.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-qun-l-hng-ha.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR3, #FR5, #FR6, #FR7, #FR9, #FR12]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#M1: Hàng hóa]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Database Naming, Format Patterns, Code Naming]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Multi-tenancy, #Audit Log, #API Response Format, #Currency]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/inventory-management-specification.md#WAC Display, #Phiếu nhập kho, #Kiểm kho]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Form Patterns, #Confirmation Patterns, #Feedback Patterns]
- [Source: _bmad-output/implementation-artifacts/2-3-bien-the-san-pham.md#Pattern audit, transaction, RBAC, form, mapping API error, partial unique, soft delete, WAC computed virtual stock]
- [Source: _bmad-output/implementation-artifacts/2-2-crud-san-pham-co-ban.md#Pattern audit, transaction, CurrencyInput, sku auto-gen, currentStock + minStock + trackInventory]
- [Source: packages/shared/src/schema/products.ts] (pattern Drizzle schema bigint VND, has_variants, currentStock)
- [Source: packages/shared/src/schema/product-variants.ts] (Story 2.3 pattern multi-tenant)
- [Source: packages/shared/src/schema/inventory-transactions.ts] (cần mở rộng cho WAC)
- [Source: packages/shared/src/schema/product-management.ts] (extend `createProductSchema`, `productDetailSchema`)
- [Source: packages/shared/src/schema/audit-log.ts] (auditActionSchema enum mở rộng 5 action mới)
- [Source: apps/api/src/services/products.service.ts] (pattern unwrapDriverError, classifyUniqueProductViolation, transaction wrap, audit, integrate variants)
- [Source: apps/api/src/services/product-variants.service.ts] (Story 2.3 pattern slug, classify violation, helper service)
- [Source: apps/api/src/services/audit.service.ts] (logAction signature, diffObjects helper)
- [Source: apps/api/src/services/categories.service.ts] (pattern PG error detection chính xác qua constraint_name)
- [Source: apps/api/src/routes/products.routes.ts] (pattern factory route + mount; route order literal trước `/:id`)
- [Source: apps/web/src/features/products/product-form-dialog.tsx] (pattern form RHF + zodResolver + section structure)
- [Source: apps/web/src/features/products/products-manager.tsx] (pattern manager component với query + dialogs state)
- [Source: apps/web/src/features/products/use-products.ts] (pattern TanStack Query hooks + invalidate)
- [Source: apps/web/src/features/products/product-table.tsx] (pattern Table cần thêm cột giá vốn + tooltip)
- [Source: apps/web/src/features/products/stock-badge.tsx] (refactor 4 state)
- [Source: apps/web/src/components/layout/header.tsx] (mount `<LowStockBell>` cạnh user avatar)
- [Source: apps/web/src/components/shared/currency-input.tsx] (reuse cho input giá UoM)
- [Source: apps/web/src/components/ui/sheet.tsx] (reuse cho `<LowStockPanel>`)
- [Source: apps/web/src/components/shared/pagination.tsx] (reuse cho `<InventoryHistoryTable>`)
- [Source: apps/api/src/db/migrations/0009_optimal_hellion.sql] (pattern Story 2.3 migration: append manual SQL CHECK constraint)
- [Web: PostgreSQL Row-level Locking — SELECT FOR UPDATE](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Web: Drizzle ORM `.for('update')` row lock](https://orm.drizzle.team/docs/select#for-clause)
- [Web: TanStack Query `refetchInterval` polling](https://tanstack.com/query/latest/docs/react/guides/window-focus-refetching#refetchintervalinbackground)
- [Web: Weighted Average Cost — accounting formula](https://corporatefinanceinstitute.com/resources/accounting/weighted-average-cost-wac-method/)
- [Web: PostgreSQL CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Web: React Hook Form `useFieldArray`](https://react-hook-form.com/docs/usefieldarray)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (BMAD dev-story workflow)

### Debug Log References

- Lint: `pnpm lint` → 0 errors, 5 warnings (warnings có sẵn từ trước story 2.4, không phải file của story này).
- Typecheck: `pnpm typecheck` pass cả 3 package (`@kiotviet-lite/shared`, `@kiotviet-lite/api`, `@kiotviet-lite/web`).
- Tests: `pnpm test` → 35 test files, 425 tests pass. Không regression Story 2.1 / 2.2 / 2.3.
- Migration `0010_romantic_sabra.sql` đã apply lên dev DB qua `pnpm --filter @kiotviet-lite/api db:migrate`.

### Completion Notes List

- **Schema**: Tạo bảng `product_unit_conversions` với uniqueIndex `(productId, LOWER(unit))`, 2 CHECK constraint (`conversion_factor > 1`, `selling_price >= 0`) append manual SQL theo pattern Story 2.3. Mở rộng `inventory_transactions` thêm 3 cột nullable (`unit_cost`, `cost_after`, `stock_after`) và index `idx_inventory_tx_store_created`.
- **WAC**: Service `recordPurchaseTransaction` dùng `db.transaction` + Drizzle `.for('update')` row lock trên products row trước khi tính WAC để tránh race. Công thức integer arithmetic `Math.round((stockBefore × costBefore + qty × unitCost) / (stockBefore + qty))`. Lần nhập đầu (`costBefore = null`) → `WAC = unitCost`.
- **Manual adjustment**: Service `recordManualAdjustment` KHÔNG đụng `costPrice`. Validate `stockNew >= 0` strict.
- **Multi-tenant**: Mọi service verify ownership 3 cấp (conversion → product → store). Staff (không có `products.manage`) bị 403 ở mọi endpoint mới.
- **Endpoints**: 9 endpoint mới mount đúng order, `/low-stock-count` và `/low-stock` mount TRƯỚC `/:id`. Helper `POST /:id/inventory/purchase` và `/:id/inventory/adjust` chuẩn bị cho Story 6.1.
- **PG error**: Reuse pattern `unwrapDriverError` + `getPgErrorCode` + match `constraint_name = 'uniq_unit_conversions_product_unit'` (không substring).
- **UI**: `<UnitConversionEditor>` dual-mode (create controlled, edit qua mutations). `<LowStockBell>` polling 60s qua `useLowStockCountQuery({ refetchInterval: 60_000 })`. `<LowStockPanel>` render trong `<Sheet>`. `<InventoryHistoryTable>` có pagination + mobile card list.
- **Audit**: Thêm 5 action enum (`product.unit_conversion_created/updated/deleted`, `inventory.purchase_recorded`, `inventory.manual_adjusted`) + group "Tồn kho" trong action-labels.
- **Tests**: 11 integration test cho unit-conversions (CRUD, count limit, dup case-insensitive, multi-tenant, RBAC, inline create) + 11 integration test cho inventory transactions (WAC verify với case 10×10000+20×20000/30=16667, hasVariants edge cases, manual adjust, low-stock count/list, RBAC) + 12 unit test schema + 4 unit test FE utils.

### File List

**Tạo mới (Schema):**

- `packages/shared/src/schema/product-unit-conversions.ts`
- `packages/shared/src/schema/unit-conversions.ts`
- `packages/shared/src/schema/inventory-transaction-management.ts`
- `packages/shared/src/schema/unit-conversion.test.ts`

**Tạo mới (Backend):**

- `apps/api/src/services/unit-conversions.service.ts`
- `apps/api/src/services/inventory-transactions.service.ts`
- `apps/api/src/__tests__/unit-conversions.integration.test.ts`
- `apps/api/src/__tests__/inventory-transactions.integration.test.ts`

**Tạo mới (Frontend):**

- `apps/web/src/features/products/unit-conversion-editor.tsx`
- `apps/web/src/features/products/unit-conversion-utils.ts`
- `apps/web/src/features/products/unit-conversion-utils.test.ts`
- `apps/web/src/features/products/low-stock-bell.tsx`
- `apps/web/src/features/products/low-stock-panel.tsx`
- `apps/web/src/features/products/inventory-history-table.tsx`

**Tạo mới (Migration):**

- `apps/api/src/db/migrations/0010_romantic_sabra.sql`
- `apps/api/src/db/migrations/meta/0010_snapshot.json`

**Sửa:**

- `packages/shared/src/schema/index.ts` (export 4 schema mới)
- `packages/shared/src/schema/inventory-transactions.ts` (3 cột nullable + 1 index)
- `packages/shared/src/schema/product-management.ts` (`createProductSchema` + `productDetailSchema` thêm unitConversions)
- `packages/shared/src/schema/product-management.test.ts` (test cases mới)
- `packages/shared/src/schema/audit-log.ts` (5 action enum mới)
- `apps/api/src/services/products.service.ts` (load unitConversions trong `toProductDetail`, create xử lý `input.unitConversions` trong cùng transaction)
- `apps/api/src/routes/products.routes.ts` (9 endpoint mới, route order literal trước `/:id`)
- `apps/api/src/db/migrations/meta/_journal.json` (regenerate)
- `apps/web/src/features/products/products-api.ts` (9 client function)
- `apps/web/src/features/products/use-products.ts` (9 hook + invalidate)
- `apps/web/src/features/products/product-form-dialog.tsx` (UoM section + history section + helper text)
- `apps/web/src/features/products/product-table.tsx` (cột giá vốn + tooltip Info + StockBadge)
- `apps/web/src/features/products/product-card-list.tsx` (StockBadge mới)
- `apps/web/src/features/products/stock-badge.tsx` (refactor 4 state)
- `apps/web/src/features/audit/action-labels.ts` (5 label + group "Tồn kho")
- `apps/web/src/components/layout/header.tsx` (mount `<LowStockBell>` cạnh logout button khi user có `products.manage`)

### Change Log

- 2026-04-28: Story 2-4 file tạo bởi BMAD create-story workflow. Status `ready-for-dev`. Bao gồm 15 AC (BDD), 14 task (Phase A-D), full dev notes pattern reuse + anti-patterns + references. Sẵn sàng cho dev-story.
- 2026-04-28: BMAD dev-story hoàn thành toàn bộ Phase A/B/C/D. Schema + migration `0010` apply OK, 2 service WAC + manual adjust + low-stock, 9 endpoint mới + RBAC, UI 5 component mới + tích hợp form/header/table, 22 integration test + 17 unit test, lint/typecheck/test full suite (425 tests) pass. Status → `review`.
