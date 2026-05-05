# Story 11.2: Security Hardening

Status: ready-for-dev

## Story

As a **chủ cửa hàng**,
I want hệ thống bảo vệ khỏi replay attacks, CSRF, và token theft,
so that dữ liệu kinh doanh an toàn khi hệ thống public.

## Acceptance Criteria

1. **Webhook HMAC Replay Protection** (TD6)
   - Given webhook outbound gửi request
   - When server ký HMAC
   - Then header bao gồm timestamp (±5 phút tolerance) + nonce (UUID, dùng 1 lần)
   - And receiver verify cả HMAC + timestamp freshness + nonce uniqueness

2. **Refresh Token Reuse Detection** (TD7)
   - Given refresh token đã bị sử dụng 1 lần
   - When cùng refresh token được dùng lại (reuse attempt)
   - Then revoke toàn bộ token family của user
   - And force re-login tất cả sessions

3. **CSRF Protection** (TD8)
   - Given form submit sensitive action (POST/PUT/DELETE)
   - When request không có valid CSRF token
   - Then trả 403 Forbidden
   - And SameSite=Strict trên session cookie

4. **JWT Secret Validation** (TD9)
   - Given .env file chứa JWT_SECRET
   - When server khởi động
   - Then validate: length ≥ 32 chars, TTL parse valid (15m, 7d format)
   - And reject startup nếu invalid, log error rõ ràng

5. **Audit Log Login/Logout** (TD10)
   - Given user login/logout thành công
   - When sự kiện xảy ra
   - Then insert audit_log: action=login|logout, user_id, ip, user_agent, timestamp
   - And audit log không cho phép sửa/xóa

6. **Webhook SSRF Prevention** (TD19)
   - Given webhook outbound target URL
   - When URL trỏ tới private IP range (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
   - Then block request, log warning "SSRF attempt blocked"
   - And chỉ cho phép public HTTPS URLs
   - NOTE: SSRF check ĐÃ IMPLEMENT trong `webhook.ts:isPrivateHost()`. Task = enforce HTTPS-only + tighten logic.

7. **Crypto Key Validation** (TD20)
   - Given crypto parseKey nhận hex string
   - When string chứa invalid hex chars (non [0-9a-fA-F])
   - Then throw explicit error "Invalid hex in encryption key"
   - And không silent skip chars

8. **Retry Backoff Cap** (TD21)
   - Given retry mechanism với backoff
   - When tính delay cho attempt N
   - Then delay = min(baseDelay \* 4^attempt, 60_000ms)
   - And max cap 60 giây bất kể maxAttempts

9. **Permission Separation** (TD22)
   - Given route `/api/orders` accessible
   - When user có role Staff với permission `orders.view`
   - Then xem được danh sách đơn hàng
   - And `pos.sell` không bao gồm `orders.view` nữa (tách permission)

10. **Notification Context Validation** (TD23)
    - Given POST /api/notifications/emit với context field
    - When context object > 10KB hoặc nested > 3 levels
    - Then trả 422 validation error "context too large"
    - And Zod refine enforce size/depth limit

## Tasks / Subtasks

- [ ] Task 1: Webhook HMAC Replay Protection (AC: #1)
  - [ ] 1.1 Sửa `packages/notifications/src/transports/webhook.ts`: thêm `X-KVL-Timestamp` (ISO string) + `X-KVL-Nonce` (UUID) vào headers
  - [ ] 1.2 HMAC sign payload = `${timestamp}.${nonce}.${body}` thay vì chỉ body
  - [ ] 1.3 Export helper `verifyWebhookSignature(headers, body, secret, maxAgeMs=300_000)` cho receiver
  - [ ] 1.4 Nonce store: in-memory Set + TTL 5 min (đơn giản cho MVP, scale sau dùng Redis)
  - [ ] 1.5 Test: valid signature accepted, expired timestamp rejected, reused nonce rejected

- [ ] Task 2: Refresh Token Reuse Detection (AC: #2)
  - [ ] 2.1 Sửa `apps/api/src/services/auth.service.ts` hàm `rotateRefreshToken`
  - [ ] 2.2 Khi token hash found nhưng ĐÃ revoked (revokedAt != null) → đây là reuse attack
  - [ ] 2.3 Revoke ALL tokens của userId (UPDATE refreshTokens SET revokedAt WHERE userId = X AND revokedAt IS NULL)
  - [ ] 2.4 Return 401 "Token reuse detected, all sessions revoked"
  - [ ] 2.5 Log security event: severity=error, "Refresh token reuse detected"
  - [ ] 2.6 Test: normal rotation OK, reuse revokes family, subsequent requests 401

- [ ] Task 3: CSRF Protection (AC: #3)
  - [ ] 3.1 Trong `apps/api/src/routes/auth.routes.ts`: set cookie `SameSite=Strict` (hiện chưa set)
  - [ ] 3.2 Project dùng Bearer token (không cookie auth cho API calls) → CSRF risk thấp
  - [ ] 3.3 Đảm bảo refresh token cookie set `SameSite=Strict; HttpOnly; Secure`
  - [ ] 3.4 Test: cookie attributes đúng

- [ ] Task 4: JWT Secret & TTL Validation (AC: #4)
  - [ ] 4.1 Sửa `apps/api/src/lib/env.ts`: validate JWT_ACCESS_SECRET + JWT_REFRESH_SECRET length ≥ 32
  - [ ] 4.2 Validate TTL format (accept "900" as seconds, or "15m"/"7d" parseable)
  - [ ] 4.3 Throw on startup nếu validation fail (process.exit(1) với error rõ)
  - [ ] 4.4 Test: short secret rejected, valid secret accepted, bad TTL rejected

- [ ] Task 5: Audit Log Login/Logout (AC: #5)
  - [ ] 5.1 Sửa `apps/api/src/services/auth.service.ts` hàm `loginUser`: insert audit_log sau login thành công
  - [ ] 5.2 Sửa hàm `logoutUser`: insert audit_log
  - [ ] 5.3 Audit log fields: action='login'|'logout', user_id, ip, user_agent, timestamp
  - [ ] 5.4 Dùng bảng `audit_logs` đã tồn tại (schema từ Story 1.4)
  - [ ] 5.5 Test: login creates audit entry, logout creates audit entry

- [ ] Task 6: Webhook SSRF Tighten + HTTPS-only (AC: #6)
  - [ ] 6.1 Sửa `packages/notifications/src/transports/webhook.ts`: reject `http:` protocol (chỉ cho `https:`)
  - [ ] 6.2 Thêm check cho IPv6 private ranges đầy đủ hơn (fe80::, fc00::, fd00::)
  - [ ] 6.3 Thêm DNS rebind prevention: resolve hostname trước khi fetch, check resolved IP
  - [ ] 6.4 Log warning khi block: include URL (sanitized) + reason
  - [ ] 6.5 Test: http rejected, private IP rejected, public https accepted

- [ ] Task 7: Crypto Key Hex Validation (AC: #7)
  - [ ] 7.1 Sửa `packages/notifications/src/crypto.ts` hàm `parseKey`
  - [ ] 7.2 Trước `Buffer.from`: regex test `/^[0-9a-fA-F]{64}$/` (64 hex chars = 32 bytes)
  - [ ] 7.3 Throw "Invalid hex in encryption key: contains non-hex characters" nếu fail
  - [ ] 7.4 Test: valid hex OK, invalid hex rejected with clear message

- [ ] Task 8: Retry Backoff Max Cap (AC: #8)
  - [ ] 8.1 Sửa `packages/notifications/src/retry.ts` line 26
  - [ ] 8.2 Change: `const backoffMs = Math.min(Math.pow(4, attempt - 1) * 1000, 60_000)`
  - [ ] 8.3 Test: attempt 1 = 1s, attempt 2 = 4s, attempt 3 = 16s, attempt 4+ capped at 60s

- [ ] Task 9: Permission Separation (AC: #9)
  - [ ] 9.1 Sửa `packages/shared/src/constants/permissions.ts`: thêm `'orders.view': ['owner', 'manager', 'staff']`
  - [ ] 9.2 Tìm mọi route dùng `pos.sell` cho order viewing → đổi sang `orders.view`
  - [ ] 9.3 File: `apps/api/src/routes/orders.routes.ts` — đổi permission check
  - [ ] 9.4 File: `apps/web/src/components/layout/nav-items.ts` — orders menu item dùng `orders.view`
  - [ ] 9.5 Test: staff với `orders.view` xem được orders, staff chỉ có `pos.sell` không xem được

- [ ] Task 10: Notification Context Size/Depth Validation (AC: #10)
  - [ ] 10.1 Sửa `apps/api/src/routes/notifications.routes.ts`: thêm `.refine()` cho context field
  - [ ] 10.2 Check depth: recursive function maxDepth(obj, limit=3)
  - [ ] 10.3 Check size: `JSON.stringify(context).length <= 10_240`
  - [ ] 10.4 Return 422 "context too large" hoặc "context too deeply nested"
  - [ ] 10.5 Test: shallow small OK, deep nested rejected, large payload rejected

## Dev Notes

### Architecture Constraints

- **Framework**: Hono v4.12.0 + @hono/node-server v1.15.0
- **Auth**: JWT access (15min) + refresh token rotation (7d). Tokens in `jsonwebtoken` package.
- **Logger**: Pino v10.3.1 — dùng `c.get('logger')` trong routes, `logger` import trực tiếp trong services
- **DB**: Drizzle ORM + PostgreSQL. Schema trong `packages/shared/src/schema/`
- **Validation**: Zod 3.x — schema dùng chung client/server
- **Testing**: Vitest + Hono test client `app.request()`

### Existing Middleware Pattern

```typescript
import { createMiddleware } from 'hono/factory'
export const myMiddleware = createMiddleware(async (c, next) => {
  // logic
  await next()
})
```

### Key Files to Touch

| File                                               | Action                             | TD        |
| -------------------------------------------------- | ---------------------------------- | --------- |
| `packages/notifications/src/transports/webhook.ts` | EDIT (timestamp+nonce+HTTPS)       | TD6, TD19 |
| `apps/api/src/services/auth.service.ts`            | EDIT (reuse detection + audit log) | TD7, TD10 |
| `apps/api/src/routes/auth.routes.ts`               | EDIT (cookie SameSite)             | TD8       |
| `apps/api/src/lib/env.ts`                          | EDIT (secret validation)           | TD9       |
| `packages/notifications/src/crypto.ts`             | EDIT (hex validation)              | TD20      |
| `packages/notifications/src/retry.ts`              | EDIT (backoff cap)                 | TD21      |
| `packages/shared/src/constants/permissions.ts`     | EDIT (add orders.view)             | TD22      |
| `apps/api/src/routes/notifications.routes.ts`      | EDIT (context refine)              | TD23      |
| `apps/api/src/routes/orders.routes.ts`             | EDIT (permission change)           | TD22      |
| `apps/web/src/components/layout/nav-items.ts`      | EDIT (permission change)           | TD22      |

### Testing Standards

- Unit tests co-located: `*.test.ts` cạnh source file
- Integration tests: `__tests__/` folder
- Vitest configured sẵn
- Backend: Hono test client `app.request()`
- Pattern: Given/When/Then trong describe/it blocks

### Previous Story Intelligence (11-1)

- Middleware pattern: `createMiddleware` from `hono/factory`
- Error handling: throw `ApiError` with status code + message
- Rate limiter: `hono-rate-limiter` v0.5.3 đã dùng trong notifications.routes.ts
- Auth context: `c.get('auth')` returns `{ userId, storeId, role }`
- Graceful shutdown, CORS, security headers đã implement
- Story 11-1 commit: `ed91956`

### Critical Implementation Notes

1. **TD7 (Token Reuse)**: Hiện tại `rotateRefreshToken` chỉ check `isNull(refreshTokens.revokedAt)`. Nếu token đã revoke thì return "phiên hết hạn" (generic). Cần PHÂN BIỆT: token revoked do rotation vs token bị reuse. Cách: nếu hash found + revokedAt != null + replacedByTokenHash != null → đây là reuse attack.

2. **TD19 (SSRF)**: `isPrivateHost()` đã implement đầy đủ IPv4. Cần thêm: (a) IPv6 ranges, (b) HTTPS-only enforcement, (c) DNS resolution check.

3. **TD6 (HMAC)**: Hiện HMAC sign chỉ body: `createHmac('sha256', hmacSecret).update(body).digest('hex')`. Cần đổi sign = `${timestamp}.${nonce}.${body}`.

4. **TD9 (Env validation)**: `env.ts` dùng getter pattern. Validation cần chạy eager (startup) không phải lazy.

5. **TD22 (Permission)**: `pos.sell` hiện authorize cho cả bán hàng và xem orders. Routes file `orders.routes.ts` cần check. Frontend nav-items cũng cần update.

6. **TD8 (CSRF)**: Project dùng Bearer token cho API, không cookie-based auth. CSRF risk thấp nhất. Focus vào: refresh token cookie set đúng `SameSite=Strict`.

### Project Structure Notes

- Monorepo pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`, `packages/notifications`
- Shared types/schemas: `packages/shared/src/schema/`
- Shared constants: `packages/shared/src/constants/`
- Notification transports: `packages/notifications/src/transports/`
- API routes: `apps/api/src/routes/`
- API services: `apps/api/src/services/`

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-11-technical-debt-resolution.md#Story 11.2]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Authentication & Security]
- [Source: _bmad-output/implementation-artifacts/11-1-production-ready-critical-fixes.md]

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes List

(to be filled after implementation)

### File List

(to be filled after implementation)
