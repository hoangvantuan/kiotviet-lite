---
project_name: 'kiotviet-lite'
user_name: 'shun'
date: '2026-04-24'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns', 'logging_rules', 'notification_rules']
status: 'complete'
rule_count: 62
optimized_for_llm: true
---

# Project Context cho AI Agent

_File này chứa các quy tắc và pattern quan trọng mà AI agent PHẢI tuân thủ khi viết code. Tập trung vào chi tiết không hiển nhiên mà agent dễ bỏ sót._

## Technology Stack & Phiên bản

**Monorepo:** pnpm workspaces (3 packages)
**Runtime:** Node.js ≥ 22 LTS | Package manager: pnpm ≥ 9.x

| Layer    | Package             | Phiên bản   | Vai trò                          |
| -------- | ------------------- | ----------- | -------------------------------- |
| Frontend | React               | 19.2.x      | UI framework                    |
| Frontend | Vite                | 8.0.x       | Build tool (Rolldown bundler)   |
| Frontend | TanStack Router     | 1.168.x     | File-based routing              |
| Frontend | TanStack Query      | 5.99.x      | Server state, cache             |
| Frontend | Zustand             | 5.0.x       | Client/UI state                 |
| Frontend | Tailwind CSS        | 4.2.x       | Styling                         |
| Frontend | shadcn/ui           | latest 2026 | Component library               |
| Frontend | React Hook Form     | current     | Form handling                   |
| Frontend | PGlite              | 0.4.x       | Browser PostgreSQL (offline DB) |
| Frontend | html5-qrcode        | current     | Barcode scanner                 |
| Frontend | @tanstack/react-virtual | current | Virtual scrolling               |
| Frontend | Lucide React        | current     | Icon library                    |
| Frontend | date-fns            | current     | Date utilities                  |
| Backend  | Hono                | 4.12.x      | HTTP framework                  |
| Backend  | Drizzle ORM         | 0.45.x      | Type-safe ORM                   |
| Backend  | PostgreSQL          | ≥ 16        | Database server                 |
| Backend  | Better Auth         | 1.6.x       | Authentication                  |
| Backend  | Pino                | 9.x         | Structured logging (JSON)       |
| Backend  | pino-roll           | 3.x         | Log file rotation               |
| Backend  | grammy              | 1.x         | Telegram bot (notification)     |
| Shared   | Zod                 | 3.x         | Validation schemas              |
| Shared   | TypeScript          | strict mode | Ngôn ngữ                        |

**Ràng buộc phiên bản quan trọng:**

- PGlite (pre-1.0) và Drizzle ORM (pre-1.0): API có thể thay đổi. Ghim đúng minor version
- Drizzle phải hoạt động với CẢ PostgreSQL (server) VÀ PGlite (browser). Cùng schema, cùng query
- Vite 8 dùng Rolldown bundler, KHÔNG phải Rollup. Config có thể khác Vite 5/6/7
- React 19.2 có Server Components nhưng project KHÔNG dùng SSR. Chỉ client-side SPA

## Quy tắc bắt buộc

### Kiến trúc Monorepo

```
kiotviet-lite/
├── apps/web/              → Frontend SPA/PWA (Vite + React)
├── apps/api/              → Backend REST API (Hono)
├── packages/shared/       → Zod schemas, types, utils, constants dùng chung
└── packages/notifications/ → Notification Service (transports, router, formatters)
```

- `packages/shared` là nguồn duy nhất cho Zod schemas, types, và business logic thuần (pricing engine, debt allocator)
- KHÔNG tạo type hoặc validation schema riêng trong `apps/web` hay `apps/api`. Import từ `@kiotviet-lite/shared`
- Pricing engine (`pricing-engine.ts`) và debt allocator (`debt-allocator.ts`) là pure function, chạy được cả client và server

### Quy tắc TypeScript

- TypeScript strict mode bắt buộc. KHÔNG dùng `any`, `@ts-ignore`, hoặc tắt strict checks
- ESM only. KHÔNG dùng CommonJS (`require`, `module.exports`)
- Schema-first: Drizzle schema → infer TypeScript types → tạo Zod schema. KHÔNG viết type thủ công rồi đồng bộ
- Transform camelCase ↔ snake_case ở Drizzle layer (cấu hình `.camelCase()`). Code JS/TS luôn dùng camelCase

### Import

Thứ tự import (ESLint enforce tự động):
1. React / thư viện ngoài
2. `@kiotviet-lite/shared`
3. Internal modules (absolute path `@/`)
4. Relative imports

### API (Hono)

- REST resource-based. Pattern: `GET|POST|PATCH|DELETE /api/v1/{resource}`
- Mọi endpoint PHẢI có Zod input schema (request) VÀ output schema (response)
- Mọi query PHẢI filter theo `store_id` (multi-tenant). Middleware tự inject từ JWT
- Mọi mutation PHẢI kiểm tra authorization (role + permission)
- Response format chuẩn:
  - Success: `{ "data": T, "meta": { "page", "pageSize", "total" } }`
  - Error: `{ "error": { "code": "ERROR_CODE", "message": "...", "details": [...] } }`
- Error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `PIN_REQUIRED` (403), `NOT_FOUND` (404), `CONFLICT` (409), `BUSINESS_RULE_VIOLATION` (422), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500)
- Endpoint naming: kebab-case, số nhiều. Ví dụ: `/api/v1/price-lists`, `/api/v1/order-items`
- Query params: camelCase. Ví dụ: `?pageSize=20&sortBy=createdAt`
- JSON fields: camelCase. Ví dụ: `{ "unitPrice": 85000 }`

### Backend Architecture

Ba tầng tách biệt trong `apps/api/src/`:
- `routes/`: parse request, validate input (Zod), gọi service, format response. KHÔNG chứa business logic
- `services/`: business logic thuần, không biết HTTP, nhận typed params. KHÔNG gọi trực tiếp DB
- `db/`: Drizzle queries, không business logic

### Database

- Table: snake_case, số nhiều (`products`, `order_items`, `price_lists`)
- Column: snake_case (`created_at`, `store_id`, `unit_price`)
- Foreign key: `{table_singular}_id` (`product_id`, `customer_id`)
- Index: `idx_{table}_{columns}` (`idx_products_barcode`)
- Boolean column: prefix `is_`, `has_`, `can_` (`is_active`, `has_variants`)
- Primary key: UUID v7 (`uuid_generate_v7()`). Sortable theo thời gian, tốt cho offline
- Timestamps: `created_at` và `updated_at` trên MỌI table
- Soft delete cho business entities (orders, customers, products). KHÔNG hard delete
- Tiền VND lưu integer (không thập phân). Tính toán dùng integer arithmetic, KHÔNG floating point
- Date/Time: `timestamptz` (UTC) trong DB, ISO 8601 trong API, format `vi-VN` trong UI
- Notification tables (server): `notification_channels` (config mã hoá per-store), `notification_rules` (routing event → channel), `notification_deliveries` (log gửi + dead-letter)
- Outbox table (PGlite client): `outbox_events` (queue notification offline, sync worker đẩy khi online, xoá sau khi server ack, archive sau 7 ngày)

### Frontend (React)

**State management:**
- TanStack Query: server state (products, customers, orders). Cache + background refetch + optimistic updates
- Zustand: UI state (cart POS, theme, modals, sidebar, offline status). Store đặt tên `use{Name}Store`
- PGlite: offline data store. Khi offline, query PGlite thay vì API

**Component:**
- shadcn/ui + Tailwind CSS. KHÔNG viết CSS custom. KHÔNG dùng styled-components/CSS modules
- Component file: PascalCase (`ProductCard.tsx`)
- Non-component file: kebab-case (`pricing-engine.ts`)
- Hook file: `use-*.ts` (`use-cart.ts`)
- Feature-based organization: mỗi feature folder tự chứa components, hooks, utils, tests
- Feature folders KHÔNG import cross-feature. Dùng `components/shared/` hoặc `packages/shared`
- Error boundary bọc mỗi route
- Hooks encapsulate data fetching. Component chỉ render

**Routing:**
- TanStack Router file-based routing trong `src/routes/`
- Layout authenticated: `_authenticated.tsx`
- Dynamic params dùng `$` prefix: `$productId.tsx`

### Offline & Sync

- PGlite-first: toàn bộ POS workflow PHẢI hoạt động không internet
- Đơn hàng offline: lưu PGlite với `sync_status = 'pending'`, `client_id = UUID`
- Sync khi có mạng: Background Sync API → batch push pending → server validate → update `sync_status = 'synced'`
- Conflict resolution: server wins (tồn kho, sản phẩm, khách hàng, bảng giá, settings), client wins (đơn hàng đã tạo)
- Incremental sync dùng `updated_at` watermark
- Service Worker: Workbox precache app shell + static assets

### Authentication & Authorization

- Better Auth + JWT access (15 phút) + refresh token rotation (7 ngày)
- Access token lưu memory, refresh token lưu httpOnly cookie
- 3 role: Owner, Manager, Staff. Permission matrix theo architecture doc
- PIN 6 chữ số (bcrypt hash) cho: sửa giá dưới vốn, override hạn mức nợ
- PIN rate-limit: 5 lần sai → khóa 15 phút
- PIN hash lưu PGlite để kiểm tra offline
- Multi-tenant: `store_id` trong JWT, middleware inject vào mọi request

### Audit Log

- Append-only table `audit_logs`. KHÔNG cho phép xóa/sửa (DB constraint)
- Ghi log khi: sửa giá, điều chỉnh nợ, override hạn mức, xóa dữ liệu, đăng nhập
- Fields: `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `user_id`, `created_at`
- Mọi thay đổi giá/nợ/tồn kho PHẢI tạo audit log entry

### Logging (Pino)

Tách hoàn toàn với Notification Service. Vai trò: ghi structured log cho ops/debug.

**Backend (Hono):**
- Output: JSON stdout (production), pino-pretty (dev)
- Level: `trace | debug | info | warn | error | fatal`. Default `info`, override qua env `LOG_LEVEL`
- Redact tự động: `req.headers.authorization`, `*.password`, `*.pin`, `*.botToken`, `*.secret`. Thêm field nhạy cảm mới → CẬP NHẬT redact config
- Correlation: middleware inject `requestId` (uuid v7) vào mọi log line + response header. Dùng để trace request xuyên suốt
- File rotation: pino-roll, rotate theo ngày, giữ 30 ngày, max 100MB/file. Production ship sang Cloudflare R2 hàng ngày (cron)

**Frontend:**
- Dev: `console.*` bình thường
- Production: giữ `console.error` + `console.warn`, loại bỏ `console.log/debug` (Vite build plugin)
- Error thực sự vẫn đi Sentry như cũ

### Notification Service

Hai lớp độc lập: Logger nền (Pino, cho dev/ops) và Notification Service (cho alert nghiệp vụ tới user/admin).

**Kiến trúc:**
- Module nằm ở `packages/notifications/`, gọi từ service layer qua `notify(event)`
- 4 transport: console, file, webhook (undici native), Telegram (grammy)
- Thêm transport mới (Slack, Zalo, email): implement interface `Transport`, không động router
- Rule routing lưu DB (`notification_rules`), không hard-code. Router query rule theo `store_id + type + severity` → fan-out

**Event schema (Zod):**
- Mọi event có: `id` (uuid v7), `storeId`, `type` (enum), `severity` (`info|warn|error|critical`), `title`, `body`, `occurredAt`, `correlationId` (optional, link với request log)
- Event type theo namespace: `<domain>.<action>[.<qualifier>]`. Ví dụ: `stock.negative`, `auth.pin.locked`, `order.high_value`
- Thêm event mới: bổ sung enum + Zod schema + Event Catalog

**7 event MVP khởi tạo:**

| Type | Severity | Trigger |
| --- | --- | --- |
| `auth.login.suspicious` | warn | Login từ IP/UA bất thường |
| `auth.pin.locked` | warn | PIN sai 5 lần |
| `order.high_value` | info | Đơn vượt ngưỡng cấu hình |
| `stock.negative` | error | Tồn kho âm sau giao dịch |
| `sync.failed_repeatedly` | error | Sync fail 3 lần liên tiếp |
| `audit.price_override` | warn | Sửa giá dưới vốn |
| `system.error.unhandled` | critical | Exception không bắt |

**Frontend notification:**
- Frontend KHÔNG gọi transport trực tiếp (Telegram, webhook). Lý do: offline fail, lộ token, thiếu audit
- Outbox pattern: action → lưu `outbox_events` (PGlite) → toast ngay → khi online sync worker đẩy qua `POST /api/notifications/emit` → backend validate + route
- 3 loại thông báo client: Toast (react-hot-toast, chỉ user hiện tại), In-app inbox (query API), External push (outbox → backend → transport)

**Multi-tenant config:**
- Mỗi store cấu hình kênh riêng qua bảng `notification_channels`
- Config (token, URL, secret) lưu mã hoá AES-256-GCM. Key: env var `NOTIFICATION_CONFIG_KEY` (32 byte). Rotation 6 tháng
- Decrypt chỉ trong Notification Service runtime, KHÔNG trả về client, KHÔNG log

**Retry, throttle, dead-letter:**
- Retry: webhook/Telegram 3 lần, exponential backoff (1s, 4s, 16s)
- Throttle: theo rule (`throttle_seconds`). Ví dụ `order.high_value` throttle 300s = max 1 notification/5 phút cùng type cùng store
- Dead-letter: fail sau retry → `notification_deliveries` với `status='dead'`. Cron hàng ngày quét dead-letter, gửi summary cho admin

**Security:**
- Webhook outbound ký HMAC-SHA256 header `X-KVL-Signature` bằng secret per-channel
- Rate-limit endpoint `/api/notifications/emit`: 60 req/phút per JWT user
- Client KHÔNG được chỉ định transport hoặc override rule. Client chỉ emit event type đã whitelist

### In ấn

- Hai channel: thermal (58/80mm, ESC/POS binary qua Web Serial/WebUSB) và paper (A4/A5, HTML CSS `@media print`)
- Template là Zod-typed config object, KHÔNG phải string template
- Render phía client (hoạt động offline)
- Fallback thermal: generate image + `window.print()` nếu không kết nối được printer

### Business Logic quan trọng

**Pricing Engine (6 tầng ưu tiên, cao → thấp):**
1. Giá riêng khách hàng
2. Chiết khấu danh mục
3. Giá nhập thủ công trên đơn
4. Giá theo số lượng
5. Giá theo nhóm khách hàng
6. Giá gốc (base price)

- Chain formula: tính giá bán từ giá vốn theo công thức chuỗi
- Cascade: khi giá vốn thay đổi, tự động cập nhật giá bán theo chain formula
- Pricing engine là pure function trong `packages/shared`, chạy cả client và server

**Công nợ:**
- FIFO allocation: thu tiền phân bổ vào nợ cũ nhất trước
- Hạn mức nợ: vượt hạn mức cần PIN owner override
- Debt allocator là pure function trong `packages/shared`

**Tồn kho:**
- Giá vốn bình quân gia quyền (Weighted Average Cost)
- Integer arithmetic cho mọi tính toán tiền

### Testing

- Co-located tests: `ProductCard.test.tsx` cạnh `ProductCard.tsx`
- Integration tests: `__tests__/` trong mỗi feature folder (frontend) và `apps/api/src/__tests__/` (backend)
- E2E: Playwright trong `apps/web/e2e/`
- Unit test cho pure functions (pricing engine, debt allocator, validators)
- Integration test cho API endpoints (Hono test client)

### Code Quality

- Hằng số: UPPER_SNAKE_CASE (`MAX_CART_TABS`, `SYNC_BATCH_SIZE`)
- Type/Interface: PascalCase (`Product`, `OrderItem`)
- Zod schema: `{name}Schema` (`productSchema`, `orderItemSchema`)
- Zustand store: `use{Name}Store` (`useCartStore`, `useUiStore`)
- Event naming: `{entity}.{action}` past tense (`order.created`, `price.changed`)
- Currency UI: `Intl.NumberFormat('vi-VN')` → `85.000 ₫`
- Date UI: format theo locale `vi-VN` (`18/04/2026 10:30`)
- Toast cho user-facing errors (tiếng Việt). Sentry cho unexpected errors
- Retry tự động cho network failures (exponential backoff)

### Quy tắc TUYỆT ĐỐI (Enforcement)

1. Tuân thủ naming convention. Không ngoại lệ
2. Zod schema từ `packages/shared` only. Không tạo riêng
3. Mọi API endpoint có Zod input/output schema
4. Mọi DB query filter theo `store_id`
5. Mọi mutation kiểm tra authorization
6. Soft delete, KHÔNG hard delete cho business entities
7. UUID v7 cho primary key mới
8. Tailwind + shadcn/ui. Không CSS custom
9. Thay đổi giá/nợ/tồn kho → audit log entry
10. Mọi notification qua `notify(event)` của `packages/notifications`. Cấm gọi trực tiếp HTTP/Telegram từ service khác
11. Frontend cấm gọi transport trực tiếp. Luôn đi qua outbox + backend API
12. Config channel (token, URL, secret) bắt buộc lưu mã hoá AES-256-GCM. Không plaintext trong DB hoặc log
13. Pino redact phải phủ mọi field nhạy cảm. Thêm field mới → cập nhật redact config ngay

## Anti-patterns: KHÔNG được làm

- KHÔNG import cross-feature (giữa `features/pos/` và `features/products/`). Dùng shared
- KHÔNG dùng floating point cho tiền. Integer VND only
- KHÔNG hard delete business entities. Luôn soft delete
- KHÔNG bypass `store_id` filter. Mọi query phải scope theo tenant
- KHÔNG lưu access token vào localStorage/cookie. Chỉ memory
- KHÔNG viết business logic trong route handler. Tách vào service
- KHÔNG tạo Zod schema trong `apps/`. Luôn đặt ở `packages/shared`
- KHÔNG dùng CSS custom, styled-components, CSS modules. Chỉ Tailwind + shadcn/ui
- KHÔNG bỏ qua audit log khi thay đổi giá/nợ/tồn kho
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG dùng CommonJS (`require`, `module.exports`)
- KHÔNG assume online. POS flow PHẢI hoạt động offline
- KHÔNG gọi Telegram/webhook trực tiếp từ frontend. Luôn đi qua outbox + backend (security + offline + audit)
- KHÔNG lưu token/secret notification channel dạng plaintext trong DB hoặc log
- KHÔNG gửi notification bỏ qua `packages/notifications`. Cấm gọi transport từ service nghiệp vụ
- KHÔNG thêm event type mà không bổ sung enum + Zod schema

## Hướng dẫn sử dụng

**Cho AI Agent:**
- Đọc file này TRƯỚC khi implement bất kỳ code nào
- Tuân thủ TẤT CẢ quy tắc đúng như tài liệu
- Khi không chắc, chọn phương án chặt chẽ hơn
- Cập nhật file này nếu phát hiện pattern mới

**Cho người dùng:**
- Giữ file này ngắn gọn, tập trung vào nhu cầu agent
- Cập nhật khi technology stack thay đổi
- Review định kỳ để loại bỏ quy tắc lỗi thời

Cập nhật lần cuối: 2026-04-24 (bổ sung Logging + Notification Service)
