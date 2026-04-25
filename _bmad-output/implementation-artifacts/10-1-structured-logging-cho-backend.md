# Story 10.1: Structured Logging cho Backend

Status: ready-for-dev

## Story

As a developer,
I want structured JSON logging với request correlation trên backend Hono,
So that tôi debug nhanh, trace request xuyên suốt, và ship log sang hệ thống aggregation sau này mà không refactor.

## Acceptance Criteria (BDD)

### AC1: Mọi log line là JSON hợp lệ với requestId

**Given** backend Hono đang chạy
**When** bất kỳ request nào đến API
**Then** mỗi log line là JSON hợp lệ chứa: `level`, `time` (ISO 8601), `requestId` (UUID v7), `msg`
**And** response header chứa `X-Request-Id` cùng giá trị

### AC2: Redact field nhạy cảm

**Given** log chứa field nhạy cảm (`password`, `pin`, `botToken`, `authorization` header, `secret`)
**When** Pino ghi log
**Then** các field đó bị redact thành `[Redacted]`

### AC3: Log rotation theo ngày

**Given** môi trường production
**When** app chạy qua đêm
**Then** log rotate theo ngày (`app-YYYY-MM-DD.log`), giữ 30 ngày, max 100MB/file

### AC4: Pino-pretty cho development

**Given** môi trường development
**When** dev chạy `pnpm dev`
**Then** log hiển thị pino-pretty (có màu, dễ đọc)

### AC5: Log level cấu hình qua env

**Given** developer muốn kiểm tra log level
**When** set env `LOG_LEVEL=debug`
**Then** log hiển thị từ mức debug trở lên
**And** mức mặc định là `info`

### AC6: Error handler dùng logger thay console

**Given** error handler hiện tại dùng `console.error`
**When** exception xảy ra
**Then** error được log qua Pino logger với level `error`, kèm `requestId`, error message, và stack trace

## Tasks / Subtasks

### Phase A: Logger Core Setup

- [ ] Task 1: Cài đặt dependencies (AC: #1, #3, #4)
  - [ ] 1.1: `pnpm --filter api add pino pino-roll`
  - [ ] 1.2: `pnpm --filter api add -D pino-pretty @types/pino-roll` (nếu cần)
  - [ ] 1.3: Verify import ESM hoạt động (`import pino from 'pino'`)

- [ ] Task 2: Tạo logger module `apps/api/src/lib/logger.ts` (AC: #1, #2, #4, #5)
  - [ ] 2.1: Tạo file `apps/api/src/lib/logger.ts` với Pino instance
  - [ ] 2.2: Config `level` từ `process.env.LOG_LEVEL ?? 'info'`
  - [ ] 2.3: Config `formatters.level`: `(label) => ({ level: label })` (ghi tên level thay vì số)
  - [ ] 2.4: Config `timestamp`: `pino.stdTimeFunctions.isoTime` (ISO 8601)
  - [ ] 2.5: Config `redact`: paths = `['req.headers.authorization', '*.password', '*.pin', '*.pinHash', '*.botToken', '*.secret', '*.hmacSecret', '*.configEncrypted']`
  - [ ] 2.6: Development: dùng `pino.transport({ target: 'pino-pretty' })` khi `NODE_ENV !== 'production'`
  - [ ] 2.7: Production: multistream gồm stdout JSON + pino-roll file (xem Task 4)
  - [ ] 2.8: Export `logger` instance và type `Logger` từ module

### Phase B: Request Correlation Middleware

- [ ] Task 3: Tạo middleware `apps/api/src/middleware/request-logger.middleware.ts` (AC: #1)
  - [ ] 3.1: Generate `requestId` dùng `crypto.randomUUID()` (UUID v4, Node 22 native). Nếu muốn UUID v7 dùng package hiện có hoặc custom. **Lưu ý:** ADR ghi UUID v7 nhưng `crypto.randomUUID()` cho v4. Chọn v4 vì native, tương thích, đủ cho correlation. Nếu team muốn v7, cần thêm dependency
  - [ ] 3.2: Set response header `X-Request-Id` = requestId
  - [ ] 3.3: Tạo child logger: `const reqLogger = logger.child({ requestId })`
  - [ ] 3.4: Lưu `reqLogger` vào Hono context: `c.set('logger', reqLogger)` (đăng ký type qua Hono `Variables`)
  - [ ] 3.5: Log request bắt đầu: `reqLogger.info({ method, path, userAgent }, 'request started')`
  - [ ] 3.6: Log request kết thúc: `reqLogger.info({ method, path, status, duration }, 'request completed')`
  - [ ] 3.7: Duration tính bằng `performance.now()` (milliseconds)

- [ ] Task 3b: Khai báo Hono Variables type (AC: #1)
  - [ ] 3b.1: Tạo hoặc mở rộng file `apps/api/src/types.ts`: khai báo `Variables` type chứa `logger: pino.Logger`
  - [ ] 3b.2: Cập nhật tất cả `new Hono()` sang `new Hono<{ Variables: AppVariables }>()` (hoặc merge với `Variables` hiện có chứa `auth`)
  - [ ] 3b.3: Verify `c.get('logger')` type-safe trong route handlers

### Phase C: Production File Rotation

- [ ] Task 4: Cấu hình pino-roll cho production (AC: #3)
  - [ ] 4.1: Trong `logger.ts`, khi `NODE_ENV === 'production'`:

    ```ts
    import { multistream } from 'pino'
    import { createRollStream } from 'pino-roll'

    const fileStream = await createRollStream({
      file: join(LOG_DIR, 'app'),
      frequency: 'daily',
      extension: '.log',
      limit: { count: 30 },
      size: '100m',
    })

    const streams = [{ stream: process.stdout }, { stream: fileStream }]

    export const logger = pino(pinoConfig, multistream(streams))
    ```

  - [ ] 4.2: `LOG_DIR` lấy từ env var `LOG_DIR` hoặc mặc định `./logs`
  - [ ] 4.3: Thêm `LOG_DIR` vào `apps/api/src/lib/env.ts` (optional, fallback `./logs`)
  - [ ] 4.4: Thêm `logs/` vào `.gitignore` (nếu chưa có)
  - [ ] 4.5: Thêm entry vào `apps/api/.env.example`: `LOG_DIR=./logs` và `LOG_LEVEL=info`

### Phase D: Wire Logger vào App

- [ ] Task 5: Mount middleware vào app (AC: #1, #6)
  - [ ] 5.1: Import và mount `requestLoggerMiddleware` vào `apps/api/src/index.ts` TRƯỚC các routes, SAU cors
  - [ ] 5.2: Thứ tự middleware: `cors` → `requestLogger` → routes → `errorHandler`

- [ ] Task 6: Cập nhật error handler dùng logger (AC: #6)
  - [ ] 6.1: Sửa `apps/api/src/middleware/error-handler.ts`:
    - Thay `console.error('[unhandled]', err)` bằng `c.get('logger')?.error({ err, requestId }, 'unhandled error')`
    - Giữ nguyên logic phân biệt `ApiError` / `ZodError` / unhandled
    - Chỉ log ở level `error` cho unhandled errors (ApiError < 500 log ở `warn`, >= 500 log `error`)

- [ ] Task 7: Thay thế console.log hiện có (AC: #1)
  - [ ] 7.1: Tìm tất cả `console.log`, `console.error`, `console.warn` trong `apps/api/src/`
  - [ ] 7.2: Thay bằng `logger.info(...)`, `logger.error(...)`, `logger.warn(...)` tương ứng
  - [ ] 7.3: Server start message: giữ `console.log` DUY NHẤT cho "API server running at..." (logger chưa sẵn sàng lúc boot)

### Phase E: Tests

- [ ] Task 8: Unit tests cho logger module (AC: #1, #2, #4, #5)
  - [ ] 8.1: `apps/api/src/lib/logger.test.ts`:
    - Logger tồn tại, là Pino instance
    - Default level = `info`
    - Custom level qua env
    - Log output là JSON hợp lệ chứa `level`, `time`, `msg`
    - Redact: log object chứa `password` → output có `[Redacted]`
  - [ ] 8.2: Test bằng `pino({ level: 'info' }, writable)` với custom WritableStream để capture output

- [ ] Task 9: Integration test cho request logging middleware (AC: #1, #6)
  - [ ] 9.1: `apps/api/src/__tests__/logging.integration.test.ts`:
    - Request tới `/api/v1/health` → response header có `X-Request-Id` (UUID format)
    - Request tới endpoint không tồn tại → log có `requestId`
    - Throw error trong handler → error log có `requestId` + error info
  - [ ] 9.2: Dùng Hono test client (`app.request(...)`) giống pattern test hiện tại

- [ ] Task 10: Verify không regression (AC: all)
  - [ ] 10.1: `pnpm typecheck` pass
  - [ ] 10.2: `pnpm lint` pass
  - [ ] 10.3: `pnpm test` pass (toàn bộ suite, bao gồm tests từ Story 1.1-1.4)
  - [ ] 10.4: Chạy `pnpm dev` → verify log format đẹp (pino-pretty, có màu)
  - [ ] 10.5: Gọi vài API endpoints → verify response header `X-Request-Id` có mặt

## Dev Notes

### Kiến trúc tổng quan

Story này implement **Logger nền** (1 trong 2 lớp của hệ thống Observability). Logger nền tách hoàn toàn với Notification Service (Story 10.2+). Vai trò: ghi structured log cho ops/debug, KHÔNG phải cho alert nghiệp vụ.

```
Service Layer → Pino Logger → stdout JSON (production)
                            → pino-pretty (development)
                            → File rotating (production)
```

### Pattern reuse từ Story 1.2-1.4 (BẮT BUỘC tuân thủ)

| Khu vực         | File hiện có                                 | Cách dùng                                                                                 |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Error handler   | `apps/api/src/middleware/error-handler.ts`   | SỬA: thay `console.error` bằng `logger.error`. Giữ nguyên logic ApiError/ZodError         |
| Auth middleware | `apps/api/src/middleware/auth.middleware.ts` | KHÔNG SỬA. Logger middleware chạy TRƯỚC auth, `requestId` có sẵn cho cả request chưa auth |
| Env config      | `apps/api/src/lib/env.ts`                    | THÊM: `logLevel`, `logDir` (optional)                                                     |
| App entry       | `apps/api/src/index.ts`                      | SỬA: mount requestLogger middleware                                                       |
| Hono Variables  | Hiện tại `auth` object qua `c.get('auth')`   | MỞ RỘNG: thêm `logger` vào Variables type                                                 |

### Files cần TẠO MỚI

- `apps/api/src/lib/logger.ts` (Pino instance, multistream production, pino-pretty dev)
- `apps/api/src/middleware/request-logger.middleware.ts` (generate requestId, child logger, timing)
- `apps/api/src/types.ts` (hoặc mở rộng file type hiện có, khai báo Hono Variables)
- `apps/api/src/lib/logger.test.ts` (unit test)
- `apps/api/src/__tests__/logging.integration.test.ts` (integration test)

### Files cần SỬA

- `apps/api/src/index.ts`: mount requestLogger middleware
- `apps/api/src/middleware/error-handler.ts`: dùng `c.get('logger')` thay `console.error`
- `apps/api/src/lib/env.ts`: thêm `logLevel`, `logDir`
- `apps/api/package.json`: thêm dependencies pino, pino-roll, pino-pretty
- `.gitignore`: thêm `logs/`
- `apps/api/.env.example`: thêm `LOG_DIR`, `LOG_LEVEL`

### Cấu hình Pino (reference implementation)

```ts
// apps/api/src/lib/logger.ts
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

const pinoConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.passwordHash',
      '*.pin',
      '*.pinHash',
      '*.botToken',
      '*.secret',
      '*.hmacSecret',
      '*.configEncrypted',
    ],
    censor: '[Redacted]',
  },
}

// Development: pino-pretty transport
// Production: stdout JSON + file rotation (multistream)
```

### Middleware pattern (reference implementation)

```ts
// apps/api/src/middleware/request-logger.middleware.ts
import type { MiddlewareHandler } from 'hono'
import { logger } from '../lib/logger.js'

export const requestLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = crypto.randomUUID()
  const start = performance.now()
  const reqLogger = logger.child({ requestId })

  c.set('logger', reqLogger)
  c.header('X-Request-Id', requestId)

  reqLogger.info({ method: c.req.method, path: c.req.path }, 'request started')

  await next()

  const duration = Math.round(performance.now() - start)
  reqLogger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, duration },
    'request completed',
  )
}
```

### Hono Variables type extension

Hiện tại auth middleware set `c.set('auth', ...)`. Cần tìm nơi khai báo `Variables` type và mở rộng thêm `logger`. Có thể:

1. Nếu đã có file type chung → thêm `logger: pino.Logger` vào `Variables`
2. Nếu chưa có → tạo `apps/api/src/types.ts` với intersection type cho cả `auth` và `logger`

Quan trọng: Tất cả `new Hono()` phải dùng generic type chung để cả `c.get('auth')` và `c.get('logger')` đều type-safe.

### UUID v7 vs v4 cho requestId

ADR ghi UUID v7 cho requestId. Tuy nhiên:

- `crypto.randomUUID()` native Node 22 cho v4, không cần dependency
- requestId chỉ dùng cho correlation, KHÔNG dùng làm primary key DB
- Sortable (v7) không cần thiết cho correlation ID

**Quyết định**: dùng `crypto.randomUUID()` (v4) cho requestId. Nếu team muốn v7, dùng cùng package UUID v7 đã dùng cho DB primary keys (kiểm tra `packages/shared`).

### Log format output (production)

```json
{"level":"info","time":"2026-04-25T10:30:00.000Z","requestId":"550e8400-e29b-41d4-a716-446655440000","method":"GET","path":"/api/v1/products","msg":"request started"}
{"level":"info","time":"2026-04-25T10:30:00.150Z","requestId":"550e8400-e29b-41d4-a716-446655440000","method":"GET","path":"/api/v1/products","status":200,"duration":150,"msg":"request completed"}
```

### Redact field danh sách đầy đủ

Từ ADR + project-context.md, redact paths PHẢI bao gồm:

- `req.headers.authorization` (Bearer token)
- `*.password` (mật khẩu)
- `*.passwordHash` (hash mật khẩu)
- `*.pin` (mã PIN)
- `*.pinHash` (hash PIN)
- `*.botToken` (Telegram bot token, story 10.3)
- `*.secret` (generic secret)
- `*.hmacSecret` (webhook HMAC, story 10.3)
- `*.configEncrypted` (notification channel config, story 10.2)

Khi thêm field nhạy cảm mới ở story sau, CẬP NHẬT redact config ngay.

### Cron ship log sang R2 (OUT OF SCOPE)

ADR đề cập cron job ship log sang Cloudflare R2 hàng ngày. Đây là concern deployment/ops, KHÔNG thuộc story này. Ghi vào deferred work nếu chưa có.

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG log field nhạy cảm (password, PIN, token). Pino redact xử lý tự động, nhưng KHÔNG truyền giá trị nhạy cảm vào `msg` string (redact chỉ hoạt động trên object properties)
- KHÔNG dùng `console.log/warn/error` cho bất kỳ log nào trong `apps/api/src/` (trừ server start message)
- KHÔNG tạo logger instance mới trong từng file. Dùng `c.get('logger')` trong route/middleware, import `logger` từ `lib/logger.ts` cho code ngoài request context
- KHÔNG log toàn bộ request/response body (quá verbose, có thể chứa PII). Log method, path, status, duration là đủ
- KHÔNG import pino-pretty ở runtime production (chỉ dev dependency)
- KHÔNG thay đổi Pino `level` format thành số (giữ label string cho human-readable)
- KHÔNG hardcode log level. Luôn đọc từ env `LOG_LEVEL`

### Project Structure Notes

- File naming: kebab-case cho non-component (`logger.ts`, `request-logger.middleware.ts`). Nhất quán với `error-handler.ts`, `auth.middleware.ts`
- Middleware đặt trong `apps/api/src/middleware/` (cùng folder với `error-handler.ts`, `rbac.middleware.ts`, `auth.middleware.ts`)
- Library/utility đặt trong `apps/api/src/lib/` (cùng folder với `env.ts`, `errors.ts`, `jwt.ts`)

### Thư viện và phiên bản

| Package     | Version                 | Vai trò                               | Ghi chú                                                                                     |
| ----------- | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| pino        | ^9.0.0                  | Structured JSON logger                | ADR chỉ định 9.x. NPM latest = 10.3.1. Giữ 9.x theo ADR, upgrade lên 10 nếu team quyết định |
| pino-roll   | ^3.0.0                  | Log file rotation (daily, size limit) | ADR chỉ định 3.x. NPM latest = 4.0.0. Giữ 3.x theo ADR                                      |
| pino-pretty | ^13.0.0 (devDependency) | Dev-mode pretty printing              | Latest 13.1.3                                                                               |

**Lưu ý Hono middleware:** Có package `@maou-shonen/hono-pino` trên JSR cho Hono-specific Pino integration. Tuy nhiên, ADR thiết kế custom middleware đơn giản (15-20 dòng code). KHÔNG thêm dependency bên ngoài. Tự viết middleware theo pattern đã mô tả ở Task 3.

Pino 9.x features cần dùng:

- `pino.transport()` ổn định cho worker thread transports (pino-pretty dev)
- `formatters.level` API giữ nguyên
- `pino.multistream()` cho multi-destination (stdout + file)
- ESM support đầy đủ (project dùng ESM)

### Previous Story Intelligence (1.4)

Từ Story 1.4 (gần nhất đã done):

- Error handler dùng `console.error('[unhandled]', err)` tại [error-handler.ts:22](apps/api/src/middleware/error-handler.ts#L22). Đây là target chính cần sửa
- Hono Variables pattern: `c.get('auth')` hoạt động, cần extend type thêm `logger`
- Test pattern: dùng Hono test client `app.request(...)` + PGlite cho integration tests
- Auth middleware set `auth` vào context. Logger middleware PHẢI mount trước auth (requestId có sẵn cho cả unauthenticated requests)
- Pattern env.ts: getter lazy, `required()` throw khi thiếu, `optional()` có fallback. Dùng pattern tương tự cho `logLevel` và `logDir`

### References

- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 7: Logger nền (Pino)]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 2: Quyết định tổng thể]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md#Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/epics/epic-10-canh-bao-giam-sat-cua-hang.md#Story 10.1]
- [Source: _bmad-output/project-context.md#Logging (Pino)]
- [Source: apps/api/src/middleware/error-handler.ts] (dùng console.error, cần thay bằng Pino)
- [Source: apps/api/src/lib/env.ts] (pattern env config getter)
- [Source: apps/api/src/index.ts] (app entry, nơi mount middleware)
- [Source: _bmad-output/implementation-artifacts/1-4-quan-ly-nhan-vien-phan-quyen.md#Pattern reuse, Hono Variables]
- [Pino npm docs](https://github.com/pinojs/pino)
- [pino-roll npm docs](https://github.com/pinojs/pino-roll)
- [pino-pretty npm docs](https://github.com/pinojs/pino-pretty)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
