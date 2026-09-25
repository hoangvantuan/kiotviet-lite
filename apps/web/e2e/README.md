# Kiểm thử End-to-End (E2E) với Playwright cho KiotViet Lite Web

Thư mục này chứa bộ kiểm thử đầu-cuối (end-to-end) sử dụng framework Playwright cho ứng dụng web KiotViet Lite.

## 1. Yêu cầu tiên quyết (Quan trọng)

- **Cơ sở dữ liệu thật (PostgreSQL)**: Bộ kiểm thử E2E tương tác với toàn bộ luồng hệ thống thật (backend API và cơ sở dữ liệu PostgreSQL), **KHÔNG sử dụng PGlite trong bộ nhớ**.
- **Chạy di chuyển lược đồ (migration) và nạp dữ liệu mẫu (seed)**:
  ```bash
  # Tại thư mục gốc của dự án
  pnpm --filter api db:migrate
  pnpm --filter api db:seed
  ```
  Lệnh nạp dữ liệu mẫu sẽ từ chối nếu cơ sở dữ liệu có đơn hàng, phiếu thu, phiếu chi hoặc phiếu kiểm kê ở **bất kỳ cửa hàng nào**; không có dữ liệu nào bị xóa khi từ chối. Chỉ trên cơ sở dữ liệu thử nghiệm có thể xóa bỏ, khi đã xác nhận muốn xóa toàn bộ dữ liệu cũ, dùng `FORCE_SEED=1 pnpm --filter api db:seed`.
- **Khởi động máy chủ backend API**:
  ```bash
  # Chạy API server ở cổng 3000
  pnpm --filter @kiotviet-lite/api run dev
  ```

## 2. Cấu trúc thư mục

```
e2e/
├── fixtures/
│   └── auth.fixture.ts    # Fixture và trợ giúp đăng nhập theo vai trò (chủ cửa hàng, quản lý, nhân viên)
├── helpers/
│   └── test-data.ts       # Dữ liệu mẫu seed chuẩn (tài khoản, cửa hàng, sản phẩm)
├── smoke.spec.ts          # Kiểm thử khói: đăng nhập tài khoản seed và xác thực hiển thị trang chủ
└── README.md              # Tài liệu hướng dẫn
```

## 3. Cách chạy kiểm thử

### Chạy toàn bộ kiểm thử E2E (chế độ dòng lệnh - headless):

```bash
# Chạy từ thư mục gốc
pnpm --filter @kiotviet-lite/web run test:e2e

# Hoặc di chuyển vào apps/web
cd apps/web
pnpm run test:e2e
```

### Chạy với giao diện đồ họa trực quan (Playwright UI):

```bash
pnpm --filter @kiotviet-lite/web exec playwright test --ui
```

### Xem báo cáo kết quả kiểm thử (HTML Report):

```bash
pnpm --filter @kiotviet-lite/web exec playwright show-report
```

### Hai đích chạy: dev và bản build production

- `pnpm run test:e2e` (project `chromium`): chạy trên `vite dev`, không có service worker.
- `pnpm run test:e2e:prod` (project `chromium-prod`, `E2E_TARGET=prod`): chạy trên bản build production có service worker (`pnpm run build:e2e`, `VITE_API_URL` rỗng như `apps/web/Dockerfile`), phục vụ bởi `e2e/prod-server.mjs` mô phỏng `deploy/nginx.conf` (`/api/` proxy sang API, SPA fallback, `sw.js` không cache). Playwright tự build và khởi động máy chủ này.

Mỗi lần chạy chỉ một đích và cần DB vừa seed: các bài ghi dữ liệu thật (bán nợ, trả hàng), nên chạy hai đích liên tiếp trên cùng DB sẽ làm lệch tiền đề của nhau (ví dụ khách "Bùi Thanh Hà" đã vượt hạn mức sau lượt đầu). Giữa hai lượt chạy `FORCE_SEED=1 pnpm --filter api db:seed` (chỉ trên DB thử nghiệm), như CI.

Bài nào mock mạng bằng `page.route` phải đặt `test.use({ serviceWorkers: 'block' })`, vì request đi qua service worker không bị `page.route` chặn (xem `bulk-import.spec.ts`). Các bài còn lại để service worker chạy như production.

### Kiểm bất biến dữ liệu sau E2E

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/scripts/invariants.sql
```

Xem danh sách bất biến ở `docs/deploy.md` mục 9.

## 4. Biến môi trường tùy chọn

- `PLAYWRIGHT_BASE_URL`: Địa chỉ URL của ứng dụng web (mặc định: `http://localhost:5173`).
- `E2E_TARGET`: `dev` (mặc định) hoặc `prod`.
- `WEB_PORT`, `WEB_PROD_PORT`: cổng của vite dev (mặc định 5173) và của bản build (mặc định 4173).
- `E2E_API_URL`: API mà `prod-server.mjs` proxy `/api/` tới (mặc định `http://localhost:3000`).
- `CI`: Khi thiết lập bằng `true`, Playwright sẽ kích hoạt chế độ chạy trên CI (tự động thử lại 1 lần khi thất bại, không mở báo cáo HTML tự động).
