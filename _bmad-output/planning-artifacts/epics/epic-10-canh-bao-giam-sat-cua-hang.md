# Epic 10: Cảnh báo & Giám sát cửa hàng

Chủ cửa hàng nhận cảnh báo tức thì qua Telegram/webhook khi có sự kiện nghiệp vụ quan trọng (tồn kho âm, đơn giá trị lớn, sync lỗi, đăng nhập bất thường). Dev có structured log để debug và giám sát hệ thống.

> **Phụ thuộc**: Epic 1 (auth), Epic 2 (products), Epic 3 (orders), Epic 9 (sync, PGlite outbox)
> **Nguồn yêu cầu**: ADR `architecture/observability-and-notifications.md`
> **Nợ kỹ thuật chấp nhận ở MVP**: Chưa có UI admin quản lý rule (config qua SQL/API nội bộ). Chưa có metrics Prometheus.

## Story 10.1: Structured Logging cho Backend

As a developer,
I want structured JSON logging với request correlation trên backend,
So that tôi debug nhanh và ship log sang hệ thống aggregation sau này.

> **ARs:** AR30, AR31
> **FRs:** (không có FR trực tiếp, đây là infrastructure concern)

**Acceptance Criteria:**

**Given** backend Hono đang chạy
**When** bất kỳ request nào đến API
**Then** mỗi log line là JSON hợp lệ chứa: `level`, `time` (ISO 8601), `requestId` (UUID v7), `msg`
**And** response header chứa `X-Request-Id` cùng giá trị

**Given** log chứa field nhạy cảm (`password`, `pin`, `botToken`, `authorization` header)
**When** Pino ghi log
**Then** các field đó bị redact thành `[Redacted]`

**Given** môi trường production
**When** app chạy qua đêm
**Then** log rotate theo ngày (`app-YYYY-MM-DD.log`), giữ 30 ngày, max 100MB/file
**And** cron job ship log sang Cloudflare R2 hàng ngày

**Given** môi trường development
**When** dev chạy `pnpm dev`
**Then** log hiển thị pino-pretty (có màu, dễ đọc)

**Given** developer muốn kiểm tra log level
**When** set env `LOG_LEVEL=debug`
**Then** log hiển thị từ mức debug trở lên
**And** mức mặc định là `info`

## Story 10.2: Notification Service Core

As a hệ thống,
I want một notification service có thể route event tới nhiều kênh theo rule,
So that các service nghiệp vụ chỉ cần emit event mà không cần biết gửi đi đâu.

> **ARs:** AR32, AR33, AR34, AR36

**Acceptance Criteria:**

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
```
**When** import `notify(event)` từ package
**Then** function nhận `NotificationEvent` (validate bằng Zod schema) và trả về `Promise<SendResult[]>`

**Given** DB migration chạy thành công
**When** kiểm tra database
**Then** 3 bảng tồn tại với schema đúng ADR:
- `notification_channels` (`id`, `store_id`, `transport`, `name`, `config_encrypted`, `enabled`, `created_at`, `updated_at`)
- `notification_rules` (`id`, `store_id`, `event_type`, `min_severity`, `channel_id`, `enabled`, `throttle_seconds`, `created_at`)
- `notification_deliveries` (`id`, `event_id`, `channel_id`, `status`, `attempts`, `error`, `created_at`)

**Given** 1 rule match event type `stock.negative` + severity `error` → channel console
**When** gọi `notify({ type: 'stock.negative', severity: 'error', storeId, title, body, ... })`
**Then** console transport nhận event và ghi ra stdout
**And** 1 row insert vào `notification_deliveries` với `status='sent'`, `attempts=1`

**Given** transport fail (ví dụ file permission denied)
**When** retry 3 lần (1s, 4s, 16s exponential backoff) đều fail
**Then** `notification_deliveries` row có `status='dead'`, `attempts=3`, `error` chứa message lỗi

**Given** rule có `throttle_seconds=300`
**When** cùng event type + store_id gửi 2 lần trong 5 phút
**Then** lần 2 bị skip, không gửi transport
**And** delivery log ghi `status='throttled'`

**Given** event có `severity='info'` nhưng rule yêu cầu `min_severity='error'`
**When** router filter rules
**Then** rule đó không match, event không gửi qua channel đó

## Story 10.3: Webhook & Telegram Transport + Bảo mật

As a chủ cửa hàng,
I want nhận cảnh báo qua Telegram và webhook,
So that tôi biết ngay khi có sự cố dù không mở app.

> **ARs:** AR32 (webhook + telegram transport), AR38, AR39

**Acceptance Criteria:**

**Given** channel Telegram đã cấu hình (`botToken` + `chatId`)
**When** event match rule gửi tới Telegram transport
**Then** Grammy bot gửi message Markdown tới đúng chat, chứa: title, body, severity badge, thời gian
**And** delivery < 5 giây từ lúc emit

**Given** channel webhook đã cấu hình (`url` + `hmacSecret`)
**When** event match rule gửi tới webhook transport
**Then** POST request chứa JSON body + header `X-KVL-Signature` = HMAC-SHA256(body, hmacSecret)
**And** receiver verify signature thành công

**Given** Telegram bot token hoặc webhook URL fail khi gửi
**When** transport retry 3 lần đều fail
**Then** delivery log ghi `status='dead'`, `retriable=false` (nếu 401/403) hoặc `retriable=true` (nếu timeout/5xx)

**Given** owner lưu channel config (botToken, webhook URL, hmacSecret)
**When** config được persist vào DB
**Then** cột `config_encrypted` chứa ciphertext AES-256-GCM, không plaintext
**And** key mã hoá từ env var `NOTIFICATION_CONFIG_KEY` (32 byte)
**And** decrypt chỉ trong Notification Service runtime
**And** API GET channel trả về `config: null` (không trả về cho client)

**Given** endpoint `POST /api/notifications/emit`
**When** user gửi > 60 request/phút
**Then** trả 429 Rate Limited
**And** chỉ chấp nhận event type đã whitelist, không cho client chỉ định transport

**Given** `packages/notifications/src/transports/` đã có 4 transport
**When** kiểm tra cấu trúc
**Then** tồn tại: `console.ts`, `file.ts`, `webhook.ts`, `telegram.ts`
**And** tất cả implement interface `Transport` từ `base.ts`

## Story 10.4: Kết nối 7 Event nghiệp vụ MVP

As a chủ cửa hàng,
I want hệ thống tự phát hiện và cảnh báo 7 sự kiện quan trọng,
So that tôi xử lý bất thường kịp thời mà không cần canh chừng liên tục.

> **ARs:** AR35
> **Event Catalog:** 7 events theo ADR Section 6

**Acceptance Criteria:**

**Given** user đăng nhập từ IP/User-Agent khác thường (so với 5 lần login gần nhất)
**When** auth service detect bất thường
**Then** emit `auth.login.suspicious` severity `warn` qua event bus
**And** context chứa: userId, IP, userAgent

**Given** PIN nhập sai 5 lần liên tiếp
**When** auth service lock PIN
**Then** emit `auth.pin.locked` severity `warn`
**And** context chứa: userId, lockedUntil

**Given** đơn hàng có tổng tiền > ngưỡng cấu hình (mặc định 5.000.000 VNĐ)
**When** order service tạo đơn thành công
**Then** emit `order.high_value` severity `info`
**And** context chứa: orderId, total, customerName

**Given** giao dịch khiến tồn kho SP xuống dưới 0
**When** stock service cập nhật tồn kho
**Then** emit `stock.negative` severity `error`
**And** context chứa: productId, productName, currentStock, previousStock

**Given** sync fail 3 lần liên tiếp cho cùng 1 batch
**When** sync service detect repeated failure
**Then** emit `sync.failed_repeatedly` severity `error`
**And** context chứa: failCount, lastError, pendingCount

**Given** nhân viên sửa giá dưới giá vốn (sau PIN override thành công)
**When** order service ghi nhận price override
**Then** emit `audit.price_override` severity `warn`
**And** context chứa: orderId, productName, originalPrice, newPrice, costPrice, userId

**Given** exception không bắt được ở backend
**When** global error handler catch
**Then** emit `system.error.unhandled` severity `critical`
**And** context chứa: errorMessage, stack (truncated 500 chars), requestId
**And** Sentry vẫn nhận error song song (không thay thế)

**Given** store mới tạo, owner chưa cấu hình rule
**When** store khởi tạo xong
**Then** hệ thống seed 7 default rules map event → console transport (enabled)
**And** owner có thể bật thêm Telegram/webhook sau

**Given** event type theo namespace `<domain>.<action>[.<qualifier>]`
**When** developer muốn thêm event mới
**Then** cập nhật enum `NotificationTypeEnum` + Zod schema + bảng Event Catalog trong ADR

## Story 10.5: Frontend Outbox cho Notification

As a nhân viên bán hàng,
I want notification event được queue lại khi offline và tự gửi khi có mạng,
So that chủ shop vẫn nhận cảnh báo dù tôi đang bán offline.

> **ARs:** AR37
> **Phụ thuộc:** Epic 9 (PGlite), Story 10.2 (Notification Service), Story 10.4 (events)

**Acceptance Criteria:**

**Given** PGlite migration chạy thành công
**When** kiểm tra schema client
**Then** bảng `outbox_events` tồn tại với cột: `id` (UUID v7), `type`, `payload` (JSON), `created_at`, `synced_at` (nullable), `retry_count`

**Given** thiết bị đang offline, xảy ra event cần notification (ví dụ tồn kho âm)
**When** business logic phát sinh notification event
**Then** event write vào `outbox_events` với `synced_at = null`
**And** Toast UI hiển thị ngay cho user hiện tại (phản hồi tức thì, không chờ sync)

**Given** thiết bị online trở lại
**When** sync worker detect unsynced events trong `outbox_events`
**Then** batch POST tới `POST /api/notifications/emit`
**And** server validate + enqueue vào event bus + trả 200
**And** worker mark `synced_at = now()` cho từng event đã ack

**Given** events trong outbox quá 7 ngày chưa sync
**When** sync worker chạy
**Then** archive events cũ (giữ local để truy vấn), không gửi lên server nữa

**Given** sync worker POST fail (server 500 hoặc network error)
**When** `retry_count < 5`
**Then** retry với exponential backoff, tăng `retry_count`
**And** `retry_count >= 5` → mark event failed, không retry nữa

**Given** frontend gửi event qua outbox
**When** event tới server
**Then** server validate event type nằm trong whitelist
**And** server không cho client chỉ định transport hay override rule
