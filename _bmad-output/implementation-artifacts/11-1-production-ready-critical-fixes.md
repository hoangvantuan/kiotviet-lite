# Story 11.1: Production-Ready Critical Fixes

Status: ready-for-dev

## Story

As a **chủ cửa hàng**,
I want hệ thống đủ an toàn và ổn định để deploy production,
so that khách hàng sử dụng mà không gặp lỗi bảo mật hay crash.

## Acceptance Criteria

1. **Rate Limiting** (TD1)
   - Given API server đang chạy
   - When auth endpoint nhận >5 requests/phút từ cùng IP → trả 429, block 1 phút
   - And register endpoint rate limit 3/hour/IP

2. **Graceful Shutdown** (TD2)
   - Given API server nhận SIGTERM
   - When graceful shutdown kích hoạt
   - Then pino.final flush logs, connection pool drain, pending requests hoàn tất (timeout 10s), exit 0
   - And không mất log entry nào

3. **CORS + Security Headers** (TD3)
   - Given web (5173) gọi API (3000) cross-origin
   - Then CORS headers đúng (Access-Control-Allow-Origin, Methods, Headers)
   - And security headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Strict-Transport-Security

4. **Vietnamese Text Audit** (TD4)
   - Given toàn bộ JSX files trong apps/web
   - Then tất cả text hiển thị tiếng Việt CÓ DẤU đầy đủ
   - NOTE: Audit đã xong, tất cả strings hiện tại đã có dấu. Task = verify script confirm, không cần sửa.

5. **CI/CD Pipeline** (TD5)
   - Given code push lên main branch
   - When GitHub Actions CI pipeline chạy
   - Then lint + type-check + unit tests + build pass
   - And deploy trigger (manual cho production)

6. **Mobile Drawer Focus Trap** (TD17)
   - Given mobile drawer navigation mở (≤767px)
   - When user tab focus → focus bị trap trong drawer
   - And khi đóng drawer, focus trả về hamburger button

7. **Bottom Tab Bar Responsive** (TD18)
   - Given bottom tab bar trên ≤375px
   - Then hiển thị tối đa 5 tabs (POS, SP, Đơn, Nợ, Thêm)
   - And "Thêm" mở menu gom các items còn lại

## Tasks / Subtasks

- [ ] Task 1: Rate Limiting Middleware (AC: #1)
  - [ ] 1.1 Tạo `apps/api/src/middleware/rate-limit.middleware.ts`
  - [ ] 1.2 Config: auth endpoints 5req/min/IP, register 3req/hour/IP
  - [ ] 1.3 Sử dụng `hono-rate-limiter` (đã có trong deps v0.5.3)
  - [ ] 1.4 Apply vào auth routes trong `apps/api/src/routes/auth.routes.ts`
  - [ ] 1.5 Viết test rate limit behavior

- [ ] Task 2: Graceful Shutdown (AC: #2)
  - [ ] 2.1 Tạo `apps/api/src/lib/graceful-shutdown.ts`
  - [ ] 2.2 Handle SIGTERM + SIGINT signals
  - [ ] 2.3 pino.final() flush all logs
  - [ ] 2.4 Drain DB connection pool (postgres package close)
  - [ ] 2.5 Wait pending HTTP requests max 10s timeout
  - [ ] 2.6 Exit code 0 on success, 1 on timeout
  - [ ] 2.7 Wire vào `apps/api/src/index.ts` server bootstrap

- [ ] Task 3: Security Headers Middleware (AC: #3)
  - [ ] 3.1 Tạo `apps/api/src/middleware/security-headers.middleware.ts`
  - [ ] 3.2 Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Strict-Transport-Security, Referrer-Policy
  - [ ] 3.3 Harden CORS config: explicit methods/headers whitelist
  - [ ] 3.4 Apply global middleware trong app setup
  - [ ] 3.5 Test headers present trên response

- [ ] Task 4: Vietnamese Text Verification (AC: #4)
  - [ ] 4.1 Script grep tìm ASCII-only Vietnamese strings
  - [ ] 4.2 Chạy verify, confirm 0 violations (đã audit OK)

- [ ] Task 5: GitHub Actions CI Pipeline (AC: #5)
  - [ ] 5.1 Tạo `.github/workflows/ci.yml`
  - [ ] 5.2 Jobs: install → lint → typecheck → test → build
  - [ ] 5.3 Matrix: Node 22, pnpm cache
  - [ ] 5.4 Trigger: push main, pull_request
  - [ ] 5.5 Add build scripts nếu chưa có trong root package.json

- [ ] Task 6: Mobile Drawer Focus Trap (AC: #6)
  - [ ] 6.1 Edit `apps/web/src/components/layout/sidebar.tsx` (MobileDrawer)
  - [ ] 6.2 Implement focus trap khi drawer open (useFocusTrap hook hoặc radix)
  - [ ] 6.3 Return focus to trigger button on close
  - [ ] 6.4 Keyboard: Escape closes drawer

- [ ] Task 7: Bottom Tab Bar "Thêm" Overflow (AC: #7)
  - [ ] 7.1 Edit `apps/web/src/components/layout/bottom-tab-bar.tsx`
  - [ ] 7.2 Show max 5 tabs: POS, SP, Đơn, Nợ, Thêm
  - [ ] 7.3 "Thêm" tab opens popover/sheet with remaining nav items
  - [ ] 7.4 Active state highlight cho item trong overflow menu

## Dev Notes

### Architecture Constraints

- **Framework**: Hono v4.12.0 + @hono/node-server v1.15.0
- **Rate limiter**: `hono-rate-limiter` v0.5.3 (already in package.json, unused)
- **Logger**: Pino v10.3.1 + pino-roll v4.0.0
- **DB**: postgres v3.4.0 (connection pool built-in)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Radix primitives

### Existing Middleware Pattern

```typescript
// Pattern from auth.middleware.ts
import { createMiddleware } from 'hono/factory'
import type { AuthContext } from '../types'

export const requireAuth = createMiddleware<{ Variables: { auth: AuthContext } }>(
  async (c, next) => {
    // validation logic
    await next()
  },
)
```

Follow this exact pattern for new middleware.

### Key Files to Touch

| File                                                     | Action                                  |
| -------------------------------------------------------- | --------------------------------------- |
| `apps/api/src/middleware/rate-limit.middleware.ts`       | CREATE                                  |
| `apps/api/src/lib/graceful-shutdown.ts`                  | CREATE                                  |
| `apps/api/src/middleware/security-headers.middleware.ts` | CREATE                                  |
| `apps/api/src/index.ts`                                  | EDIT (wire shutdown + security headers) |
| `apps/api/src/routes/auth.routes.ts`                     | EDIT (apply rate limit)                 |
| `.github/workflows/ci.yml`                               | CREATE                                  |
| `apps/web/src/components/layout/sidebar.tsx`             | EDIT (focus trap)                       |
| `apps/web/src/components/layout/bottom-tab-bar.tsx`      | EDIT (overflow menu)                    |

### Testing Standards

- Unit tests co-located: `*.test.ts` next to source
- Integration tests: `__tests__/` folder
- Use Vitest (already configured)
- Backend: supertest-style via Hono test client `app.request()`
- Frontend: @testing-library/react

### Previous Story Intelligence

From Epic 10 (Notifications):

- Middleware pattern established: use `createMiddleware` from `hono/factory`
- Error handling: throw `ApiError` with status code + message
- Logging: use `c.get('logger')` from request context (injected by request-logger middleware)
- Auth context: `c.get('auth')` returns `{ userId, storeId, role }`

### CORS Current State

CORS already configured via Hono built-in in `apps/api/src/index.ts`:

- Uses `ALLOWED_ORIGINS` env var (comma-separated)
- Dev defaults: localhost:5173, localhost:5174
- Task 3 enhances with explicit methods/headers whitelist + security headers (new middleware)

### CI/CD Notes

- No `.github/workflows/` directory exists currently
- Build commands: `pnpm -r build`, `pnpm -r lint`, `pnpm -r typecheck`
- Test command: `pnpm -r test`
- pnpm version: check `packageManager` field in root package.json

### Vietnamese Text Status

Audit complete: all hardcoded Vietnamese strings in apps/web already use proper diacritics.
Task 4 = write verification script to prove compliance, not to fix anything.

### Mobile Nav Current State

- `bottom-tab-bar.tsx`: renders all tabs, no overflow logic
- `sidebar.tsx`: exports `MobileDrawer()` component, no focus trap
- Both use Radix/shadcn primitives (Sheet for drawer, etc.)

### References

- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md]
- [Source: _bmad-output/planning-artifacts/epics/epic-11-technical-debt-resolution.md]

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes List

(to be filled after implementation)

### File List

(to be filled after implementation)
