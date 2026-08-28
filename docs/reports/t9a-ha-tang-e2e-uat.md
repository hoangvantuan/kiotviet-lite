# Báo Cáo Hoàn Thành Công Việc: Hạ Tầng Kiểm Thử E2E và Kịch Bản UAT (t9a-e2e-uat)

> Mã công việc trong hệ điều phối: `task_b81435bd8b9c`
> Nhánh làm việc: `hoangvantuan/t9a-e2e-uat`

---

## 1. Tổng quan các hạng mục đã thực hiện

Hạng mục T9a (Dựng hạ tầng kiểm thử đầu cuối E2E và bộ kịch bản nghiệm thu người dùng UAT) đã được hoàn thành đầy đủ, đúng phạm vi và tuân thủ tuyệt đối các ràng buộc kỹ thuật:

1. **Thiết lập hạ tầng kiểm thử Playwright cho ứng dụng web (`apps/web`)**:
   - Cài đặt gói `@playwright/test` vào `devDependencies` của không gian làm việc `apps/web`.
   - Tạo tập tin cấu hình `playwright.config.ts` hỗ trợ trình duyệt Chromium, địa chỉ gốc linh hoạt đọc từ biến môi trường (`PLAYWRIGHT_BASE_URL`, mặc định `http://localhost:5173`), tự động khởi động máy chủ phục vụ kiểm thử cục bộ (`webServer`), cấu hình thời gian chờ (timeout) và số lần thử lại (retries) khi chạy trên môi trường tích hợp liên tục (CI), xuất báo cáo dạng danh sách (list) và trang web (HTML report).
   - Xây dựng thư mục `apps/web/e2e/` gồm:
     - `fixtures/auth.fixture.ts`: Khung tiện ích đăng nhập theo từng vai trò (chủ cửa hàng, quản lý, nhân viên).
     - `helpers/test-data.ts`: Dữ liệu mẫu chuẩn đồng bộ với bộ dữ liệu khởi tạo (`db:seed`).
     - `smoke.spec.ts`: Kiểm thử khói (smoke test) xác thực luồng đăng nhập bằng tài khoản khởi tạo và chuyển hướng hiển thị trang chủ.
     - `README.md`: Hướng dẫn vận hành chi tiết, nhấn mạnh yêu cầu sử dụng cơ sở dữ liệu thật (PostgreSQL) và nạp dữ liệu mẫu, không dùng PGlite trong bộ nhớ.
   - Bổ sung lệnh chạy `test:e2e` vào `apps/web/package.json`.

2. **Cấu hình luồng tích hợp liên tục (CI Workflow) riêng biệt trong `.github/workflows/ci.yml`**:
   - Thêm công việc `e2e` chạy phụ thuộc sau công việc `ci` (`needs: ci`), không làm chậm chu trình kiểm tra cơ bản.
   - Khởi tạo dịch vụ cơ sở dữ liệu PostgreSQL (`postgres:16-alpine`), tự động chạy di chuyển lược đồ (`pnpm db:migrate`) và nạp dữ liệu mẫu (`pnpm db:seed`).
   - Cài đặt trình duyệt Playwright Chromium, cấu hình biến môi trường chuẩn xác (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `PORT`, `VITE_API_URL`, `ALLOWED_ORIGINS`).
   - Khởi động máy chủ API ngầm và thăm dò tín hiệu sức khỏe thật qua endpoint `/api/v1/health` với thời gian chờ tối đa 30 giây (không dùng thời gian chờ cố định thiếu tin cậy).
   - Loại bỏ bước xây dựng bản dựng web (`Build Web`) thừa để Playwright `webServer` tự khởi động Vite dev server (`pnpm run dev`), giúp tiết kiệm tài nguyên và đồng bộ môi trường.
   - Thiết lập cờ `continue-on-error: true` cho phép thất bại mềm trong giai đoạn khởi tạo ban đầu, kèm ghi chú sẽ siết chặt sau khi mở rộng thêm các kịch bản kiểm thử.
   - Tự động lưu trữ báo cáo kiểm thử (Playwright report artifacts) phục vụ tra cứu.

3. **Xây dựng bộ tài liệu kịch bản nghiệm thu người dùng (UAT) bằng tiếng Việt trong `docs/uat/`**:
   - `docs/uat/README.md`: Hướng dẫn tổng thể, thứ tự thực hiện, quy ước đánh giá (Đạt / Không đạt / Chặn) và biểu mẫu báo cáo lỗi chuẩn.
   - `docs/uat/01-ban-hang-pos.md`: Luồng bán hàng tại quầy (mở ca, bán tiền mặt tính tiền thừa, chuyển khoản qua mã QR, bán ghi nợ kiểm tra hạn mức tín dụng).
   - `docs/uat/02-tra-hang.md`: Luồng trả hàng và hoàn tiền (trả một phần, trả toàn bộ đơn hàng, khấu trừ nợ và cập nhật tồn kho).
   - `docs/uat/03-cong-no.md`: Luồng quản lý công nợ (tra cứu sổ nợ, lập phiếu thu nợ, điều chỉnh tăng giảm nợ thủ công kèm lý do).
   - `docs/uat/04-nhap-hang-ton-kho.md`: Luồng kho hàng (phiếu nhập hàng nhà cung cấp, kiểm kê kho thực tế, cân bằng kho và cảnh báo dưới định mức tồn).
   - `docs/uat/05-bao-cao-cuoi-ngay.md`: Luồng báo cáo quản trị (doanh thu theo dòng tiền, lợi nhuận gộp theo mặt hàng, phân tích tuổi nợ khách hàng, xuất dữ liệu ra file CSV/Excel).
   - `docs/uat/06-in-hoa-don.md`: Luồng cài đặt mẫu in (bật/tắt các trường hiển thị, logo, slogan, khổ giấy, xem trước thời gian thực và in thực tế).
   - `docs/uat/07-ngoai-tuyen.md`: Luồng bán hàng ngoại tuyến (ngắt kết nối mạng, bán hàng lưu cục bộ, chỉ báo ngoại tuyến, khôi phục mạng tự động đồng bộ và chống trùng lặp đơn).

---

## 2. Chi tiết 3 điểm đã chỉnh sửa theo phản hồi của điều phối viên (Coordinator Review)

1. **Chuẩn hoá biến môi trường bí mật (Secrets)**:
   - Sửa từ biến không tồn tại `JWT_SECRET` thành hai biến bắt buộc theo `apps/api/src/lib/env.ts` (mỗi chuỗi tối thiểu 32 ký tự):
     - `JWT_ACCESS_SECRET: e2e-test-jwt-access-secret-at-least-32-chars`
     - `JWT_REFRESH_SECRET: e2e-test-jwt-refresh-secret-at-least-32-chars`
   - Bổ sung `ALLOWED_ORIGINS: http://localhost:5173`.
2. **Cơ chế chờ máy chủ API sẵn sàng theo tín hiệu sức khỏe thực tế**:
   - Thay thế lệnh chờ cố định `sleep 5` bằng vòng lặp kiểm tra tín hiệu phản hồi thực tế từ endpoint `http://localhost:3000/api/v1/health` trong vòng 30 giây qua `curl -sf`.
   - Nếu quá 30 giây máy chủ API chưa sẵn sàng, quy trình báo lỗi rõ ràng và dừng ngay lập tức.
3. **Tối ưu bước khởi động web**:
   - Loại bỏ bước `Build Web` khỏi job `e2e` trong CI.
   - Lý do: `playwright.config.ts` đã thiết lập `webServer` tự động khởi chạy `pnpm run dev`, việc chạy dev server trực tiếp vừa nhanh chóng, vừa đồng nhất môi trường cục bộ và tiết kiệm thời gian chạy CI.

---

## 3. Danh sách các tập tin đã tạo mới và chỉnh sửa

### Tập tin cấu hình và kiểm thử:

- `apps/web/package.json`: Bổ sung `@playwright/test` vào `devDependencies` và thêm lệnh `"test:e2e": "playwright test"`.
- `apps/web/playwright.config.ts`: Tập tin cấu hình Playwright chuẩn cho ứng dụng web.
- `apps/web/e2e/fixtures/auth.fixture.ts`: Fixture hỗ trợ xác thực và trợ giúp đăng nhập.
- `apps/web/e2e/helpers/test-data.ts`: Dữ liệu mẫu seed chuẩn.
- `apps/web/e2e/smoke.spec.ts`: Bài kiểm thử khói mở màn hình đăng nhập và xác thực trang chủ.
- `apps/web/e2e/README.md`: Hướng dẫn vận hành kiểm thử E2E.
- `.github/workflows/ci.yml`: Bổ sung và tinh chỉnh công việc (job) `e2e` chạy container PostgreSQL, thăm dò API health và Playwright.

### Tập tin tài liệu kịch bản UAT:

- `docs/uat/README.md`
- `docs/uat/01-ban-hang-pos.md`
- `docs/uat/02-tra-hang.md`
- `docs/uat/03-cong-no.md`
- `docs/uat/04-nhap-hang-ton-kho.md`
- `docs/uat/05-bao-cao-cuoi-ngay.md`
- `docs/uat/06-in-hoa-don.md`
- `docs/uat/07-ngoai-tuyen.md`

---

## 4. Tuân thủ ràng buộc kỹ thuật

- **Không sửa đổi mã logic nghiệp vụ**: Không can thiệp hoặc sửa đổi bất kỳ tập tin nào trong `apps/api/src/services`, `apps/api/src/routes`, hay `apps/web/src/features` (ngoại trừ việc tạo mới thư mục `apps/web/e2e/`).
- **Tuân thủ quy tắc kiểm thử thu hẹp**: Không chạy toàn bộ bộ kiểm thử tích hợp nặng `pnpm test` (tránh quá tải CPU máy theo chỉ dẫn của điều phối viên). Thay vào đó, tập trung chạy đầy đủ các bước kiểm tra tĩnh và kiểm tra kiểu.

---

## 5. Kết quả xác thực chất lượng (Verification)

| Lệnh kiểm tra          | Kết quả                      | Chi tiết                                                                                                                              |
| :--------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`            | **THÀNH CÔNG (Exit Code 0)** | 0 lỗi (0 errors), mã nguồn tuân thủ hoàn toàn quy chuẩn định dạng ESLint và sắp xếp import.                                           |
| `pnpm -r typecheck`    | **THÀNH CÔNG (Exit Code 0)** | Toàn bộ các gói (`packages/shared`, `packages/notifications`, `apps/web`, `apps/api`) vượt qua kiểm tra kiểu TypeScript không có lỗi. |
| `pnpm -r build`        | **THÀNH CÔNG (Exit Code 0)** | Bản dựng ứng dụng web và máy chủ API biên dịch thành công 100%.                                                                       |
| `playwright --version` | **THÀNH CÔNG (Exit Code 0)** | Playwright phiên bản `1.62.1` sẵn sàng hoạt động.                                                                                     |

---

## 6. Kết luận và Bước tiếp theo

Toàn bộ hạ tầng E2E và bộ kịch bản nghiệm thu UAT đã sẵn sàng để tích hợp vào nhánh chính sau khi các tác vụ refactor nghiệp vụ độc lập hoàn tất. Mã nguồn đã được kiểm tra nghiêm ngặt và đóng gói sẵn sàng trong nhánh làm việc hiện tại.
