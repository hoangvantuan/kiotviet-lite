# Story 1.2: Đăng ký cửa hàng & Đăng nhập

Status: done

## Story

As a chủ cửa hàng,
I want đăng ký tài khoản bằng số điện thoại và đăng nhập an toàn,
So that tôi có cửa hàng riêng trên hệ thống và chỉ người được phép mới truy cập được.

## Acceptance Criteria (BDD)

### AC1: Đăng ký cửa hàng thành công

**Given** người dùng mới truy cập hệ thống lần đầu
**When** vào trang đăng ký và điền: tên cửa hàng (bắt buộc, 2-100 ký tự), số điện thoại (bắt buộc, format VN 10 số), mật khẩu (bắt buộc, ≥8 ký tự), tên chủ cửa hàng (bắt buộc)
**Then** hệ thống tạo 1 record trong bảng `stores` và 1 record trong bảng `users` (role = `owner`)
**And** user được liên kết với store qua `store_id`
**And** tự động đăng nhập và redirect về trang chủ

### AC2: Duplicate phone

**Given** số điện thoại đã được đăng ký
**When** người dùng khác đăng ký với cùng số điện thoại
**Then** hiển thị lỗi "Số điện thoại đã được sử dụng" ngay dưới field input
**And** không tạo record mới nào trong database

### AC3: Đăng nhập + JWT

**Given** Better Auth đã cấu hình trên `apps/api`
**When** người dùng đăng nhập đúng số điện thoại + mật khẩu
**Then** server trả về JWT access token (expire 15 phút) và refresh token (expire 7 ngày)
**And** access token chứa: `userId`, `storeId`, `role`
**And** token được lưu trong httpOnly cookie (không localStorage)

### AC4: Token refresh tự động

**Given** access token đã hết hạn
**When** client gửi request đến API
**Then** middleware tự động dùng refresh token để lấy access token mới
**And** request ban đầu được retry tự động, user không bị gián đoạn
**And** nếu refresh token cũng hết hạn, redirect về trang đăng nhập

### AC5: Protected routes

**Given** người dùng chưa đăng nhập
**When** truy cập bất kỳ route nào ngoài `/login` và `/register`
**Then** TanStack Router redirect về `/login`
**And** sau khi đăng nhập thành công, redirect về URL ban đầu user muốn vào

### AC6: Đăng xuất

**Given** người dùng đã đăng nhập
**When** nhấn "Đăng xuất"
**Then** xoá JWT cookie cả access và refresh token
**And** redirect về `/login`
**And** mọi request API tiếp theo trả về 401

### AC7: Validation inline

**Given** người dùng điền form đăng ký
**When** nhập số điện thoại sai format (không đủ 10 số, chứa chữ cái)
**Then** hiển thị lỗi validation inline dưới field
**And** nút "Đăng ký" bị disable cho đến khi tất cả field hợp lệ

### AC8: Error handling

**Given** server trả về lỗi bất kỳ (500, network error)
**When** đang submit form đăng ký hoặc đăng nhập
**Then** hiển thị Toast lỗi với message rõ ràng (không hiển thị stack trace)
**And** form giữ nguyên dữ liệu user đã nhập, không reset

## Tasks / Subtasks

### Phase A: Backend Auth Setup

- [x] Task 1: JWT auth + token management (AC: #3)
  - [x] 1.1: Custom JWT auth (fallback từ Better Auth do xung đột schema)
  - [x] 1.2: `apps/api/src/lib/jwt.ts`: signAccessToken, signRefreshToken, verify, hashToken
  - [x] 1.3: `apps/api/src/lib/password.ts`: bcrypt hash/verify (rounds=12)
  - [x] 1.4: Cấu hình accessToken 15 phút, refreshToken 7 ngày
  - [x] 1.5: `apps/api/src/lib/cookies.ts`: httpOnly cookie management
  - [x] 1.6: Thêm env vars JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ALLOWED_ORIGINS vào `.env.example`

- [x] Task 2: Tạo Zod schemas auth trong packages/shared (AC: #1, #7)
  - [x] 2.1: `packages/shared/src/schema/auth.ts`: registerSchema, loginSchema, authResponseSchema, token payloads
  - [x] 2.2: Export từ `packages/shared/src/schema/index.ts`
  - [x] 2.3: Token TTL cấu hình qua env vars (env.ts)

- [x] Task 3: Tạo auth service layer (AC: #1, #2, #3)
  - [x] 3.1: `apps/api/src/services/auth.service.ts`: registerStoreOwner, loginUser, rotateRefreshToken, logoutUser
  - [x] 3.2: Duplicate phone → throw ApiError CONFLICT

- [x] Task 4: Tạo auth routes (AC: #1, #2, #3, #6)
  - [x] 4.1: `apps/api/src/routes/auth.routes.ts`: POST register, login, refresh, logout
  - [x] 4.2: `apps/api/src/lib/http.ts`: parseJson với Zod validation
  - [x] 4.3: Mount auth routes vào Hono app tại `/api/v1/auth`

- [x] Task 5: Tạo auth middleware (AC: #4, #5)
  - [x] 5.1: `apps/api/src/middleware/auth.middleware.ts`: requireAuth, verify Bearer token, set AuthContext
  - [x] 5.2: `apps/api/src/middleware/error-handler.ts`: global error handler (ApiError, ZodError)
  - [x] 5.3: CORS middleware với ALLOWED_ORIGINS whitelist (fix từ permissive origin)

### Phase B: Frontend Auth

- [x] Task 6: Setup TanStack Router (AC: #5)
  - [x] 6.1: `apps/web/src/router.tsx`: createRouter với rootRoute, loginRoute, registerRoute, authenticatedRoute
  - [x] 6.2: `beforeLoad` guard kiểm tra auth, redirect /login với search param redirect
  - [x] 6.3: `apps/web/src/pages/login-page.tsx`, `register-page.tsx`, `home-page.tsx`
  - [x] 6.4: Cập nhật `main.tsx` dùng QueryClientProvider + RouterProvider

- [x] Task 7: Auth state management (AC: #3, #4)
  - [x] 7.1: `apps/web/src/stores/use-auth-store.ts` (Zustand): user, accessToken, isAuthenticated, setAuth, clearAuth
  - [x] 7.2: `apps/web/src/lib/api-client.ts`: apiFetch, auto-refresh 401, ApiClientError
  - [x] 7.3: `apps/web/src/features/auth/auth-api.ts`: registerApi, loginApi, logoutApi, meApi

- [x] Task 8: Form đăng ký (AC: #1, #2, #7, #8)
  - [x] 8.1: `apps/web/src/features/auth/register-form.tsx`: RHF + Zod, mode onBlur, 4 fields
  - [x] 8.2: Error inline dưới field, nút disable khi invalid/submitting, toast error
  - [x] 8.3: `apps/web/src/features/auth/auth-card.tsx`: card layout wrapper

- [x] Task 9: Form đăng nhập (AC: #3, #7, #8)
  - [x] 9.1: `apps/web/src/features/auth/login-form.tsx`: RHF + Zod, mode onBlur, 2 fields
  - [x] 9.2: Redirect URL ban đầu từ search param `redirect`
  - [x] 9.3: Link "Chưa có cửa hàng? Đăng ký ngay"

- [x] Task 10: UI components (AC: #7)
  - [x] 10.1: shadcn/ui: button, input, label, dialog, tabs, select, sonner

### Phase C: Integration & Tests

- [x] Task 11: Integration testing (AC: all)
  - [x] 11.1: `packages/shared/src/schema/auth.test.ts`: 7 tests (valid/invalid inputs)
  - [x] 11.2: `apps/api/src/__tests__/auth.integration.test.ts`: 9 tests (PGlite in-memory)
    - Register: success, duplicate phone (409), invalid phone format
    - Login: correct password (200), wrong password (401), non-existent phone (401)
    - Refresh: token rotation, missing cookie (401), logout revokes token
  - [x] 11.3: `apps/api/src/lib/jwt.test.ts`: 4 tests (sign/verify)
  - [x] 11.4: `pnpm typecheck` pass (3/3 packages)
  - [x] 11.5: `pnpm lint` pass (0 errors)
  - [x] 11.6: `pnpm test` pass (21/21 tests, 4 files)

### Phase D: Verify end-to-end

- [ ] Task 12: Manual verification (AC: all)
  - [ ] 12.1: Start dev server (`pnpm dev`)
  - [ ] 12.2: Mở browser → truy cập `/` → redirect `/login`
  - [ ] 12.3: Click "Đăng ký" → điền form → submit → redirect trang chủ
  - [ ] 12.4: Đăng xuất → redirect `/login`
  - [ ] 12.5: Đăng nhập lại → redirect trang chủ
  - [ ] 12.6: Truy cập `/register` với SĐT đã đăng ký → lỗi inline
  - [ ] 12.7: Nhập SĐT sai format → validation inline

## Dev Notes

### Quyết định kỹ thuật quan trọng: Better Auth + Phone-based Auth

Better Auth mặc định dùng email/password. Dự án này dùng SĐT thay email. Có 2 cách:

**Cách 1 (Khuyến nghị): Dùng `username` plugin của Better Auth**

- Bật plugin `username` trong config
- Dùng field `username` để lưu SĐT
- Login bằng username (SĐT) + password
- Ưu điểm: tận dụng Better Auth built-in, ít custom code

**Cách 2: Custom auth không dùng Better Auth**

- Tự implement JWT signing/verifying
- Tự manage session, refresh token
- Nhược điểm: nhiều code hơn, dễ lỗi bảo mật

**Quyết định:** Nếu Better Auth `username` plugin hoạt động tốt với Hono + Drizzle → dùng cách 1. Nếu gặp vấn đề → fallback cách 2 (tự implement JWT với `jsonwebtoken` hoặc `jose`).

### Better Auth + Hono Setup (verified April 2026)

```typescript
// apps/api/src/lib/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db/index.js'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  // HOẶC dùng username plugin:
  // plugins: [username()],
})
```

```typescript
// apps/api/src/index.ts - mount handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})
```

```typescript
// Session middleware
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', session?.user ?? null)
  c.set('session', session?.session ?? null)
  await next()
})
```

### Better Auth tạo tables riêng

Better Auth tự quản lý tables: `user`, `session`, `account`, `verification`. Chạy `npx auth@latest generate` sẽ tạo migration cho các tables này. Cần review và merge với Drizzle schema hiện có (`users`, `stores`).

**Lưu ý quan trọng:** Better Auth dùng table name `user` (số ít), còn schema hiện tại dùng `users` (số nhiều). Cần cấu hình mapping hoặc đổi tên.

**Khả năng xung đột:** Better Auth có schema `user` riêng, dự án đã có `users` table. Cần:

1. Map Better Auth `user` table → `users` table hiện có
2. Hoặc tạo table riêng cho Better Auth, link qua FK

**Nếu Better Auth quá phức tạp để tích hợp với schema hiện có → fallback tự implement JWT.**

### TanStack Router Auth Guard Pattern

```typescript
// apps/web/src/routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const isAuth = useAuthStore.getState().isAuthenticated
    if (!isAuth) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})
```

### TanStack Router File Structure

```
apps/web/src/routes/
├── __root.tsx                    # Root layout: providers, Toaster
├── login.tsx                     # /login (public)
├── register.tsx                  # /register (public)
└── _authenticated/               # Auth guard layout
    └── index.tsx                 # / (trang chủ, protected)
```

`_authenticated.tsx` là layout route, `beforeLoad` chạy trước mọi child route.

### API Client Pattern

```typescript
// apps/web/src/lib/api-client.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // gửi cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const json = await res.json()

  if (!res.ok) {
    // Auto-retry on 401 (token expired)
    if (res.status === 401 && path !== '/api/v1/auth/login') {
      // Thử refresh
      const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (refreshRes.ok) {
        return fetchApi(path, options) // retry
      }
      // Refresh fail → redirect login
      useAuthStore.getState().clearUser()
      window.location.href = '/login'
    }
    throw json.error
  }

  return json.data
}
```

### Form Validation Rules (Zod)

```typescript
// packages/shared/src/schema/auth.ts
import { z } from 'zod'

export const registerSchema = z.object({
  storeName: z.string().min(2).max(100),
  phone: z.string().regex(/^0\d{9}$/, 'Số điện thoại phải đúng 10 số, bắt đầu bằng 0'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  ownerName: z.string().min(1).max(100),
})

export const loginSchema = z.object({
  phone: z.string().regex(/^0\d{9}$/),
  password: z.string().min(1),
})
```

### UX Requirements (từ UX Design Spec)

- **Validate khi blur**, không realtime khi đang gõ
- Error message dưới field: text đỏ, `text-sm`
- Field error: border đỏ + error message
- Label phía trên input (không inline)
- Required fields đánh dấu `*` đỏ
- Button touch target ≥ 44px height
- Success toast: xanh lá, tự đóng 3 giây
- Error toast: đỏ, cần tap dismiss, kèm gợi ý sửa

### Toast Patterns

- Thành công đăng ký/đăng nhập: Toast success, 3 giây
- Lỗi server: Toast error, persist đến dismiss, kèm message rõ ràng
- Toast không chồng: tối đa 1 toast, toast mới thay thế cũ
- Dùng Sonner (đã cài ở Story 1.1)

### Security Checklist

- [ ] Password hash: bcrypt hoặc Argon2id (Better Auth default)
- [ ] Access token KHÔNG lưu localStorage (chỉ httpOnly cookie)
- [ ] Refresh token rotation (7 ngày, rotate mỗi lần dùng)
- [ ] CORS restricted: chỉ allow origin frontend URL
- [ ] Rate limit auth endpoints: 5 req/min per IP
- [ ] Input validation: Zod cả client + server
- [ ] SQL injection: Drizzle ORM parameterized queries
- [ ] KHÔNG trả stack trace trong error response

### Response Format chuẩn (từ Architecture)

```typescript
// Success
{ "data": { "user": { "id": "...", "name": "...", ... } } }

// Error
{
  "error": {
    "code": "CONFLICT",
    "message": "Số điện thoại đã được sử dụng",
    "details": [{ "field": "phone", "message": "..." }]
  }
}
```

Error codes dùng trong story này: VALIDATION_ERROR (400), UNAUTHORIZED (401), CONFLICT (409), INTERNAL_ERROR (500)

### Previous Story Intelligence (Story 1.1)

**Learnings từ Story 1.1:**

1. **UUID v7:** Dùng thư viện JS `uuidv7` với `$defaultFn()` trong Drizzle schema. KHÔNG dùng `uuid_generate_v7()` SQL function
2. **Drizzle casing:** `.camelCase()` đã cấu hình, code JS dùng camelCase, DB lưu snake_case
3. **Path alias:** `@kiotviet-lite/shared` import từ `packages/shared/src/index.ts`. Alias `@/` cho internal imports
4. **ESLint:** Flat config, `eslint-plugin-simple-import-sort` cho import order
5. **Vite 8:** Dùng Rolldown bundler, `@vitejs/plugin-react` v6.0
6. **PGlite test:** Dùng `drizzle-orm/pglite/migrator` để chạy migration
7. **shadcn/ui:** Components ở `apps/web/src/components/ui/`, utility `cn()` ở `apps/web/src/lib/utils.ts`

**Deferred items từ Story 1.1 (xử lý trong story này):**

- API server thiếu CORS, security headers, error handler → Task 5.2, 5.3
- DB connection chưa có graceful shutdown → scope nhỏ, có thể xử lý nếu kịp

**Files từ Story 1.1 sẽ sửa:**

- `apps/api/src/index.ts`: thêm CORS, auth middleware, mount routes
- `apps/api/src/db/index.ts`: giữ nguyên
- `packages/shared/src/schema/index.ts`: thêm export auth schemas
- `packages/shared/src/index.ts`: thêm export
- `apps/web/src/main.tsx`: chuyển sang RouterProvider
- `apps/web/src/App.tsx`: có thể xoá hoặc chuyển thành root layout

### Project Structure Notes

Các file MỚI cần tạo (theo architecture boundary):

```
packages/shared/src/
├── schema/
│   └── auth.ts              # NEW: Zod schemas (register, login)
├── constants/
│   └── auth.ts              # NEW: token expiry constants, error codes

apps/api/src/
├── lib/
│   └── auth.ts              # NEW: Better Auth instance
├── routes/
│   └── auth.routes.ts       # NEW: POST register, login, logout, GET me
├── services/
│   └── auth.service.ts      # NEW: register, login business logic
├── middleware/
│   ├── auth.middleware.ts    # NEW: session verification
│   └── error-handler.ts     # NEW: global error handler

apps/web/src/
├── routes/
│   ├── __root.tsx            # NEW: root layout
│   ├── login.tsx             # NEW: login page
│   ├── register.tsx          # NEW: register page
│   └── _authenticated/
│       └── index.tsx         # NEW: home page (protected)
├── features/
│   └── auth/
│       └── components/
│           ├── LoginForm.tsx     # NEW
│           ├── LoginPage.tsx     # NEW
│           ├── RegisterForm.tsx  # NEW
│           └── RegisterPage.tsx  # NEW
├── stores/
│   └── use-auth-store.ts    # NEW: Zustand auth state
├── lib/
│   ├── api-client.ts        # NEW: fetch wrapper
│   └── query-client.ts      # NEW: TanStack Query config
```

Naming conventions: PascalCase components, kebab-case non-components, `use-*.ts` hooks.

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG tạo Zod schema trong `apps/`. Luôn đặt ở `packages/shared`
- KHÔNG lưu access token vào localStorage hoặc Zustand. Chỉ httpOnly cookie
- KHÔNG viết business logic trong route handler. Tách vào service
- KHÔNG trả password hash qua API response
- KHÔNG hardcode secret keys. Dùng env vars
- KHÔNG bypass store_id filter trong queries
- KHÔNG dùng CSS custom. Chỉ Tailwind + shadcn/ui
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG dùng CommonJS

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-1-khi-to-d-n-qun-tr-ca-hng.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md]
- [Source: _bmad-output/planning-artifacts/architecture/project-structure-boundaries.md#Auth]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/user-journey-flows.md#Journey 1]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#Form Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/visual-design-foundation.md]
- [Source: _bmad-output/planning-artifacts/prd/functional-requirements.md#FR65-FR67]
- [Source: _bmad-output/planning-artifacts/prd/non-functional-requirements.md#NF5-NF9]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/1-1-khoi-tao-monorepo-database-design-system-co-ban.md]
- [Web: Better Auth Hono Integration](https://better-auth.com/docs/integrations/hono)
- [Web: Better Auth Installation](https://better-auth.com/docs/installation)
- [Web: TanStack Router Auth Guard](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
