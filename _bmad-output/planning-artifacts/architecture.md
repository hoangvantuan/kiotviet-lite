---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
workflowType: 'architecture'
project_name: 'kiotviet-lite'
user_name: 'shun'
date: '2026-04-18'
lastStep: 8
status: 'complete'
completedAt: '2026-04-18'
classification:
  projectType: web_app_pwa
  domain: retail_pos
  complexity: medium
  projectContext: greenfield
---

# Architecture Decision Document — KiotViet Lite

**Dự án:** KiotViet Lite — POS cho hộ kinh doanh nhỏ Việt Nam
**Ngày:** 2026-04-18
**Tác giả:** shun + AI Architect

---

## Project Context Analysis

### Tổng quan yêu cầu

**Functional Requirements:**
67 FR chia thành 9 nhóm chức năng:

| Nhóm | FR | Mô tả | Độ phức tạp kiến trúc |
|------|-----|-------|----------------------|
| Hàng hóa | FR1-FR7 | CRUD SP, biến thể, đơn vị quy đổi, danh mục 2 cấp, tồn kho | Trung bình |
| Nhập hàng & NCC | FR8-FR12 | Phiếu nhập, giá vốn BQ gia quyền, kiểm kho, NCC | Trung bình |
| Đơn giá | FR13-FR25 | 6 tầng ưu tiên, chain formula, cascade, CK danh mục | **Cao** |
| POS | FR26-FR35 | Mobile-first, barcode camera, đa phương thức, 5 tab | **Cao** |
| Offline | FR36-FR39 | Full offline POS, sync, conflict resolution | **Cao** |
| Khách hàng | FR40-FR45 | Nhóm KH, hạn mức nợ, lịch sử, tạo nhanh từ POS | Thấp |
| Hóa đơn | FR46-FR51 | In thermal/A4, trả hàng, tùy chỉnh mẫu in | Trung bình |
| Công nợ | FR52-FR58 | FIFO allocation, hạn mức, phiếu thu/chi, cảnh báo | **Cao** |
| Báo cáo | FR59-FR64 | Dashboard, doanh thu, lợi nhuận, tồn kho, export | Trung bình |
| Quyền hạn | FR65-FR67 | 3 role, PIN override, audit log | Thấp |

**Non-Functional Requirements:**
19 NFR chia 5 nhóm:

| Nhóm | Yêu cầu quan trọng nhất |
|------|------------------------|
| Performance | Tìm SP < 200ms, tạo đơn < 500ms, tải trang < 2s, POS ≥ 30fps |
| Security | TLS 1.2+, bcrypt/argon2, JWT + refresh rotation, PIN hash, audit log |
| Scalability | ≤ 10.000 SP, ≤ 5.000 KH, ≤ 5 nhân viên đồng thời |
| Offline | 100% POS offline, sync ≤ 100 đơn trong < 30s |
| Compatibility | Mobile ≥ 375px, thermal 58/80mm ESC/POS, camera barcode |

### Đánh giá độ phức tạp

| Chỉ số | Mức |
|--------|-----|
| Real-time | Thấp — polling đủ, không cần WebSocket cho MVP |
| Multi-tenancy | Đơn giản — mỗi store 1 tenant, không share data |
| Regulatory | Không — chưa cần hóa đơn điện tử cho MVP |
| Integration | Thấp — không tích hợp bên thứ 3 trong MVP |
| User interaction | **Cao** — POS cần responsive, nhanh, offline |
| Data complexity | **Cao** — 6-tier pricing, FIFO debt, weighted avg cost |
| Tổng thể | **Medium-High** — business logic phức tạp, infra đơn giản |

### Technical Constraints

1. **Offline-first bắt buộc** — toàn bộ luồng POS phải hoạt động không internet
2. **Mobile-first** — thiết kế cho màn hình nhỏ trước, mở rộng lên desktop
3. **Team nhỏ** (1-2 dev) — cần stack đơn giản, ít boilerplate, DX tốt
4. **Target device** — Android mid-range + Safari iOS ≥ 15
5. **Thermal printer** — ESC/POS protocol qua WebUSB hoặc Web Serial

### Cross-Cutting Concerns

1. **Offline/Sync** — ảnh hưởng mọi module có write data
2. **Pricing Engine** — cần chạy cả client (offline) và server (sync verify)
3. **Authentication & Authorization** — 3 role, PIN cho thao tác nhạy cảm
4. **Audit Trail** — mọi thay đổi giá, nợ, override phải ghi log
5. **Printing** — thermal + A4, dùng chung template engine
6. **Validation** — Zod schema dùng chung client/server

---

## Starter Template Evaluation

### Primary Technology Domain

**SPA/PWA Web App** — không cần SSR/SSG (app nội bộ, không SEO), cần offline-first.

Next.js bị loại vì: SSR không cần, thêm complexity, khó control offline behavior. Vite + React là lựa chọn tối ưu cho SPA thuần.

### Starter đã chọn: Vite + React + TypeScript (manual setup)

**Lý do không dùng starter template có sẵn:**
- Dự án có yêu cầu đặc thù (PGlite offline, monorepo, Hono backend) — không starter nào cover đủ
- Setup thủ công với Vite 8 rất nhanh (< 5 phút)
- Kiểm soát hoàn toàn dependencies, không phải xóa thứ không cần

**Initialization Command:**

```bash
mkdir kiotviet-lite && cd kiotviet-lite
pnpm init
# Tạo monorepo structure
mkdir -p apps/web apps/api packages/shared
# Init Vite + React cho frontend
cd apps/web && pnpm create vite . --template react-ts
# Init Hono cho backend
cd ../api && pnpm init
```

**Quyết định kiến trúc do starter cung cấp:**

| Quyết định | Giá trị |
|-----------|---------|
| Language | TypeScript (strict mode) |
| Build tool | Vite 8.0 (Rolldown bundler) |
| UI Framework | React 19.2 |
| Module system | ESM only |
| Dev server | Vite dev server (HMR) |

**Lưu ý:** Khởi tạo project = story đầu tiên trong sprint.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (chặn implementation):**
- Monorepo structure & package management
- Frontend framework & state management
- Backend framework & API design
- Database & ORM
- Offline storage & sync strategy
- Authentication

**Important (định hình kiến trúc):**
- Styling solution
- Component library
- Form handling & validation
- Routing
- Printing architecture
- Error handling strategy

**Deferred (post-MVP):**
- WebSocket/real-time
- Multi-branch architecture
- E-commerce integration
- E-invoice integration

---

### Monorepo & Package Management

| Quyết định | Giá trị |
|-----------|---------|
| Monorepo tool | pnpm workspaces (đơn giản, nhanh, không cần Turborepo cho 3 packages) |
| Package manager | pnpm ≥ 9.x |
| Node.js | ≥ 22 LTS |

**Cấu trúc workspace:**

```
apps/web      → Frontend SPA/PWA
apps/api      → Backend API
packages/shared → Types, Zod schemas, utils, constants dùng chung
```

**Rationale:** pnpm workspaces đủ cho monorepo 3 packages. Turborepo/Nx thêm complexity không cần thiết ở quy mô này.

---

### Data Architecture

| Quyết định | Giá trị | Phiên bản |
|-----------|---------|-----------|
| Database (server) | PostgreSQL | ≥ 16 |
| ORM | Drizzle ORM | 0.45.x (stable) |
| Migration | Drizzle Kit | Bundled với Drizzle |
| Offline DB (browser) | PGlite | 0.4.x |
| Validation | Zod | 3.x |

**Rationale:**
- **PostgreSQL** — chuẩn cho business app, hỗ trợ JSON, full-text search, tính toán phức tạp
- **Drizzle ORM** — type-safe, lightweight (5x nhỏ hơn Prisma), SQL-like syntax dễ debug, hỗ trợ PGlite
- **PGlite** — chạy PostgreSQL thực sự trong browser qua WASM (3MB gzip). Lợi thế lớn: **cùng Drizzle schema + queries chạy được cả server và client** — giảm code duplication cho pricing engine, validation
- **Zod** — validation schema dùng chung client/server, tích hợp tốt với Drizzle, React Hook Form, Hono

**Data Modeling Approach:**
- Schema-first: define Drizzle schema → generate types → generate Zod schemas
- Shared schema package (`packages/shared`) dùng bởi cả frontend và backend
- Soft delete cho entities quan trọng (đơn hàng, KH, SP)
- UUID v7 cho primary key (sortable by time, good for distributed/offline)
- Timestamps: `created_at`, `updated_at` trên mọi table

**Caching Strategy:**
- PGlite IS the client cache — không cần thêm layer
- Server-side: in-memory cache cho pricing engine (invalidate khi giá thay đổi)
- TanStack Query cache cho API responses (stale-while-revalidate)

---

### Offline & Sync Architecture

**Chiến lược:** PGlite-first, sync-on-connect

```
┌──────────────────────┐         ┌──────────────────────┐
│    Browser (PWA)      │         │      Server          │
│                      │         │                      │
│  PGlite (IndexedDB)  │◄──sync──►  PostgreSQL          │
│  - products          │         │  - products          │
│  - customers         │         │  - customers         │
│  - price_lists       │         │  - price_lists       │
│  - orders (pending)  │         │  - orders            │
│  - settings          │         │  - settings          │
│                      │         │                      │
│  Service Worker      │         │  Hono API            │
│  - App shell cache   │         │  - Sync endpoints    │
│  - Static assets     │         │  - Business logic    │
└──────────────────────┘         └──────────────────────┘
```

**Sync Protocol:**
1. Client tạo đơn hàng offline → lưu PGlite với `sync_status = 'pending'`, `client_id = UUID`
2. Khi có mạng → Background Sync API trigger sync
3. Client gửi batch pending orders lên server
4. Server xử lý từng order:
   - Validate lại (giá, tồn kho, hạn mức nợ)
   - Insert vào PostgreSQL
   - Trả về `sync_status = 'synced'` + `server_id`
5. Client cập nhật `sync_status` trong PGlite

**Conflict Resolution:**

| Data type | Strategy | Lý do |
|-----------|----------|-------|
| Tồn kho | Server wins | Server có truth duy nhất, nhiều client ghi |
| Đơn hàng | Client wins | Đơn đã tạo = cam kết với KH |
| Sản phẩm | Server wins | Chỉ owner/manager sửa |
| Khách hàng | Server wins | Tránh duplicate |
| Bảng giá | Server wins | Giá phải consistent |
| Settings | Server wins | Owner control |

**Initial Sync (lần đầu mở app):**
- Download toàn bộ: products, customers, price_lists, settings
- Lưu vào PGlite persistent storage (IndexedDB)
- Incremental sync sau đó (dùng `updated_at` watermark)

**Service Worker:**
- Precache app shell + static assets (Workbox)
- Runtime cache cho API responses
- Background Sync cho offline orders

---

### Authentication & Security

| Quyết định | Giá trị | Phiên bản |
|-----------|---------|-----------|
| Auth library | Better Auth | 1.6.x |
| Token strategy | JWT access + refresh token rotation | — |
| Password hash | Argon2id (via Better Auth) | — |
| PIN hash | bcrypt (6 digit PIN) | — |

**Auth Flow:**

```
Login (SĐT + password) → JWT access token (15min) + refresh token (7 ngày)
                         → Lưu access token trong memory
                         → Lưu refresh token trong httpOnly cookie
                         → Refresh tự động khi access token hết hạn
```

**Authorization — 3 Role:**

| Permission | Owner | Manager | Staff |
|-----------|-------|---------|-------|
| Quản lý SP, KH, NCC | ✅ | ✅ | ❌ |
| Bán hàng (POS) | ✅ | ✅ | ✅ |
| Sửa giá trên đơn | ✅ | Tùy cài đặt | Tùy cài đặt |
| Sửa giá dưới vốn | PIN | ❌ | ❌ |
| Override hạn mức nợ | PIN | ❌ | ❌ |
| Trả hàng | ✅ | ✅ | ❌ |
| Điều chỉnh nợ | ✅ | ❌ | ❌ |
| Báo cáo | ✅ | ✅ | Dashboard only |
| Quản lý NV | ✅ | ❌ | ❌ |
| Cài đặt cửa hàng | ✅ | ❌ | ❌ |

**PIN System:**
- 6 chữ số, hash bằng bcrypt
- Rate-limit: 5 lần sai → khoá 15 phút
- Dùng cho: sửa giá dưới vốn, override hạn mức nợ
- Kiểm tra offline (PIN hash lưu trong PGlite)

**Multi-tenancy:**
- Tenant = Store (cửa hàng)
- `store_id` trong JWT payload
- Mọi query filter theo `store_id`
- Middleware tự inject `store_id` vào mọi request

**Audit Log:**
- Append-only table: `audit_logs`
- Ghi: sửa giá, điều chỉnh nợ, override hạn mức, xóa dữ liệu, đăng nhập
- Fields: `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `user_id`, `created_at`
- Không cho phép xóa/sửa audit log (DB constraint)

---

### API & Communication

| Quyết định | Giá trị | Phiên bản |
|-----------|---------|-----------|
| Backend framework | Hono | 4.12.x |
| API style | REST (resource-based) | — |
| Validation | Zod (shared schemas) | 3.x |
| API docs | OpenAPI via @hono/zod-openapi | — |

**Rationale chọn Hono:**
- Nhẹ, nhanh, Web Standards-based
- Middleware ecosystem tốt (cors, jwt, zod-validator, rate-limit)
- Type-safe với Zod integration
- Chạy trên Node.js, Bun, Cloudflare Workers — linh hoạt deploy
- DX tốt hơn Express cho TypeScript project

**API Response Format:**

```typescript
// Success
{
  "data": T,
  "meta": { "page": 1, "pageSize": 20, "total": 150 }  // cho list
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Giá bán không được nhỏ hơn 0",
    "details": [{ "field": "price", "message": "..." }]
  }
}
```

**Error Codes chuẩn hóa:**

| HTTP Status | Code | Mô tả |
|-------------|------|-------|
| 400 | VALIDATION_ERROR | Input không hợp lệ |
| 401 | UNAUTHORIZED | Chưa đăng nhập |
| 403 | FORBIDDEN | Không có quyền |
| 403 | PIN_REQUIRED | Cần PIN owner |
| 404 | NOT_FOUND | Resource không tồn tại |
| 409 | CONFLICT | Xung đột dữ liệu (sync) |
| 422 | BUSINESS_RULE_VIOLATION | Vi phạm business rule (vượt hạn mức nợ) |
| 429 | RATE_LIMITED | Quá nhiều request |
| 500 | INTERNAL_ERROR | Lỗi server |

**API Endpoint Pattern:**

```
GET    /api/v1/{resource}          → List (paginated)
GET    /api/v1/{resource}/:id      → Detail
POST   /api/v1/{resource}          → Create
PATCH  /api/v1/{resource}/:id      → Update (partial)
DELETE /api/v1/{resource}/:id      → Soft delete

POST   /api/v1/sync/push           → Push offline data
GET    /api/v1/sync/pull?since=    → Pull updates since timestamp
```

**Rate Limiting:**
- Auth endpoints: 5 req/min per IP
- PIN verify: 5 attempts, lockout 15 min
- General API: 100 req/min per user
- Sync endpoints: 10 req/min per user

---

### Frontend Architecture

| Quyết định | Giá trị | Phiên bản |
|-----------|---------|-----------|
| UI Framework | React | 19.2.x |
| Build tool | Vite | 8.0.x |
| Routing | TanStack Router | 1.168.x |
| Server state | TanStack Query | 5.99.x |
| Client state | Zustand | 5.0.x |
| Styling | Tailwind CSS | 4.2.x |
| Component library | shadcn/ui | latest (2026) |
| Forms | React Hook Form + Zod | — |
| Barcode scanner | html5-qrcode | — |
| Virtual scroll | @tanstack/react-virtual | — |
| Icons | Lucide React | — |

**State Management Strategy:**

```
┌─────────────────────────────────────────┐
│              Zustand Stores              │
│  ┌─────────┐ ┌──────┐ ┌──────────────┐ │
│  │ cartStore│ │uiStore│ │ offlineStore │ │
│  │ (POS)    │ │(theme,│ │ (sync queue, │ │
│  │          │ │modals)│ │  status)     │ │
│  └─────────┘ └──────┘ └──────────────┘ │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│           TanStack Query                 │
│  Server state: products, customers,      │
│  orders, reports, price lists            │
│  Cache + background refetch              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│              PGlite                      │
│  Offline data store: full local DB       │
│  Query trực tiếp bằng Drizzle            │
└─────────────────────────────────────────┘
```

- **Zustand** cho UI state thuần (cart/giỏ hàng POS, theme, modal state, sidebar, offline status)
- **TanStack Query** cho server data (products, customers, orders) — cache, refetch, optimistic updates
- **PGlite** cho offline reads — khi offline, query trực tiếp PGlite thay vì API

**Routing Structure:**

```
/                    → Redirect to /pos hoặc /dashboard
/login               → Đăng nhập
/pos                 → POS bán hàng (mobile-first)
/products            → Quản lý hàng hóa
/products/:id        → Chi tiết sản phẩm
/customers           → Quản lý khách hàng
/customers/:id       → Chi tiết khách hàng
/orders              → Danh sách hóa đơn
/orders/:id          → Chi tiết hóa đơn
/inventory           → Nhập hàng / kiểm kho
/inventory/import    → Tạo phiếu nhập
/inventory/check     → Kiểm kho
/pricing             → Quản lý bảng giá
/pricing/:id         → Chi tiết bảng giá
/debts               → Quản lý công nợ
/debts/receipts      → Phiếu thu/chi
/reports             → Báo cáo
/reports/dashboard   → Dashboard
/settings            → Cài đặt cửa hàng
/settings/staff      → Quản lý nhân viên
/settings/printing   → Cài đặt mẫu in
```

**Component Architecture:**

```
components/
├── ui/          → shadcn/ui components (Button, Input, Dialog, ...)
├── layout/      → Layout components (Sidebar, Header, MobileNav)
├── pos/         → POS-specific components (Cart, ProductGrid, PaymentDialog)
├── products/    → Product components (ProductForm, ProductCard, VariantEditor)
├── customers/   → Customer components (CustomerForm, CustomerCard)
├── orders/      → Order components (OrderDetail, OrderList, ReturnDialog)
├── pricing/     → Pricing components (PriceListEditor, PriceCompare)
├── debts/       → Debt components (DebtSummary, ReceiptForm)
├── reports/     → Report components (Charts, DashboardCards)
└── shared/      → Shared components (SearchInput, DataTable, PrintPreview)
```

---

### Printing Architecture

**Hai channel in:**

| Channel | Target | Format | Công nghệ |
|---------|--------|--------|-----------|
| Thermal | Máy in nhiệt 58mm/80mm | ESC/POS binary | Web Serial API / WebUSB |
| Paper | A4/A5 (bán buôn) | HTML → PDF | CSS @media print + window.print() |

**Thermal Printing Flow:**
1. User bấm "In hóa đơn" → build ESC/POS commands
2. Kết nối printer qua Web Serial hoặc USB
3. Gửi binary data trực tiếp
4. Fallback: generate image + `window.print()` nếu không kết nối được

**Print Template Engine:**
- Template là Zod-typed config object (không phải string template)
- Mỗi cửa hàng tùy chỉnh: logo, slogan, ẩn/hiện trường
- Render phía client (hoạt động offline)

---

### Infrastructure & Deployment

| Quyết định | Giá trị |
|-----------|---------|
| Hosting frontend | Vercel hoặc Cloudflare Pages (static SPA) |
| Hosting backend | Railway hoặc Fly.io (Node.js container) |
| Database hosting | Neon PostgreSQL (serverless, auto-scale) |
| CDN | Cloudflare (free tier) |
| File storage | Cloudflare R2 (S3-compatible, free egress) |
| CI/CD | GitHub Actions |
| Monitoring | Sentry (error tracking) |

**Rationale:**
- **Vercel/CF Pages** cho SPA — deploy tự động từ git, global CDN, free tier đủ
- **Railway/Fly.io** cho API — container deployment, auto-scaling, affordable
- **Neon** cho PostgreSQL — serverless (scale-to-zero), branching cho dev, free tier 0.5GB
- **Cloudflare R2** cho images — S3-compatible, không tính phí egress

**Environment Strategy:**

```
development  → local (Vite dev + Hono dev + PGlite + local PostgreSQL)
staging      → preview deploys (PR-based)
production   → main branch auto-deploy
```

---

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database Naming:**

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Table | snake_case, số nhiều | `products`, `order_items`, `price_lists` |
| Column | snake_case | `created_at`, `store_id`, `unit_price` |
| Foreign key | `{table_singular}_id` | `product_id`, `customer_id` |
| Index | `idx_{table}_{columns}` | `idx_products_barcode`, `idx_orders_store_date` |
| Enum | snake_case | `sync_status`, `payment_method` |
| Boolean column | `is_` hoặc `has_` hoặc `can_` prefix | `is_active`, `has_variants`, `can_edit_price` |

**API Naming:**

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Endpoint | kebab-case, số nhiều | `/api/v1/price-lists`, `/api/v1/order-items` |
| Path param | `:id` (camelCase) | `/api/v1/products/:productId` |
| Query param | camelCase | `?pageSize=20&sortBy=createdAt` |
| JSON field | camelCase | `{ "unitPrice": 85000, "createdAt": "..." }` |

**Code Naming:**

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Component | PascalCase | `ProductCard`, `PaymentDialog` |
| File (component) | PascalCase.tsx | `ProductCard.tsx`, `PaymentDialog.tsx` |
| File (non-component) | kebab-case.ts | `pricing-engine.ts`, `sync-worker.ts` |
| File (hook) | use-*.ts | `use-cart.ts`, `use-offline-status.ts` |
| Function | camelCase | `calculateWeightedAvgCost()`, `applyPriceTier()` |
| Variable | camelCase | `unitPrice`, `syncStatus` |
| Constant | UPPER_SNAKE_CASE | `MAX_CART_TABS`, `SYNC_BATCH_SIZE` |
| Type/Interface | PascalCase | `Product`, `OrderItem`, `PriceList` |
| Zustand store | use{Name}Store | `useCartStore`, `useUiStore` |
| Zod schema | {name}Schema | `productSchema`, `orderItemSchema` |

### Structure Patterns

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

### Format Patterns

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

### Communication Patterns

**Event Naming (cho sync & state):**

| Pattern | Ví dụ |
|---------|-------|
| `{entity}.{action}` | `order.created`, `product.updated`, `price.changed` |
| Past tense | `synced`, `created`, `updated`, `deleted` |

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

### Process Patterns

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

### Enforcement Guidelines

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

## Project Structure & Boundaries

### Complete Project Directory Structure

```
kiotviet-lite/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml            # pnpm workspace config
├── tsconfig.base.json             # Shared TS config
├── .gitignore
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Lint, test, build
│       └── deploy.yml             # Deploy to production
│
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts           # Public API
│           ├── schemas/           # Zod schemas (shared validation)
│           │   ├── product.ts
│           │   ├── customer.ts
│           │   ├── order.ts
│           │   ├── price-list.ts
│           │   ├── debt.ts
│           │   ├── inventory.ts
│           │   └── auth.ts
│           ├── types/             # TypeScript types (inferred from Zod)
│           │   └── index.ts
│           ├── constants/         # Shared constants
│           │   ├── roles.ts       # Owner, Manager, Staff
│           │   ├── permissions.ts
│           │   ├── sync-status.ts
│           │   └── error-codes.ts
│           └── utils/             # Pure utility functions
│               ├── pricing-engine.ts    # 6-tier pricing logic
│               ├── debt-allocator.ts    # FIFO debt allocation
│               ├── weighted-avg-cost.ts # Giá vốn BQ gia quyền
│               ├── currency.ts          # Format VND
│               └── validators.ts        # Business rule validators
│
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── manifest.json      # PWA manifest
│   │   │   ├── sw.js              # Service Worker (Workbox)
│   │   │   ├── icons/             # PWA icons
│   │   │   └── fonts/             # Vietnamese fonts
│   │   ├── e2e/                   # Playwright E2E tests
│   │   │   ├── pos.spec.ts
│   │   │   ├── pricing.spec.ts
│   │   │   └── offline.spec.ts
│   │   └── src/
│   │       ├── main.tsx           # App entry
│   │       ├── App.tsx            # Root component + providers
│   │       ├── router.tsx         # TanStack Router config
│   │       ├── globals.css        # Tailwind imports
│   │       │
│   │       ├── components/
│   │       │   ├── ui/            # shadcn/ui components
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   ├── Dialog.tsx
│   │       │   │   ├── DataTable.tsx
│   │       │   │   └── ...
│   │       │   ├── layout/
│   │       │   │   ├── AppLayout.tsx
│   │       │   │   ├── Sidebar.tsx
│   │       │   │   ├── Header.tsx
│   │       │   │   ├── MobileNav.tsx
│   │       │   │   └── ErrorBoundary.tsx
│   │       │   └── shared/
│   │       │       ├── SearchInput.tsx
│   │       │       ├── CurrencyDisplay.tsx
│   │       │       ├── SyncStatusBadge.tsx
│   │       │       ├── OfflineBanner.tsx
│   │       │       └── PrintPreview.tsx
│   │       │
│   │       ├── features/
│   │       │   ├── pos/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PosScreen.tsx
│   │       │   │   │   ├── ProductGrid.tsx
│   │       │   │   │   ├── CartPanel.tsx
│   │       │   │   │   ├── CartItem.tsx
│   │       │   │   │   ├── PaymentDialog.tsx
│   │       │   │   │   ├── CustomerSelect.tsx
│   │       │   │   │   ├── BarcodeScanner.tsx
│   │       │   │   │   └── PriceSourceBadge.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   ├── use-cart.ts
│   │       │   │   │   ├── use-barcode.ts
│   │       │   │   │   └── use-payment.ts
│   │       │   │   └── pos.test.tsx
│   │       │   │
│   │       │   ├── products/
│   │       │   │   ├── components/
│   │       │   │   │   ├── ProductList.tsx
│   │       │   │   │   ├── ProductForm.tsx
│   │       │   │   │   ├── ProductDetail.tsx
│   │       │   │   │   ├── VariantEditor.tsx
│   │       │   │   │   ├── UnitConversion.tsx
│   │       │   │   │   └── CategoryTree.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-products.ts
│   │       │   │   └── products.test.tsx
│   │       │   │
│   │       │   ├── customers/
│   │       │   │   ├── components/
│   │       │   │   │   ├── CustomerList.tsx
│   │       │   │   │   ├── CustomerForm.tsx
│   │       │   │   │   ├── CustomerDetail.tsx
│   │       │   │   │   └── CustomerGroupManager.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-customers.ts
│   │       │   │   └── customers.test.tsx
│   │       │   │
│   │       │   ├── orders/
│   │       │   │   ├── components/
│   │       │   │   │   ├── OrderList.tsx
│   │       │   │   │   ├── OrderDetail.tsx
│   │       │   │   │   └── ReturnDialog.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-orders.ts
│   │       │   │   └── orders.test.tsx
│   │       │   │
│   │       │   ├── pricing/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PriceListManager.tsx
│   │       │   │   │   ├── PriceListEditor.tsx
│   │       │   │   │   ├── PriceCompare.tsx
│   │       │   │   │   ├── ChainFormulaEditor.tsx
│   │       │   │   │   └── CascadePreview.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-pricing.ts
│   │       │   │   └── pricing.test.tsx
│   │       │   │
│   │       │   ├── inventory/
│   │       │   │   ├── components/
│   │       │   │   │   ├── PurchaseOrderForm.tsx
│   │       │   │   │   ├── PurchaseOrderList.tsx
│   │       │   │   │   ├── StockCheckForm.tsx
│   │       │   │   │   └── SupplierManager.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-inventory.ts
│   │       │   │   └── inventory.test.tsx
│   │       │   │
│   │       │   ├── debts/
│   │       │   │   ├── components/
│   │       │   │   │   ├── DebtDashboard.tsx
│   │       │   │   │   ├── ReceiptForm.tsx
│   │       │   │   │   ├── DebtAdjustment.tsx
│   │       │   │   │   └── DebtAgingReport.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-debts.ts
│   │       │   │   └── debts.test.tsx
│   │       │   │
│   │       │   ├── reports/
│   │       │   │   ├── components/
│   │       │   │   │   ├── Dashboard.tsx
│   │       │   │   │   ├── RevenueReport.tsx
│   │       │   │   │   ├── ProfitReport.tsx
│   │       │   │   │   ├── InventoryReport.tsx
│   │       │   │   │   └── Charts.tsx
│   │       │   │   ├── hooks/
│   │       │   │   │   └── use-reports.ts
│   │       │   │   └── reports.test.tsx
│   │       │   │
│   │       │   ├── auth/
│   │       │   │   ├── components/
│   │       │   │   │   ├── LoginForm.tsx
│   │       │   │   │   └── PinDialog.tsx
│   │       │   │   └── hooks/
│   │       │   │       └── use-auth.ts
│   │       │   │
│   │       │   └── settings/
│   │       │       ├── components/
│   │       │       │   ├── StoreSettings.tsx
│   │       │       │   ├── StaffManager.tsx
│   │       │       │   └── PrintSettings.tsx
│   │       │       └── hooks/
│   │       │           └── use-settings.ts
│   │       │
│   │       ├── stores/              # Zustand stores
│   │       │   ├── cart.ts          # POS cart state
│   │       │   ├── ui.ts            # UI state (theme, sidebar, modals)
│   │       │   └── offline.ts       # Offline/sync status
│   │       │
│   │       ├── lib/
│   │       │   ├── api-client.ts    # Hono RPC client / fetch wrapper
│   │       │   ├── pglite.ts        # PGlite instance & setup
│   │       │   ├── sync.ts          # Sync engine
│   │       │   ├── print/
│   │       │   │   ├── thermal.ts   # ESC/POS commands
│   │       │   │   ├── paper.ts     # A4/A5 HTML print
│   │       │   │   └── templates.ts # Print template configs
│   │       │   ├── auth.ts          # Better Auth client
│   │       │   ├── query-client.ts  # TanStack Query config
│   │       │   └── utils.ts         # UI utility functions
│   │       │
│   │       ├── hooks/               # Global hooks
│   │       │   ├── use-offline-status.ts
│   │       │   ├── use-keyboard-shortcuts.ts
│   │       │   └── use-responsive.ts
│   │       │
│   │       └── routes/              # TanStack Router route files
│   │           ├── __root.tsx
│   │           ├── _authenticated.tsx    # Auth layout
│   │           ├── _authenticated/
│   │           │   ├── pos.tsx
│   │           │   ├── products/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $productId.tsx
│   │           │   ├── customers/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $customerId.tsx
│   │           │   ├── orders/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $orderId.tsx
│   │           │   ├── inventory/
│   │           │   │   ├── index.tsx
│   │           │   │   ├── import.tsx
│   │           │   │   └── check.tsx
│   │           │   ├── pricing/
│   │           │   │   ├── index.tsx
│   │           │   │   └── $priceListId.tsx
│   │           │   ├── debts/
│   │           │   │   ├── index.tsx
│   │           │   │   └── receipts.tsx
│   │           │   ├── reports/
│   │           │   │   ├── index.tsx
│   │           │   │   └── dashboard.tsx
│   │           │   └── settings/
│   │           │       ├── index.tsx
│   │           │       ├── staff.tsx
│   │           │       └── printing.tsx
│   │           └── login.tsx
│   │
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts               # Entry point (Hono app)
│           ├── app.ts                 # Hono app setup + middleware
│           │
│           ├── db/
│           │   ├── index.ts           # Drizzle client
│           │   ├── schema/            # Drizzle schema definitions
│           │   │   ├── products.ts
│           │   │   ├── customers.ts
│           │   │   ├── orders.ts
│           │   │   ├── price-lists.ts
│           │   │   ├── debts.ts
│           │   │   ├── inventory.ts
│           │   │   ├── users.ts
│           │   │   ├── stores.ts
│           │   │   ├── audit-logs.ts
│           │   │   └── index.ts       # Re-export all schemas
│           │   └── migrations/        # Drizzle Kit migrations
│           │
│           ├── routes/                # Hono route handlers
│           │   ├── auth.ts
│           │   ├── products.ts
│           │   ├── customers.ts
│           │   ├── orders.ts
│           │   ├── price-lists.ts
│           │   ├── debts.ts
│           │   ├── inventory.ts
│           │   ├── reports.ts
│           │   ├── sync.ts
│           │   └── settings.ts
│           │
│           ├── services/              # Business logic
│           │   ├── pricing.ts         # Pricing engine (server-side)
│           │   ├── debt.ts            # Debt management + FIFO
│           │   ├── inventory.ts       # Stock management + WAC
│           │   ├── order.ts           # Order processing
│           │   ├── sync.ts            # Sync logic + conflict resolution
│           │   └── audit.ts           # Audit log service
│           │
│           ├── middleware/
│           │   ├── auth.ts            # JWT verification
│           │   ├── tenant.ts          # Multi-tenant store_id injection
│           │   ├── rate-limit.ts      # Rate limiting
│           │   └── error-handler.ts   # Global error handler
│           │
│           └── __tests__/             # API integration tests
│               ├── auth.test.ts
│               ├── orders.test.ts
│               ├── pricing.test.ts
│               └── sync.test.ts
```

### Architectural Boundaries

**API Boundaries:**

```
Client (apps/web) ──HTTP/JSON──► API (apps/api)
                                    │
                                    ├── routes/ (HTTP layer, validation)
                                    ├── services/ (business logic)
                                    └── db/ (data access via Drizzle)
```

- Routes: parse request, validate input (Zod), call service, format response
- Services: business logic thuần, không biết HTTP, nhận typed params
- DB: Drizzle queries, không business logic

**Component Boundaries:**
- Feature folders tự chứa — không import cross-feature
- Shared code qua `components/shared/` hoặc `packages/shared`
- Hooks encapsulate data fetching — components chỉ render

**Data Flow:**

```
User action → Component → Hook → 
  ├── Online: TanStack Query → API → Service → DB
  └── Offline: PGlite (local) + Sync queue
```

### Requirements to Structure Mapping

| Module PRD | Frontend | Backend | Shared |
|-----------|----------|---------|--------|
| M1: Hàng hóa | features/products/ | routes/products.ts, services/inventory.ts | schemas/product.ts |
| M2: Đơn giá | features/pricing/ | routes/price-lists.ts, services/pricing.ts | schemas/price-list.ts, utils/pricing-engine.ts |
| M3: POS | features/pos/ | routes/orders.ts, services/order.ts | schemas/order.ts |
| M4: Khách hàng | features/customers/ | routes/customers.ts | schemas/customer.ts |
| M5: Hóa đơn | features/orders/ | routes/orders.ts | schemas/order.ts |
| M6: Công nợ | features/debts/ | routes/debts.ts, services/debt.ts | schemas/debt.ts, utils/debt-allocator.ts |
| M7: Báo cáo | features/reports/ | routes/reports.ts | — |
| Offline | stores/offline.ts, lib/sync.ts, lib/pglite.ts | routes/sync.ts, services/sync.ts | constants/sync-status.ts |
| Auth | features/auth/ | routes/auth.ts, middleware/auth.ts | schemas/auth.ts, constants/roles.ts |

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- Vite 8 + React 19 + TypeScript: tương thích hoàn toàn
- Drizzle ORM hoạt động với cả PostgreSQL (server) và PGlite (browser) — đây là lý do chính chọn Drizzle
- Hono + Zod: native integration qua @hono/zod-validator
- TanStack Router + TanStack Query: cùng ecosystem, type-safe
- shadcn/ui + Tailwind CSS 4: tương thích native
- Better Auth: framework-agnostic, hoạt động với Hono

**Pattern Consistency:**
- camelCase JSON ↔ snake_case DB: transform ở Drizzle layer (cấu hình `.camelCase()`)
- Zod schemas dùng chung: validate cùng logic ở cả client và server
- Pricing engine chạy được cả 2 phía nhờ pure function trong `packages/shared`

**Structure Alignment:**
- Monorepo 3 packages đủ cho scale hiện tại
- Feature-based organization phù hợp 7 module PRD
- Clear separation: routes → services → db

### Requirements Coverage Validation ✅

**Functional Requirements:**

| Module | FRs | Covered | Ghi chú |
|--------|-----|---------|---------|
| Hàng hóa | FR1-FR7 | ✅ | Drizzle schema + CRUD API |
| Nhập hàng | FR8-FR12 | ✅ | Inventory service + WAC calc |
| Đơn giá | FR13-FR25 | ✅ | Pricing engine shared + cascade |
| POS | FR26-FR35 | ✅ | React SPA + barcode + keyboard shortcuts |
| Offline | FR36-FR39 | ✅ | PGlite + Service Worker + Background Sync |
| Khách hàng | FR40-FR45 | ✅ | CRUD + group pricing integration |
| Hóa đơn | FR46-FR51 | ✅ | Print engine (thermal + A4) |
| Công nợ | FR52-FR58 | ✅ | FIFO allocator + debt limits |
| Báo cáo | FR59-FR64 | ✅ | SQL aggregation + charts |
| Quyền hạn | FR65-FR67 | ✅ | Better Auth + role middleware + PIN |

**Non-Functional Requirements:**

| NFR | Covered | Giải pháp |
|-----|---------|-----------|
| NF1: Search < 200ms | ✅ | PGlite local query + index on barcode/SKU/name |
| NF2: Tạo đơn < 500ms | ✅ | PGlite local write + async sync |
| NF3: Tải trang < 2s | ✅ | Vite code-splitting + SPA cache |
| NF4: POS ≥ 30fps | ✅ | React 19 concurrent + virtual scroll |
| NF5-NF9: Security | ✅ | TLS + Argon2 + JWT + PIN hash + audit log |
| NF10-NF13: Scale | ✅ | PostgreSQL + PGlite index + pagination |
| NF14-NF16: Offline | ✅ | PGlite + Service Worker + Background Sync |
| NF17-NF19: Compat | ✅ | Responsive + ESC/POS + html5-qrcode |

### Implementation Readiness ✅

**Decision Completeness:**
- Tất cả technology đã chọn version cụ thể (verified tháng 4/2026)
- Mọi pattern có ví dụ cụ thể
- Naming convention bao phủ DB, API, code
- Enforcement rules rõ ràng cho AI agents

**Potential Risks:**

| Risk | Mitigation |
|------|------------|
| PGlite chưa v1.0 (đang 0.4) | Community lớn (13M downloads/tuần), Electric SQL maintain tích cực |
| Drizzle chưa v1.0 (0.45) | Stable đủ cho production, beta 1.0 sắp ra |
| Offline sync complexity | Giữ conflict resolution đơn giản (server/client wins), không hỗ trợ edit đơn offline |
| Thermal printing browser support | Web Serial API limited trên iOS Safari → fallback print image |

### Architecture Completeness Checklist

- [x] Project context phân tích kỹ
- [x] Scale & complexity đánh giá
- [x] Technical constraints xác định
- [x] Cross-cutting concerns mapped
- [x] Technology stack hoàn chỉnh với versions
- [x] Offline/sync architecture thiết kế chi tiết
- [x] Authentication & authorization đầy đủ
- [x] API design patterns & error handling
- [x] Frontend state management strategy
- [x] Naming conventions toàn diện
- [x] Project structure cụ thể đến file
- [x] Requirements → structure mapping
- [x] Validation passed

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Điểm mạnh:**
- Offline-first architecture với PGlite giải quyết gọn gàng requirement phức tạp nhất
- Shared Drizzle schema + Zod giảm code duplication client/server
- Stack hiện đại, nhẹ, phù hợp team nhỏ (1-2 dev)
- Feature-based organization map trực tiếp 7 module PRD

**Cần chú ý khi implement:**
- Sync engine là phần phức tạp nhất — implement đơn giản trước, tối ưu sau
- Pricing engine cần test kỹ 6 tầng ưu tiên + chain formula cycle detection
- Thermal printing cần test trên thiết bị thật sớm
- iOS Safari có limitation với Web Serial — cần fallback plan

**Implementation Priority:**
1. Khởi tạo monorepo + shared schemas
2. M3 (POS) + M1 (Hàng hóa) — core value
3. M2 (Đơn giá) — differentiator
4. M6 (Công nợ) + M4 (KH)
5. M5 (Hóa đơn) + M7 (Báo cáo)
6. Offline sync
7. Polish & deploy
