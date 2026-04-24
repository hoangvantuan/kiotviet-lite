# Core Architectural Decisions

## Decision Priority Analysis

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

## Monorepo & Package Management

| Quyết định      | Giá trị                                                               |
| --------------- | --------------------------------------------------------------------- |
| Monorepo tool   | pnpm workspaces (đơn giản, nhanh, không cần Turborepo cho 3 packages) |
| Package manager | pnpm ≥ 9.x                                                            |
| Node.js         | ≥ 22 LTS                                                              |


**Cấu trúc workspace:**

```
apps/web      → Frontend SPA/PWA
apps/api      → Backend API
packages/shared → Types, Zod schemas, utils, constants dùng chung
```

**Rationale:** pnpm workspaces đủ cho monorepo 3 packages. Turborepo/Nx thêm complexity không cần thiết ở quy mô này.

---

## Data Architecture

| Quyết định           | Giá trị     | Phiên bản           |
| -------------------- | ----------- | ------------------- |
| Database (server)    | PostgreSQL  | ≥ 16                |
| ORM                  | Drizzle ORM | 0.45.x (stable)     |
| Migration            | Drizzle Kit | Bundled với Drizzle |
| Offline DB (browser) | PGlite      | 0.4.x               |
| Validation           | Zod         | 3.x                 |


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

## Offline & Sync Architecture

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

| Data type  | Strategy    | Lý do                                      |
| ---------- | ----------- | ------------------------------------------ |
| Tồn kho    | Server wins | Server có truth duy nhất, nhiều client ghi |
| Đơn hàng   | Client wins | Đơn đã tạo = cam kết với KH                |
| Sản phẩm   | Server wins | Chỉ owner/manager sửa                      |
| Khách hàng | Server wins | Tránh duplicate                            |
| Bảng giá   | Server wins | Giá phải consistent                        |
| Settings   | Server wins | Owner control                              |


**Initial Sync (lần đầu mở app):**

- Download toàn bộ: products, customers, price_lists, settings
- Lưu vào PGlite persistent storage (IndexedDB)
- Incremental sync sau đó (dùng `updated_at` watermark)

**Service Worker:**

- Precache app shell + static assets (Workbox)
- Runtime cache cho API responses
- Background Sync cho offline orders

---

## Authentication & Security

| Quyết định     | Giá trị                             | Phiên bản |
| -------------- | ----------------------------------- | --------- |
| Auth library   | Better Auth                         | 1.6.x     |
| Token strategy | JWT access + refresh token rotation | —         |
| Password hash  | Argon2id (via Better Auth)          | —         |
| PIN hash       | bcrypt (6 digit PIN)                | —         |


**Auth Flow:**

```
Login (SĐT + password) → JWT access token (15min) + refresh token (7 ngày)
                         → Lưu access token trong memory
                         → Lưu refresh token trong httpOnly cookie
                         → Refresh tự động khi access token hết hạn
```

**Authorization — 3 Role:**

| Permission          | Owner | Manager     | Staff          |
| ------------------- | ----- | ----------- | -------------- |
| Quản lý SP, KH, NCC | ✅     | ✅           | ❌              |
| Bán hàng (POS)      | ✅     | ✅           | ✅              |
| Sửa giá trên đơn    | ✅     | Tùy cài đặt | Tùy cài đặt    |
| Sửa giá dưới vốn    | PIN   | ❌           | ❌              |
| Override hạn mức nợ | PIN   | ❌           | ❌              |
| Trả hàng            | ✅     | ✅           | ❌              |
| Điều chỉnh nợ       | ✅     | ❌           | ❌              |
| Báo cáo             | ✅     | ✅           | Dashboard only |
| Quản lý NV          | ✅     | ❌           | ❌              |
| Cài đặt cửa hàng    | ✅     | ❌           | ❌              |


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

## API & Communication

| Quyết định        | Giá trị                       | Phiên bản |
| ----------------- | ----------------------------- | --------- |
| Backend framework | Hono                          | 4.12.x    |
| API style         | REST (resource-based)         | —         |
| Validation        | Zod (shared schemas)          | 3.x       |
| API docs          | OpenAPI via @hono/zod-openapi | —         |


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

| HTTP Status | Code                    | Mô tả                                   |
| ----------- | ----------------------- | --------------------------------------- |
| 400         | VALIDATION_ERROR        | Input không hợp lệ                      |
| 401         | UNAUTHORIZED            | Chưa đăng nhập                          |
| 403         | FORBIDDEN               | Không có quyền                          |
| 403         | PIN_REQUIRED            | Cần PIN owner                           |
| 404         | NOT_FOUND               | Resource không tồn tại                  |
| 409         | CONFLICT                | Xung đột dữ liệu (sync)                 |
| 422         | BUSINESS_RULE_VIOLATION | Vi phạm business rule (vượt hạn mức nợ) |
| 429         | RATE_LIMITED            | Quá nhiều request                       |
| 500         | INTERNAL_ERROR          | Lỗi server                              |


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

## Frontend Architecture

| Quyết định        | Giá trị                 | Phiên bản     |
| ----------------- | ----------------------- | ------------- |
| UI Framework      | React                   | 19.2.x        |
| Build tool        | Vite                    | 8.0.x         |
| Routing           | TanStack Router         | 1.168.x       |
| Server state      | TanStack Query          | 5.99.x        |
| Client state      | Zustand                 | 5.0.x         |
| Styling           | Tailwind CSS            | 4.2.x         |
| Component library | shadcn/ui               | latest (2026) |
| Forms             | React Hook Form + Zod   | —             |
| Barcode scanner   | html5-qrcode            | —             |
| Virtual scroll    | @tanstack/react-virtual | —             |
| Icons             | Lucide React            | —             |


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

## Printing Architecture

**Hai channel in:**

| Channel | Target                 | Format         | Công nghệ primary | Fallback                          |
| ------- | ---------------------- | -------------- | ------------------ | --------------------------------- |
| Thermal | Máy in nhiệt 58mm/80mm | ESC/POS binary | Web Serial API     | CSS @media print + window.print() |
| Paper   | A4/A5 (bán buôn)       | HTML           | CSS @media print   | Không cần                         |

**Chiến lược thống nhất:** Web Serial API là kênh chính cho máy in nhiệt. CSS `@media print` + `window.print()` là fallback duy nhất. **Không dùng image generation** (canvas → PNG) vì chậm, mờ, tốn bộ nhớ.

**Thermal Printing Flow:**

1. User bấm "In hóa đơn" → build ESC/POS commands (text + formatting)
2. Kiểm tra thiết bị đã pair chưa (lưu trong `print_settings`)
3. Đã pair → gửi ESC/POS binary qua Web Serial
4. Chưa pair hoặc lỗi kết nối → fallback CSS `@media print` + `window.print()`

**Web Serial Permission Flow:**

```
Lần đầu: User bấm "Kết nối máy in" (button rõ ràng, không popup tự động)
       → Browser hiện native Serial port picker
       → User chọn thiết bị → lưu vendorId + productId vào print_settings
       → Test print 1 dòng "KiotViet Lite ✓"

Lần sau: Auto-reconnect bằng saved vendorId + productId
       → Nếu fail (máy in tắt, rút cáp) → hiện toast "Máy in không phản hồi"
       → User có thể in bằng fallback hoặc kết nối lại
```

**Print Template Data Model:**

```sql
CREATE TABLE print_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  printer_type TEXT NOT NULL DEFAULT 'thermal_58mm',
  paper_width INT NOT NULL DEFAULT 58,
  vendor_id INT,
  product_id INT,
  show_logo BOOLEAN DEFAULT true,
  logo_url TEXT,
  store_slogan TEXT,
  show_customer_name BOOLEAN DEFAULT true,
  show_customer_phone BOOLEAN DEFAULT true,
  show_item_sku BOOLEAN DEFAULT false,
  footer_text TEXT DEFAULT 'Cảm ơn quý khách!',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Print Template Engine:**

- Template là Zod-typed config object (không phải string template)
- Mỗi cửa hàng tùy chỉnh: logo, slogan, ẩn/hiện trường (theo `print_settings`)
- Render phía client (hoạt động offline)
- ESC/POS builder: `packages/shared/src/printing/escpos-builder.ts` (pure function, testable)

---

## Infrastructure & Deployment

| Quyết định       | Giá trị                                    |
| ---------------- | ------------------------------------------ |
| Hosting frontend | Vercel hoặc Cloudflare Pages (static SPA)  |
| Hosting backend  | Railway hoặc Fly.io (Node.js container)    |
| Database hosting | Neon PostgreSQL (serverless, auto-scale)   |
| CDN              | Cloudflare (free tier)                     |
| File storage     | Cloudflare R2 (S3-compatible, free egress) |
| CI/CD            | GitHub Actions                             |
| Monitoring       | Sentry (error tracking)                    |


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
