# Deferred Work

## Deferred from: code review of 10-3-webhook-telegram-transport-bao-mat (2026-04-25)

- HMAC khong co timestamp, cho phep replay attacks. Spec chi yeu cau HMAC-SHA256 signing, khong yeu cau replay protection. Can them timestamp + nonce khi scale. [webhook.ts]
- toLocaleString output phu thuoc runtime ICU data. Node.js small ICU build co the format khac. Can Intl.DateTimeFormat hoac date-fns khi can deterministic output. [formatters/index.ts:31-33]
- Request timeout khong gioi han khi nhieu rules match. Moi rule co the mat 61s (4 attempts x 10s timeout + 21s backoff). Can refactor notify() sang background job queue. [notifications/src/index.ts]
- formatTelegramMessage truncate body truoc khi escape HTML. Escaped output co the dai hon 2000 chars. Margin du cho MVP (vs 4096 Telegram limit). [formatters/index.ts:28-29]
- context field khong gioi han size/depth trong emit schema. z.record(z.unknown()) cho phep nested object lon. Can them .refine() gioi han size. [notifications.routes.ts:36]
- Throttled delivery tra ok:true, caller khong phan biet sent vs throttled. Design choice story 10-2. [notifications/src/index.ts:65]
- Race condition giua throttle check va delivery insert. 2 request dong thoi co the ca hai thay "chua throttle". Best-effort throttle, low impact. [notifications/src/index.ts:46-66]
- notificationConfigKey empty khong canh bao khi khoi dong. By design (.env.example: "Empty = notifications disabled"). Can them startup log warning. [env.ts:44-46]
- maxAttempts=4 co the khong khop spec "retry 3 lan". retry.ts thuoc story 10-2 (KHONG SUA). Can lam ro spec: 3 retries (4 total) hay 3 total attempts. [retry.ts:8]

## Deferred from: code review of 10-2-notification-service-core (2026-04-25)

- `isSeverityGte` default severity không xác định về 0 (= info), gây false positive nếu gọi trực tiếp. Zod validate ở boundary nên rủi ro thấp. [router.ts:19]
- `notification_deliveries.storeId` thiếu FK tới stores. Cột denormalized cho query performance, thêm FK tăng overhead write. [notifications.ts:99]
- Thiếu index cho `eventId` trên notification_deliveries. Chưa có use case query theo eventId ở production. [notifications.ts:95]
- Transport instances là module-level singletons. Hiện tại stateless, cần xem lại khi thêm stateful transports ở Story 10.3. [index.ts:18-23]
- `decrypt()` chỉ dùng `JSON.parse` + type assertion, không validate schema cho config object. Thêm Zod validation per-transport khi có nhiều transport hơn. [crypto.ts:39]
- `notify()` xử lý tuần tự từng rule, rule chậm block toàn bộ. Cân nhắc `Promise.allSettled` khi có network transports ở Story 10.3. [index.ts:40-93]
- `notification_rules` thiếu `updatedAt`. AC2 không yêu cầu, thêm khi cần audit rule changes. [notifications.ts:72-87]
- `notificationEventSchema.parse()` throw ZodError không catch, có thể leak data trong error. Caller nên handle. [index.ts:34]
- Bảng notification_deliveries tích luỹ vô hạn, không có cơ chế purge. Thêm retention policy khi scale. [notifications.ts:89-114]
- Throttled delivery trả `{ ok: true, attempts: 0 }`, caller không phân biệt sent vs throttled. Cân nhắc thêm variant khi cần. [index.ts:63]

## Deferred from: code review of 10-2-notification-service-core, round 2 (2026-04-25)

- `parseKey` chấp nhận hex không hợp lệ, `Buffer.from('xyz', 'hex')` skip ký tự sai, error "wrong length" gây nhầm. [crypto.ts:7-10]
- FileTransport zero test coverage. Path validation, file write, error handling chưa test. [file.ts]
- `ConsoleTransport.send()` không catch `stdout.write` throw khi pipe broken. [console.ts:12]
- Backoff delay không có max cap, nếu `maxAttempts` tăng thì delay explode (4^n). [retry.ts:26]
- Clock skew giữa app server (`Date.now()`) và DB server (`defaultNow()`) ảnh hưởng throttle window. [throttle.ts:19]
- `context` field `z.record(z.unknown()).optional()` không giới hạn depth/size, tiềm ẩn DoS. [notifications.ts:128]
- Catch blocks swallow exception hoàn toàn (6 chỗ), mất audit trail khi DB connection pool cạn. [index.ts]
- Webhook SSRF + Telegram Bot instance leak + grammy missing dep (thuộc scope Story 10-3). [webhook.ts, telegram.ts]

## Deferred from: code review of 10-1-structured-logging-cho-backend (2026-04-25)

- `let logger` export race condition: ES module live binding xử lý đúng, nhưng nếu ai destructure/cache giá trị thì sẽ giữ reference cũ. Document pattern sử dụng.
- ZodError không được log trong error handler: pre-existing behavior, validation 400 hiện không log. Xem xét log ở debug/warn khi cần observability.
- Non-/api/ routes fallback về root logger không có requestId: by design, chỉ /api/\* qua request logger middleware.
- c.req.path có thể chứa PII trong tương lai (reset token trên URL). Hiện tại Hono path không chứa query string, an toàn.
- Redact pattern `*.password` chỉ match 1 cấp nesting. Cần `**` cho deep wildcard khi có use case log object lồng sâu.
- Thiếu graceful shutdown (pino.final/flushSync) khi process nhận SIGTERM. Quan trọng cho container/Kubernetes deployment.
- Thiếu redact cho cookie, token, refreshToken, accessToken. Chưa log các field này nhưng cần cập nhật khi thêm.
- Integration test chỉ verify X-Request-Id header, không verify nội dung log (method, path, status, duration). Cần inject mock stream để test kỹ hơn.

## Deferred from: code review of 1-4-quan-ly-nhan-vien-phan-quyen (2026-04-25)

- REVOKE UPDATE, DELETE trên audit_logs chỉ áp dụng FROM PUBLIC, không chặn app role cụ thể. Cần REVOKE cho application role hoặc dùng trigger BEFORE UPDATE/DELETE RAISE EXCEPTION. Áp dụng khi deploy production.
- X-Forwarded-For có thể giả mạo khi không có reverse proxy, audit log ghi IP sai. Cần trust proxy config hoặc fallback sang socket remote address. Phụ thuộc deployment infrastructure.
- orders.viewAll thiếu trong permissions.ts dù bảng ma trận quyền AC3 liệt kê. Orders module chưa implement, sẽ thêm permission khi implement Epic 3.

## Deferred from: code review of story 1.3 (2026-04-25)

- Mobile drawer focus trap (WCAG 2.1 AA AC8): focus đi vào drawer khi mở, focus trả về hamburger khi đóng. Hiện chỉ có Escape + backdrop click.
- Unit tests cho layout components (Sidebar, AppLayout, ErrorBoundary, EmptyState). Spec chưa bắt buộc nhưng nên có.
- HomePage hiển thị "Xin chào, " (tên trống) khi user null. Auth guard đã chặn nhưng nên defensive default value.

## Deferred from: code review of story 1.2 (2026-04-25)

- Rate limit cho auth endpoints (5 req/min/IP cho login, 3/hour cho register)
- Pino structured logging thay console.log/error (redact password, authorization)
- Audit log cho sự kiện đăng nhập/đăng xuất (cần audit_logs table)
- Refresh token reuse detection: revoke toàn bộ family khi phát hiện reuse
- CSRF protection cho endpoints dùng cookie auth (SameSite=Strict hoặc CSRF token)
- JWT issuer/audience claims
- Refresh tokens cleanup cron (xoá rows expired/revoked)
- Env validation: JWT secret length >= 32, TTL parse validation
- bcrypt 72 byte limit cho Unicode passwords
- Chuyển sang file-based routing (TanStack Router plugin)
- QueryClient global error handler + staleTime config
- Password leading/trailing space UX warning

## Deferred from: code review of 1-1-khoi-tao-monorepo-database-design-system-co-ban (2026-04-24)

- DB connection không có graceful shutdown (`apps/api/src/db/index.ts`): cần `process.on('SIGTERM/SIGINT')` để đóng connection pool. Scope story deploy/production-readiness.
- API server thiếu CORS, security headers, error handler (`apps/api/src/index.ts`): CORS cần cho web port 5173 gọi API port 3000. Scope story 1.2+ khi có API routes thực.
- Bảng stores/users thiếu indexes cho truy vấn (`packages/shared/src/schema/`): chưa cần khi bảng trống, thêm khi có data và query patterns rõ.
- `next-themes` dependency trong Vite project (`apps/web/package.json`): shadcn/ui tạo, hoạt động được nhưng cần ThemeProvider wrap app. Xem xét thay bằng giải pháp nhẹ hơn khi implement dark mode.
- Test dùng plaintext cho password_hash (`apps/web/src/lib/pglite.test.ts:67`): chấp nhận trong test, nhưng khi viết auth logic cần validation layer đảm bảo không lưu plaintext.
