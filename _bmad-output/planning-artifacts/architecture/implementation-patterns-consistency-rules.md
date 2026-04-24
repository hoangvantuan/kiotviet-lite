# Implementation Patterns & Consistency Rules

## Naming Patterns

**Database Naming:**

| Loại           | Convention                           | Ví dụ                                           |
| -------------- | ------------------------------------ | ----------------------------------------------- |
| Table          | snake_case, số nhiều                 | `products`, `order_items`, `price_lists`        |
| Column         | snake_case                           | `created_at`, `store_id`, `unit_price`          |
| Foreign key    | `{table_singular}_id`                | `product_id`, `customer_id`                     |
| Index          | `idx_{table}_{columns}`              | `idx_products_barcode`, `idx_orders_store_date` |
| Enum           | snake_case                           | `sync_status`, `payment_method`                 |
| Boolean column | `is_` hoặc `has_` hoặc `can_` prefix | `is_active`, `has_variants`, `can_edit_price`   |


**API Naming:**

| Loại        | Convention           | Ví dụ                                        |
| ----------- | -------------------- | -------------------------------------------- |
| Endpoint    | kebab-case, số nhiều | `/api/v1/price-lists`, `/api/v1/order-items` |
| Path param  | `:id` (camelCase)    | `/api/v1/products/:productId`                |
| Query param | camelCase            | `?pageSize=20&sortBy=createdAt`              |
| JSON field  | camelCase            | `{ "unitPrice": 85000, "createdAt": "..." }` |


**Code Naming:**

| Loại                 | Convention       | Ví dụ                                            |
| -------------------- | ---------------- | ------------------------------------------------ |
| Component            | PascalCase       | `ProductCard`, `PaymentDialog`                   |
| File (component)     | PascalCase.tsx   | `ProductCard.tsx`, `PaymentDialog.tsx`           |
| File (non-component) | kebab-case.ts    | `pricing-engine.ts`, `sync-worker.ts`            |
| File (hook)          | use-*.ts         | `use-cart.ts`, `use-offline-status.ts`           |
| Function             | camelCase        | `calculateWeightedAvgCost()`, `applyPriceTier()` |
| Variable             | camelCase        | `unitPrice`, `syncStatus`                        |
| Constant             | UPPER_SNAKE_CASE | `MAX_CART_TABS`, `SYNC_BATCH_SIZE`               |
| Type/Interface       | PascalCase       | `Product`, `OrderItem`, `PriceList`              |
| Zustand store        | use{Name}Store   | `useCartStore`, `useUiStore`                     |
| Zod schema           | {name}Schema     | `productSchema`, `orderItemSchema`               |


## Structure Patterns

**Test Organization:**

- Co-located: `ProductCard.test.tsx` cạnh `ProductCard.tsx`
- Integration tests: `__tests__/` trong mỗi feature folder
- E2E: `apps/web/e2e/` (Playwright)

**Feature Organization:**

- **By feature**, không by type
- Mỗi feature folder chứa: components, hooks, utils, types, tests riêng
- Shared code nằm ở `shared/` folder

**Import Order (tự động bằng ESLint):**

```typescript
// 1. React / external libraries
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

// 2. Shared package
import { productSchema } from '@kiotviet-lite/shared'

// 3. Internal modules (absolute path)
import { useCartStore } from '@/stores/cart'

// 4. Relative imports
import { ProductCard } from './ProductCard'
```

## Format Patterns

**Date/Time:**

- Database: `timestamptz` (UTC)
- API JSON: ISO 8601 string (`"2026-04-18T10:30:00Z"`)
- UI display: format theo locale `vi-VN` (`18/04/2026 10:30`)
- Library: `date-fns` (tree-shakeable, nhẹ hơn dayjs)

**Currency:**

- Lưu DB: integer (đồng VND, không thập phân)
- API: number (integer)
- UI: `Intl.NumberFormat('vi-VN')` → `85.000 ₫`
- Tính toán: integer arithmetic, không floating point

**Pagination:**

```typescript
// Request
GET /api/v1/products?page=1&pageSize=20&sortBy=name&sortDir=asc

// Response
{
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Communication Patterns

**Event Naming (cho sync & state):**

| Pattern             | Ví dụ                                               |
| ------------------- | --------------------------------------------------- |
| `{entity}.{action}` | `order.created`, `product.updated`, `price.changed` |
| Past tense          | `synced`, `created`, `updated`, `deleted`           |


**Loading States:**

```typescript
type AsyncState<T> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppError }
```

- TanStack Query quản lý loading cho server data
- Zustand cho UI loading (payment processing, printing)

## Process Patterns

**Error Handling:**

```
Browser → try/catch → AppError → 
  ├─ UI: toast notification (react-hot-toast)
  ├─ Log: Sentry.captureException()
  └─ Offline: retry queue (cho network errors)
```

- Error boundary bọc mỗi route
- Toast cho user-facing errors (tiếng Việt)
- Sentry cho unexpected errors
- Retry tự động cho network failures (exponential backoff)

**Validation Flow:**

```
User input → Zod schema (client) → API request
                                       ↓
                               Zod schema (server) → DB operation
```

- Cùng Zod schema validate cả 2 phía
- Client validate = UX nhanh
- Server validate = security (không trust client)

## Enforcement Guidelines

**Tất cả AI Agent PHẢI:**

1. Tuân thủ naming convention bảng trên — không ngoại lệ
2. Dùng Zod schema từ `packages/shared` — không tạo type/validation riêng
3. Mọi API endpoint phải có Zod input/output schema
4. Mọi DB query phải filter theo `store_id` (multi-tenant)
5. Mọi mutation phải kiểm tra authorization
6. Soft delete thay vì hard delete cho business entities
7. Sử dụng `uuid_generate_v7()` cho primary key mới
8. Mọi component dùng Tailwind + shadcn/ui — không CSS custom
9. Mọi thay đổi giá/nợ/tồn kho phải tạo audit log entry

---
