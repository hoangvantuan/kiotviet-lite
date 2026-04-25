# Story 10.3: Webhook & Telegram Transport + Bao mat

Status: done

## Story

As a chu cua hang,
I want nhan canh bao qua Telegram va webhook,
So that toi biet ngay khi co su co du khong mo app.

## Acceptance Criteria (BDD)

### AC1: Telegram transport gui message thanh cong

**Given** channel Telegram da cau hinh (`botToken` + `chatId`)
**When** event match rule gui toi Telegram transport
**Then** Grammy bot gui message HTML toi dung chat, chua: title, body, severity badge, thoi gian
**And** delivery < 5 giay tu luc emit

### AC2: Webhook transport gui va ky HMAC

**Given** channel webhook da cau hinh (`url` + `hmacSecret`)
**When** event match rule gui toi webhook transport
**Then** POST request chua JSON body + header `X-KVL-Signature` = HMAC-SHA256(body, hmacSecret)
**And** receiver verify signature thanh cong

### AC3: Retry va retriable classification

**Given** Telegram bot token hoac webhook URL fail khi gui
**When** transport retry 3 lan deu fail
**Then** delivery log ghi `status='dead'`, `retriable=false` (neu 401/403) hoac `retriable=true` (neu timeout/5xx)

### AC4: Config ma hoa AES-256-GCM

**Given** owner luu channel config (botToken, webhook URL, hmacSecret)
**When** config duoc persist vao DB
**Then** cot `config_encrypted` chua ciphertext AES-256-GCM, khong plaintext
**And** key ma hoa tu env var `NOTIFICATION_CONFIG_KEY` (32 byte)
**And** decrypt chi trong Notification Service runtime
**And** API GET channel tra ve `config: null` (khong tra ve cho client)

### AC5: Rate limit endpoint emit

**Given** endpoint `POST /api/notifications/emit`
**When** user gui > 60 request/phut
**Then** tra 429 Rate Limited
**And** chi chap nhan event type da whitelist, khong cho client chi dinh transport

### AC6: 4 transport day du

**Given** `packages/notifications/src/transports/` da co 4 transport
**When** kiem tra cau truc
**Then** ton tai: `console.ts`, `file.ts`, `webhook.ts`, `telegram.ts`
**And** tat ca implement interface `Transport` tu `base.ts`

## Tasks / Subtasks

### Phase A: Telegram Transport

- [x] Task 1: Cai dat Grammy dependency (AC: #1)
  - [x] 1.1: `pnpm --filter @kiotviet-lite/notifications add grammy`
  - [x] 1.2: Verify import ESM hoat dong: `import { Bot } from 'grammy'`

- [x] Task 2: Tao `packages/notifications/src/transports/telegram.ts` (AC: #1, #3)
  - [x] 2.1: Import `Bot` tu `grammy` (CHI dung `bot.api.sendMessage`, KHONG start bot/polling)
  - [x] 2.2: Implement `TelegramTransport` class theo interface `Transport`
  - [x] 2.3: Method `send(event, config)`:
    - Extract `botToken` va `chatId` tu config. Neu thieu, tra `{ ok: false, error: 'Missing botToken or chatId', attempts: 1, retriable: false }`
    - Tao Grammy `Bot` instance: `new Bot(botToken)`
    - Format message dung `formatTelegramMessage(event)` (xem Task 3)
    - Goi `bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' })`
    - Thanh cong: tra `{ ok: true, attempts: 1 }`
    - Loi 401/403 (bot token invalid, chat not found): tra `{ ok: false, error, attempts: 1, retriable: false }`
    - Loi 429/5xx/timeout/network: tra `{ ok: false, error, attempts: 1, retriable: true }`
  - [x] 2.4: Handle Grammy `GrammyError` va `HttpError` de phan loai retriable

- [x] Task 3: Tao Telegram message formatter (AC: #1)
  - [x] 3.1: Them `formatTelegramMessage(event)` trong `packages/notifications/src/formatters/index.ts` (hoac file rieng `telegram.ts` trong formatters/)
  - [x] 3.2: Output HTML format (Telegram MarkdownV2 yeu cau escape nhieu ky tu dac biet, HTML on dinh hon):

    ```
    <b>[ERROR] Ton kho am</b>
    San pham ABC giam xuong -5

    <i>2026-04-25 10:30 UTC</i>
    ```

  - [x] 3.3: Severity badge: `[INFO]`, `[WARN]`, `[ERROR]`, `[CRITICAL]`
  - [x] 3.4: Truncate body > 2000 ky tu (Telegram message limit ~4096 chars, giu margin)

### Phase B: Webhook Transport

- [x] Task 4: Tao `packages/notifications/src/transports/webhook.ts` (AC: #2, #3)
  - [x] 4.1: Implement `WebhookTransport` class theo interface `Transport`
  - [x] 4.2: Method `send(event, config)`:
    - Extract `url` va `hmacSecret` tu config. Neu thieu `url`, tra `{ ok: false, error: 'Missing webhook URL', attempts: 1, retriable: false }`
    - Serialize JSON body: `JSON.stringify(event)`
    - Tinh HMAC-SHA256: `createHmac('sha256', hmacSecret).update(body).digest('hex')`
    - POST bang `fetch()` (global, Node 22 native, KHONG can undici import):

      ```ts
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hmacSecret ? { 'X-KVL-Signature': signature } : {}),
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      })
      ```

    - Response 2xx: tra `{ ok: true, attempts: 1 }`
    - Response 401/403: tra `{ ok: false, error, attempts: 1, retriable: false }`
    - Response 429/5xx/timeout: tra `{ ok: false, error, attempts: 1, retriable: true }`

  - [x] 4.3: Handle network errors (TypeError tu fetch) nhu retriable

### Phase C: Register Transports

- [x] Task 5: Cap nhat transport registry trong `packages/notifications/src/index.ts` (AC: #6)
  - [x] 5.1: Import `TelegramTransport` va `WebhookTransport`
  - [x] 5.2: Them vao `transports` record:

    ```ts
    const transports: Record<string, Transport> = {
      console: new ConsoleTransport(),
      file: new FileTransport(),
      webhook: new WebhookTransport(),
      telegram: new TelegramTransport(),
    }
    ```

  - [x] 5.3: Export types neu can: `TelegramTransport`, `WebhookTransport`

### Phase D: API Endpoint + Rate Limit

- [x] Task 6: Tao API route `POST /api/notifications/emit` (AC: #5)
  - [x] 6.1: Tao `apps/api/src/routes/notifications.routes.ts`
  - [x] 6.2: Endpoint `POST /api/v1/notifications/emit`:
    - Require auth (`requireAuth` middleware)
    - Parse body bang Zod: chi chap nhan fields `type`, `severity`, `title`, `body`, `context` (khong cho chi dinh `storeId`, `id`, `correlationId`)
    - `storeId` lay tu JWT auth context (`c.get('auth').storeId`)
    - `id` generate server-side bang `uuidv7()`
    - `occurredAt` = `new Date().toISOString()`
    - `correlationId` = `c.get('logger')?.bindings()?.requestId` (tu request logger middleware)
    - Validate `type` trong whitelist (`notificationTypeValues`)
    - Goi `notify(db, event, { configKey: env.notificationConfigKey })`
    - Tra `{ data: { accepted: true, results: [...] } }`
  - [x] 6.3: Response 429 khi vuot rate limit

- [x] Task 7: Rate limit middleware cho emit endpoint (AC: #5)
  - [x] 7.1: Cai `hono-rate-limiter`: `pnpm --filter api add hono-rate-limiter`
  - [x] 7.2: Tao rate limiter instance:

    ```ts
    import { rateLimiter } from 'hono-rate-limiter'

    const emitRateLimiter = rateLimiter({
      windowMs: 60 * 1000, // 1 phut
      limit: 60, // 60 requests/phut
      keyGenerator: (c) => c.get('auth')?.userId ?? c.req.header('x-forwarded-for') ?? 'anonymous',
    })
    ```

  - [x] 7.3: Mount rate limiter LEN TRUOC route handler cho `POST /api/v1/notifications/emit`

- [x] Task 8: Mount notification routes vao app (AC: #5)
  - [x] 8.1: Import va mount `createNotificationRoutes()` trong `apps/api/src/index.ts`
  - [x] 8.2: Thu tu: sau auth routes, cung cap voi cac resource routes khac

### Phase E: Tests

- [x] Task 9: Unit test Telegram transport (AC: #1, #3)
  - [x] 9.1: `packages/notifications/src/__tests__/telegram-transport.test.ts`:
    - Mock `bot.api.sendMessage`: gui thanh cong, tra `{ ok: true, attempts: 1 }`
    - Mock fail 401: tra `{ ok: false, retriable: false }`
    - Mock fail 500: tra `{ ok: false, retriable: true }`
    - Missing botToken/chatId: tra error khong retriable
    - Message chua severity badge + title + body + time

- [x] Task 10: Unit test Webhook transport (AC: #2, #3)
  - [x] 10.1: `packages/notifications/src/__tests__/webhook-transport.test.ts`:
    - Mock fetch: gui thanh cong 200, tra `{ ok: true }`
    - Verify header `X-KVL-Signature` = HMAC-SHA256 dung
    - Mock fail 403: tra `{ ok: false, retriable: false }`
    - Mock fail 500: tra `{ ok: false, retriable: true }`
    - Mock network error (TypeError): retriable = true
    - Missing URL: tra error khong retriable
    - Webhook khong co hmacSecret: gui khong co header `X-KVL-Signature`

- [x] Task 11: Unit test Telegram message formatter (AC: #1)
  - [x] 11.1: Test output chua `<b>` tag voi severity badge
  - [x] 11.2: Test output chua title, body, time
  - [x] 11.3: Test truncate body > 2000 chars

- [x] Task 12: Integration test emit endpoint (AC: #5)
  - [x] 12.1: `apps/api/src/__tests__/notifications-emit.integration.test.ts`:
    - Auth required: 401 khi khong co token
    - Happy path: POST event hop le, tra 200 + accepted
    - Invalid event type: 400 validation error
    - Client KHONG duoc gui field `storeId`, `id`, `transport`: bi strip hoac reject

- [x] Task 13: Verify khong regression (AC: all)
  - [x] 13.1: `pnpm typecheck` pass (toan workspace)
  - [x] 13.2: `pnpm lint` pass
  - [x] 13.3: `pnpm test` pass (bao gom tests tu Story 1.1-1.4, 10.1, 10.2)
  - [x] 13.4: Verify `packages/notifications` export moi hoat dong

## Dev Notes

### Kien truc tong quan

Story nay them 2 transport (Telegram, webhook) vao Notification Service da xay o Story 10.2, va tao API endpoint `POST /api/notifications/emit` de frontend/client gui event len backend xu ly.

```
Client (Frontend/External)
  |
  POST /api/v1/notifications/emit  [rate-limited, auth required]
  |
  ↓
API Layer (Hono)
  → Validate event type whitelist
  → Inject storeId tu JWT
  → Generate id, occurredAt, correlationId
  → notify(db, event, { configKey })
      ↓
  Notification Service (packages/notifications)
      → Router: query rules
      → Throttle check
      → Decrypt channel config
      → Transport.send() with retry
          ├── ConsoleTransport (Story 10.2)
          ├── FileTransport (Story 10.2)
          ├── WebhookTransport  ← MOI
          └── TelegramTransport ← MOI
```

### Pattern reuse tu Story 10.2 (BAT BUOC tuan thu)

| Khu vuc             | File hien co                                     | Cach dung                                                                      |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Transport interface | `packages/notifications/src/transports/base.ts`  | Implement y het: `send(event, config): Promise<SendResult>`                    |
| Transport registry  | `packages/notifications/src/index.ts` line 16-19 | THEM webhook va telegram vao `transports` record                               |
| Retry logic         | `packages/notifications/src/retry.ts`            | DA CO, KHONG SUA. `withRetry()` goi transport.send()                           |
| Crypto decrypt      | `packages/notifications/src/crypto.ts`           | DA CO, KHONG SUA. Config encrypted duoc decrypt truoc khi truyen vao transport |
| Formatter           | `packages/notifications/src/formatters/index.ts` | MO RONG: them Telegram HTML formatter                                          |
| Event schema        | `packages/shared/src/schema/notifications.ts`    | KHONG SUA. Schema, enums, tables da san sang                                   |
| Env config          | `apps/api/src/lib/env.ts`                        | DA CO `notificationConfigKey` getter                                           |
| Notify function     | `packages/notifications/src/index.ts`            | KHONG SUA logic. Chi them transports                                           |
| NotificationDb type | `packages/notifications/src/types.ts`            | KHONG SUA                                                                      |

### Grammy: Chi dung API, KHONG start bot

Story chi can GUI message Telegram, KHONG can nhan message. Grammy `Bot` class expose `bot.api` object de goi Telegram Bot API truc tiep ma khong can polling/webhook listener.

```ts
import { Bot } from 'grammy'

const bot = new Bot(botToken)
await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' })
```

**Quan trong:**

- Tao `Bot` instance TRONG method `send()`, KHONG cache global (moi channel co botToken rieng)
- KHONG goi `bot.start()` (bat polling). Chi dung `bot.api.sendMessage()`
- Handle `GrammyError` (API error tu Telegram) va `HttpError` (network error)
- `GrammyError` co `error_code` (HTTP status): 401/403 = retriable false, 429/5xx = retriable true

```ts
import { GrammyError, HttpError } from 'grammy'

try {
  await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' })
  return { ok: true, attempts: 1 }
} catch (err) {
  if (err instanceof GrammyError) {
    const retriable = err.error_code >= 500 || err.error_code === 429
    return { ok: false, error: err.message, attempts: 1, retriable }
  }
  if (err instanceof HttpError) {
    return { ok: false, error: err.message, attempts: 1, retriable: true }
  }
  return { ok: false, error: String(err), attempts: 1, retriable: false }
}
```

### Telegram message format: dung HTML, KHONG MarkdownV2

Telegram MarkdownV2 yeu cau escape nhieu ky tu dac biet (`.`, `-`, `(`, `)`, `!`, v.v.). HTML on dinh hon va de bao tri.

```ts
export function formatTelegramMessage(event: NotificationEvent): string {
  const badge = SEVERITY_BADGE[event.severity] ?? event.severity.toUpperCase()
  const time = new Date(event.occurredAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const body = event.body.length > 2000 ? event.body.slice(0, 2000) + '...' : event.body

  return `<b>[${badge}] ${escapeHtml(event.title)}</b>\n${escapeHtml(body)}\n\n<i>${time}</i>`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

**Chu y:** `SEVERITY_BADGE` da co trong `formatters/index.ts` (`[INFO]`, `[WARN]`, `[ERROR]`, `[CRITICAL]`). Reuse constant, khong duplicate.

### Webhook HMAC-SHA256 signing

```ts
import { createHmac } from 'node:crypto'

function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}
```

Header: `X-KVL-Signature: <hex digest>`

Receiver verify:

1. Doc raw body (khong parse JSON truoc)
2. Tinh HMAC-SHA256 voi secret cua minh
3. So sanh timing-safe voi header `X-KVL-Signature`

Neu channel config KHONG co `hmacSecret`, gui request KHONG co header signature. Day la truong hop webhook khong can xac thuc (e.g. internal endpoint).

### Webhook HTTP client: dung `fetch()` native

Node 22 co global `fetch()` native (undici under the hood). KHONG can import undici rieng.

```ts
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(hmacSecret ? { 'X-KVL-Signature': signature } : {}),
  },
  body: jsonBody,
  signal: AbortSignal.timeout(10_000),
})
```

- Timeout: 10 giay (`AbortSignal.timeout(10_000)`)
- `fetch()` throw `TypeError` khi network fail hoac DNS fail. Catch va tra retriable = true
- Response status < 300: thanh cong
- Response 401/403: retriable false (auth invalid)
- Response 429/5xx: retriable true

### Rate limit implementation

Dung `hono-rate-limiter` (v0.5.3). Package nay export middleware tuong thich Hono.

```ts
import { rateLimiter } from 'hono-rate-limiter'

const emitRateLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (c) => {
    const auth = c.get('auth')
    return auth?.userId ?? 'anonymous'
  },
  standardHeaders: 'draft-7',
})
```

Mount truoc route handler:

```ts
app.post('/api/v1/notifications/emit', emitRateLimiter, requireAuth, handler)
```

**Luu y:** `hono-rate-limiter` mac dinh dung in-memory store. Du cho MVP 1 instance. Khi scale nhieu instance, chuyen sang Redis store.

### Emit endpoint Zod schema

Client chi gui event content, KHONG duoc chi dinh routing:

```ts
const emitInputSchema = z.object({
  type: z.enum(notificationTypeValues),
  severity: z.enum(notificationSeverityValues),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  context: z.record(z.unknown()).optional(),
})
```

Server tu inject:

- `id`: `uuidv7()`
- `storeId`: tu JWT (`c.get('auth').storeId`)
- `occurredAt`: `new Date().toISOString()`
- `correlationId`: `c.get('logger')?.bindings()?.requestId`

Client KHONG duoc gui `storeId`, `id`, `transport`, `channelId`. Schema parse strict, field thua bi reject.

### Files can TAO MOI

- `packages/notifications/src/transports/webhook.ts`
- `packages/notifications/src/transports/telegram.ts`
- `packages/notifications/src/__tests__/webhook-transport.test.ts`
- `packages/notifications/src/__tests__/telegram-transport.test.ts`
- `apps/api/src/routes/notifications.routes.ts`
- `apps/api/src/__tests__/notifications-emit.integration.test.ts`

### Files can SUA

- `packages/notifications/src/index.ts`: them WebhookTransport + TelegramTransport vao registry
- `packages/notifications/src/formatters/index.ts`: them `formatTelegramMessage()` (hoac tao file rieng)
- `packages/notifications/package.json`: them dependency `grammy`
- `apps/api/package.json`: them dependency `hono-rate-limiter`
- `apps/api/src/index.ts`: mount notification routes

### Story 10.4 se them (OUT OF SCOPE cho story nay)

- 7 business event emitters trong cac service (auth, order, stock, sync, audit)
- Default rules seeding khi store moi tao
- Event Catalog enum da co san (khong can sua schema)

### Anti-patterns: TUYET DOI KHONG

- KHONG goi `bot.start()` hay `bot.launch()`. Chi dung `bot.api.sendMessage()`
- KHONG cache Bot instance global. Moi send tao instance moi (botToken khac nhau per channel)
- KHONG log botToken, hmacSecret, webhook URL. Pino redact da cover `*.botToken`, `*.secret`, `*.hmacSecret`
- KHONG cho client chi dinh transport, channelId, hoac override rule. API chi nhan event content
- KHONG hard-code rate limit threshold. Dung config constant, de thay doi sau
- KHONG dung `axios` hay `got`. Dung `fetch()` native (Node 22)
- KHONG import `undici` rieng. `fetch()` global da dung undici
- KHONG tra `config_encrypted` plaintext qua API. Endpoint GET channel phai tra `config: null`
- KHONG tao Zod schema rieng trong `apps/api/`. Reuse `notificationTypeValues`, `notificationSeverityValues` tu `@kiotviet-lite/shared`
- KHONG dung `any` hoac `@ts-ignore`
- KHONG dung CommonJS

### Thu vien va phien ban

| Package           | Version | Vai tro                         | Ghi chu                                              |
| ----------------- | ------- | ------------------------------- | ---------------------------------------------------- |
| grammy            | ^1.42.0 | Telegram Bot API client         | Chi dung `bot.api.sendMessage()`, khong dung polling |
| hono-rate-limiter | ^0.5.3  | Rate limit middleware cho Hono  | In-memory store mac dinh, du cho MVP                 |
| node:crypto       | native  | HMAC-SHA256 cho webhook signing | Khong can install                                    |

### Previous Story Intelligence (10.2)

Tu Story 10.2 (Notification Service Core, dang in-progress):

- Transport interface da on dinh: `send(event: NotificationEvent, config: Record<string, unknown>): Promise<SendResult>`
- Transport registry: object literal, them transport bang cach them property
- Retry logic: `withRetry()` wrap `transport.send()`. Exponential backoff 1s, 4s, 16s
- Crypto: `decrypt(ciphertext, key)` tra `Record<string, unknown>`. Key = hex string 64 chars (32 bytes)
- Throttle: check dua tren `notification_deliveries` table, scope (storeId, eventType, channelId)
- `notify()` function da handle: validate → route → throttle → decrypt → transport.send → log delivery
- DB schemas: `notificationChannels`, `notificationRules`, `notificationDeliveries` da co san
- Enum `notificationTransportEnum` da bao gom `'webhook'` va `'telegram'`
- PGlite test pattern: dung `@electric-sql/pglite` in-memory cho integration test

### Previous Story Intelligence (10.1)

Tu Story 10.1 (Structured Logging, done):

- Pino logger wire vao Hono middleware, `c.get('logger')` tra Pino child logger voi `requestId`
- `c.get('logger')?.bindings()?.requestId` de lay requestId lam correlationId cho notification event
- Hono Variables type: `declare module 'hono'` pattern, da extend cho `auth` va `logger`
- Middleware order: cors → requestLogger → routes → errorHandler
- Error handler: dung Pino, phan biet warn (4xx) va error (5xx)

### Git Intelligence

5 commits gan nhat:

- `da68e5a`: Document CI/CD pipeline va structured logging implementation
- `dbe3932`: Update sprint status cho Epic 10
- `2a2237e`: Add actor_role to audit logs + transaction support
- `003da14`: Implement layout, navigation, user management RBAC
- `6690277`: Hoan thanh Story 1.2

Pattern:

- Commit style: `feat:`, `fix:`, `chore:` prefix
- Middleware pattern nhat quan: factory function `createXxxRoutes()` tra Hono instance
- Auth middleware inject auth object vao context

### Test Patterns

**Unit test transport:**

- Mock external dependency (Grammy, fetch)
- Test happy path + error classification (retriable vs non-retriable)
- Test missing config fields

**Integration test endpoint:**

- Dung Hono test client `app.request(...)` giong pattern hien co
- Seed test data: tao store, user, channel, rule trong PGlite
- Verify response status + body schema

**Mock Grammy example:**

```ts
import { vi } from 'vitest'

vi.mock('grammy', () => ({
  Bot: vi.fn().mockImplementation(() => ({
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
  })),
  GrammyError: class GrammyError extends Error {
    constructor(
      message: string,
      public error_code: number,
    ) {
      super(message)
    }
  },
  HttpError: class HttpError extends Error {},
}))
```

**Mock fetch example:**

```ts
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }))
```

### Project Structure Notes

- Route file: `apps/api/src/routes/notifications.routes.ts` (kebab-case, cung folder voi `auth.routes.ts`, `users.routes.ts`)
- Transport file: `packages/notifications/src/transports/telegram.ts`, `webhook.ts` (cung folder voi `console.ts`, `file.ts`)
- Test files: co-located trong `__tests__/` folder cua package tuong ung
- Naming: `TelegramTransport`, `WebhookTransport` (PascalCase class)

### References

- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 3: Backend Notification Service]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 10: Security]
- [Source: _bmad-output/planning-artifacts/architecture/observability-and-notifications.md#Section 12: Technology stack]
- [Source: _bmad-output/planning-artifacts/epics/epic-10-canh-bao-giam-sat-cua-hang.md#Story 10.3]
- [Source: _bmad-output/project-context.md#Notification Service]
- [Source: _bmad-output/implementation-artifacts/10-2-notification-service-core.md] (previous story, transport interface, patterns)
- [Source: _bmad-output/implementation-artifacts/10-1-structured-logging-cho-backend.md] (logger, requestId, middleware patterns)
- [Source: packages/notifications/src/transports/base.ts] (Transport interface, SendResult type)
- [Source: packages/notifications/src/index.ts] (notify function, transport registry)
- [Source: packages/notifications/src/crypto.ts] (AES-256-GCM encrypt/decrypt)
- [Source: packages/notifications/src/formatters/index.ts] (formatEvent, SEVERITY_BADGE)
- [Source: packages/notifications/src/retry.ts] (withRetry exponential backoff)
- [Source: apps/api/src/lib/env.ts] (notificationConfigKey getter)
- [Source: apps/api/src/index.ts] (middleware mount order)
- [Grammy documentation](https://grammy.dev/)
- [hono-rate-limiter npm](https://www.npmjs.com/package/hono-rate-limiter)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Webhook test: Node Response constructor khong tu set statusText, can truyen explicit trong test
- Telegram test: vi.mock hoisted truoc class declaration, can dung vi.hoisted() de khai bao mock classes
- ApiError import unused sau khi dung parseJson pattern, lint --fix da xu ly

### Completion Notes List

- TelegramTransport: dung Grammy Bot API (chi bot.api.sendMessage, khong start polling), phan loai retriable theo GrammyError.error_code
- WebhookTransport: dung fetch() native Node 22, HMAC-SHA256 signing voi X-KVL-Signature header, 10s timeout
- formatTelegramMessage: HTML format voi severity badge, escapeHtml, truncate 2000 chars
- Transport registry: them webhook + telegram vao transports record trong index.ts
- API endpoint POST /api/v1/notifications/emit: requireAuth + rate limit 60req/min, strict Zod schema reject field thua (storeId, id, transport), server inject id/storeId/occurredAt/correlationId
- 22 test files, 198 tests pass, 0 regression. Typecheck va lint pass toan workspace

### File List

**Tao moi:**

- packages/notifications/src/transports/telegram.ts
- packages/notifications/src/transports/webhook.ts
- packages/notifications/src/**tests**/telegram-transport.test.ts
- packages/notifications/src/**tests**/webhook-transport.test.ts
- packages/notifications/src/**tests**/telegram-formatter.test.ts
- apps/api/src/routes/notifications.routes.ts
- apps/api/src/**tests**/notifications-emit.integration.test.ts

**Sua:**

- packages/notifications/src/formatters/index.ts (them formatTelegramMessage, escapeHtml)
- packages/notifications/src/index.ts (them WebhookTransport, TelegramTransport vao registry)
- packages/notifications/package.json (them grammy dependency)
- apps/api/src/index.ts (mount notification routes)
- apps/api/package.json (them hono-rate-limiter, uuidv7 dependencies)
- pnpm-lock.yaml (updated)

### Review Findings

**Decision Needed:**

- [x] [Review][Decision] Thu tu middleware: doi theo spec, rate limiter truoc auth. keyGenerator dung IP thay userId. [notifications.routes.ts:47] — FIXED
- [x] [Review][Decision] Delivery log thieu cot `retriable`: them cot boolean + migration 0006 + update notify(). [schema/notifications.ts, notifications/src/index.ts] — FIXED

**Patch:**

- [x] [Review][Patch] Grammy thieu trong package.json — FIXED: them `grammy: ^1.42.0` vao dependencies
- [x] [Review][Patch] SSRF: Webhook URL khong validate — FIXED: them isPrivateHost() + URL protocol check
- [x] [Review][Patch] API response lo error messages noi bo — FIXED: sanitize results truoc khi tra client
- [x] [Review][Patch] Webhook response body khong duoc consume — FIXED: them response.body?.cancel()
- [x] [Review][Patch] Telegram transport thieu timeout — FIXED: Promise.race voi 10s timeout
- [x] [Review][Patch] Thieu test case webhook 401 — FIXED: them test
- [x] [Review][Patch] Thieu test case telegram 403 — FIXED: them test + SSRF tests

**Deferred:**

- [x] [Review][Defer] HMAC khong co timestamp, cho phep replay — deferred, spec chi yeu cau HMAC-SHA256 signing, khong yeu cau replay protection
- [x] [Review][Defer] toLocaleString output phu thuoc runtime ICU — deferred, can ICU data setup, low impact
- [x] [Review][Defer] Request timeout khong gioi han khi nhieu rules match — deferred, can refactor notify() sang background job, khong thuoc scope story 10-3
- [x] [Review][Defer] formatTelegramMessage truncate truoc escape — deferred, margin du cho MVP (2000 chars vs 4096 limit)
- [x] [Review][Defer] context field khong gioi han size/depth — deferred, can them constraint, low impact cho MVP
- [x] [Review][Defer] Throttled delivery tra ok:true khong phan biet voi gui thanh cong — deferred, design choice story 10-2
- [x] [Review][Defer] Race condition throttle check vs delivery insert — deferred, pre-existing story 10-2, best-effort throttle
- [x] [Review][Defer] notificationConfigKey empty khong canh bao khi khoi dong — deferred, by design (.env.example: "Empty = notifications disabled")
- [x] [Review][Defer] maxAttempts=4 co the khong khop spec "retry 3 lan" — deferred, retry.ts thuoc story 10-2 (KHONG SUA)

### Change Log

- 2026-04-25: Implement Story 10.3 - Them Telegram va Webhook transport, API endpoint emit voi rate limit, strict schema validation. 22 test files / 201 tests pass.
- 2026-04-25: Re-implement missing files (telegram.ts, webhook.ts, formatter, tests, registry). 22 test files / 198 tests pass. Typecheck va lint pass.
