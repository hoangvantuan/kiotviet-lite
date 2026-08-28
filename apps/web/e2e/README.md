# Kiểm thử End-to-End (E2E) với Playwright cho KiotViet Lite Web

Thư mục này chứa bộ kiểm thử đầu-cuối (end-to-end) sử dụng framework Playwright cho ứng dụng web KiotViet Lite.

## 1. Yêu cầu tiên quyết (Quan trọng)

- **Cơ sở dữ liệu thật (PostgreSQL)**: Bộ kiểm thử E2E tương tác với toàn bộ luồng hệ thống thật (backend API và cơ sở dữ liệu PostgreSQL), **KHÔNG sử dụng PGlite trong bộ nhớ**.
- **Chạy di chuyển lược đồ (migration) và nạp dữ liệu mẫu (seed)**:
  ```bash
  # Tại thư mục gốc của dự án
  pnpm db:migrate
  pnpm db:seed
  ```
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

## 4. Biến môi trường tùy chọn

- `PLAYWRIGHT_BASE_URL`: Địa chỉ URL của ứng dụng web (mặc định: `http://localhost:5173`).
- `CI`: Khi thiết lập bằng `true`, Playwright sẽ kích hoạt chế độ chạy trên CI (tự động thử lại 1 lần khi thất bại, không mở báo cáo HTML tự động).
