# Deferred Work

## Deferred from: code review of 7-2-tra-hang (2026-05-04)

- ✅ N+1 query trong `getOrderReturns`: mỗi return record query items riêng. Nên optimize bằng single JOIN khi số lượng return lớn. [apps/api/src/services/returns.service.ts:574] → **Epic 11 TD11**
- ✅ Unit conversion không reverse khi trả hàng: `unitConversionId` không được lưu trong `order_items`, nên khi trả hàng không thể tính lại base quantity. Pre-existing design gap. → **Epic 11 TD28**

## Deferred from: code review of 4-3c-so-sanh-bang-gia (2026-05-01)

- Banner reason 'Đã bị xoá' trong `buildIneffectiveReason` là dead path vì `getPriceList` throw 404 khi `deletedAt !== null` trước khi banner render. Defensive code, giữ lại an toàn. [apps/web/src/features/pricing/components/ComparePriceListsView.tsx:45]

## Deferred from: code review of 2-1-quan-ly-danh-muc-san-pham (2026-04-25)

- ✅ Race condition khi 2 concurrent updates đổi parent của 2 categories khác → 2 row cùng sortOrder (không có unique constraint trên (parent, sortOrder)). [apps/api/src/services/categories.service.ts:309-316] → **Epic 11 TD12**
- ✅ `asFormSetError` cast cồng kềnh giữa CreateCategoryInput và UpdateCategoryInput → **Đã fix** (2026-05-07, deferred-work cleanup)
- Reorder không enforce orderedIds completeness; race với user khác thêm cấp 1 mới có thể tạo lỗ trong sortOrder dãy. [apps/api/src/services/categories.service.ts:374-389]
- ✅ Reorder transaction sequential update loop. N=200 sequential queries chậm; có thể dùng UPDATE ... CASE WHEN bulk. [apps/api/src/services/categories.service.ts:392-396] → **Epic 11 TD12**
- ✅ Migration 0007 cuối file thiếu `--> statement-breakpoint` → **Đã fix** (2026-05-07, deferred-work cleanup)
- ✅ Schema name regex cho phép multiple internal whitespace, không collapse → "Cà phê" vs "Cà phê" coi là khác category. UX inconsistency. [packages/shared/src/schema/category-management.ts:5-10] → **Epic 11 TD29**

## Deferred from: code review of 10-3-webhook-telegram-transport-bao-mat (2026-04-25)

- ✅ HMAC khong co timestamp, cho phep replay attacks. Spec chi yeu cau HMAC-SHA256 signing, khong yeu cau replay protection. Can them timestamp + nonce khi scale. [webhook.ts] → **Epic 11 TD6**
- toLocaleString output phu thuoc runtime ICU data. Node.js small ICU build co the format khac. Can Intl.DateTimeFormat hoac date-fns khi can deterministic output. [formatters/index.ts:31-33]
- Request timeout khong gioi han khi nhieu rules match. Moi rule co the mat 61s (4 attempts x 10s timeout + 21s backoff). Can refactor notify() sang background job queue. [notifications/src/index.ts]
- ✅ formatTelegramMessage truncate body truoc khi escape HTML → **Đã fix**: escape trước, truncate sau (2026-05-07, deferred-work cleanup)
- ✅ context field khong gioi han size/depth trong emit schema. z.record(z.unknown()) cho phep nested object lon. Can them .refine() gioi han size. [notifications.routes.ts:36] → **Epic 11 TD23**
- Throttled delivery tra ok:true, caller khong phan biet sent vs throttled. Design choice story 10-2. [notifications/src/index.ts:65]
- Race condition giua throttle check va delivery insert. 2 request dong thoi co the ca hai thay "chua throttle". Best-effort throttle, low impact. [notifications/src/index.ts:46-66]
- notificationConfigKey empty khong canh bao khi khoi dong. By design (.env.example: "Empty = notifications disabled"). Can them startup log warning. [env.ts:44-46]
- maxAttempts=4 co the khong khop spec "retry 3 lan". retry.ts thuoc story 10-2 (KHONG SUA). Can lam ro spec: 3 retries (4 total) hay 3 total attempts. [retry.ts:8]

## Deferred from: code review of 10-2-notification-service-core (2026-04-25)

- ✅ `isSeverityGte` default severity không xác định về 0 → **Đã fix**: trả `false` khi severity không nhận diện (2026-05-07, deferred-work cleanup)
- `notification_deliveries.storeId` thiếu FK tới stores. Cột denormalized cho query performance, thêm FK tăng overhead write. [notifications.ts:99]
- Thiếu index cho `eventId` trên notification_deliveries. Chưa có use case query theo eventId ở production. [notifications.ts:95]
- Transport instances là module-level singletons. Hiện tại stateless, cần xem lại khi thêm stateful transports ở Story 10.3. [index.ts:18-23]
- ✅ `decrypt()` chỉ dùng `JSON.parse` + type assertion → **Đã fix**: thêm Zod schema validation (2026-05-07, deferred-work cleanup)
- ✅ `notify()` xử lý tuần tự từng rule → **Đã fix**: dùng Promise.allSettled xử lý song song (2026-05-07, deferred-work cleanup)
- `notification_rules` thiếu `updatedAt`. AC2 không yêu cầu, thêm khi cần audit rule changes. [notifications.ts:72-87]
- ✅ `notificationEventSchema.parse()` throw ZodError không catch → **Đã fix**: wrap try-catch, trả sanitized error (2026-05-07, deferred-work cleanup)
- ✅ Bảng notification_deliveries tích luỹ vô hạn, không có cơ chế purge. Thêm retention policy khi scale. [notifications.ts:89-114] → **Epic 11 TD13**
- Throttled delivery trả `{ ok: true, attempts: 0 }`, caller không phân biệt sent vs throttled. Cân nhắc thêm variant khi cần. [index.ts:63]

## Deferred from: code review of 10-2-notification-service-core, round 2 (2026-04-25)

- ✅ `parseKey` chấp nhận hex không hợp lệ, `Buffer.from('xyz', 'hex')` skip ký tự sai, error "wrong length" gây nhầm. [crypto.ts:7-10] → **Epic 11 TD20**
- FileTransport zero test coverage. Path validation, file write, error handling chưa test. [file.ts]
- ✅ `ConsoleTransport.send()` không catch `stdout.write` throw khi pipe broken → **Đã fix**: wrap try-catch (2026-05-07, deferred-work cleanup)
- ✅ Backoff delay không có max cap, nếu `maxAttempts` tăng thì delay explode (4^n). [retry.ts:26] → **Epic 11 TD21**
- Clock skew giữa app server (`Date.now()`) và DB server (`defaultNow()`) ảnh hưởng throttle window. [throttle.ts:19]
- ✅ `context` field `z.record(z.unknown()).optional()` không giới hạn depth/size, tiềm ẩn DoS. [notifications.ts:128] → **Epic 11 TD23**
- ✅ Catch blocks swallow exception hoàn toàn (6 chỗ), mất audit trail khi DB connection pool cạn. [index.ts] → **Epic 11 TD30**
- ✅ Webhook SSRF + Telegram Bot instance leak + grammy missing dep (thuộc scope Story 10-3). [webhook.ts, telegram.ts] → **Epic 11 TD19**

## Deferred from: code review of 10-1-structured-logging-cho-backend (2026-04-25)

- `let logger` export race condition: ES module live binding xử lý đúng, nhưng nếu ai destructure/cache giá trị thì sẽ giữ reference cũ. Document pattern sử dụng.
- ✅ ZodError không được log trong error handler → **Đã fix**: log ở warn level với sanitized issues (2026-05-07, deferred-work cleanup)
- Non-/api/ routes fallback về root logger không có requestId: by design, chỉ /api/\* qua request logger middleware.
- c.req.path có thể chứa PII trong tương lai (reset token trên URL). Hiện tại Hono path không chứa query string, an toàn.
- Redact pattern `*.password` chỉ match 1 cấp nesting. Cần `**` cho deep wildcard khi có use case log object lồng sâu.
- ✅ Thiếu graceful shutdown (pino.final/flushSync) khi process nhận SIGTERM. Quan trọng cho container/Kubernetes deployment. → **Epic 11 TD2**
- Thiếu redact cho cookie, token, refreshToken, accessToken. Chưa log các field này nhưng cần cập nhật khi thêm.
- Integration test chỉ verify X-Request-Id header, không verify nội dung log (method, path, status, duration). Cần inject mock stream để test kỹ hơn.

## Deferred from: code review of 1-4-quan-ly-nhan-vien-phan-quyen (2026-04-25)

- REVOKE UPDATE, DELETE trên audit_logs chỉ áp dụng FROM PUBLIC, không chặn app role cụ thể. Cần REVOKE cho application role hoặc dùng trigger BEFORE UPDATE/DELETE RAISE EXCEPTION. Áp dụng khi deploy production.
- X-Forwarded-For có thể giả mạo khi không có reverse proxy, audit log ghi IP sai. Cần trust proxy config hoặc fallback sang socket remote address. Phụ thuộc deployment infrastructure.
- orders.viewAll thiếu trong permissions.ts dù bảng ma trận quyền AC3 liệt kê. Orders module chưa implement, sẽ thêm permission khi implement Epic 3.

## Deferred from: code review of story 1.3 (2026-04-25)

- ✅ Mobile drawer focus trap (WCAG 2.1 AA AC8): focus đi vào drawer khi mở, focus trả về hamburger khi đóng. Hiện chỉ có Escape + backdrop click. → **Epic 11 TD17**
- Unit tests cho layout components (Sidebar, AppLayout, ErrorBoundary, EmptyState). Spec chưa bắt buộc nhưng nên có.
- ✅ HomePage hiển thị "Xin chào, " (tên trống) khi user null → **Đã fix**: fallback `user?.name || 'bạn'` (2026-05-07, deferred-work cleanup)

## Deferred from: code review of story 1.2 (2026-04-25)

- ✅ Rate limit cho auth endpoints (5 req/min/IP cho login, 3/hour cho register) → **Epic 11 TD1**
- Pino structured logging thay console.log/error (redact password, authorization)
- ✅ Audit log cho sự kiện đăng nhập/đăng xuất (cần audit_logs table) → **Epic 11 TD10**
- ✅ Refresh token reuse detection: revoke toàn bộ family khi phát hiện reuse → **Epic 11 TD7**
- ✅ CSRF protection cho endpoints dùng cookie auth (SameSite=Strict hoặc CSRF token) → **Epic 11 TD8**
- ✅ JWT issuer/audience claims → **Đã fix**: thêm iss + aud khi sign, verify khi validate (2026-05-07, deferred-work cleanup)
- Refresh tokens cleanup cron (xoá rows expired/revoked)
- ✅ Env validation: JWT secret length >= 32, TTL parse validation → **Epic 11 TD9**
- bcrypt 72 byte limit cho Unicode passwords
- Chuyển sang file-based routing (TanStack Router plugin)
- ✅ QueryClient global error handler + staleTime config → **Đã fix**: QueryCache + MutationCache onError + staleTime 30s (2026-05-07, deferred-work cleanup)
- ✅ Password leading/trailing space UX warning → **Đã fix**: cảnh báo vàng trên login + register form (2026-05-07, deferred-work cleanup)

## Deferred from: tách danh mục thành màn hình riêng (2026-04-28)

- ✅ Bottom tab bar mobile hiển thị tất cả nav items (hiện 7 mục). Trên màn hình nhỏ (320-375px) quá chật, label bị cắt. Cần giới hạn 4-5 tab hoặc gom sub-items. [apps/web/src/components/layout/bottom-tab-bar.tsx] → **Epic 11 TD18**
- ✅ Settings nav item dùng permission `audit.viewOwn` → **Đã fix**: đổi sang `store.manage` (owner only) (2026-05-07, deferred-work cleanup)

## Deferred from: code review of 3-1-giao-dien-pos-tim-kiem-san-pham (2026-04-28)

- ✅ W1: Duplicate variant mapping logic trong searchProductsForPos, cần extract helper function [products.service.ts] → **Epic 11 TD26**
- ✅ W2: N+1 queries variant barcode search (5 round-trips), cần merge vào single query [products.service.ts] → **Epic 11 TD27**
- ✅ W3: const rows mutated via push → **Đã fix**: đổi sang let + spread (2026-05-07, deferred-work cleanup)
- ✅ W4: PosProductItem/PosVariantItem duplicated backend/frontend → **Đã fix**: chuyển vào packages/shared, re-export từ cả hai apps (2026-05-07, deferred-work cleanup)
- W5: No min query length server-side, frontend guard đủ cho MVP [pos.routes.ts]
- ✅ W6: Touch targets < 44px: CartItem buttons 28px, CategoryFilter chips 32px, scanner button 36px [CartItem.tsx, CategoryFilter.tsx, PosSearchBar.tsx] → **Epic 11 TD14**
- ✅ W7: Autocomplete dropdown thiếu ARIA combobox roles (role="combobox", role="listbox", aria-expanded) [PosSearchBar.tsx] → **Epic 11 TD15**
- ✅ W8: ProductGrid cards thiếu aria-label → **Đã fix**: thêm aria-label mô tả tên, giá, trạng thái (2026-05-07, deferred-work cleanup)
- ✅ W9: CartPanel width 384px vs spec 380px → **Đã fix**: đổi sang w-[380px] (2026-05-07, deferred-work cleanup)
- ✅ W10: Breakpoint desktop dùng 768px thay vì spec 1024px → **Đã fix**: đổi sang 1024px, tạo 3 trạng thái mobile/tablet/desktop (2026-05-07, deferred-work cleanup)
- W11: Integer overflow risk totalAmount khi VND lớn (không thực tế đạt MAX_SAFE_INTEGER) [use-cart-store.ts]
- W12: Stock validation giữa dialog open và checkout, sẽ validate server-side ở Story 3.3 [VariantSelectionDialog.tsx]
- ✅ W13: attribute1Value empty string khi attribute1Name có giá trị → **Đã fix**: trim + validate, normalize empty to null (2026-05-07, deferred-work cleanup)

## Deferred from: code review of 4-3-bang-gia-direct-formula (2026-04-28)

- ✅ Thiếu inline toggle isActive trên trang chi tiết bảng giá → **Đã fix**: Switch component inline + PATCH mutation (2026-05-07, deferred-work cleanup)
- ✅ AlertDialog xoá item formula chưa override → **Đã fix**: disable nút khi item chưa có override (2026-05-07, deferred-work cleanup)
- useProductsQuery pageSize=100 cap số sản phẩm hiển thị trong wizard tạo direct + add item. Store >100 SP sẽ thiếu. Đã được Dev Notes H4/note 10 acknowledge MVP. [CreatePriceListDialog.tsx:186, AddPriceListItemDialog.tsx:49]
- listPriceLists subquery itemCount correlated chạy 1 query/row. Hiệu năng OK MVP (≤100 bảng giá). Có thể tối ưu LEFT JOIN GROUP BY. [apps/api/src/services/price-lists.service.ts:117-120]
- Recalculate không filter product alive. Base có item của product đã soft delete sẽ vào formula list. Dev Notes H8 đã defer xử lý orphan items. [price-lists.service.ts:886]
- validateProductsAlive race condition với soft delete. Product có thể soft delete giữa validate và insert; FK CASCADE chỉ trigger trên hard delete nên insert vẫn pass. Tác động consistency, không corruption. Story 4.5 sẽ filter trong pricing engine. [price-list-items.service.ts:208-213]
- FK customer_groups.defaultPriceListId không enforce same-store ở DB. Service layer Story 4.1 đảm nhận. [test note customer-groups-pricing-fk]

## Deferred from: code review of 1-1-khoi-tao-monorepo-database-design-system-co-ban (2026-04-24)

- ✅ DB connection không có graceful shutdown (`apps/api/src/db/index.ts`): cần `process.on('SIGTERM/SIGINT')` để đóng connection pool. Scope story deploy/production-readiness. → **Epic 11 TD2**
- ✅ API server thiếu CORS, security headers, error handler (`apps/api/src/index.ts`): CORS cần cho web port 5173 gọi API port 3000. Scope story 1.2+ khi có API routes thực. → **Epic 11 TD3**
- Bảng stores/users thiếu indexes cho truy vấn (`packages/shared/src/schema/`): chưa cần khi bảng trống, thêm khi có data và query patterns rõ.
- `next-themes` dependency trong Vite project (`apps/web/package.json`): shadcn/ui tạo, hoạt động được nhưng cần ThemeProvider wrap app. Xem xét thay bằng giải pháp nhẹ hơn khi implement dark mode.
- Test dùng plaintext cho password_hash (`apps/web/src/lib/pglite.test.ts:67`): chấp nhận trong test, nhưng khi viết auth logic cần validation layer đảm bảo không lưu plaintext.

## Deferred from: code review of 4-4-gia-rieng-khach-hang-gia-theo-so-luong (2026-04-29)

- Race condition `ensureProductAlive`/`ensureCustomerAlive` ngoài transaction. FK CASCADE + DB CHECK đã guard. Spec H7 chấp nhận risk MVP. [apps/api/src/services/customer-prices.service.ts:243-244, volume-prices.service.ts:248]
- Concurrency 2 user replace volume_prices cùng productId: tx2 ghi đè tx1. Spec H7 chấp nhận, không cần SELECT FOR UPDATE cho MVP. [volume-prices.service.ts:241-320]
- Migration naming spec đề `0015_*.sql` nhưng thực tế `0016_sleepy_odin.sql` do dev tạo song song với Story 6-2 (0015 là stock-checks). Không ảnh hưởng functionality. [apps/api/src/db/migrations/0016_sleepy_odin.sql]
- ✅ Performance `listCustomerPrices` 2 queries (data + count) → **Đã fix**: dùng COUNT(*) OVER() window function, single query (2026-05-07, deferred-work cleanup)

## Deferred from: code review of story 3-3 (2026-04-30)

- ✅ CR-004: `cashAmount` và `transferAmount` không persist vào DB. Bảng `orders` thiếu 2 cột này. Với thanh toán `combined`, không thể tra lại phần tiền mặt vs chuyển khoản sau khi tạo đơn. Cần thêm migration tạo 2 cột. [packages/shared/src/schema/orders.ts] → **Epic 11 TD16**
- ✅ CR-005: Tất cả JSX text dùng ASCII-only Vietnamese (thiếu dấu). Pattern pre-existing từ Story 3.1. Ảnh hưởng UX nhưng cần sửa project-wide, không phải regression. [PaymentDialog.tsx, OrderCompletionDialog.tsx, CartPanel.tsx, và nhiều file khác] → **Epic 11 TD4**

## Deferred from: code review of story 4-4b (2026-04-30)

- ✅ F3: UI thiếu Tooltip "Bạn không có quyền sửa giá" → **Đã fix**: thêm Tooltip component khi canEditPrice = false (2026-05-07, deferred-work cleanup)
- ✅ F4: Form Create/Edit CategoryDiscount dùng manual validation thay vì zodResolver. Duplicate logic với schema Zod (XOR target, percent ≤ 100, dates). Defer vì server vẫn enforce qua Zod, không ảnh hưởng correctness. [apps/web/src/features/pricing/components/CreateCategoryDiscountDialog.tsx, EditCategoryDiscountDialog.tsx] → **Epic 11 TD25**
- ✅ F7: order-management.ts validation messages bị chuyển sang KHÔNG DẤU → **Đã fix**: thêm dấu cho 34 chuỗi validation (2026-05-07, deferred-work cleanup)
- F9: pos.routes.ts mở rộng không spec trong 4-4b. Thuộc story 3-3. [apps/api/src/routes/pos.routes.ts]

## Deferred from: code review of 7-1-danh-sach-chi-tiet-hoa-don (2026-05-01)

- ✅ F13: Permission `pos.sell` dùng chung cho xem danh sách hóa đơn + bán hàng tại POS. Nên tách `orders.view` khi cần least privilege. Thiết kế permission pre-existing. [orders.routes.ts, router.tsx] → **Epic 11 TD22**
- ✅ F14: StatusBadge/PaymentStatusBadge duplicate giữa order-list.tsx và order-detail-view.tsx. Cần extract shared component khi thêm trạng thái mới. [apps/web/src/features/orders/] → **Epic 11 TD24**

## Deferred from: code review of 5-4-dieu-chinh-no-thu-cong (2026-05-04)

- ✅ F2: Query invalidation dùng `['customers', 'detail']` (broad) → **Đã fix**: scope theo customerId cụ thể (2026-05-07, deferred-work cleanup)
- F3: Race condition test chỉ verify sequential (2 await tuần tự), không test concurrent FOR UPDATE thực sự. Service code đúng nhưng test coverage gap. [debt-adjustments.integration.test.ts]
- ✅ F4: Nút "Huỷ" trong dialog điều chỉnh nợ không disable khi mutation đang pending → **Đã fix**: thêm disabled={isPending} (2026-05-07, deferred-work cleanup)
- F5: currentDebt prop trong dialog có thể stale nếu user mở lại trước khi TanStack Query refetch xong. Server validate 422 nếu sai. [DebtAdjustmentDialog.tsx]

## Deferred from: Story 11-3 Performance & Quality Polish (2026-05-05)

- Phase 2: order_items table does not store unitConversionId. Returns service cannot determine which unit conversion was used at time of sale. Add `unit_conversion_id` column to order_items and populate during createOrder. [apps/api/src/services/returns.service.ts, packages/shared/src/schema/orders.ts]
