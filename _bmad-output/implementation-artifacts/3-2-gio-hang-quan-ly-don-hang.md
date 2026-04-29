# Story 3.2: Giỏ hàng & Quản lý đơn hàng

Status: ready-for-dev

## Story

As a nhân viên bán hàng,
I want quản lý giỏ hàng linh hoạt và làm việc song song nhiều đơn,
so that tôi phục vụ nhiều khách cùng lúc mà không mất đơn nào.

## Acceptance Criteria (BDD)

### AC1: CartPanel hiển thị chi tiết

**Given** đã thêm sản phẩm vào giỏ hàng
**When** xem CartPanel
**Then** hiển thị danh sách line item: tên sản phẩm (+ tên biến thể nếu có), đơn giá, số lượng (nút +/- và input trực tiếp), thành tiền, nút xoá (icon thùng rác)
**And** phía dưới hiển thị: tổng số lượng, tổng tiền hàng, chiết khấu đơn hàng, tổng thanh toán
**And** trên mobile (bottom sheet): hiển thị tóm tắt (X sản phẩm, Tổng: Y VND), kéo lên để xem chi tiết

### AC2: Chiết khấu dòng (line discount)

**Given** line item đang trong giỏ hàng
**When** nhấn vào dòng sản phẩm hoặc icon chiết khấu
**Then** mở inline edit cho phép: sửa số lượng, nhập chiết khấu dòng (chọn % hoặc VND cố định), ghi chú cho dòng
**And** chiết khấu dòng: nếu % thì tính trên đơn giá x số lượng, nếu VND thì trừ trực tiếp
**And** thành tiền = (đơn giá x số lượng) - chiết khấu dòng
**And** chiết khấu không được vượt quá thành tiền (không âm)

### AC3: Chiết khấu đơn hàng (order discount)

**Given** giỏ hàng có ít nhất 1 item
**When** nhấn vào vùng chiết khấu đơn hàng
**Then** mở popover nhập chiết khấu toàn đơn: chọn % hoặc VND cố định
**And** chiết khấu đơn áp dụng SAU chiết khấu dòng: tổng thanh toán = tổng thành tiền các dòng - chiết khấu đơn
**And** chiết khấu đơn không được vượt quá tổng tiền hàng

### AC4: Multi-tab 5 đơn hàng

**Given** POS hỗ trợ 5 tab đơn hàng
**When** xem header CartPanel
**Then** hiển thị 5 tab (Tab 1-5), tab active highlight, mỗi tab hiển thị số item (VD: "Tab 1 (3)")
**And** nhấn tab khác thì chuyển sang giỏ hàng của tab đó, dữ liệu tab cũ giữ nguyên
**And** tab trống hiển thị "+" hoặc text mờ

### AC5: Cảnh báo tồn kho

**Given** nhân viên sửa số lượng sản phẩm có `track_inventory = true`
**When** nhập số lượng > tồn kho hiện tại
**Then** hiển thị cảnh báo "Tồn kho chỉ còn X [đơn vị]" dưới dòng sản phẩm (text vàng)
**And** vẫn cho phép bán (cảnh báo, không block, tồn kho có thể âm)

### AC6: Huỷ đơn hàng

**Given** giỏ hàng có sản phẩm
**When** nhấn nút "Huỷ đơn" hoặc icon xoá toàn bộ
**Then** hiển thị dialog xác nhận "Bạn có chắc muốn huỷ đơn hàng này?"
**And** xác nhận thì xoá toàn bộ item trong tab hiện tại, reset về trạng thái trống

### AC7: Database schema orders + order_items

**Given** cần bảng DB để lưu đơn hàng hoàn thành (Story 3.3 sẽ dùng)
**When** tạo Drizzle schema + migration
**Then** bảng `orders`: `id`, `store_id`, `order_number` (auto: `HD-YYMMDD-XXXX`), `customer_id`, `user_id`, `subtotal`, `discount_type`, `discount_value`, `discount_amount`, `total`, `payment_method`, `payment_status`, `note`, `status`, `created_at`, `updated_at`
**And** bảng `order_items`: `id`, `order_id`, `product_id`, `variant_id`, `product_name`, `variant_name`, `unit`, `unit_price`, `quantity`, `discount_type`, `discount_value`, `discount_amount`, `line_total`, `note`

## Phạm vi Story 3.2 (Scope)

### Bao gồm

- Nâng cấp CartPanel: inline edit, chiết khấu dòng, ghi chú dòng
- Chiết khấu đơn hàng (% hoặc VND)
- Multi-tab 5 đơn hàng (Zustand state)
- Cảnh báo tồn kho vượt mức
- Xác nhận huỷ đơn (AlertDialog)
- Drizzle schema + migration cho `orders` và `order_items`
- Zod schemas cho orders trong `packages/shared`
- Nâng cấp cart store hỗ trợ discount + multi-tab

### KHÔNG bao gồm (Stories sau)

- Tạo đơn hàng thực (Story 3.3: Thanh toán)
- Trừ tồn kho khi hoàn thành đơn (Story 3.3)
- PaymentDialog (Story 3.3)
- Phím tắt F2/F4/F5 (Story 3.3)
- API endpoint POST /orders (Story 3.3)
- Chọn khách hàng thật (Story 4.5)
- Pricing engine 6 tầng (Story 4.5)
- Ghi nợ (Story 5.1)

## Tasks / Subtasks

- [ ] **Task 1: Drizzle schema orders + order_items** (AC: 7)
  - [ ] 1.1 Tạo `packages/shared/src/schema/orders.ts` (Drizzle pgTable)
  - [ ] 1.2 Tạo `packages/shared/src/schema/order-items.ts` (Drizzle pgTable)
  - [ ] 1.3 Export từ `packages/shared/src/schema/index.ts`
  - [ ] 1.4 Tạo Zod validation schemas trong `packages/shared/src/schema/order-management.ts`
  - [ ] 1.5 Chạy `pnpm drizzle-kit generate` để tạo migration
  - [ ] 1.6 Chạy `pnpm drizzle-kit migrate` để apply migration

- [ ] **Task 2: Nâng cấp cart store hỗ trợ discount + multi-tab** (AC: 1, 2, 3, 4)
  - [ ] 2.1 Mở rộng `CartItem` interface: thêm `discountType`, `discountValue`, `discountAmount`, `lineTotal`, `trackInventory`, `stockQuantity`
  - [ ] 2.2 Thêm state cho multi-tab: `tabs: Record<number, TabState>`, `activeTab: number` (1-5)
  - [ ] 2.3 Thêm state chiết khấu đơn: `orderDiscountType`, `orderDiscountValue`, `orderDiscountAmount` per tab
  - [ ] 2.4 Actions mới: `setActiveTab(n)`, `updateLineDiscount(id, type, value)`, `updateOrderDiscount(type, value)`, `updateLineNotes(id, notes)`
  - [ ] 2.5 Computed mới: `subtotal()` (trước chiết khấu đơn), `totalDiscount()`, `grandTotal()`
  - [ ] 2.6 Logic tính discount: `discountAmount = type === 'percent' ? Math.round(subtotal * value / 100) : value`, cap tại subtotal

- [ ] **Task 3: Nâng cấp CartItem component (inline edit)** (AC: 1, 2, 5)
  - [ ] 3.1 Thêm trạng thái expanded khi tap vào dòng item
  - [ ] 3.2 Expanded view: input số lượng trực tiếp (thay vì chỉ +/-), toggle chiết khấu % hoặc VND, input giá trị chiết khấu, textarea ghi chú
  - [ ] 3.3 Hiển thị thành tiền = (đơn giá x qty) - discountAmount
  - [ ] 3.4 Validation: discountAmount <= đơn giá x qty (không âm)
  - [ ] 3.5 Cảnh báo tồn kho: nếu qty > stockQuantity && trackInventory, hiển thị text vàng

- [ ] **Task 4: Nâng cấp CartPanel (summary + order discount)** (AC: 1, 3, 6)
  - [ ] 4.1 Header: thêm tab bar 5 tabs với item count per tab
  - [ ] 4.2 Footer summary: tổng số lượng, tổng tiền hàng (subtotal), chiết khấu đơn, tổng thanh toán
  - [ ] 4.3 Nhấn vào vùng chiết khấu đơn → Popover: toggle % / VND, input giá trị
  - [ ] 4.4 Nút "Huỷ đơn" → AlertDialog xác nhận → clearCart tab hiện tại
  - [ ] 4.5 Nút "Thanh toán" vẫn disabled (placeholder Story 3.3)

- [ ] **Task 5: Multi-tab component** (AC: 4)
  - [ ] 5.1 Tạo `features/pos/components/CartTabBar.tsx`
  - [ ] 5.2 5 tabs ngang, active tab highlight (bg-primary text-primary-foreground)
  - [ ] 5.3 Mỗi tab: số tab + item count badge, tab trống hiển thị "+"
  - [ ] 5.4 Click tab → setActiveTab → CartPanel render items của tab đó
  - [ ] 5.5 Constant `MAX_CART_TABS = 5`

- [ ] **Task 6: OrderDiscountPopover component** (AC: 3)
  - [ ] 6.1 Tạo `features/pos/components/OrderDiscountPopover.tsx`
  - [ ] 6.2 Popover (shadcn): toggle % / VND (2 nút chip), input số tiền (CurrencyInput cho VND, number input cho %)
  - [ ] 6.3 Validation: discount không vượt subtotal
  - [ ] 6.4 Apply → updateOrderDiscount trong cart store

- [ ] **Task 7: Mobile bottom sheet tóm tắt** (AC: 1)
  - [ ] 7.1 Cập nhật FAB trên mobile: hiển thị "X SP | Tổng: Y VND"
  - [ ] 7.2 Bottom sheet khi kéo lên hiển thị chi tiết đầy đủ (bao gồm tab bar, discounts)

- [ ] **Task 8: Integration & Test** (AC: all)
  - [ ] 8.1 Wire tất cả components vào PosScreen / CartPanel
  - [ ] 8.2 Test: thêm SP, sửa qty, chiết khấu dòng %, chiết khấu dòng VND
  - [ ] 8.3 Test: chiết khấu đơn %, chiết khấu đơn VND
  - [ ] 8.4 Test: multi-tab chuyển qua lại, dữ liệu giữ nguyên
  - [ ] 8.5 Test: cảnh báo tồn kho khi qty > stock
  - [ ] 8.6 Test: huỷ đơn với xác nhận
  - [ ] 8.7 Test: mobile bottom sheet summary
  - [ ] 8.8 Verify DB migration chạy thành công

## Dev Notes

### Architecture Compliance

**Tech stack (bắt buộc, giống Story 3.1):**

| Layer        | Công nghệ                    | Phiên bản |
| ------------ | ---------------------------- | --------- |
| UI           | React                        | 19.2.x    |
| Build        | Vite                         | 8.0.x     |
| Server state | TanStack Query               | 5.99+     |
| Client state | Zustand                      | 5.0.x     |
| Styling      | Tailwind CSS 4.2 + shadcn/ui |           |
| Icons        | Lucide React                 |           |
| ORM          | Drizzle ORM                  | 0.45.x    |
| Validation   | Zod                          | 3.x       |

**Naming conventions (giống Story 3.1):**

- Component: PascalCase (`CartTabBar.tsx`, `OrderDiscountPopover.tsx`)
- Hook: `use-*.ts`
- Store: `use-*-store.ts`
- Schema: kebab-case (`order-management.ts`)
- DB table: snake_case số nhiều (`orders`, `order_items`)
- DB column: snake_case (`discount_type`, `unit_price`)

### Database Schema Chi Tiết

**Bảng `orders`:**

```typescript
// packages/shared/src/schema/orders.ts
export const orders = pgTable(
  'orders',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    orderNumber: varchar({ length: 32 }).notNull(), // HD-YYMMDD-XXXX
    customerId: uuid().references(() => customers.id, { onDelete: 'set null' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    subtotal: bigint({ mode: 'number' }).notNull(), // tổng trước chiết khấu đơn
    discountType: varchar({ length: 16 }), // 'percent' | 'amount' | null
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    total: bigint({ mode: 'number' }).notNull(), // subtotal - discountAmount
    paymentMethod: varchar({ length: 16 }).notNull(), // 'cash' | 'transfer' | 'qr' | 'combined'
    paymentStatus: varchar({ length: 16 }).notNull(), // 'paid' | 'partial' | 'unpaid'
    note: text(),
    status: varchar({ length: 16 }).notNull().default('completed'), // 'completed' | 'cancelled'
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('uniq_orders_store_number').on(table.storeId, table.orderNumber),
    index('idx_orders_store_date').on(table.storeId, table.createdAt),
    index('idx_orders_store_status').on(table.storeId, table.status),
    index('idx_orders_store_customer').on(table.storeId, table.customerId),
    index('idx_orders_store_payment_status').on(table.storeId, table.paymentStatus),
  ],
)
```

**Bảng `order_items`:**

```typescript
// packages/shared/src/schema/order-items.ts
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid().references(() => productVariants.id, { onDelete: 'set null' }),
    productName: varchar({ length: 255 }).notNull(), // snapshot tại thời điểm bán
    variantName: varchar({ length: 255 }),
    unit: varchar({ length: 50 }), // đơn vị tính (snapshot)
    unitPrice: bigint({ mode: 'number' }).notNull(),
    quantity: bigint({ mode: 'number' }).notNull(),
    discountType: varchar({ length: 16 }), // 'percent' | 'amount' | null
    discountValue: bigint({ mode: 'number' }).notNull().default(0),
    discountAmount: bigint({ mode: 'number' }).notNull().default(0),
    lineTotal: bigint({ mode: 'number' }).notNull(), // unitPrice * quantity - discountAmount
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_order_items_order').on(table.orderId),
    index('idx_order_items_product').on(table.productId, table.createdAt),
    index('idx_order_items_variant').on(table.variantId),
  ],
)
```

**Pattern tham khảo:** Xem `packages/shared/src/schema/purchase-orders.ts` và `purchase-order-items.ts` cho cùng pattern Drizzle (bigint mode number, uuidv7, timestamps, indexes).

**Lưu ý quan trọng:**

- `productName`, `variantName`, `unit`, `unitPrice` là SNAPSHOT tại thời điểm bán. KHÔNG join lại bảng products khi đọc order.
- `bigint({ mode: 'number' })` cho mọi giá trị tiền (integer VND).
- `customerId` nullable vì khách vãng lai không có customer record.
- `orderNumber` format `HD-YYMMDD-XXXX` sẽ generate ở Story 3.3 (server-side, atomic sequence).

### Zod Schemas

```typescript
// packages/shared/src/schema/order-management.ts
import { z } from 'zod'

export const discountTypeSchema = z.enum(['percent', 'amount'])

export const createOrderItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productName: z.string().min(1).max(255),
  variantName: z.string().max(255).nullable(),
  unit: z.string().max(50).nullable(),
  unitPrice: z.number().int().min(0),
  quantity: z.number().int().min(1),
  discountType: discountTypeSchema.nullable().default(null),
  discountValue: z.number().int().min(0).default(0),
  discountAmount: z.number().int().min(0).default(0),
  lineTotal: z.number().int().min(0),
  note: z.string().max(500).nullable().default(null),
})

export const createOrderSchema = z.object({
  customerId: z.string().uuid().nullable().default(null),
  subtotal: z.number().int().min(0),
  discountType: discountTypeSchema.nullable().default(null),
  discountValue: z.number().int().min(0).default(0),
  discountAmount: z.number().int().min(0).default(0),
  total: z.number().int().min(0),
  paymentMethod: z.enum(['cash', 'transfer', 'qr', 'combined']),
  note: z.string().max(1000).nullable().default(null),
  items: z.array(createOrderItemSchema).min(1),
})
```

### Cart Store Thiết Kế Chi Tiết

**Cấu trúc mới cho `use-cart-store.ts`:**

```typescript
interface CartItem {
  id: string
  productId: string
  variantId: string | null
  productName: string
  variantName: string | null
  sku: string
  unitPrice: number // integer VND
  quantity: number
  imageUrl: string | null
  notes: string | null
  unitName: string | null
  unitConversionId: string | null
  // --- Mới Story 3.2 ---
  discountType: 'percent' | 'amount' | null
  discountValue: number // giá trị chiết khấu (% hoặc VND)
  discountAmount: number // số tiền chiết khấu thực tế (luôn VND)
  lineTotal: number // unitPrice * quantity - discountAmount
  trackInventory: boolean // để hiện cảnh báo tồn kho
  stockQuantity: number // tồn kho hiện tại (snapshot khi thêm vào giỏ)
}

interface TabState {
  items: CartItem[]
  orderDiscountType: 'percent' | 'amount' | null
  orderDiscountValue: number
  orderDiscountAmount: number
}

interface CartState {
  tabs: Record<number, TabState> // key: 1-5
  activeTab: number // 1-5
  mode: 'quick' | 'normal'
  // Actions
  setActiveTab: (tab: number) => void
  addItem: (item: CartItemInput, qty?: number) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  updateLineDiscount: (id: string, type: 'percent' | 'amount' | null, value: number) => void
  updateLineNotes: (id: string, notes: string | null) => void
  updateOrderDiscount: (type: 'percent' | 'amount' | null, value: number) => void
  clearCart: () => void
  setMode: (mode: 'quick' | 'normal') => void
  // Computed (return values for active tab)
  getActiveItems: () => CartItem[]
  subtotal: () => number // sum of lineTotal
  orderDiscountAmount: () => number
  grandTotal: () => number // subtotal - orderDiscountAmount
  totalItems: () => number
  getTabItemCount: (tab: number) => number
}
```

**Logic tính chiết khấu (integer arithmetic):**

```typescript
function calcLineDiscount(
  unitPrice: number,
  qty: number,
  type: 'percent' | 'amount' | null,
  value: number,
): number {
  if (!type || value <= 0) return 0
  const gross = unitPrice * qty
  if (type === 'percent') return Math.min(Math.round((gross * value) / 100), gross)
  return Math.min(value, gross) // VND cố định, cap tại gross
}

function calcOrderDiscount(
  subtotal: number,
  type: 'percent' | 'amount' | null,
  value: number,
): number {
  if (!type || value <= 0) return 0
  if (type === 'percent') return Math.min(Math.round((subtotal * value) / 100), subtotal)
  return Math.min(value, subtotal)
}
```

**Khởi tạo tabs:**

```typescript
const EMPTY_TAB: TabState = {
  items: [],
  orderDiscountType: null,
  orderDiscountValue: 0,
  orderDiscountAmount: 0,
}

// Khởi tạo: { 1: EMPTY_TAB, 2: EMPTY_TAB, ..., 5: EMPTY_TAB }
```

### Project Structure (Files Mới + Sửa)

```
packages/shared/src/schema/
├── orders.ts                    (NEW) Drizzle orders table
├── order-items.ts               (NEW) Drizzle order_items table
├── order-management.ts          (NEW) Zod schemas cho orders
└── index.ts                     (MODIFIED) export thêm orders, orderItems

apps/web/src/
├── stores/
│   └── use-cart-store.ts        (MODIFIED) multi-tab + discount
├── features/pos/components/
│   ├── CartPanel.tsx             (MODIFIED) tab bar + summary + order discount
│   ├── CartItem.tsx              (MODIFIED) inline edit + discount + stock warning
│   ├── CartTabBar.tsx            (NEW) 5 tabs component
│   └── OrderDiscountPopover.tsx  (NEW) popover chiết khấu đơn
└── features/pos/
    └── constants.ts              (NEW) MAX_CART_TABS, discount constants

apps/api/src/db/migrations/
└── 00XX_*.sql                   (NEW) auto-generated migration
```

### Pattern Reuse (BẮT BUỘC)

| Cần dùng        | File nguồn                                           | Ghi chú                                      |
| --------------- | ---------------------------------------------------- | -------------------------------------------- |
| Format tiền     | `apps/web/src/lib/currency.ts`                       | `formatVndWithSuffix()`                      |
| Toast           | `apps/web/src/lib/toast.ts`                          | `showSuccess()`, `showWarning()`             |
| AlertDialog     | `apps/web/src/components/ui/alert-dialog.tsx`        | Xác nhận huỷ đơn                             |
| Popover         | `apps/web/src/components/ui/popover.tsx`             | Chiết khấu đơn                               |
| CurrencyInput   | `apps/web/src/components/shared/currency-input.tsx`  | Input giá trị chiết khấu VND                 |
| Tabs            | `apps/web/src/components/ui/tabs.tsx`                | Multi-tab (hoặc custom vì layout compact)    |
| Badge           | `apps/web/src/components/ui/badge.tsx`               | Item count trên tab                          |
| Purchase orders | `packages/shared/src/schema/purchase-orders.ts`      | Pattern cho Drizzle schema (bigint, indexes) |
| PO items        | `packages/shared/src/schema/purchase-order-items.ts` | Pattern cho order-items schema               |

### KHÔNG được làm

- KHÔNG import cross-feature (cấm `features/pos` import từ `features/products/components/*`)
- KHÔNG tạo CSS custom, CHỈ dùng Tailwind classes
- KHÔNG dùng `any` type
- KHÔNG floating point cho tiền (integer VND, `Math.round()` khi tính %)
- KHÔNG hard-code magic number (dùng constants: `MAX_CART_TABS = 5`)
- KHÔNG tạo API endpoint orders (Story 3.3 mới cần)
- KHÔNG implement thanh toán (Story 3.3)
- KHÔNG tạo Zod schema trong `apps/`. Đặt ở `packages/shared`
- KHÔNG bypass `store_id` filter trong schema (có index theo storeId)

### Bài học từ Story 3.1 (PHẢI tuân thủ)

1. **Integer VND**: Mọi giá trị tiền tệ là integer. `bigint({ mode: 'number' })` trong Drizzle. `Math.round()` khi tính phần trăm.
2. **Escape LIKE pattern**: Dùng `escapeLikePattern()` từ `apps/api/src/lib/strings.ts` cho mọi ILIKE query.
3. **Route order Hono**: Literal paths PHẢI mount TRƯỚC `/:id`.
4. **Store ID filter**: MỌI query backend PHẢI filter theo `store_id`.
5. **No cross-feature import**: CartPanel gọi shared components trực tiếp, không import từ features khác.
6. **Cart store selector pattern**: Dùng computed selector `s.items.reduce(...)` cho reactive values, không dùng function reference.
7. **DialogDescription bắt buộc**: Mọi Dialog/Sheet PHẢI có DialogDescription (có thể sr-only).
8. **Touch targets**: Buttons tối thiểu 44x44px trên mobile (Story 3.1 defer W6 vẫn chưa fix, nhưng story mới nên tuân thủ).
9. **addItem guard**: Đã có guard `qty <= 0` return. Giữ nguyên.
10. **updateQuantity guard**: Đã có guard `!Number.isInteger(qty)` return. Giữ nguyên.

### UX Requirements

**Chiết khấu dòng (inline edit):**

- Tap vào CartItem → expand phần edit bên dưới (slide down animation)
- Toggle chip: "%" | "VND" (mặc định "VND")
- Input: nếu % thì max 100, nếu VND thì max = lineGross
- Hiển thị preview: "Giảm 50.000đ" hoặc "Giảm 10%"
- Ghi chú: textarea 1 dòng, placeholder "Ghi chú..."

**Chiết khấu đơn (popover):**

- Trigger: nhấn vào dòng "Chiết khấu đơn: 0đ" trong summary
- Popover position: top (mở lên phía trên trigger)
- Toggle chip giống line discount
- Áp dụng tức thì khi thay đổi (không cần nút "Lưu")

**Tab bar:**

- Compact: chiều cao 36px, font-size 13px
- Active tab: `bg-primary text-primary-foreground rounded-md`
- Inactive tab: `text-muted-foreground hover:bg-accent`
- Badge count: `bg-primary/20 text-primary text-[11px]` bên cạnh số tab
- Tab trống: hiển thị icon "+" nhỏ, opacity 50%

**Summary footer:**

- Tổng tiền hàng (subtotal): `text-sm text-muted-foreground`
- Chiết khấu đơn: `text-sm text-orange-500` (clickable)
- Tổng thanh toán: `font-mono text-2xl font-bold`
- Nút Thanh toán: disabled, chiều cao 48px

**Colors:**

- Cảnh báo tồn kho: `text-warning` (amber-500)
- Chiết khấu: `text-orange-500`
- Xoá/Huỷ: `text-destructive`

### Migration Chạy Lệnh

```bash
cd apps/api
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Sau khi migration thành công, verify bằng:

```bash
pnpm drizzle-kit studio
```

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-bn-hng-pos-lung-bn-l.md#Story 3.2]
- [Source: _bmad-output/implementation-artifacts/3-1-giao-dien-pos-tim-kiem-san-pham.md]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/project-context.md]
- [Source: packages/shared/src/schema/purchase-orders.ts (pattern reference)]
- [Source: packages/shared/src/schema/purchase-order-items.ts (pattern reference)]
- [Source: apps/web/src/stores/use-cart-store.ts (file cần modify)]
- [Source: apps/web/src/features/pos/components/CartPanel.tsx (file cần modify)]
- [Source: apps/web/src/features/pos/components/CartItem.tsx (file cần modify)]

## Review Findings

### Đã Sửa (Patched)

| ID     | Mức    | Mô tả                                                                                             | Quyết định                                                                              |
| ------ | ------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| H1     | HIGH   | CartItem: nested interactive elements (`<button>` bên trong `<div role="button">`) vi phạm WCAG   | Tách toggle thành `<button>` riêng, +/-/trash là siblings bên ngoài                     |
| H2     | HIGH   | Mobile FAB che khuất sản phẩm cuối ProductGrid                                                    | Thêm `pb-24 md:pb-3` cho scroll container                                               |
| CR-001 | HIGH   | Store expose method-style computed (getActiveItems, subtotal, grandTotal...) dễ quên `()` khi gọi | Xoá toàn bộ 6 method, consumer đã dùng inline selector                                  |
| CR-005 | MEDIUM | discountValue không cap cho percent (cho phép >100)                                               | Thêm `Math.min(Math.round(value), 100)` trong updateLineDiscount và updateOrderDiscount |
| CR-007 | LOW    | Giá trị chiết khấu không nguyên được chấp nhận                                                    | Thêm `Math.round(value)` trong cả hai hàm discount                                      |
| CR-008 | LOW    | addItem thiếu guard `Number.isInteger(qty)`                                                       | Thêm guard cùng với `qty <= 0`                                                          |
| M2     | MEDIUM | Stock warning hiển thị "Tồn kho chỉ còn 0" thay vì "Hết hàng"                                     | Thêm điều kiện `stockQuantity <= 0` hiển thị "Hết hàng"                                 |

### Hoãn Lại (Deferred to Story 3.3+)

| ID     | Mức    | Mô tả                                                               | Lý do hoãn                                      |
| ------ | ------ | ------------------------------------------------------------------- | ----------------------------------------------- |
| CR-002 | MEDIUM | Zod cross-field `.refine()` cho lineTotal validation                | Cần khi implement checkout API (Story 3.3)      |
| CR-003 | MEDIUM | `paymentStatus` thiếu trong `createOrderSchema` (DB column notNull) | Cần khi implement payment flow (Story 3.3)      |
| CR-004 | MEDIUM | `orders` table thiếu `deletedAt` cho soft delete                    | Cần đánh giá lại khi implement order management |
| M1     | MEDIUM | ARIA tabs pattern chưa đầy đủ (thiếu aria-controls, keyboard arrow) | Cải thiện UX, không block chức năng             |
| M3     | MEDIUM | Enter key trong expanded CartItem input có thể bubble lên toggle    | Edge case hiếm gặp, fix khi có user report      |
| M4     | MEDIUM | OrderDiscountPopover fire store update mỗi keystroke                | Cần debounce, tối ưu performance sau            |
| M5     | MEDIUM | autoFocus không re-trigger khi toggle discount type                 | UX minor, fix khi có user report                |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (5 agents: dev-schema, dev-store, dev-ui, reviewer-backend, reviewer-frontend)

### Completion Notes List

- DB migration 0015 applied: 2 tables (orders, order_items), 31 columns, 8 indexes
- Cart store rewrite: multi-tab (5 tabs), line/order discount, integer VND arithmetic
- UI: CartTabBar, OrderDiscountPopover (new), CartItem expanded panel, CartPanel summary footer
- Mobile: Sheet bottom panel, floating action bar with count + grand total
- Typecheck pass (1 pre-existing error in volume-prices-api.ts, unrelated)

### File List

**Created:**

- `packages/shared/src/schema/orders.ts`
- `packages/shared/src/schema/order-items.ts`
- `packages/shared/src/schema/order-management.ts`
- `apps/api/src/db/migrations/0015_round_namora.sql`
- `apps/web/src/features/pos/constants.ts`
- `apps/web/src/features/pos/components/CartTabBar.tsx`
- `apps/web/src/features/pos/components/OrderDiscountPopover.tsx`
- `apps/web/src/components/ui/popover.tsx`

**Modified:**

- `packages/shared/src/schema/index.ts`
- `apps/web/src/stores/use-cart-store.ts`
- `apps/web/src/features/pos/components/CartItem.tsx`
- `apps/web/src/features/pos/components/CartPanel.tsx`
- `apps/web/src/features/pos/components/PosScreen.tsx`
