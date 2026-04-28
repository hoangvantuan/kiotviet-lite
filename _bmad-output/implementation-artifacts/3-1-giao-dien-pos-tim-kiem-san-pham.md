# Story 3.1: Giao diện POS & Tìm kiếm sản phẩm

Status: done

## Story

As a nhân viên bán hàng,
I want giao diện POS nhanh, tìm sản phẩm tức thì bằng tên/mã vạch/lưới,
so that tôi phục vụ khách nhanh chóng mà không cần nhớ giá hay mã sản phẩm.

## Acceptance Criteria (BDD)

### AC1: Layout POS fullscreen responsive

**Given** nhân viên (bất kỳ role) đã đăng nhập
**When** vào trang `/pos`
**Then** hiển thị layout POS fullscreen responsive:

- **Desktop (>=1024px)**: trái = vùng sản phẩm (search bar + ProductGrid + danh mục filter), phải = CartPanel (380px cố định)
- **Tablet (768-1023px)**: tương tự desktop, CartPanel thu hẹp 320px
- **Mobile (<768px)**: full screen ProductGrid, CartPanel dạng bottom sheet kéo lên, badge số lượng item trên nút giỏ hàng

**And** Sidebar và BottomTabBar ẩn hoàn toàn, chỉ icon quay về menu góc trái trên

### AC2: Placeholder khách hàng

**Given** POS đang mở, chưa chọn khách hàng
**When** xem khu vực khách hàng trên POS
**Then** hiển thị placeholder "Khách vãng lai" với nút "Chọn KH" disabled, tooltip "Chức năng chọn KH sẽ kích hoạt trong Epic 4 (Story 4.5)"

### AC3: Tìm kiếm sản phẩm autocomplete

**Given** POS đang mở
**When** gõ vào thanh tìm kiếm sản phẩm
**Then** autocomplete dropdown hiển thị kết quả trong <=200ms (tìm theo tên, SKU, barcode)
**And** mỗi kết quả hiển thị: ảnh thumbnail, tên, giá bán, tồn kho
**And** nhấn Enter hoặc click kết quả → thêm 1 unit vào giỏ hàng
**And** search bar tự động focus khi mở POS và sau mỗi lần thêm sản phẩm

### AC4: ProductGrid

**Given** POS đang mở ở chế độ hiển thị lưới
**When** xem ProductGrid
**Then** hiển thị sản phẩm dạng card: ảnh, tên (tối đa 2 dòng, ellipsis), giá bán
**And** số cột responsive: mobile 3, tablet 4, desktop 5-6
**And** filter theo danh mục bằng tab/chip bar ngang phía trên grid
**And** sản phẩm hết hàng (tồn kho = 0, track_inventory = true) hiển thị overlay mờ + text "Hết hàng"

### AC5: Quét barcode bằng camera

**Given** thiết bị có camera (mobile/tablet)
**When** nhấn icon barcode scanner trên thanh tìm kiếm
**Then** mở camera quét barcode bằng html5-qrcode
**And** nhận diện barcode → tìm sản phẩm khớp → thêm vào giỏ hàng tự động
**And** không tìm thấy → Toast warning "Không tìm thấy sản phẩm với mã [barcode]"
**And** camera tự đóng sau quét thành công, có nút đóng thủ công

### AC6: Chế độ Quick Scan vs Normal

**Given** POS hỗ trợ 2 chế độ bán hàng
**When** chuyển đổi giữa chế độ
**Then** **Quick Scan**: search bar auto-focus, mỗi lần quét/enter → thêm 1 qty, sản phẩm có biến thể chọn biến thể mặc định hoặc dialog nhanh
**And** **Normal**: nhấn card sản phẩm → dialog chi tiết: chọn biến thể (nếu có), chọn đơn vị, nhập số lượng, ghi chú → "Thêm vào giỏ"
**And** toggle chuyển chế độ trên header POS, persist trong localStorage

### AC7: Chọn biến thể sản phẩm

**Given** sản phẩm có biến thể
**When** nhấn vào sản phẩm trên ProductGrid (chế độ Normal)
**Then** dialog chọn biến thể: thuộc tính dạng chip (VD: Đỏ | Xanh | Vàng, S | M | L)
**And** chọn tổ hợp → hiển thị giá bán + tồn kho của biến thể đó
**And** nhấn "Thêm" → thêm đúng biến thể đã chọn vào giỏ

## Phạm vi Story 3.1 (Scope)

### Bao gồm

- Layout POS fullscreen (KHÔNG sidebar/header app)
- Search bar autocomplete + kết quả
- ProductGrid responsive với category filter
- Barcode scanner (html5-qrcode)
- Quick Scan / Normal mode toggle
- Variant selection dialog
- Basic CartPanel: hiển thị items đã thêm, tên, giá, số lượng, tổng tiền, nút xóa item
- Zustand cart store (thêm/xóa item, tính tổng)
- Customer placeholder "Khách vãng lai"

### KHÔNG bao gồm (Stories sau)

- Chiết khấu dòng/đơn, inline edit cart (Story 3.2)
- Multi-tab đơn hàng 5 tabs (Story 3.2)
- Thanh toán, PaymentDialog (Story 3.3)
- Phím tắt F2/F4/F5 (Story 3.2/3.3)
- Chọn khách hàng thật (Story 4.5)
- Pricing engine 6 tầng (Story 4.5)
- Ghi nợ (Story 5.1)

## Tasks / Subtasks

- [x] **Task 1: Cài đặt dependencies** (AC: 5)
  - [x] 1.1 Install `html5-qrcode` vào `apps/web`
  - [x] 1.2 Install `@tanstack/react-virtual` vào `apps/web` (virtual scroll cho grid lớn)

- [x] **Task 2: Backend, product search endpoint tối ưu cho POS** (AC: 3)
  - [x] 2.1 Tạo route `GET /api/v1/pos/products/search?q=xxx&categoryId=xxx` trong `pos.routes.ts` (tách riêng vì permission `pos.sell`)
  - [x] 2.2 Service method `searchProductsForPos()` trả về fields tối thiểu: id, name, sku, barcode, basePrice, imageUrl, trackInventory, stockQuantity, hasVariants, categoryId
  - [x] 2.3 Search match: tên (ILIKE), SKU (ILIKE), barcode (exact match)
  - [x] 2.4 Include variants (id, name, sku, barcode, price, stockQuantity) khi `hasVariants = true`
  - [x] 2.5 Trả tất cả SP active (không phân trang, cache TanStack Query), limit 500 records cho lần load đầu

- [x] **Task 3: Zustand cart store** (AC: 3, 6, 7)
  - [x] 3.1 Tạo `apps/web/src/stores/use-cart-store.ts`
  - [x] 3.2 State: `items: CartItem[]`, `mode: 'quick' | 'normal'`
  - [x] 3.3 CartItem: `{ id, productId, variantId?, productName, variantName?, sku, unitPrice, quantity, imageUrl }`
  - [x] 3.4 Actions: `addItem(product, variant?, qty)`, `removeItem(id)`, `updateQuantity(id, qty)`, `clearCart()`
  - [x] 3.5 Computed: `totalItems`, `totalAmount`
  - [x] 3.6 `addItem`: nếu SP+variant đã có trong giỏ → tăng qty thay vì thêm dòng mới
  - [x] 3.7 `mode` persist trong localStorage

- [x] **Task 4: POS Layout** (AC: 1, 2)
  - [x] 4.1 Cập nhật `pos-page.tsx` thành POS layout thật
  - [x] 4.2 Tạo `features/pos/components/PosScreen.tsx`: layout chính, responsive 3 breakpoints
  - [x] 4.3 Tạo `features/pos/components/PosHeader.tsx`: nút quay về, title "Bán hàng", toggle Quick/Normal, customer placeholder
  - [x] 4.4 Desktop/Tablet: flex row, trái ProductArea (flex-1), phải CartPanel (w-[380px] desktop / w-[320px] tablet)
  - [x] 4.5 Mobile: ProductArea full, CartPanel dạng Sheet (shadcn) bottom sheet kéo lên
  - [x] 4.6 Nút giỏ hàng mobile: FAB góc phải dưới, badge đếm items

- [x] **Task 5: Search bar & Autocomplete** (AC: 3)
  - [x] 5.1 Tạo `features/pos/components/PosSearchBar.tsx`
  - [x] 5.2 Input có icon search, icon barcode scanner (mobile), icon clear
  - [x] 5.3 Debounce 150ms, gọi API search, dropdown kết quả
  - [x] 5.4 Mỗi kết quả: thumbnail 40x40, tên, giá (font-mono), tồn kho, StockBadge
  - [x] 5.5 Keyboard navigation: ArrowUp/Down di chuyển, Enter chọn
  - [x] 5.6 Click hoặc Enter → `addItem()` → clear input → re-focus
  - [x] 5.7 Auto-focus khi mount + sau mỗi lần thêm SP
  - [x] 5.8 Click outside → đóng dropdown

- [x] **Task 6: ProductGrid** (AC: 4)
  - [x] 6.1 Tạo `features/pos/components/ProductGrid.tsx`
  - [x] 6.2 Grid responsive: `grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`
  - [x] 6.3 ProductCard: ảnh (aspect-square, object-cover), tên (line-clamp-2), giá (font-mono font-semibold text-primary)
  - [x] 6.4 Sản phẩm hết hàng: overlay `bg-black/40` + badge "Hết hàng" giữa card, disable click
  - [x] 6.5 Click card (Normal mode): mở VariantDialog nếu có biến thể, hoặc addItem trực tiếp
  - [x] 6.6 Click card (Quick Scan mode): addItem ngay (biến thể mặc định nếu có)
  - [x] 6.7 Loading state: skeleton grid (shimmer)

- [x] **Task 7: Category filter** (AC: 4)
  - [x] 7.1 Tạo `features/pos/components/CategoryFilter.tsx`
  - [x] 7.2 Chip bar ngang, scroll horizontal, "Tất cả" active mặc định
  - [x] 7.3 Dùng existing `categories-api` để load danh mục
  - [x] 7.4 Filter client-side (SP đã load hết ở Task 2.5)

- [x] **Task 8: Barcode Scanner** (AC: 5)
  - [x] 8.1 Tạo `features/pos/components/BarcodeScanner.tsx`
  - [x] 8.2 Dùng `html5-qrcode` library, `Html5QrcodeScanner`
  - [x] 8.3 Mở trong Dialog (shadcn), camera viewfinder
  - [x] 8.4 Quét thành công → tìm SP/variant theo barcode exact match → addItem → đóng dialog
  - [x] 8.5 Không tìm thấy → `showWarning("Không tìm thấy sản phẩm với mã [barcode]")`
  - [x] 8.6 Nút đóng camera, cleanup scanner khi unmount

- [x] **Task 9: Variant Selection Dialog** (AC: 7)
  - [x] 9.1 Tạo `features/pos/components/VariantSelectionDialog.tsx`
  - [x] 9.2 Dialog (shadcn): tên SP, ảnh, danh sách biến thể
  - [x] 9.3 Chip selection cho attributes (màu, size, ...)
  - [x] 9.4 Hiển thị giá + tồn kho của biến thể đang chọn
  - [x] 9.5 Input số lượng (mặc định 1), nút "Thêm vào giỏ"
  - [x] 9.6 Biến thể hết hàng: chip mờ, disabled

- [x] **Task 10: CartPanel cơ bản** (AC: 1, 3)
  - [x] 10.1 Tạo `features/pos/components/CartPanel.tsx`
  - [x] 10.2 Header: "Giỏ hàng" + badge số items
  - [x] 10.3 List items: tên (+ variant name), đơn giá, stepper +/-, thành tiền, nút xóa (X)
  - [x] 10.4 Footer: tổng số lượng, tổng tiền (font-mono text-2xl font-bold)
  - [x] 10.5 Nút "Thanh toán" disabled (placeholder cho Story 3.3)
  - [x] 10.6 Cart empty: EmptyState (icon ShoppingCart, "Chưa có sản phẩm")
  - [x] 10.7 Mobile: render trong Sheet component, bottom sheet behavior

- [x] **Task 11: POS Hooks** (AC: 3, 4)
  - [x] 11.1 Tạo `features/pos/hooks/use-pos-products.ts`: TanStack Query hook load + search SP cho POS
  - [x] 11.2 Tạo `features/pos/hooks/use-barcode.ts`: logic quét barcode, match SP

- [x] **Task 12: Integration & Polish** (AC: all)
  - [x] 12.1 Wire tất cả components vào PosScreen
  - [x] 12.2 Test thủ công: thêm SP từ search, từ grid, từ barcode
  - [x] 12.3 Test responsive: mobile bottom sheet, tablet, desktop
  - [x] 12.4 Test Quick Scan vs Normal mode
  - [x] 12.5 Test SP có biến thể
  - [x] 12.6 Test SP hết hàng (disabled)
  - [x] 12.7 Verify search performance <= 200ms

## Dev Notes

### Architecture Compliance

**Tech stack (bắt buộc):**

| Layer          | Công nghệ                    | Phiên bản |
| -------------- | ---------------------------- | --------- |
| UI             | React                        | 19.2.x    |
| Build          | Vite                         | 8.0.x     |
| Routing        | TanStack Router              | 1.168.x   |
| Server state   | TanStack Query               | 5.99+     |
| Client state   | Zustand                      | 5.0.x     |
| Styling        | Tailwind CSS 4.2 + shadcn/ui |           |
| Icons          | Lucide React                 |           |
| Barcode        | html5-qrcode                 | latest    |
| Virtual scroll | @tanstack/react-virtual      | latest    |

**Naming conventions:**

- Component file: PascalCase (`ProductGrid.tsx`)
- Hook file: `use-*.ts` (`use-pos-products.ts`)
- Store file: `use-*-store.ts` (`use-cart-store.ts`)
- API file: `*-api.ts`
- Test file: co-located (`*.test.ts`)
- CSS: Tailwind classes only, KHÔNG CSS custom
- Số tiền: `font-mono font-semibold`, format `formatVndWithSuffix()` từ `@/lib/currency.ts`

**Import order (ESLint enforced):**

```typescript
// 1. React / external
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
// 2. Shared package
import type { ProductListItem } from '@kiotviet-lite/shared'
// 3. Internal absolute
import { useCartStore } from '@/stores/use-cart-store'
// 4. Relative
import { ProductCard } from './ProductCard'
```

### Project Structure

```
apps/web/src/
├── features/pos/
│   ├── components/
│   │   ├── PosScreen.tsx          # Layout chính
│   │   ├── PosHeader.tsx          # Header + toggle mode + customer placeholder
│   │   ├── PosSearchBar.tsx       # Search autocomplete
│   │   ├── ProductGrid.tsx        # Grid sản phẩm
│   │   ├── CategoryFilter.tsx     # Filter danh mục (chips)
│   │   ├── CartPanel.tsx          # Panel giỏ hàng
│   │   ├── CartItem.tsx           # Dòng item trong giỏ
│   │   ├── BarcodeScanner.tsx     # Quét barcode camera
│   │   └── VariantSelectionDialog.tsx  # Chọn biến thể
│   └── hooks/
│       ├── use-pos-products.ts    # TanStack Query: load SP cho POS
│       └── use-barcode.ts         # Logic barcode scan + match
├── stores/
│   └── use-cart-store.ts          # Zustand cart store
└── pages/
    └── pos-page.tsx               # Cập nhật từ placeholder
```

Backend (chỉ thêm 1 endpoint):

```
apps/api/src/routes/products.routes.ts   # Thêm GET /pos-search
apps/api/src/services/products.service.ts # Thêm searchProductsForPos()
```

### Pattern Reuse (BẮT BUỘC)

| Cần dùng        | File nguồn                                          | Ghi chú                                            |
| --------------- | --------------------------------------------------- | -------------------------------------------------- |
| API client      | `apps/web/src/lib/api-client.ts`                    | `apiClient.get<T>()`                               |
| Format tiền     | `apps/web/src/lib/currency.ts`                      | `formatVndWithSuffix()`                            |
| Toast           | `apps/web/src/lib/toast.ts`                         | `showSuccess()`, `showWarning()`, `showError()`    |
| Auth store      | `apps/web/src/stores/use-auth-store.ts`             | Lấy user, role                                     |
| Permission hook | `apps/web/src/hooks/use-permission.ts`              | `usePermission('pos.sell')`                        |
| Media query     | `apps/web/src/hooks/use-media-query.ts`             | Responsive breakpoints                             |
| EmptyState      | `apps/web/src/components/shared/empty-state.tsx`    | Cart empty state                                   |
| StockBadge      | `apps/web/src/features/products/stock-badge.tsx`    | Trạng thái tồn kho                                 |
| CurrencyInput   | `apps/web/src/components/shared/currency-input.tsx` | Nếu cần input tiền                                 |
| shadcn/ui       | `apps/web/src/components/ui/*`                      | Dialog, Sheet, Badge, Button, Input, Tabs, Tooltip |
| Categories API  | `apps/web/src/features/categories/`                 | Load danh mục cho filter                           |
| Products API    | `apps/web/src/features/products/products-api.ts`    | Tham khảo pattern, nhưng POS dùng endpoint riêng   |

### KHÔNG được làm

- KHÔNG import cross-feature (cấm `features/pos` import từ `features/products/components/*`)
- KHÔNG tạo CSS custom, CHỈ dùng Tailwind classes
- KHÔNG dùng `any` type
- KHÔNG tạo DB migration (Story 3.1 chưa cần bảng orders)
- KHÔNG implement thanh toán, chiết khấu, multi-tab (Stories sau)
- KHÔNG hard-code giá trị magic number (dùng constants)
- KHÔNG floating point cho tiền (integer VND)

### Backend Endpoint Spec

```
GET /api/v1/products/pos-search
Query: ?q=string&categoryId=string
Auth: requireAuth + requirePermission('pos.sell')
```

Response:

```typescript
{
  data: {
    id: string
    name: string
    sku: string
    barcode: string | null
    basePrice: number // integer VND
    imageUrl: string | null
    trackInventory: boolean
    stockQuantity: number
    hasVariants: boolean
    categoryId: string | null
    variants: {
      id: string
      name: string
      sku: string
      barcode: string | null
      price: number // integer VND
      stockQuantity: number
      attributes: Record<string, string> // { "Màu": "Đỏ", "Size": "M" }
    }
    ;[]
  }
  ;[]
}
```

QUAN TRỌNG: Mount route `/pos-search` TRƯỚC `/:id` trong Hono (literal paths first).

### Search Implementation

- Server: `WHERE (name ILIKE '%q%' OR sku ILIKE '%q%' OR barcode = 'q') AND deleted_at IS NULL AND store_id = ?`
- Dùng `escapeLikePattern()` từ `apps/api/src/lib/strings.ts` cho ILIKE values
- Barcode dùng exact match (=), không ILIKE
- Client: TanStack Query với `staleTime: 30_000` (30s cache)
- Debounce 150ms trên search input (dùng `useDeferredValue` hoặc `setTimeout`)

### UX Requirements

**Colors:**

- Primary: `#2563EB` (Tailwind `primary`)
- Success (thanh toán): `#16A34A` (`success`)
- Warning (tồn kho thấp): `#F59E0B` (`warning`)
- Error: `#DC2626` (`error`)
- Background: `#F8FAFC` (`neutral-50`)
- Card border: `neutral-200`, radius `8px`, `shadow-sm`

**Typography POS:**

- Giá bán: `font-mono font-semibold text-lg`
- Tổng tiền giỏ hàng: `font-mono font-bold text-2xl`
- Tên SP trên card: `text-sm line-clamp-2`
- Format VND: dấu chấm phân cách nghìn, hậu tố "đ" (1.500.000đ)

**Touch targets:**

- Minimum 44x44px cho tất cả interactive elements trên mobile
- Product card: tối thiểu 80x100px

**Feedback:**

- Toast success auto-dismiss 3s (top)
- Toast warning persist, cần tap dismiss
- Loading: skeleton shimmer cho grid
- Thêm SP vào giỏ: hiệu ứng subtle (opacity flash trên cart item mới)

**Accessibility:**

- WCAG 2.1 AA
- Focus ring 2px primary cho mọi interactive element
- `aria-label` cho icon buttons
- Keyboard navigation: ArrowUp/Down trong autocomplete, Esc đóng dropdown/dialog
- Font size tối thiểu 14px body
- `lang="vi"` trên html (đã có)

### Responsive Layout Chi Tiết

**Desktop (>=1024px):**

```
┌─────────────────────────────────────────────┬──────────────┐
│ [←] Bán hàng    [Quick/Normal]  Khách vãng lai │              │
├─────────────────────────────────────────────┤  CartPanel   │
│ [🔍 Tìm sản phẩm...]                        │  w-[380px]   │
│ [Tất cả] [Đồ uống] [Thực phẩm] [...]       │              │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │  Items...    │
│ │ SP │ │ SP │ │ SP │ │ SP │ │ SP │        │              │
│ └────┘ └────┘ └────┘ └────┘ └────┘        │  ─────────── │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │  Tổng: xxxđ  │
│ │ SP │ │ SP │ │ SP │ │ SP │ │ SP │        │  [Thanh toán]│
│ └────┘ └────┘ └────┘ └────┘ └────┘        │              │
└─────────────────────────────────────────────┴──────────────┘
```

**Mobile (<768px):**

```
┌──────────────────────┐
│ [←] Bán hàng [Q/N]  │
│ [🔍 Tìm SP...] [📷] │
│ [Tất cả][Đồ uống].. │
│ ┌──┐ ┌──┐ ┌──┐     │
│ │SP│ │SP│ │SP│     │
│ └──┘ └──┘ └──┘     │
│ ┌──┐ ┌──┐ ┌──┐     │
│ │SP│ │SP│ │SP│     │
│ └──┘ └──┘ └──┘     │
│                      │
│  [🛒 3 SP | 450.000đ]│  ← FAB, tap mở bottom sheet
└──────────────────────┘
```

### Bài học từ Stories trước (PHẢI tuân thủ)

1. **Route order trong Hono**: Literal paths (`/pos-search`) PHẢI mount TRƯỚC `/:id`. Vi phạm sẽ 404 trên literal paths.
2. **Escape LIKE pattern**: Dùng `escapeLikePattern()` từ `apps/api/src/lib/strings.ts` cho mọi ILIKE query. Không dùng string interpolation trực tiếp.
3. **Integer VND**: Mọi giá trị tiền tệ là integer (đồng). KHÔNG floating point. Dùng `bigint({ mode: 'number' })` trong Drizzle schema.
4. **Form validation pattern**: RHF + zodResolver, mode `onTouched`.
5. **Error handling**: `throw new ApiError(code, message, details)` trong service. Route layer catch và format response.
6. **Store ID filter**: MỌI query backend PHẢI filter theo `store_id` (multi-tenant).

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-3-bn-hng-pos-lung-bn-l.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/design-system-foundation.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR26-FR35]
- [Source: _bmad-output/implementation-artifacts/2-4-don-vi-quy-doi-ton-kho.md (route order, integer VND)]
- [Source: _bmad-output/implementation-artifacts/4-1-quan-ly-khach-hang-nhom-khach-hang.md (escapeLikePattern)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6) với agent teams

### Debug Log References

Không có debug log riêng.

### Completion Notes List

1. **Endpoint mount riêng**: Tạo `pos.routes.ts` riêng thay vì thêm vào `products.routes.ts` vì permission khác nhau (`pos.sell` vs `products.manage`). Mọi role đều bán hàng được.
2. **URL thay đổi so với spec**: Endpoint thực tế là `GET /api/v1/pos/products/search` (mount qua `app.route('/api/v1/pos', posRoutes)`), không phải `/api/v1/products/pos-search` như Dev Notes ban đầu.
3. **Variant search**: Backend tìm cả barcode/SKU trên variants, nạp thêm products tìm được qua variant match.
4. **Responsive layout**: Desktop flex-row (CartPanel w-[380px]), mobile dùng Sheet bottom-sheet với FAB trigger.
5. **Không cross-feature import**: CategoryFilter gọi categories API trực tiếp, không import từ `features/products/`.
6. **html5-qrcode dynamic import**: BarcodeScanner dùng `import('html5-qrcode')` để code-split.
7. **Pre-existing TS error**: `action-labels.ts` thiếu price_list labels (từ Story 4-3), không liên quan POS.

### File List

**Backend (2 files):**

- `apps/api/src/routes/pos.routes.ts` (NEW)
- `apps/api/src/services/products.service.ts` (MODIFIED: +searchProductsForPos)
- `apps/api/src/index.ts` (MODIFIED: +posRoutes mount)

**Frontend (14 files):**

- `apps/web/src/features/pos/types.ts` (NEW)
- `apps/web/src/features/pos/hooks/use-pos-products.ts` (NEW)
- `apps/web/src/features/pos/hooks/use-barcode.ts` (NEW)
- `apps/web/src/features/pos/components/PosScreen.tsx` (NEW)
- `apps/web/src/features/pos/components/PosHeader.tsx` (NEW)
- `apps/web/src/features/pos/components/PosSearchBar.tsx` (NEW)
- `apps/web/src/features/pos/components/ProductGrid.tsx` (NEW)
- `apps/web/src/features/pos/components/CategoryFilter.tsx` (NEW)
- `apps/web/src/features/pos/components/CartPanel.tsx` (NEW)
- `apps/web/src/features/pos/components/CartItem.tsx` (NEW)
- `apps/web/src/features/pos/components/BarcodeScanner.tsx` (NEW)
- `apps/web/src/features/pos/components/VariantSelectionDialog.tsx` (NEW)
- `apps/web/src/stores/use-cart-store.ts` (NEW)
- `apps/web/src/pages/pos-page.tsx` (MODIFIED)

### Review Findings

**Decision Needed:**

- [x] [Review][Decision] D1: VariantSelectionDialog thiếu trường "ghi chú" → RESOLVED: Thêm textarea ghi chú vào dialog, thêm notes vào CartItem
- [x] [Review][Decision] D2: VariantSelectionDialog thiếu "chọn đơn vị" → RESOLVED: Thêm unit selector (chip toggle), backend trả unit + unitConversions, giá tính theo đơn vị quy đổi
- [x] [Review][Decision] D3: Quick Scan barcode SP có biến thể luôn mở dialog → RESOLVED: Giữ nguyên hành vi hiện tại (mở dialog chọn biến thể)

**Patch (HIGH):**

- [x] [Review][Patch] P1: Normal mode + SP không biến thể: nút "Thêm" luôn disabled vì selectedVariant=null → FIXED: Tách logic isVariantReady cho variant/non-variant products
- [x] [Review][Patch] P2: PosScreen FAB badge không reactive → FIXED: Dùng computed selector s.items.reduce(...) thay vì function reference
- [x] [Review][Patch] P3: BarcodeScanner handleScan chạy nhiều lần → FIXED: Thêm processingRef guard + try/finally

**Patch (MEDIUM):**

- [x] [Review][Patch] P4: Barcode search lấy products[0] thay vì exact match → FIXED: Ưu tiên exact barcode match rồi fallback
- [x] [Review][Patch] P5: "Khách vãng lai" ẩn trên mobile → FIXED: Đổi hidden sm:flex thành flex
- [x] [Review][Patch] P6: handleScan trong useEffect deps gây scanner restart → FIXED: Dùng modeRef + addItemRef cho stable deps
- [x] [Review][Patch] P7: Search bar không auto-focus sau khi thêm SP → FIXED: Thêm searchRef prop, focus sau addItem và dialog close
- [x] [Review][Patch] P8: Không giới hạn quantity theo stock → FIXED: maxStock tính từ rawStock/conversionFactor, cap quantity + disabled nút +
- [x] [Review][Patch] P9: Tooltip "Chọn KH" sai nội dung → FIXED: Đổi sang "Chức năng chọn KH sẽ kích hoạt trong Epic 4 (Story 4.5)"

**Patch (LOW):**

- [x] [Review][Patch] P10: Thiếu DialogDescription → FIXED: Thêm sr-only DialogDescription
- [x] [Review][Patch] P11: use-barcode.ts dead code → FIXED: Xóa file
- [x] [Review][Patch] P12: categoryId không encode → FIXED: Thêm encodeURIComponent
- [x] [Review][Patch] P13: addItem không guard qty<=0 → FIXED: Thêm if (qty <= 0) return
- [x] [Review][Patch] P14: updateQuantity không guard non-integer → FIXED: Thêm if (!Number.isInteger(qty)) return

**Deferred:**

- [x] [Review][Defer] W1: Duplicate variant mapping logic trong searchProductsForPos (refactor) [products.service.ts]
- [x] [Review][Defer] W2: N+1 queries variant barcode search (performance optimization) [products.service.ts]
- [x] [Review][Defer] W3: const rows mutated via push (code style) [products.service.ts]
- [x] [Review][Defer] W4: PosProductItem/PosVariantItem duplicated backend/frontend, nên đưa vào shared package [products.service.ts, types.ts]
- [x] [Review][Defer] W5: No min query length server-side (frontend đã guard) [pos.routes.ts]
- [x] [Review][Defer] W6: Touch targets < 44px: CartItem buttons 28px, CategoryFilter chips 32px, scanner button 36px [CartItem.tsx, CategoryFilter.tsx, PosSearchBar.tsx]
- [x] [Review][Defer] W7: Autocomplete dropdown thiếu ARIA combobox roles (a11y pass) [PosSearchBar.tsx]
- [x] [Review][Defer] W8: ProductGrid cards thiếu aria-label (a11y pass) [ProductGrid.tsx]
- [x] [Review][Defer] W9: CartPanel width 384px vs spec 380px, sai 4px [PosScreen.tsx]
- [x] [Review][Defer] W10: Breakpoint desktop dùng 768px thay vì 1024px, 2 trạng thái thay vì 3 [PosScreen.tsx]
- [x] [Review][Defer] W11: Integer overflow risk totalAmount (VND không thực tế đạt MAX_SAFE_INTEGER) [use-cart-store.ts]
- [x] [Review][Defer] W12: Stock validation giữa dialog và checkout (sẽ validate server-side ở Story 3.3) [VariantSelectionDialog.tsx]
- [x] [Review][Defer] W13: attribute1Value empty string edge case [products.service.ts]
