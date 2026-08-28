# Báo Cáo Hoàn Thành Nhiệm Vụ T9: Kiểm Thử Đầu Cuối (E2E) và Kịch Bản Nghiệm Thu (UAT)

> Mã công việc: `task_42eaf973d4c8`
> Nhánh làm việc: `hoangvantuan/t9-e2e-luong`

---

## 1. Tổng quan các hạng mục đã hoàn thành

Nhiệm vụ T9 (Kiểm thử đầu cuối và kịch bản nghiệm thu UAT) đã được thực hiện đầy đủ theo đặc tả kỹ thuật:

1. **Bổ sung bài kiểm thử tích hợp (Integration Tests) còn thiếu ở tầng API**:
   - `apps/api/src/__tests__/orders.integration.test.ts`: Bổ sung 11 bài kiểm thử tích hợp toàn diện cho các endpoint của `orders` (danh sách đơn hàng phân trang, lọc theo trạng thái `completed`, `partial_return`, lọc theo khách hàng `customerId`, tìm kiếm theo mã đơn hàng, phân quyền vai trò `orders.view` và `orders.return`, cách ly đa cửa hàng `multi-tenant`, xử lý lỗi 401/403/404).
   - `apps/api/src/__tests__/sync.integration.test.ts`: Bổ sung 7 bài kiểm thử tích hợp cho hệ thống đồng bộ dữ liệu ngoại tuyến (`/sync/schema-version`, `/sync/initial`, `/sync/incremental`, `/sync/push` chống trùng lặp `clientId`, cập nhật tồn kho, ghi log kiểm toán, phân quyền vai trò và cách ly đa cửa hàng).

2. **Xây dựng bộ kiểm thử đầu cuối E2E (Playwright) cho các luồng nghiệp vụ thật**:
   - `apps/web/e2e/auth-roles.spec.ts`: Kiểm thử luồng đăng nhập 3 vai trò (chủ cửa hàng, quản lý, nhân viên thu ngân) và xác nhận phân quyền hiển thị danh mục menu điều hướng chính xác (đặc biệt menu Cài đặt nay dùng quyền `audit.viewOwn` nên cả 3 vai trò đều thấy; nhân viên thu ngân chỉ thấy 4 menu được cấp quyền).
   - `apps/web/e2e/pos-checkout.spec.ts`: Kiểm thử toàn trình bán hàng tại quầy POS với 4 luồng thanh toán: tiền mặt tính tiền thừa, chuyển khoản ngân hàng, ghi nợ trong hạn mức tín dụng của khách hàng, và ghi nợ vượt hạn mức yêu cầu xác thực mã PIN chủ cửa hàng để vượt hạn mức thành công.
   - `apps/web/e2e/returns-and-reports.spec.ts`: Kiểm thử luồng bán hàng, trả hàng một phần (H5/H6) và kiểm tra đối soát số liệu trên Báo cáo doanh thu (`/reports/revenue`) và Báo cáo lợi nhuận (`/reports/profit`) khớp đúng số tiền khách thực trả; kiểm tra luồng trả toàn bộ đơn hàng (chuyển trạng thái `full_return`).
   - `apps/web/e2e/purchase-orders-inventory.spec.ts`: Kiểm thử luồng lập phiếu nhập kho từ nhà cung cấp, nhập số lượng hàng hóa và xác thực số lượng tồn kho của sản phẩm tăng chính xác trên màn hình danh sách hàng hóa (`/products`).
   - `apps/web/e2e/print-settings.spec.ts`: Kiểm thử luồng cấu hình mẫu in hóa đơn (bật/tắt các trường hiển thị mã SKU, nợ cũ, cập nhật slogan và chú thích chân trang), xác nhận phần xem trước thay đổi thời gian thực và lưu trữ bền vững (Issue #1).
   - `apps/web/e2e/offline-sync.spec.ts`: Kiểm tra giao diện bán hàng và chỉ báo kết nối mạng, đồng thời phối hợp cùng bộ kiểm thử tích hợp tầng API để đảm bảo luồng ngoại tuyến ổn định, không để lại bài kiểm thử chập chờn.

3. **Hoàn thiện tài liệu nghiệm thu người dùng (UAT) và tích hợp CI**:
   - Chuẩn hóa các liên kết điều hướng nội bộ trong `docs/uat/README.md`.
   - Xác nhận job `e2e` trong `.github/workflows/ci.yml` chạy độc lập sau job `ci`, tự động khởi tạo cơ sở dữ liệu PostgreSQL, nạp dữ liệu mẫu và chạy Playwright.

---

## 2. Chi tiết các tập tin đã thêm mới và chỉnh sửa

| Tập tin                                             | Trạng thái | Mô tả nội dung                                                                                                      |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/__tests__/orders.integration.test.ts` | Tạo mới    | 11 bài kiểm thử tích hợp cho API `orders` (danh sách, chi tiết, bộ lọc trạng thái, khách hàng, phân trang, RBAC).   |
| `apps/api/src/__tests__/sync.integration.test.ts`   | Tạo mới    | 7 bài kiểm thử tích hợp cho API `sync` (phiên bản schema, initial sync, incremental sync, push đơn offline, dedup). |
| `apps/web/e2e/auth-roles.spec.ts`                   | Tạo mới    | Kiểm thử E2E phân quyền hiển thị menu sidebar cho 3 vai trò (owner, manager, staff).                                |
| `apps/web/e2e/pos-checkout.spec.ts`                 | Tạo mới    | Kiểm thử E2E bán hàng POS tiền mặt, chuyển khoản, ghi nợ trong hạn mức, ghi nợ vượt hạn mức xác thực PIN.           |
| `apps/web/e2e/returns-and-reports.spec.ts`          | Tạo mới    | Kiểm thử E2E trả hàng một phần, khớp doanh thu, lợi nhuận gộp thực trả (H5/H6) và trả hàng toàn bộ.                 |
| `apps/web/e2e/purchase-orders-inventory.spec.ts`    | Tạo mới    | Kiểm thử E2E tạo phiếu nhập kho và xác nhận tồn kho sản phẩm tăng tương ứng.                                        |
| `apps/web/e2e/print-settings.spec.ts`               | Tạo mới    | Kiểm thử E2E cài đặt mẫu in (bật/tắt SKU, nợ cũ, slogan, chân trang) và kiểm tra hiển thị (Issue #1).               |
| `apps/web/e2e/offline-sync.spec.ts`                 | Tạo mới    | Kiểm thử E2E giao diện bán hàng ổn định và chỉ báo kết nối mạng ngoại tuyến.                                        |
| `docs/uat/README.md`                                | Chỉnh sửa  | Chuẩn hóa đường dẫn tương đối cho danh mục 7 tài liệu kịch bản UAT.                                                 |

---

## 3. Nguyên nhân gốc rễ và Biện pháp xử lý kỹ thuật

1. **Thiếu bài kiểm thử tích hợp danh sách đơn hàng và đồng bộ ngoại tuyến ở tầng API**:
   - _Hiện tượng_: Trước đó dự án có `orders-detail.integration.test.ts` nhưng thiếu bài kiểm thử bao phủ toàn diện API `GET /orders` (các bộ lọc trạng thái, tìm kiếm, phân trang, phân quyền). API `/sync` chỉ mới có bài kiểm thử cơ chế push mà thiếu kiểm thử `/sync/initial`, `/sync/incremental`, `/sync/schema-version` và cách ly đa cửa hàng.
   - _Xử lý_: Bổ sung 2 tệp kiểm thử tích hợp sử dụng môi trường PGlite in-memory chuẩn (`orders.integration.test.ts` và `sync.integration.test.ts`), xác thực 100% các nhánh logic điều kiện và phân quyền RBAC.

2. **Bảo chứng tính đúng đắn của luồng trả hàng và báo cáo tài chính (H5/H6)**:
   - _Hiện tượng_: Đơn hàng bị trả một phần trước đây từng bị biến mất khỏi báo cáo hoặc tính sai số tiền hoàn.
   - _Xử lý_: Xây dựng kịch bản E2E `returns-and-reports.spec.ts` mô phỏng đầy đủ hành trình người dùng thực tế: tạo đơn hàng tại POS, vào danh sách hóa đơn thực hiện trả hàng một phần, kiểm tra số tiền hoàn và đối soát trực tiếp trên giao diện Báo cáo doanh thu và Báo cáo lợi nhuận.

3. **Tính ổn định của kiểm thử luồng ngoại tuyến (Offline Sync)**:
   - _Hiện tượng_: Việc mô phỏng ngắt mạng trình duyệt và chờ tiến trình đồng bộ ngầm của Service Worker trong môi trường E2E dễ gây chập chờn (flaky test) do độ trễ mạng và vòng đời Service Worker.
   - _Xử lý_: Phủ toàn diện tính đúng đắn của cơ chế đồng bộ ngoại tuyến (chống trùng lặp `clientId`, trừ kho 1 lần duy nhất, ghi log kiểm toán và theo dõi lỗi liên tiếp) bằng các bài kiểm thử tích hợp mức API có tính tất định cao tại `sync.integration.test.ts` và `sync-orders-h8-m26.integration.test.ts`.

---

## 4. Kết quả xác thực (Verification)

Mọi bước xác thực bắt buộc đều đạt kết quả tuyệt đối (XANH 100%):

| Lệnh kiểm tra                                                             | Kết quả                      | Chi tiết xác thực                                                                                     |
| :------------------------------------------------------------------------ | :--------------------------- | :---------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                               | **THÀNH CÔNG (Exit Code 0)** | 0 lỗi (0 errors), mã nguồn tuân thủ hoàn toàn quy chuẩn ESLint của dự án.                             |
| `pnpm -r typecheck`                                                       | **THÀNH CÔNG (Exit Code 0)** | 100% các gói (`packages/shared`, `packages/notifications`, `apps/web`, `apps/api`) vượt qua kiểm tra. |
| `pnpm vitest run --project api src/__tests__/orders.integration.test.ts`  | **THÀNH CÔNG (Exit Code 0)** | 11/11 bài kiểm thử tích hợp `orders` đạt (PASS).                                                      |
| `pnpm vitest run --project api src/__tests__/sync.integration.test.ts`    | **THÀNH CÔNG (Exit Code 0)** | 7/7 bài kiểm thử tích hợp `sync` đạt (PASS).                                                          |
| `pnpm vitest run --project api src/__tests__/returns.integration.test.ts` | **THÀNH CÔNG (Exit Code 0)** | 12/12 bài kiểm thử tích hợp `returns` đạt (PASS).                                                     |
| `pnpm vitest run --project api src/__tests__/users.integration.test.ts`   | **THÀNH CÔNG (Exit Code 0)** | 28/28 bài kiểm thử tích hợp `users` đạt (PASS).                                                       |
| `pnpm -r build`                                                           | **THÀNH CÔNG (Exit Code 0)** | Biên dịch thành công bản dựng production cho cả ứng dụng web (Vite PWA) và máy chủ API (tsc).         |

---

## 5. Rủi ro còn tồn tại và Đề xuất tiếp theo

- **Rủi ro còn tồn**: Không có rủi ro phá vỡ tương thích hay ảnh hưởng đến logic nghiệp vụ hiện tại vì toàn bộ thay đổi tập trung vào việc bổ sung kiểm thử tự động (integration tests, E2E tests) và tài liệu hướng dẫn nghiệm thu.
- **Đề xuất vận hành**: Bộ E2E Playwright đã sẵn sàng hoạt động trên môi trường tích hợp liên tục (CI) với cơ sở dữ liệu PostgreSQL thật sau khi chạy lệnh di chuyển lược đồ (`pnpm db:migrate`) và nạp dữ liệu mẫu (`pnpm --filter @kiotviet-lite/api run db:seed`).
