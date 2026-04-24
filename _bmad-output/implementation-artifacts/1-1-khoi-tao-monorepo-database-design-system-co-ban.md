# Story 1.1: Khởi tạo monorepo, database, design system cơ bản

Status: done

## Story

As a developer,
I want một monorepo hoàn chỉnh với database, design system và dev server chạy được,
So that toàn bộ team có nền tảng thống nhất để phát triển các tính năng tiếp theo.

## Acceptance Criteria (BDD)

### AC1: Dev server khởi động thành công

**Given** developer clone repo về máy lần đầu
**When** chạy `pnpm install && pnpm dev`
**Then** dev server khởi động thành công trong ≤30 giây với cả 3 workspace: `apps/web` (Vite 8 + React 19), `apps/api` (Hono), `packages/shared`
**And** không có lỗi TypeScript hay lint error nào

### AC2: Cấu trúc monorepo đúng

**Given** monorepo đã cài đặt
**When** kiểm tra cấu trúc thư mục
**Then** tồn tại đúng 3 workspace: `apps/web`, `apps/api`, `packages/shared`
**And** `packages/shared` export được types, constants, utils dùng chung cho cả web và api
**And** path alias `@shared/*` hoạt động trong cả web và api

### AC3: Database migration chạy được

**Given** PostgreSQL đang chạy
**When** chạy `pnpm db:migrate`
**Then** Drizzle ORM tạo thành công schema ban đầu (bảng `users`, `stores`, migration history)
**And** file migration được lưu trong `apps/api/src/db/migrations`
**And** `pnpm db:studio` mở được Drizzle Studio để inspect database

### AC4: Tailwind CSS + shadcn/ui hoạt động

**Given** dev server đang chạy
**When** truy cập `apps/web` trên trình duyệt
**Then** Tailwind CSS 4 hoạt động, shadcn/ui đã cấu hình
**And** design tokens được định nghĩa trong CSS variables: `--color-primary`, `--color-secondary`, `--color-destructive`, `--color-muted`, `--radius`, `--font-sans`

### AC5: 6 base component sẵn sàng

**Given** design system đã cấu hình
**When** import các base component
**Then** 6 component cơ bản sẵn sàng sử dụng: `Button` (4 variants: default/secondary/outline/destructive, 3 sizes: sm/md/lg), `Input`, `Dialog`, `Toast`, `Tabs`, `Select`
**And** mỗi component có TypeScript props đầy đủ

### AC6: PGlite hoạt động

**Given** PostgreSQL schema đã tạo thành công
**When** khởi tạo PGlite trong browser (hoặc test environment)
**Then** PGlite tạo được schema tương đương từ Drizzle shared schemas (`packages/shared/src/schema/`)
**And** cùng 1 Drizzle schema definition dùng cho cả PostgreSQL server và PGlite client (DRY)
**And** `pnpm test:pglite` chạy test tạo PGlite instance + insert/query record thành công
**And** document rõ cách client và server schemas đồng bộ khi thêm table/column mới

### AC7: Code quality tools

**Given** developer muốn kiểm tra code quality
**When** chạy `pnpm lint` và `pnpm typecheck`
**Then** ESLint + Prettier chạy trên toàn monorepo không lỗi
**And** TypeScript strict mode bật cho tất cả workspace
**And** `pnpm test` chạy được Vitest (dù chưa có test case nào)

### AC8: Nền tảng sẵn sàng cho Story 1.2

**Given** developer hoàn thành Story 1.1
**When** muốn bắt đầu implement Story 1.2 (Đăng ký & Đăng nhập)
**Then** có thể tạo React component mới trong `apps/web`, import types từ `@shared/*`, dev server hot-reload
**And** có thể tạo API route mới trong `apps/api`, query database qua Drizzle, trả JSON response
**And** toàn bộ TypeScript strict mode pass, không lỗi

## Tasks / Subtasks

### Lane A: Monorepo + Database (infra + data layer)

- [x] Task 1: Khởi tạo monorepo với pnpm workspaces (AC: #1, #2)
  - [x] 1.1: Tạo root `package.json` với workspaces config
  - [x] 1.2: Tạo `pnpm-workspace.yaml` khai báo 3 workspace
  - [x] 1.3: Tạo `tsconfig.base.json` với strict mode, ESM, path aliases
  - [x] 1.4: Tạo workspace `apps/web` (Vite 8 + React 19 template)
  - [x] 1.5: Tạo workspace `apps/api` (Hono + TypeScript)
  - [x] 1.6: Tạo workspace `packages/shared` (types, schemas, utils)
  - [x] 1.7: Cấu hình path alias `@shared/*` và `@/` cho từng workspace
  - [x] 1.8: Tạo root scripts: `dev`, `build`, `lint`, `typecheck`, `test`

- [x] Task 2: Setup PostgreSQL + Drizzle ORM (AC: #3)
  - [x] 2.1: Cài Drizzle ORM + drizzle-kit trong `apps/api`
  - [x] 2.2: Tạo `drizzle.config.ts` trỏ đến schema và migrations
  - [x] 2.3: Tạo schema `users` và `stores` trong `packages/shared/src/schema/`
  - [x] 2.4: Tạo DB connection trong `apps/api/src/db/index.ts`
  - [x] 2.5: Tạo script `db:migrate`, `db:generate`, `db:studio`
  - [x] 2.6: Tạo `.env.example` với DATABASE_URL mẫu
  - [x] 2.7: Chạy migration thử, verify bảng tạo thành công

- [x] Task 3: Setup PGlite (AC: #6)
  - [x] 3.1: Cài `@electric-sql/pglite` trong `apps/web`
  - [x] 3.2: Tạo `apps/web/src/lib/pglite.ts` khởi tạo PGlite instance (IndexedDB storage)
  - [x] 3.3: Dùng shared Drizzle schema tạo tables trong PGlite
  - [x] 3.4: Viết test `pnpm test:pglite`: tạo instance, insert, query
  - [x] 3.5: Document cách sync schema khi thêm table/column

### Lane B: Design System (UI layer)

- [x] Task 4: Setup Tailwind CSS 4 + shadcn/ui (AC: #4)
  - [x] 4.1: Cài Tailwind CSS 4, `@tailwindcss/postcss` (hoặc Vite plugin)
  - [x] 4.2: Cấu hình `globals.css` với `@import "tailwindcss"` và `@theme` block
  - [x] 4.3: Định nghĩa design tokens trong `@theme`: colors, fonts, radius, spacing
  - [x] 4.4: Chạy `npx shadcn@latest init` với Vite preset
  - [x] 4.5: Verify Tailwind classes render đúng trên browser

- [x] Task 5: Cài 6 base component (AC: #5)
  - [x] 5.1: `npx shadcn@latest add button` + verify 4 variants, 3 sizes
  - [x] 5.2: `npx shadcn@latest add input` + verify prefix/suffix/error state
  - [x] 5.3: `npx shadcn@latest add dialog` + verify open/close
  - [x] 5.4: `npx shadcn@latest add sonner` (Toast) + verify 4 types
  - [x] 5.5: `npx shadcn@latest add tabs` + verify tab switching
  - [x] 5.6: `npx shadcn@latest add select` + verify dropdown

### Lane C: Code Quality (quality layer)

- [x] Task 6: Setup ESLint + Prettier + Vitest (AC: #7)
  - [x] 6.1: Cài ESLint (flat config) + Prettier ở root
  - [x] 6.2: Cấu hình import order rule (React > shared > @/ > relative)
  - [x] 6.3: Cấu hình Vitest ở root với workspace support
  - [x] 6.4: Tạo smoke test đơn giản để verify `pnpm test` chạy được
  - [x] 6.5: Verify `pnpm lint`, `pnpm typecheck`, `pnpm test` pass toàn bộ

### Verification

- [x] Task 7: End-to-end verification (AC: #1, #8)
  - [x] 7.1: `pnpm install && pnpm dev` khởi động trong ≤30s
  - [x] 7.2: Tạo thử component trong `apps/web` import từ `@shared/*`
  - [x] 7.3: Tạo thử API route trong `apps/api` query database
  - [x] 7.4: Hot-reload hoạt động khi sửa file
  - [x] 7.5: Xoá code thử nghiệm, đảm bảo clean state

### Review Findings

- [x] [Review][Decision] UUID v7: dùng thư viện JS `uuidv7` với `$defaultFn()` trong Drizzle schema — FIXED
- [x] [Review][Decision] FK ON DELETE RESTRICT cho `users.store_id` — FIXED
- [x] [Review][Patch] UNIQUE(store_id, phone) trên bảng users — FIXED
- [x] [Review][Patch] `updatedAt` thêm `$onUpdate(() => new Date())` — FIXED
- [x] [Review][Patch] PGlite test dùng `drizzle-orm/pglite/migrator` thay raw SQL — FIXED
- [x] [Review][Patch] `pglite.ts` thêm `initPGliteSchema()` — FIXED
- [x] [Review][Patch] `DATABASE_URL` validation trong drizzle.config.ts — FIXED
- [x] [Review][Patch] Migration regenerated (newline, UUID v7, FK restrict, unique index) — FIXED
- [x] [Review][Patch] `tsconfig.base.json` bỏ `declaration/declarationMap/sourceMap` (mâu thuẫn `noEmit`) — FIXED
- [x] [Review][Patch] ESLint ignore chỉ `postcss.config.js` thay vì `**/*.js` — FIXED
- [x] [Review][Patch] `.gitignore` bổ sung `.env.production`, `.env.staging`, `coverage/`, `*.tsbuildinfo` — FIXED
- [x] [Review][Patch] ESLint import order rule bằng `eslint-plugin-simple-import-sort` — FIXED
- [x] [Review][Patch] Document sync schema PGlite trong story file — FIXED
- [x] [Review][Defer] DB connection không có graceful shutdown [apps/api/src/db/index.ts] — deferred, scope story sau
- [x] [Review][Defer] API server thiếu CORS, security headers, error handler [apps/api/src/index.ts] — deferred, scope story 1.2+
- [x] [Review][Defer] Bảng stores/users thiếu indexes cho truy vấn [packages/shared/src/schema/] — deferred, premature cho bảng trống
- [x] [Review][Defer] `next-themes` dependency trong Vite project [apps/web/package.json] — deferred, shadcn generated
- [x] [Review][Defer] Test dùng plaintext cho password_hash [apps/web/src/lib/pglite.test.ts:67] — deferred, chấp nhận trong test

## Dev Notes

### Parallel Work Lanes

Story này gồm 3 luồng triển khai song song:
- **Lane A:** Monorepo + PostgreSQL + Drizzle + PGlite (infra + data layer)
- **Lane B:** Tailwind + Design tokens + 6 base components (UI layer)
- **Lane C:** ESLint + Prettier + TypeScript strict + Vitest (quality layer)

Lane B và C chỉ cần Lane A hoàn thành cấu trúc thư mục cơ bản (Task 1), không cần database chạy.

### Technology Versions (verified April 2026)

| Package | Version | Ghi chú |
|---------|---------|---------|
| pnpm | 10.33.x | Package manager, workspace support |
| Node.js | ≥ 22 LTS | Yêu cầu bởi Vite 8 |
| Vite | 8.0.x | **Rolldown bundler** (thay Rollup+esbuild), dùng `build.rolldownOptions` thay `build.rollupOptions` |
| React | 19.2.x | Client-side SPA only, KHÔNG dùng SSR/Server Components |
| Tailwind CSS | 4.2.x | **CSS-first config** qua `@theme`, KHÔNG còn `tailwind.config.js` |
| shadcn/ui | CLI v4 | `npx shadcn@latest init`, hỗ trợ Vite template |
| Drizzle ORM | 0.45.x | Stable. Dùng `.camelCase()` cho transform column names |
| PGlite | 0.4.x | `@electric-sql/pglite`, Postgres WASM ~3MB, IndexedDB storage |
| Hono | 4.12.x | REST API framework, zero dependencies |
| Zod | 3.x | Validation schemas, shared client/server |
| TypeScript | strict | ESM only, KHÔNG CommonJS |
| Vitest | latest | Co-located tests, workspace support |

### Vite 8 Config: Thay đổi quan trọng

Vite 8 dùng Rolldown (Rust) thay Rollup + esbuild. Các option config đổi tên:
- `build.rollupOptions` → `build.rolldownOptions`
- `worker.rollupOptions` → `worker.rolldownOptions`
- `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`
- `esbuild` option → `oxc`
- CSS minification mặc định dùng Lightning CSS

### Tailwind CSS 4: Cấu hình mới hoàn toàn

**KHÔNG còn `tailwind.config.js`.** Cấu hình bằng CSS thuần:

```css
/* apps/web/src/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: #2563EB;
  --color-primary-foreground: #FFFFFF;
  --color-secondary: #F1F5F9;
  --color-secondary-foreground: #0F172A;
  --color-destructive: #DC2626;
  --color-destructive-foreground: #FFFFFF;
  --color-muted: #F8FAFC;
  --color-muted-foreground: #64748B;
  --color-success: #16A34A;
  --color-warning: #F59E0B;
  --color-error: #DC2626;
  --color-background: #FFFFFF;
  --color-foreground: #0F172A;
  --color-card: #FFFFFF;
  --color-card-foreground: #0F172A;
  --color-border: #E2E8F0;
  --color-ring: #2563EB;

  --font-sans: 'Inter', 'Noto Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --radius: 0.5rem;
  --radius-sm: 0.25rem;
  --radius-lg: 0.75rem;
}
```

Entry point: `@import "tailwindcss"` thay vì 3 dòng `@tailwind base/components/utilities`.
PostCSS plugin: `@tailwindcss/postcss` (package riêng).

### Directory Structure bắt buộc

```
kiotviet-lite/
├── package.json                    # root workspace
├── pnpm-workspace.yaml             # workspace declaration
├── tsconfig.base.json              # shared TS config (strict, ESM)
├── .env.example                    # template env vars
├── .prettierrc                     # Prettier config
├── eslint.config.js                # ESLint flat config
├── vitest.workspace.ts             # Vitest workspace config
│
├── apps/
│   ├── web/                        # Frontend SPA/PWA
│   │   ├── package.json
│   │   ├── tsconfig.json           # extends ../../tsconfig.base.json
│   │   ├── vite.config.ts          # Vite 8 config
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── globals.css         # Tailwind @import + @theme tokens
│   │       ├── lib/
│   │       │   └── utils.ts        # shadcn cn() utility
│   │       └── components/
│   │           └── ui/             # shadcn/ui components
│   │               ├── button.tsx
│   │               ├── input.tsx
│   │               ├── dialog.tsx
│   │               ├── sonner.tsx  # Toast
│   │               ├── tabs.tsx
│   │               └── select.tsx
│   │
│   └── api/                        # Backend REST API
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Hono app entry
│           ├── db/
│           │   ├── index.ts        # Drizzle client instance
│           │   └── migrations/     # Drizzle Kit generated
│           ├── routes/             # API route handlers
│           └── services/           # Business logic
│
└── packages/
    └── shared/                     # Shared code
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts            # Public API re-exports
            ├── schema/             # Drizzle schema definitions (DRY: server + PGlite)
            │   ├── users.ts
            │   ├── stores.ts
            │   └── index.ts
            ├── types/              # TypeScript types (inferred from schemas)
            └── constants/          # Shared constants
```

### Database Schema: bảng `users` và `stores`

**Table `stores`:**
- `id`: UUID v7, primary key
- `name`: varchar(100), NOT NULL
- `address`: text, nullable
- `phone`: varchar(20), nullable
- `logo_url`: text, nullable
- `created_at`: timestamptz, default now()
- `updated_at`: timestamptz, default now()

**Table `users`:**
- `id`: UUID v7, primary key
- `store_id`: UUID, foreign key → `stores.id`, NOT NULL
- `name`: varchar(100), NOT NULL
- `phone`: varchar(20), UNIQUE within store
- `password_hash`: text, NOT NULL
- `role`: enum('owner', 'manager', 'staff'), NOT NULL
- `pin_hash`: text, nullable
- `is_active`: boolean, default true
- `created_at`: timestamptz, default now()
- `updated_at`: timestamptz, default now()

**Quy tắc bắt buộc:**
- Table name: snake_case, số nhiều
- Column name: snake_case
- Foreign key: `{table_singular}_id`
- Primary key: UUID v7
- Mọi table có `created_at`, `updated_at`
- Drizzle `.camelCase()` transform: code JS dùng camelCase, DB lưu snake_case

### PGlite Setup

- Package: `@electric-sql/pglite` 0.4.x
- Storage: IndexedDB (persistent qua browser restart)
- Schema: import từ `packages/shared/src/schema/` (CÙNG schema với PostgreSQL server)
- Drizzle adapter: dùng `drizzle-orm/pglite` driver
- Test: dùng `drizzle-orm/pglite/migrator` để chạy migration từ `apps/api/src/db/migrations/`

### Quy trình sync schema PGlite khi thay đổi

1. Sửa Drizzle schema trong `packages/shared/src/schema/`
2. Chạy `pnpm db:generate` để tạo migration SQL mới
3. PGlite test tự động dùng migration mới qua `drizzle-orm/pglite/migrator`
4. Cho browser (production): import migration SQL bằng `?raw` import rồi gọi `initPGliteSchema(pglite, sql)`
5. Chạy `pnpm test:pglite` để verify schema đồng bộ

### shadcn/ui Init cho Vite

```bash
npx shadcn@latest init
```

Khi init, chọn:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Components lưu tại `apps/web/src/components/ui/`.
Utility `cn()` lưu tại `apps/web/src/lib/utils.ts`.

### Design Tokens (CSS Variables)

| Token | Giá trị | Mục đích |
|-------|---------|----------|
| `--color-primary` | `#2563EB` | Nút chính, links, focus |
| `--color-secondary` | `#F1F5F9` | Nút phụ, backgrounds |
| `--color-destructive` | `#DC2626` | Xoá, lỗi |
| `--color-muted` | `#F8FAFC` | Text phụ, placeholder |
| `--color-success` | `#16A34A` | Thanh toán, xác nhận |
| `--color-warning` | `#F59E0B` | Cảnh báo tồn kho |
| `--font-sans` | Inter, Noto Sans, system-ui | Font chính, hỗ trợ tiếng Việt |
| `--font-mono` | JetBrains Mono | Số tiền, mã đơn hàng |
| `--radius` | 0.5rem (8px) | Border radius mặc định |

### Button Component: 4 variants, 3 sizes

**Variants:** default (primary blue), secondary (slate), outline (border), destructive (red)
**Sizes:** sm (h-8 px-3 text-xs), md (h-10 px-4 text-sm), lg (h-12 px-6 text-base)

### Naming Conventions

| Phần tử | Convention | Ví dụ |
|---------|-----------|-------|
| Component file | PascalCase | `ProductCard.tsx` |
| Non-component file | kebab-case | `pricing-engine.ts` |
| Hook file | `use-*.ts` | `use-cart.ts` |
| Zustand store | `use{Name}Store` | `useCartStore` |
| Zod schema | `{name}Schema` | `productSchema` |
| Hằng số | UPPER_SNAKE_CASE | `MAX_CART_TABS` |
| Type/Interface | PascalCase | `Product`, `OrderItem` |
| API endpoint | kebab-case, số nhiều | `/api/v1/products` |
| DB table | snake_case, số nhiều | `order_items` |
| DB column | snake_case | `created_at` |

### Anti-patterns: KHÔNG được làm

- KHÔNG tạo type hoặc Zod schema riêng trong `apps/web` hay `apps/api`. Import từ `@kiotviet-lite/shared`
- KHÔNG dùng `any`, `@ts-ignore`, hoặc tắt strict checks
- KHÔNG dùng CommonJS (`require`, `module.exports`). ESM only
- KHÔNG viết CSS custom, styled-components, CSS modules. Chỉ Tailwind + shadcn/ui
- KHÔNG dùng `tailwind.config.js` (Tailwind 4 dùng CSS `@theme`)
- KHÔNG dùng `build.rollupOptions` (Vite 8 dùng `build.rolldownOptions`)
- KHÔNG dùng floating point cho tiền. Integer VND only
- KHÔNG bypass `store_id` filter trong database queries

### Import Order (ESLint enforce)

1. React / thư viện ngoài
2. `@kiotviet-lite/shared`
3. Internal modules (`@/`)
4. Relative imports (`./`)

### Project Structure Notes

- Path alias `@kiotviet-lite/shared` trỏ đến `packages/shared/src/index.ts`
- Path alias `@/` trong `apps/web` trỏ đến `apps/web/src/`
- Path alias `@/` trong `apps/api` trỏ đến `apps/api/src/`
- pnpm workspace protocol: `"@kiotviet-lite/shared": "workspace:*"` trong package.json

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-khi-to-d-n-qun-tr-ca-hng.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/starter-template-evaluation.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/design-system-foundation.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/design-direction-decision.md]
- [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- @vitejs/plugin-react v4 không hỗ trợ Vite 8, nâng lên v6.0
- TypeScript rootDir conflict khi import shared package, bỏ rootDir/outDir trong apps/api tsconfig
- tsconfig.node.json reference cần composite, đơn giản hoá bằng cách gộp vite.config.ts vào include chính

### Completion Notes List

- ✅ Monorepo pnpm workspaces: 3 workspace (apps/web, apps/api, packages/shared) hoạt động
- ✅ PostgreSQL + Drizzle ORM: schema stores/users, migration chạy thành công
- ✅ PGlite: in-memory instance, insert/query test pass, dùng chung Drizzle schema với server
- ✅ Tailwind CSS 4: CSS-first config với @theme block, design tokens đầy đủ
- ✅ shadcn/ui: 6 base component (Button, Input, Dialog, Sonner, Tabs, Select)
- ✅ ESLint flat config + Prettier + Vitest workspace
- ✅ Dev server: Web (Vite 8, 380ms) + API (Hono) khởi động thành công
- ✅ TypeScript strict mode pass, lint pass (1 warning shadcn pattern), test pass

### Change Log

- 2026-04-24: Khởi tạo monorepo, database, design system, code quality tools

### File List

- package.json (new)
- pnpm-workspace.yaml (new)
- tsconfig.base.json (new)
- .gitignore (new)
- .env.example (new)
- .prettierrc (new)
- eslint.config.js (new)
- vitest.workspace.ts (new)
- pnpm-lock.yaml (new)
- apps/web/package.json (new)
- apps/web/tsconfig.json (new)
- apps/web/vite.config.ts (new)
- apps/web/postcss.config.js (new)
- apps/web/index.html (new)
- apps/web/components.json (new)
- apps/web/src/main.tsx (new)
- apps/web/src/App.tsx (new)
- apps/web/src/globals.css (new)
- apps/web/src/lib/utils.ts (new)
- apps/web/src/lib/pglite.ts (new)
- apps/web/src/lib/pglite.test.ts (new)
- apps/web/src/components/ui/button.tsx (new)
- apps/web/src/components/ui/input.tsx (new)
- apps/web/src/components/ui/dialog.tsx (new)
- apps/web/src/components/ui/sonner.tsx (new)
- apps/web/src/components/ui/tabs.tsx (new)
- apps/web/src/components/ui/select.tsx (new)
- apps/api/package.json (new)
- apps/api/tsconfig.json (new)
- apps/api/drizzle.config.ts (new)
- apps/api/src/index.ts (new)
- apps/api/src/db/index.ts (new)
- apps/api/src/db/migrations/0000_big_boom_boom.sql (new)
- apps/api/src/db/migrations/meta/ (new)
- packages/shared/package.json (new)
- packages/shared/tsconfig.json (new)
- packages/shared/src/index.ts (new)
- packages/shared/src/schema/index.ts (new)
- packages/shared/src/schema/stores.ts (new)
- packages/shared/src/schema/users.ts (new)
- packages/shared/src/types/index.ts (new)
- packages/shared/src/constants/index.ts (new)
