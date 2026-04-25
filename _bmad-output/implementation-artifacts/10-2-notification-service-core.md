# Story 10.2: Notification Service Core

Status: done

## Story

As a hệ thống,
I want một notification service có thể route event tới nhiều kênh theo rule,
So that các service nghiệp vụ chỉ cần emit event mà không cần biết gửi đi đâu.

## Acceptance Criteria (BDD)

### AC1: Package structure và public API

**Given** `packages/notifications/` đã tạo với cấu trúc:

```
packages/notifications/src/
├── index.ts              # Public API: notify(event)
├── event-schema.ts       # Zod schemas cho NotificationEvent
├── router.ts             # Map event → channels theo rule
├── transports/
│   ├── base.ts           # Interface Transport
│   ├── console.ts
│   └── file.ts
└── formatters/
    └── index.ts          # Render event → text
```

**When** import `notify(event)` từ package
**Then** function nhận `NotificationEvent` (validate bằng Zod schema) và trả về `Promise<SendResult[]>`

### AC2: DB migration cho 3 bảng notification

**Given** DB migration chạy thành công
**When** kiểm tra database
**Then** 3 bảng tồn tại với schema đúng ADR:

- `notification_channels` (`id`, `store_id`, `transport`, `name`, `config_encrypted`, `enabled`, `created_at`, `updated_at`)
- `notification_rules` (`id`, `store_id`, `event_type`, `min_severity`, `channel_id`, `enabled`, `throttle_seconds`, `created_at`)
- `notification_deliveries` (`id`, `event_id`, `channel_id`, `status`, `attempts`, `error`, `created_at`)

### AC3: Event routing và delivery thành công

**Given** 1 rule match event type `stock.negative` + severity `error` mapping channel console
**When** gọi `notify({ type: 'stock.negative', severity: 'error', storeId, title, body, ... })`
**Then** console transport nhận event và ghi ra stdout
**And** 1 row insert vào `notification_deliveries` với `status='sent'`, `attempts=1`

### AC4: Retry và dead-letter khi transport fail

**Given** transport fail (ví dụ file permission denied)
**When** retry 3 lần (1s, 4s, 16s exponential backoff) đều fail
**Then** `notification_deliveries` row có `status='dead'`, `attempts=3`, `error` chứa message lỗi

### AC5: Throttle chống spam

**Given** rule có `throttle_seconds=300`
**When** cùng event type + store_id gửi 2 lần trong 5 phút
**Then** lần 2 bị skip, không gửi transport
**And** delivery log ghi `status='throttled'`

### AC6: Severity filter theo rule

**Given** event có `severity='info'` nhưng rule yêu cầu `min_severity='error'`
**When** router filter rules
**Then** rule đó không match, event không gửi qua channel đó

## Tasks / Subtasks

### Phase A: Package Setup

- [x] Task 1: Tạo `packages/notifications/` package (AC: #1)
  - [x] 1.1: Tạo `packages/notifications/package.json` với name `@kiotviet-lite/notifications`, type `module`, dependencies: `zod`, `@kiotviet-lite/shared` (workspace), `drizzle-orm`
  - [x] 1.2: Tạo `packages/notifications/tsconfig.json` extends root config, strict mode
  - [x] 1.3: Cập nhật `pnpm-workspace.yaml` (đã có `packages/*`, KHÔNG cần sửa)
  - [x] 1.4: Verify `pnpm install` thành công, workspace link hoạt động

### Phase B: Zod Schemas và Types (trong packages/shared)

- [x] Task 2: Tạo notification schemas trong `packages/shared/` (AC: #1, #3, #6)
  - [x] 2.1: Tạo `packages/shared/src/schema/notifications.ts`:
    - `notificationTransportEnum`: `pgEnum('notification_transport', ['console', 'file', 'webhook', 'telegram'])`
    - `notificationSeverityEnum`: `pgEnum('notification_severity', ['info', 'warn', 'error', 'critical'])`
    - `deliveryStatusEnum`: `pgEnum('delivery_status', ['pending', 'sent', 'throttled', 'dead'])`
    - `notificationTypeEnum`: `pgEnum('notification_type', ['auth.login.suspicious', 'auth.pin.locked', 'order.high_value', 'stock.negative', 'sync.failed_repeatedly', 'audit.price_override', 'system.error.unhandled'])`
  - [x] 2.2: Drizzle table `notificationChannels`:
    - `id`: uuid v7, PK
    - `storeId`: uuid, FK → stores, NOT NULL
    - `transport`: notificationTransportEnum, NOT NULL
    - `name`: varchar(100), NOT NULL
    - `configEncrypted`: text (ciphertext AES-256-GCM)
    - `enabled`: boolean, default true
    - `createdAt`, `updatedAt`: timestamptz
  - [x] 2.3: Drizzle table `notificationRules`:
    - `id`: uuid v7, PK
    - `storeId`: uuid, FK → stores, NOT NULL
    - `eventType`: notificationTypeEnum, NOT NULL
    - `minSeverity`: notificationSeverityEnum, NOT NULL, default 'info'
    - `channelId`: uuid, FK → notificationChannels, NOT NULL
    - `enabled`: boolean, default true
    - `throttleSeconds`: integer, default 0
    - `createdAt`: timestamptz
  - [x] 2.4: Drizzle table `notificationDeliveries`:
    - `id`: uuid v7, PK
    - `eventId`: uuid, NOT NULL (ID của notification event, KHÔNG phải FK)
    - `channelId`: uuid, FK → notificationChannels, NOT NULL
    - `status`: deliveryStatusEnum, NOT NULL, default 'pending'
    - `attempts`: integer, NOT NULL, default 0
    - `error`: text, nullable
    - `createdAt`: timestamptz
  - [x] 2.5: Export từ `packages/shared/src/schema/index.ts`
  - [x] 2.6: Tạo Zod validation schemas cho NotificationEvent (dùng trong runtime):

    ```ts
    export const notificationEventSchema = z.object({
      id: z.string().uuid(),
      storeId: z.string().uuid(),
      type: z.enum([...notification type values]),
      severity: z.enum(['info', 'warn', 'error', 'critical']),
      title: z.string().max(200),
      body: z.string().max(2000),
      context: z.record(z.unknown()).optional(),
      occurredAt: z.string().datetime(),
      correlationId: z.string().optional(),
    })
    ```

### Phase C: Transport Interface và Implementations

- [x] Task 3: Transport base interface (AC: #1, #4)
  - [x] 3.1: Tạo `packages/notifications/src/transports/base.ts`:

    ```ts
    export type SendResult =
      | { ok: true; attempts: number }
      | { ok: false; error: string; attempts: number; retriable: boolean }

    export interface Transport {
      readonly name: string
      send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult>
    }
    ```

- [x] Task 4: Console transport (AC: #1, #3)
  - [x] 4.1: Tạo `packages/notifications/src/transports/console.ts`
  - [x] 4.2: `send()` ghi event ra `process.stdout` dạng formatted text (severity badge + title + body)
  - [x] 4.3: Luôn trả `{ ok: true, attempts: 1 }`

- [x] Task 5: File transport (AC: #1)
  - [x] 5.1: Tạo `packages/notifications/src/transports/file.ts`
  - [x] 5.2: `send()` append JSON line vào file path từ config
  - [x] 5.3: Handle file write error → trả `{ ok: false, error, attempts: 1, retriable: true }`

### Phase D: Router và Core Logic

- [x] Task 6: Router module (AC: #3, #5, #6)
  - [x] 6.1: Tạo `packages/notifications/src/router.ts`
  - [x] 6.2: Function `findMatchingRules(db, storeId, eventType, severity)`:
    - Query `notification_rules` WHERE `store_id = storeId AND event_type = eventType AND enabled = true`
    - Filter: event severity >= rule min_severity (dùng severity order: info=0, warn=1, error=2, critical=3)
    - JOIN `notification_channels` để lấy transport type và config
    - Return array of matched rules + channel info
  - [x] 6.3: Severity comparison helper: `isSeverityGte(eventSeverity, minSeverity): boolean`

- [x] Task 7: Throttle logic (AC: #5)
  - [x] 7.1: Trong router hoặc module riêng `packages/notifications/src/throttle.ts`
  - [x] 7.2: Function `isThrottled(db, storeId, eventType, channelId, throttleSeconds)`:
    - Query `notification_deliveries` WHERE `channel_id AND status IN ('sent', 'throttled') AND created_at > NOW() - throttle_seconds`
    - Scope query theo event_id pattern hoặc thêm `event_type` + `store_id` vào deliveries (xem Dev Notes)
    - Return boolean
  - [x] 7.3: Nếu throttled, insert delivery row với `status='throttled'`, `attempts=0`

- [x] Task 8: Retry logic (AC: #4)
  - [x] 8.1: Trong `packages/notifications/src/retry.ts` hoặc inline trong notify
  - [x] 8.2: Function `withRetry(fn, maxAttempts=3)`:
    - Exponential backoff: 1s, 4s, 16s (base 4^attempt seconds)
    - Dùng `setTimeout` + `Promise` (in-process, KHÔNG dùng external queue cho MVP)
    - Nếu tất cả fail → trả `{ ok: false, error, attempts: 3, retriable }`
    - `retriable` = true cho timeout/network/5xx, false cho 401/403/validation

### Phase E: Notify Function (Public API)

- [x] Task 9: Tạo `packages/notifications/src/index.ts` (AC: #1, #3, #4, #5, #6)
  - [x] 9.1: Export `notify(db, event)` function:
    1. Validate event bằng `notificationEventSchema.parse(event)`
    2. Gọi `findMatchingRules(db, event.storeId, event.type, event.severity)`
    3. Với mỗi matched rule:
       a. Check throttle → nếu throttled, log delivery `status='throttled'`, skip
       b. Resolve transport instance theo channel.transport type
       c. Decrypt channel config (gọi decrypt helper)
       d. Gọi `withRetry(() => transport.send(event, decryptedConfig))`
       e. Insert delivery row: `status='sent'` hoặc `status='dead'`
    4. Return `SendResult[]` cho tất cả channels
  - [x] 9.2: Export types: `NotificationEvent`, `SendResult`, `Transport`
  - [x] 9.3: Export schemas: `notificationEventSchema`

### Phase F: Encryption Helper

- [x] Task 10: Config encryption/decryption (AC: #2)
  - [x] 10.1: Tạo `packages/notifications/src/crypto.ts`
  - [x] 10.2: `encrypt(plaintext, key)`: AES-256-GCM, trả base64 string chứa iv + ciphertext + authTag
  - [x] 10.3: `decrypt(ciphertext, key)`: parse iv + ciphertext + authTag, giải mã, trả JSON object
  - [x] 10.4: Key từ env var `NOTIFICATION_CONFIG_KEY` (32 bytes). Throw nếu key thiếu hoặc sai length
  - [x] 10.5: Dùng `node:crypto` native, KHÔNG thêm dependency

### Phase G: DB Migration

- [x] Task 11: Generate và chạy migration (AC: #2)
  - [x] 11.1: Sau khi thêm schemas vào `packages/shared/src/schema/notifications.ts`
  - [x] 11.2: Chạy `pnpm --filter api db:generate` để tạo migration SQL
  - [x] 11.3: Review migration SQL, đảm bảo 3 bảng + enums đúng
  - [x] 11.4: Chạy `pnpm --filter api db:migrate` apply migration
  - [x] 11.5: Verify bằng `drizzle-kit studio` hoặc SQL query

### Phase H: Wire vào Backend

- [x] Task 12: Thêm env var và dependency (AC: all)
  - [x] 12.1: Thêm `@kiotviet-lite/notifications` vào `apps/api/package.json` dependencies (workspace)
  - [x] 12.2: Thêm vào `apps/api/src/lib/env.ts`:
    - `notificationConfigKey`: `optional('NOTIFICATION_CONFIG_KEY', '')` (rỗng = notification disabled, không crash app)
  - [x] 12.3: Thêm vào `apps/api/.env.example`:
    - `NOTIFICATION_CONFIG_KEY=` (32 bytes hex hoặc base64)

### Phase I: Tests

- [x] Task 13: Unit tests cho notification package (AC: #1, #3, #4, #5, #6)
  - [x] 13.1: `packages/notifications/src/__tests__/event-schema.test.ts`:
    - Valid event parse thành công
    - Missing required fields throw ZodError
    - Invalid severity/type reject
    - Title > 200 chars reject
  - [x] 13.2: `packages/notifications/src/__tests__/router.test.ts`:
    - Severity filter: info event không match error rule
    - Severity filter: error event match info rule (>=)
    - Multiple rules match → return all
    - Disabled rule skip
  - [x] 13.3: `packages/notifications/src/__tests__/throttle.test.ts`:
    - Delivery trong throttle window → throttled
    - Delivery ngoài window → không throttled
    - throttle_seconds = 0 → không bao giờ throttled
  - [x] 13.4: `packages/notifications/src/__tests__/retry.test.ts`:
    - Success lần 1 → attempts=1
    - Fail 2 lần, success lần 3 → attempts=3
    - Fail 3 lần → dead, attempts=3
  - [x] 13.5: `packages/notifications/src/__tests__/crypto.test.ts`:
    - Encrypt → decrypt round-trip thành công
    - Wrong key → decrypt fail
    - Tampered ciphertext → decrypt fail
  - [x] 13.6: `packages/notifications/src/__tests__/console-transport.test.ts`:
    - Send event → output chứa title, severity
    - Luôn return ok: true

- [x] Task 14: Integration test notify flow (AC: #3, #4, #5)
  - [x] 14.1: `packages/notifications/src/__tests__/notify.integration.test.ts`:
    - Setup: PGlite in-memory, seed channel + rule
    - Gọi `notify()` với matching event → delivery row `status='sent'`
    - Gọi `notify()` 2 lần nhanh với throttle rule → lần 2 `status='throttled'`
    - Gọi `notify()` với non-matching severity → không có delivery row
  - [x] 14.2: Dùng PGlite test pattern từ `apps/api/src/__tests__/helpers/test-env.ts`

- [x] Task 15: Verify không regression (AC: all)
  - [x] 15.1: `pnpm typecheck` pass (toàn workspace)
  - [x] 15.2: `pnpm lint` pass
  - [x] 15.3: `pnpm test` pass (bao gồm tests từ Story 1.1-1.4 và 10.1)
  - [x] 15.4: Verify `packages/notifications` được resolve đúng từ workspace

### Review Findings

- [x] [Review][Decision] Race condition trong throttle check → **Deferred** (fix ở Story 10.3 khi có concurrent network transports)
- [x] [Review][Decision] Backoff timing → **Fixed**: maxAttempts=4, dùng cả 3 delay (1s, 4s, 16s)
- [x] [Review][Decision] Throttle self-reference → **Fixed**: chỉ check status='sent', throttled records không kéo dài window
- [x] [Review][Patch] Scope creep → **Fixed**: xoá telegram.ts, webhook.ts, grammy dep, formatTelegramMessage, 3 test files
- [x] [Review][Patch] Fail fast configKey → **Fixed**: trả lỗi rõ khi configEncrypted có nhưng configKey rỗng
- [x] [Review][Patch] FileTransport path traversal → **Fixed**: thêm path validation
- [x] [Review][Patch] drizzle-orm duplicate deps → **Fixed**: xoá khỏi devDependencies
- [x] [Review][Patch] db.insert try-catch → **Fixed**: wrap tất cả db.insert trong try-catch
- [x] [Review][Patch] decrypt() encoding → **Fixed**: explicit 'utf8' encoding
- [x] [Review][Defer] `isSeverityGte` default severity không xác định về 0, gây false positive nếu gọi trực tiếp. Zod validate ở boundary nên rủi ro thấp. [router.ts:19] (edge)
- [x] [Review][Defer] `notification_deliveries.storeId` thiếu FK tới stores. Cột denormalized cho query performance, thêm FK tăng overhead write. [notifications.ts:99] (blind)
- [x] [Review][Defer] Thiếu index cho `eventId` trên notification_deliveries. Chưa có use case query theo eventId ở production. [notifications.ts:95] (blind+edge)
- [x] [Review][Defer] Transport instances là module-level singletons. Hiện tại stateless, cần xem lại khi thêm stateful transports ở Story 10.3. [index.ts:18-23] (blind+auditor+edge)
- [x] [Review][Defer] `decrypt()` chỉ dùng `JSON.parse` + type assertion, không validate schema cho config object. Thêm Zod validation per-transport khi có nhiều transport hơn. [crypto.ts:39] (edge)
- [x] [Review][Defer] `notify()` xử lý tuần tự từng rule, rule chậm block toàn bộ. Cân nhắc `Promise.allSettled` khi có network transports ở Story 10.3. [index.ts:40-93] (blind)
- [x] [Review][Defer] `notification_rules` thiếu `updatedAt`. AC2 không yêu cầu, thêm khi cần audit rule changes. [notifications.ts:72-87] (blind+auditor)
- [x] [Review][Defer] `notificationEventSchema.parse()` throw ZodError không catch, có thể leak data trong error. Caller nên handle. [index.ts:34] (edge)
- [x] [Review][Defer] Bảng notification_deliveries tích luỹ vô hạn, không có cơ chế purge. Thêm retention policy khi scale. [notifications.ts:89-114] (edge)
- [x] [Review][Defer] Throttled delivery trả `{ ok: true, attempts: 0 }`, caller không phân biệt sent vs throttled. Cân nhắc thêm variant khi cần. [index.ts:63] (auditor)

### Review Findings (Round 2, 2026-04-25)

- [x] [Review][Patch] FileTransport path validation broken → **Fixed**: chuyển sang allowlist (`/tmp`, `/var/log`), dùng `resolve()` rồi check `startsWith`. [file.ts:17-19] (blind+edge)
- [x] [Review][Patch] `decrypt()` unchecked `JSON.parse` cast → **Fixed**: thêm typeof/null/Array check, throw nếu không phải object. [crypto.ts:40] (blind+edge)
- [x] [Review][Patch] Completion Notes ghi "max 3 attempts" → **Fixed**: sửa thành "max 4 attempts (1 gốc + 3 retry)". [story:543] (auditor)
- [x] [Review][Defer] `parseKey` chấp nhận hex không hợp lệ, `Buffer.from('xyz', 'hex')` skip ký tự sai, error "wrong length" gây nhầm. [crypto.ts:7-10] (blind)
- [x] [Review][Defer] FileTransport zero test coverage. Path validation, file write, error handling chưa test. [file.ts] (edge)
- [x] [Review][Defer] `ConsoleTransport.send()` không catch `stdout.write` throw khi pipe broken. [console.ts:12] (edge)
- [x] [Review][Defer] Backoff delay không có max cap, nếu `maxAttempts` tăng thì delay explode (4^n). [retry.ts:26] (edge)
- [x] [Review][Defer] Clock skew giữa app server (`Date.now()`) và DB server (`defaultNow()`) ảnh hưởng throttle window. [throttle.ts:19] (edge)
- [x] [Review][Defer] `context` field `z.record(z.unknown()).optional()` không giới hạn depth/size, tiềm ẩn DoS. [notifications.ts:128] (edge)
- [x] [Review][Defer] Catch blocks swallow exception hoàn toàn (6 chỗ), mất audit trail khi DB connection pool cạn. Thêm logging khi có logger. [index.ts] (blind)
- [x] [Review][Defer] Webhook SSRF + Telegram Bot instance leak + grammy missing dep. Thuộc scope Story 10-3. [webhook.ts, telegram.ts] (blind+edge)

## Dev Notes

### Kiến trúc tổng quan

Story này tạo lõi Notification Service: package `packages/notifications/` với public API `notify(event)`, 2 transport cơ bản (console, file), router theo rule DB, throttle, retry, và delivery logging. Webhook + Telegram transport sẽ thêm ở Story 10.3.

```
Service Layer → notify(event)
                    ↓
              [Validate Zod]
                    ↓
              [Router: query rules by storeId + type + severity]
                    ↓
              [Throttle check per rule]
                    ↓
              [Decrypt channel config]
                    ↓
              [Transport.send() with retry]
                    ↓
              [Log delivery to notification_deliveries]
```

### Mối quan hệ với Story 10.1 (Logger)

Logger (Pino, Story 10.1) và Notification Service là 2 hệ thống ĐỘC LẬP:

- Logger: ghi structured log cho dev/ops debug. Output: stdout/file
- Notification: route business event tới transport (Telegram, webhook). Output: external channels

Notification Service CÓ THỂ dùng Pino logger để ghi internal debug log (import logger từ `apps/api/src/lib/logger.ts` khi được gọi từ API context). Nhưng `packages/notifications/` KHÔNG depend vào Pino. Nếu cần log trong package, dùng một logger interface đơn giản hoặc truyền logger qua options.

### Pattern quan trọng từ codebase hiện tại

| Khu vực        | File hiện có                              | Pattern                                                                                     |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Drizzle schema | `packages/shared/src/schema/users.ts`     | pgTable, uuid v7 via `uuidv7()`, timestamptz, FK references, pgEnum                         |
| Schema export  | `packages/shared/src/schema/index.ts`     | Barrel export `export * from './notifications.js'`                                          |
| Zod schemas    | `packages/shared/src/schema/audit-log.ts` | z.object, z.enum, z.coerce, type inference                                                  |
| DB connection  | `apps/api/src/db/index.ts`                | `drizzle(client, { schema, casing: 'snake_case' })`                                         |
| Drizzle config | `apps/api/drizzle.config.ts`              | Schema path: `../../packages/shared/src/schema/index.ts`, migrations: `./src/db/migrations` |
| Env config     | `apps/api/src/lib/env.ts`                 | Lazy getter, `required()` throw, `optional()` fallback                                      |
| Error handling | `apps/api/src/lib/errors.ts`              | `ApiError` class với code + status mapping                                                  |
| Workspace      | `pnpm-workspace.yaml`                     | `packages: ['apps/*', 'packages/*']`                                                        |

### Drizzle Schema Pattern (BẮT BUỘC tuân thủ)

Drizzle config dùng `casing: 'snake_case'`. Code JS/TS viết camelCase, Drizzle tự map sang snake_case ở DB. KHÔNG viết snake_case trong schema definition.

```ts
// ĐÚNG: camelCase trong code
storeId: uuid()
  .notNull()
  .references(() => stores.id)
configEncrypted: text()
createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()

// SAI: snake_case trong code
store_id: uuid() // KHÔNG LÀM THẾ NÀY
```

UUID v7 dùng package `uuidv7` đã có trong `packages/shared`:

```ts
import { uuidv7 } from 'uuidv7'
id: uuid()
  .primaryKey()
  .$defaultFn(() => uuidv7())
```

### Throttle Implementation Detail

Bảng `notification_deliveries` hiện tại KHÔNG có `event_type` hay `store_id`. Để throttle check ("cùng event type + store_id đã gửi trong N giây chưa?"), có 2 cách:

**Cách 1 (Khuyến nghị):** Thêm cột `event_type` và `store_id` vào `notification_deliveries` để query trực tiếp. Index: `idx_deliveries_throttle ON (store_id, event_type, channel_id, created_at)`.

**Cách 2:** JOIN `notification_deliveries` với event ID lookup. Phức tạp hơn, không cần thiết cho MVP.

Chọn cách 1. Cập nhật schema `notificationDeliveries` thêm:

- `eventType`: notificationTypeEnum, NOT NULL
- `storeId`: uuid, NOT NULL (FK → stores)

### Severity Ordering

Dùng numeric mapping cho so sánh severity:

```ts
const SEVERITY_ORDER = { info: 0, warn: 1, error: 2, critical: 3 } as const

function isSeverityGte(eventSeverity: string, minSeverity: string): boolean {
  return SEVERITY_ORDER[eventSeverity] >= SEVERITY_ORDER[minSeverity]
}
```

Event severity `error` (2) >= rule min_severity `info` (0) → match.
Event severity `info` (0) >= rule min_severity `error` (2) → KHÔNG match.

### Notify Function Signature

`notify()` cần DB connection để query rules và insert deliveries. Hai cách truyền:

**Cách 1 (Khuyến nghị):** `notify(db: Db, event: NotificationEvent)` truyền DB trực tiếp mỗi lần gọi. Đơn giản, testable, không global state.

**Cách 2:** Factory `createNotifier({ db })` trả về `notify(event)`. Linh hoạt hơn nhưng thêm complexity.

Chọn cách 1 cho MVP. Nếu cần config key cho decrypt, truyền qua options: `notify(db, event, { configKey })`.

### Encryption Format

AES-256-GCM cần: key (32 bytes), IV (12 bytes random), authTag (16 bytes).

Format lưu DB (base64): `base64(iv + ciphertext + authTag)`

```ts
// encrypt
const iv = crypto.randomBytes(12)
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
const authTag = cipher.getAuthTag()
return Buffer.concat([iv, encrypted, authTag]).toString('base64')

// decrypt
const buf = Buffer.from(ciphertext, 'base64')
const iv = buf.subarray(0, 12)
const authTag = buf.subarray(-16)
const data = buf.subarray(12, -16)
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(authTag)
return JSON.parse(decipher.update(data) + decipher.final('utf8'))
```

### Files cần TẠO MỚI

- `packages/notifications/package.json`
- `packages/notifications/tsconfig.json`
- `packages/notifications/src/index.ts` (public API: notify)
- `packages/notifications/src/event-schema.ts` (re-export Zod schemas từ shared)
- `packages/notifications/src/router.ts` (query rules, severity filter)
- `packages/notifications/src/throttle.ts` (throttle check)
- `packages/notifications/src/retry.ts` (exponential backoff wrapper)
- `packages/notifications/src/crypto.ts` (AES-256-GCM encrypt/decrypt)
- `packages/notifications/src/transports/base.ts` (Transport interface, SendResult type)
- `packages/notifications/src/transports/console.ts`
- `packages/notifications/src/transports/file.ts`
- `packages/notifications/src/formatters/index.ts` (format event → text)
- `packages/shared/src/schema/notifications.ts` (Drizzle tables + enums + Zod schemas)
- Tests: 7 test files trong `packages/notifications/src/__tests__/`

### Files cần SỬA

- `packages/shared/src/schema/index.ts`: thêm `export * from './notifications.js'`
- `apps/api/package.json`: thêm dependency `@kiotviet-lite/notifications: workspace:*`
- `apps/api/src/lib/env.ts`: thêm `notificationConfigKey` getter
- `apps/api/.env.example`: thêm `NOTIFICATION_CONFIG_KEY=`

### Story 10.3 sẽ thêm (OUT OF SCOPE cho story này)

- `packages/notifications/src/transports/webhook.ts`
- `packages/notifications/src/transports/telegram.ts`
- API endpoint `POST /api/notifications/emit` (rate-limited)
- API endpoint quản lý channels/rules
- Grammy dependency cho Telegram

### Anti-patterns: TUYỆT ĐỐI KHÔNG

- KHÔNG import trực tiếp Telegram/webhook code. Story này chỉ có console + file transport
- KHÔNG hard-code rules. Rules lưu DB, query runtime
- KHÔNG tạo Zod schemas riêng trong `packages/notifications/`. Đặt trong `packages/shared/src/schema/`
- KHÔNG dùng global state / singleton cho DB connection. Truyền `db` qua parameter
- KHÔNG log config đã decrypt (token, secret). Dùng Pino redact nếu cần log
- KHÔNG lưu `config_encrypted` plaintext trong DB
- KHÔNG dùng `any` hoặc `@ts-ignore`
- KHÔNG dùng CommonJS. ESM only (`import/export`)
- KHÔNG tạo migration thủ công. Dùng `drizzle-kit generate` từ schema
- KHÔNG bypass `store_id` filter khi query rules/channels
- KHÔNG dùng `setTimeout` kiểu callback cho retry. Dùng async/await + Promise-based delay

### Thư viện và phiên bản

| Package     | Version | Vai trò            | Ghi chú                  |
| ----------- | ------- | ------------------ | ------------------------ |
| zod         | ^3.25.0 | Validation schemas | Đã có trong shared       |
| drizzle-orm | ^0.45.0 | Type-safe ORM      | Đã có, dùng chung schema |
| uuidv7      | ^1.2.1  | UUID v7 cho PK     | Đã có trong shared       |
| node:crypto | native  | AES-256-GCM        | Không cần install        |

KHÔNG thêm thư viện notification framework bên ngoài. Tự viết mỏng, kiểm soát dependency.

### Previous Story Intelligence (10.1)

Từ Story 10.1 (Structured Logging):

- Pino logger đã wire vào Hono middleware, `c.get('logger')` hoạt động
- Request correlation `requestId` có sẵn trong log context, dùng làm `correlationId` cho notification event
- Error handler đã sửa dùng Pino thay `console.error`
- Env pattern: lazy getter, `required()` / `optional()` trong `apps/api/src/lib/env.ts`
- Redact config đã bao gồm `*.botToken`, `*.secret`, `*.hmacSecret`, `*.configEncrypted` cho story 10.2+

### Vitest Configuration

Project dùng Vitest (root `devDependencies`). Package notifications cần:

- Thêm `vitest` vào devDependencies (hoặc dùng từ root workspace)
- Config test trong `packages/notifications/vitest.config.ts` hoặc dùng root config
- Integration test cần PGlite: thêm `@electric-sql/pglite` devDependency giống `apps/api`

### Project Structure Notes

- Package mới `packages/notifications/` nằm cùng cấp `packages/shared/`
- File naming: kebab-case cho tất cả (`event-schema.ts`, `console.ts`)
- Barrel exports: `index.ts` export public API, internal modules không re-export
- Test files: co-located trong `__tests__/` folder
- Workspace: `pnpm-workspace.yaml` pattern `packages/*` đã bao gồm package mới

### References

- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 3: Backend Notification Service]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 5: Multi-tenant config]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 9: Retry, throttle, dead-letter]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 10: Security]
- [Source: _bmad-output/planning-artifacts/epics/epic-10-canh-bao-giam-sat-cua-hang.md#Story 10.2]
- [Source: _bmad-output/project-context.md#Notification Service]
- [Source: _bmad-output/project-context.md#Database]
- [Source: _bmad-output/implementation-artifacts/10-1-structured-logging-cho-backend.md] (previous story patterns)
- [Source: packages/shared/src/schema/users.ts] (Drizzle table pattern, uuid v7, pgEnum)
- [Source: packages/shared/src/schema/stores.ts] (stores FK reference)
- [Source: packages/shared/src/schema/audit-log.ts] (Zod schema pattern)
- [Source: apps/api/src/db/index.ts] (Drizzle connection, casing: snake_case)
- [Source: apps/api/drizzle.config.ts] (migration config, schema path)
- [Source: apps/api/src/lib/env.ts] (env getter pattern)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Typecheck lỗi `QueryResultHKT` -> fix thành `PgQueryResultHKT`
- Tests cần `uuidv7` trực tiếp -> thêm vào devDependencies
- ESLint unused `_config` param trong ConsoleTransport -> dùng eslint-disable comment (interface require)

### Completion Notes List

- Tạo package `@kiotviet-lite/notifications` với public API `notify(db, event, options)`
- 4 pgEnum: notification_transport, notification_severity, delivery_status, notification_type
- 3 Drizzle tables: notification_channels, notification_rules, notification_deliveries (+ index cho throttle)
- Zod schema `notificationEventSchema` validate runtime input
- 2 transport: ConsoleTransport (stdout), FileTransport (JSON line append)
- Router: query rules by storeId + eventType + severity filter (isSeverityGte)
- Throttle: check delivery window, auto-skip + log throttled
- Retry: exponential backoff 1s/4s/16s, max 4 attempts (1 gốc + 3 retry)
- Crypto: AES-256-GCM encrypt/decrypt cho channel config
- DB migration 0005: 4 enums + 3 tables applied
- Wire: `@kiotviet-lite/notifications` dependency trong API, env var `NOTIFICATION_CONFIG_KEY`
- 30 unit tests (7 files) + 174 tests tổng (18 files), 0 regression

### File List

**Files tạo mới:**

- packages/notifications/package.json
- packages/notifications/tsconfig.json
- packages/notifications/src/index.ts
- packages/notifications/src/event-schema.ts
- packages/notifications/src/router.ts
- packages/notifications/src/throttle.ts
- packages/notifications/src/retry.ts
- packages/notifications/src/crypto.ts
- packages/notifications/src/types.ts
- packages/notifications/src/transports/base.ts
- packages/notifications/src/transports/console.ts
- packages/notifications/src/transports/file.ts
- packages/notifications/src/formatters/index.ts
- packages/shared/src/schema/notifications.ts
- packages/notifications/src/**tests**/event-schema.test.ts
- packages/notifications/src/**tests**/router.test.ts
- packages/notifications/src/**tests**/throttle.test.ts
- packages/notifications/src/**tests**/retry.test.ts
- packages/notifications/src/**tests**/crypto.test.ts
- packages/notifications/src/**tests**/console-transport.test.ts
- packages/notifications/src/**tests**/notify.integration.test.ts
- apps/api/src/db/migrations/0005_skinny_dark_beast.sql

**Files sửa:**

- packages/shared/src/schema/index.ts (thêm export notifications)
- apps/api/package.json (thêm @kiotviet-lite/notifications dependency)
- apps/api/src/lib/env.ts (thêm notificationConfigKey getter)
- .env.example (thêm NOTIFICATION_CONFIG_KEY)
- vitest.workspace.ts (thêm notifications project)
- pnpm-lock.yaml (auto-updated)

## Change Log

- 2026-04-25: Triển khai Notification Service Core (Story 10.2) - package notifications, 3 DB tables, router/throttle/retry, AES-256-GCM crypto, 2 transports (console/file), 30 tests
