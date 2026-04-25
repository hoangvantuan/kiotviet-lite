# Story 1.5: CI/CD & Development Pipeline

Status: ready-for-dev

## Story

As a developer,
I want CI/CD pipeline tự động kiểm tra code quality và deploy,
So that team phát triển nhanh, an toàn, phát hiện lỗi sớm trước khi merge.

## Acceptance Criteria (BDD)

### AC1: GitHub Actions CI pipeline chạy tự động khi tạo PR

**Given** developer push code lên GitHub
**When** tạo Pull Request
**Then** GitHub Actions tự động chạy pipeline: install → typecheck → lint → test → build
**And** pipeline fail → block merge, hiển thị chi tiết lỗi
**And** pipeline pass → cho phép merge

### AC2: CI chỉ chạy affected packages (monorepo optimization)

**Given** monorepo có 3 workspace (`apps/web`, `apps/api`, `packages/shared`)
**When** chỉ thay đổi file trong `apps/web`
**Then** CI chỉ chạy typecheck, lint, test cho `apps/web` và `packages/shared` (affected only)
**And** giảm thời gian CI cho các PR nhỏ

### AC3: Pre-commit hook kiểm tra code trước khi commit

**Given** developer commit code
**When** pre-commit hook chạy
**Then** Husky + lint-staged: format (Prettier) + lint (ESLint) cho staged files
**And** commit bị block nếu lint fail

### AC4: `.env.example` đầy đủ và có hướng dẫn

**Given** project cần env variables
**When** developer clone repo lần đầu
**Then** file `.env.example` tồn tại với tất cả env keys cần thiết (không có giá trị thật)
**And** document rõ cách copy `.env.example` → `.env.local` và điền giá trị

### AC5: Auto-deploy khi merge vào main

**Given** code được merge vào main
**When** pipeline deploy chạy
**Then** tự động deploy `apps/web` lên Vercel
**And** tự động deploy `apps/api` lên Railway
**And** chạy Drizzle migration tự động trên staging/production DB

## Tasks / Subtasks

### Phase A: GitHub Actions CI Workflow

- [ ] Task 1: Tạo CI workflow (AC: #1, #2)
  - [ ] 1.1: Tạo `.github/workflows/ci.yml` cho Pull Request events (pull_request trên main):
    ```yaml
    # Triggers: pull_request → main, push → main
    # Jobs: ci (ubuntu-latest, Node 22)
    # Steps:
    #   1. actions/checkout@v4
    #   2. pnpm/action-setup@v4 (version từ packageManager field)
    #   3. actions/setup-node@v4 (node-version: 22, cache: 'pnpm')
    #   4. pnpm install --frozen-lockfile
    #   5. pnpm typecheck
    #   6. pnpm lint
    #   7. pnpm test
    #   8. pnpm build
    ```
  - [ ] 1.2: Cấu hình pnpm cache thông qua `actions/setup-node` với `cache: 'pnpm'`
  - [ ] 1.3: Thêm `concurrency` group để cancel CI cũ khi push commit mới vào cùng PR:
    ```yaml
    concurrency:
      group: ci-${{ github.ref }}
      cancel-in-progress: true
    ```
  - [ ] 1.4: Test CI workflow bằng cách tạo PR test, verify pipeline chạy đúng 4 bước: typecheck → lint → test → build

- [ ] Task 2: Affected-only optimization (AC: #2)
  - [ ] 2.1: Approach đơn giản cho MVP: chạy toàn bộ monorepo (typecheck, lint, test, build) trong CI. Monorepo nhỏ (3 workspace), tổng CI time dưới 3 phút, chưa cần tối ưu affected-only
  - [ ] 2.2: Comment trong `ci.yml` ghi rõ cách upgrade sang affected-only khi CI chậm:
    ```yaml
    # OPTIMIZATION (khi CI > 5 phút):
    # pnpm --filter="...[origin/main]" typecheck
    # pnpm --filter="...[origin/main]" test
    ```
  - [ ] 2.3: Đảm bảo `packages/shared` luôn được test khi thay đổi (vì web và api phụ thuộc)

### Phase B: Pre-commit Hook (đã có, verify)

- [ ] Task 3: Verify và hoàn thiện pre-commit hook (AC: #3)
  - [ ] 3.1: Verify `.husky/pre-commit` đang chạy `pnpm exec lint-staged` (đã có)
  - [ ] 3.2: Verify `lint-staged` config trong root `package.json` (đã có):
    ```json
    "lint-staged": {
      "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
      "*.{js,jsx,mjs,cjs}": ["eslint --fix", "prettier --write"],
      "*.{json,md,css,yml,yaml}": ["prettier --write"]
    }
    ```
  - [ ] 3.3: Test hook bằng cách tạo file có lint error → commit → verify bị block
  - [ ] 3.4: Đảm bảo `"prepare": "husky"` có trong root `package.json` scripts (đã có)

### Phase C: Environment Variables

- [ ] Task 4: Hoàn thiện `.env.example` (AC: #4)
  - [ ] 4.1: Review `.env.example` hiện tại, đảm bảo đầy đủ tất cả keys:

    ```env
    # Database
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kiotviet_lite

    # Server
    PORT=3000

    # JWT Authentication
    JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars
    JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars
    ACCESS_TOKEN_TTL_SECONDS=900
    REFRESH_TOKEN_TTL_SECONDS=604800

    # Security
    COOKIE_SECURE=false
    BCRYPT_ROUNDS=12

    # CORS
    ALLOWED_ORIGINS=http://localhost:5173

    # Frontend (apps/web/.env nếu cần)
    VITE_API_URL=http://localhost:3000
    ```

  - [ ] 4.2: Kiểm tra `apps/web` có dùng `VITE_API_URL` không, nếu đang hardcode thì thêm env var
  - [ ] 4.3: Thêm comment mô tả từng key trong `.env.example` (mỗi key 1 dòng comment)
  - [ ] 4.4: Verify `.gitignore` đã có `.env`, `.env.local`, `.env.*.local` (không commit secrets)

### Phase D: Dockerfile cho API

- [ ] Task 5: Tạo Dockerfile cho `apps/api` (AC: #5)
  - [ ] 5.1: Tạo `apps/api/Dockerfile` dạng multi-stage build:

    ```dockerfile
    # Stage 1: Install dependencies
    FROM node:22-alpine AS deps
    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app
    COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
    COPY apps/api/package.json apps/api/
    COPY packages/shared/package.json packages/shared/
    RUN pnpm install --frozen-lockfile --prod=false

    # Stage 2: Build
    FROM deps AS builder
    COPY packages/shared/ packages/shared/
    COPY apps/api/ apps/api/
    RUN pnpm --filter @kiotviet-lite/shared build 2>/dev/null || true
    RUN pnpm --filter @kiotviet-lite/api build

    # Stage 3: Production
    FROM node:22-alpine AS runner
    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app
    COPY --from=deps /app/node_modules ./node_modules
    COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
    COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
    COPY --from=builder /app/apps/api/dist ./apps/api/dist
    COPY --from=builder /app/packages/shared ./packages/shared
    COPY apps/api/drizzle.config.ts apps/api/
    COPY apps/api/src/db/migrations apps/api/src/db/migrations
    EXPOSE 3000
    CMD ["node", "apps/api/dist/index.js"]
    ```

  - [ ] 5.2: Tạo `apps/api/.dockerignore`:
    ```
    node_modules
    dist
    .env
    .env.local
    *.test.ts
    __tests__
    ```
  - [ ] 5.3: Test build Docker image locally: `docker build -f apps/api/Dockerfile -t kiotviet-api .` (chạy từ root monorepo)
  - [ ] 5.4: Verify image chạy được: `docker run -e DATABASE_URL=... -p 3000:3000 kiotviet-api`

### Phase E: Deploy Workflow

- [ ] Task 6: Tạo deploy workflow cho apps/web → Vercel (AC: #5)
  - [ ] 6.1: Approach: dùng Vercel Git Integration (tự động deploy khi push main). KHÔNG cần GitHub Actions riêng cho deploy web
  - [ ] 6.2: Tạo `apps/web/vercel.json`:
    ```json
    {
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    }
    ```
  - [ ] 6.3: Document cách setup Vercel project:
    - Framework Preset: Vite
    - Root Directory: `apps/web`
    - Build Command: `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @kiotviet-lite/web build`
    - Output Directory: `dist`
    - Install Command: (để trống, build command đã handle)
  - [ ] 6.4: Thêm env vars cần thiết trên Vercel dashboard: `VITE_API_URL`

- [ ] Task 7: Tạo deploy workflow cho apps/api → Railway (AC: #5)
  - [ ] 7.1: Approach: dùng Railway Git Integration hoặc GitHub Actions + Railway CLI
  - [ ] 7.2: Tạo `railway.json` (hoặc `railway.toml`) ở root:
    ```json
    {
      "$schema": "https://railway.com/railway.schema.json",
      "build": {
        "builder": "DOCKERFILE",
        "dockerfilePath": "apps/api/Dockerfile"
      },
      "deploy": {
        "startCommand": "node apps/api/dist/index.js",
        "healthcheckPath": "/api/v1/health",
        "restartPolicyType": "ON_FAILURE"
      }
    }
    ```
  - [ ] 7.3: Tạo migration script chạy trước khi start:
    - Option A (chọn): Tạo `apps/api/src/migrate.ts` chạy Drizzle migration programmatically, gọi trong `apps/api/src/index.ts` trước khi start server
    - Option B (không chọn): Start command `pnpm db:migrate && node dist/index.js` (cần pnpm trong production image)
  - [ ] 7.4: Tạo health check endpoint `GET /api/v1/health` trả `{ status: 'ok', timestamp: ... }`

- [ ] Task 8: GitHub Actions deploy workflow (AC: #5)
  - [ ] 8.1: Tạo `.github/workflows/deploy.yml` trigger khi push vào main (sau CI pass):
    ```yaml
    name: Deploy
    on:
      push:
        branches: [main]
    jobs:
      deploy-api:
        runs-on: ubuntu-latest
        needs: [] # Nếu dùng Railway Git Integration, không cần job này
        steps:
          - uses: actions/checkout@v4
          # Railway auto-deploy từ Git, không cần action riêng
          # Job này chỉ là placeholder hoặc dùng cho manual trigger
    ```
  - [ ] 8.2: Thực tế: cả Vercel và Railway đều hỗ trợ Git Integration (auto-deploy khi push main). GitHub Actions deploy workflow chỉ cần cho trường hợp cần custom logic (run migration, notify, etc.)
  - [ ] 8.3: Nếu dùng Git Integration: workflow `deploy.yml` chỉ chứa comment giải thích "Deploy handled by Vercel/Railway Git Integration" và có thể thêm notification step (Slack/Discord nếu cần sau)

### Phase F: Health Check & Migration Script

- [ ] Task 9: Health check endpoint (AC: #5)
  - [ ] 9.1: Tạo route `GET /api/v1/health` trong `apps/api/src/routes/health.routes.ts`:

    ```ts
    import { Hono } from 'hono'

    export function createHealthRoutes() {
      const app = new Hono()
      app.get('/', (c) =>
        c.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version ?? '0.0.0',
        }),
      )
      return app
    }
    ```

  - [ ] 9.2: Mount trong `apps/api/src/index.ts`: `app.route('/api/v1/health', createHealthRoutes())`
  - [ ] 9.3: Health check KHÔNG cần auth middleware (public endpoint)

- [ ] Task 10: Programmatic migration script (AC: #5)
  - [ ] 10.1: Tạo `apps/api/src/db/migrate.ts`:

    ```ts
    import { migrate } from 'drizzle-orm/postgres-js/migrator'
    import { db } from './index'

    export async function runMigrations() {
      console.log('Running database migrations...')
      await migrate(db, { migrationsFolder: './src/db/migrations' })
      console.log('Migrations completed successfully')
    }
    ```

  - [ ] 10.2: Gọi `runMigrations()` trong `apps/api/src/index.ts` trước `serve()`:
    ```ts
    await runMigrations()
    serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 })
    ```
  - [ ] 10.3: Handle migration error gracefully: log error, exit process (Railway sẽ restart)

### Phase G: Verify & Test

- [ ] Task 11: Verify toàn bộ pipeline (AC: #1-#5)
  - [ ] 11.1: `pnpm typecheck` pass
  - [ ] 11.2: `pnpm lint` pass (0 errors)
  - [ ] 11.3: `pnpm test` pass
  - [ ] 11.4: `pnpm build` pass cho cả `apps/web` và `apps/api`
  - [ ] 11.5: Docker build thành công (nếu Docker available locally)
  - [ ] 11.6: Pre-commit hook test: tạo file có lint error → verify commit bị block
  - [ ] 11.7: Verify `ci.yml` syntax bằng `actionlint` (nếu available) hoặc bằng cách push lên branch test

## Dev Notes

### Trạng thái hiện tại (đã có từ Story 1.1-1.4)

| Thành phần      | File                                   | Trạng thái                                                                                           |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Husky v9        | `.husky/pre-commit`                    | Đã cấu hình, chạy `pnpm exec lint-staged`                                                            |
| lint-staged v16 | Root `package.json` `lint-staged` key  | Đã cấu hình cho `*.{ts,tsx}`, `*.{json,md,css,yml,yaml}`                                             |
| ESLint          | `eslint.config.js` (flat config)       | Đã cấu hình: `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`, `simple-import-sort` |
| Prettier        | `prettier` v3.5+ trong devDependencies | Installed, dùng default config                                                                       |
| `.env.example`  | Root `.env.example`                    | Có: DATABASE_URL, PORT, JWT secrets, BCRYPT_ROUNDS, ALLOWED_ORIGINS                                  |
| Build scripts   | Root `package.json`                    | Có: `dev`, `build`, `lint`, `format`, `format:check`, `typecheck`, `test`                            |
| TypeScript      | `tsconfig.base.json` + per-workspace   | Strict mode, đã cấu hình                                                                             |

### Những gì CẦN TẠO MỚI

**GitHub Actions:**

- `.github/workflows/ci.yml` (CI pipeline)
- `.github/workflows/deploy.yml` (deploy documentation/placeholder)

**Dockerfile:**

- `apps/api/Dockerfile` (multi-stage Node 22 Alpine)
- `apps/api/.dockerignore`

**Deploy config:**

- `apps/web/vercel.json` (SPA rewrites)
- `railway.json` (hoặc `railway.toml`) ở root

**Backend additions:**

- `apps/api/src/routes/health.routes.ts`
- `apps/api/src/db/migrate.ts`

**Files SỬA:**

- `.env.example`: thêm comments mô tả, thêm `VITE_API_URL`
- `apps/api/src/index.ts`: mount health route, gọi migration trước serve
- `.gitignore`: verify có `.env.local`, `.env.*.local`

### Architecture alignment

- **CI/CD**: GitHub Actions (theo architecture doc: Infrastructure & Deployment section)
- **Frontend hosting**: Vercel (static SPA, global CDN, free tier)
- **Backend hosting**: Railway (Node.js container, auto-scaling)
- **Database hosting**: Neon PostgreSQL (nhưng story này chỉ cấu hình pipeline, KHÔNG setup Neon)
- **Monitoring**: Sentry (deferred, không trong scope story này)

### Action versions (tháng 4/2026)

| Action               | Version | Ghi chú                               |
| -------------------- | ------- | ------------------------------------- |
| `actions/checkout`   | `v4`    | Stable, dùng Node 20 runtime          |
| `actions/setup-node` | `v4`    | Hỗ trợ pnpm cache built-in            |
| `pnpm/action-setup`  | `v4`    | Đọc version từ `packageManager` field |

Dùng `actions/setup-node@v4` với `cache: 'pnpm'` để cache `~/.pnpm-store`. Không cần `actions/cache` riêng.

### Quyết định thiết kế

**Q1: Affected-only hay full CI?**
Chọn full CI cho MVP. Monorepo chỉ có 3 workspace, tổng CI time dưới 3 phút. Affected-only thêm complexity (cần `--filter="...[origin/main]"`), chưa cần ở quy mô này. Comment cách upgrade khi CI chậm hơn 5 phút.

**Q2: Vercel CLI trong Actions hay Git Integration?**
Chọn Git Integration. Vercel tự detect push main → build → deploy. Đơn giản hơn, không cần manage Vercel token trong secrets. Build command customize qua Vercel dashboard hoặc `vercel.json`.

**Q3: Railway CLI trong Actions hay Git Integration?**
Chọn Git Integration. Railway tự detect Dockerfile và deploy. Đơn giản hơn. Nếu cần custom deploy logic sau này (blue-green, canary), mới chuyển sang Railway CLI + Actions.

**Q4: Migration chạy ở đâu?**
Chọn programmatic migration trong app startup (`apps/api/src/index.ts`). Lý do:

- Đơn giản, không cần CI step riêng
- Railway không cần cài pnpm/drizzle-kit trong production image
- Migration chạy trước server listen, đảm bảo DB ready
- Nếu migration fail → app crash → Railway auto-restart → dev sẽ thấy error log

**Q5: `.env.example` có nên chứa giá trị mặc định?**
Có, cho development. Giá trị mặc định (localhost, default ports) giúp developer setup nhanh. Production values KHÔNG bao giờ nằm trong file này.

### Pattern reuse từ Story 1.1-1.4 (BẮT BUỘC tuân thủ)

| Khu vực           | File hiện có                      | Cách dùng                                                                 |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Root scripts      | `package.json` scripts            | Đã có `build`, `lint`, `typecheck`, `test`. CI chỉ cần gọi các script này |
| ESLint config     | `eslint.config.js`                | Flat config, KHÔNG chuyển sang `.eslintrc.js`. CI chạy `pnpm lint`        |
| Husky             | `.husky/pre-commit`               | Đã có, verify chạy đúng. KHÔNG thay đổi                                   |
| lint-staged       | Root `package.json`               | Đã có config. KHÔNG chuyển sang file `.lintstagedrc` riêng                |
| API entry         | `apps/api/src/index.ts`           | Mount health route + gọi migration tại đây                                |
| Route pattern     | `apps/api/src/routes/*.routes.ts` | `createHealthRoutes()` export Hono app                                    |
| Drizzle migration | `apps/api/src/db/migrations/`     | Đã có migration files từ Story 1.1-1.4                                    |

### Dockerfile best practices

- Multi-stage build: deps → builder → runner (giảm image size)
- Alpine-based Node 22 (nhỏ, bảo mật)
- `pnpm install --frozen-lockfile` (reproducible builds)
- Copy `package.json` trước source code (tận dụng Docker layer cache)
- Production stage không chứa devDependencies
- Migration files PHẢI có trong production image (để `runMigrations()` hoạt động)
- `drizzle.config.ts` CÓ THỂ cần nếu migration dùng config path

### Vercel SPA config cần thiết

`apps/web/vercel.json` với rewrite `/(.*) → /index.html` để TanStack Router hoạt động (deep linking, direct URL access). Không có rewrite → Vercel trả 404 khi user access `/settings/staff` trực tiếp.

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG commit `.env`, `.env.local` hay bất kỳ file chứa secrets
- KHÔNG dùng `actions/setup-node@v3` (deprecated). Dùng `v4`
- KHÔNG dùng `npm` hay `yarn` trong CI. Dùng `pnpm` (consistency với local dev)
- KHÔNG skip pre-commit hook bằng `--no-verify` (nếu hook fail → fix root cause)
- KHÔNG chạy `drizzle-kit push` trên production (destructive). Luôn dùng `drizzle-kit migrate` (additive)
- KHÔNG hardcode Node version trong Dockerfile. Dùng `node:22-alpine` (match `engines.node`)
- KHÔNG copy toàn bộ source code trước `pnpm install` (phá Docker layer cache)
- KHÔNG setup Sentry, error monitoring trong story này (deferred)
- KHÔNG tạo staging environment trong story này (chỉ development + production)
- KHÔNG thêm package mới nào cho story này. Tất cả tools đã có (`husky`, `lint-staged`, `prettier`, `eslint`, `vitest`)

### Project Structure Notes

- `.github/workflows/` đặt ở root monorepo (convention GitHub)
- `apps/api/Dockerfile` đặt trong API workspace nhưng build context là root monorepo (vì cần access `packages/shared`)
- `railway.json` đặt ở root (Railway convention)
- `apps/web/vercel.json` đặt trong web workspace (Vercel convention khi set root directory = apps/web)

### Security checklist

- [ ] `.env.example` KHÔNG chứa secrets thật
- [ ] `.gitignore` chặn `.env`, `.env.local`, `.env.*.local`
- [ ] Dockerfile KHÔNG copy `.env` vào image
- [ ] CI secrets (nếu cần) dùng GitHub Secrets, KHÔNG hardcode trong workflow
- [ ] Health endpoint KHÔNG expose internal info (DB URL, env vars, error stacks)
- [ ] Production migration chạy với database user có quyền tối thiểu (KHÔNG superuser)

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-khi-to-d-n-qun-tr-ca-hng.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Complete Project Directory Structure]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Process Patterns]
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md] (previous story patterns)
- [Source: package.json] (existing scripts, lint-staged, husky)
- [Source: eslint.config.js] (ESLint flat config, import-sort)
- [Source: .husky/pre-commit] (existing pre-commit hook)
- [Source: .env.example] (existing env template)
- [Source: apps/api/package.json] (build: `tsc -b`, start: `node dist/index.js`)
- [Source: apps/web/package.json] (build: `tsc -b && vite build`)
- [Web: GitHub Actions docs](https://docs.github.com/en/actions)
- [Web: Vercel Monorepo docs](https://vercel.com/docs/monorepos)
- [Web: Railway Dockerfile deploy](https://docs.railway.com/guides/dockerfiles)
- [Web: Drizzle ORM migration](https://orm.drizzle.team/docs/migrations)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
