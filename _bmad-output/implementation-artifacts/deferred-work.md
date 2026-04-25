# Deferred Work

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
