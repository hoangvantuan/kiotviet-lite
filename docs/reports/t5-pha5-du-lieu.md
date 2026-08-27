# Báo cáo hoàn thành công việc: Pha 5: Tính đúng dữ liệu và các mục phụ trợ (t5-pha5-du-lieu)

> Mã công việc trong hệ điều phối: `task_1af45374d7a5`
> Nhánh làm việc: `hoangvantuan/t5-pha5-du-lieu`

---

## 1. Tổng quan các mục đã xử lý

Bốn mục tiêu thuộc Pha 5 (Tính đúng dữ liệu và các mục phụ trợ) đã được hoàn thành đầy đủ:

1. **M17**: Triển khai truy vấn cơ sở dữ liệu thật cho 3 thẻ (tab) trong trang chi tiết khách hàng gồm: Lịch sử đơn hàng, Công nợ, Thống kê mua hàng (thay thế mã giữ chỗ (stub) trả về rỗng trước đó).
2. **M20**: Sửa quyền hiển thị mục "Cài đặt" trên thanh điều hướng (menu navigation) từ `store.manage` sang `audit.viewOwn`, giúp vai trò nhân viên (staff) và quản lý (manager) có thể vào xem các mục họ được cấp quyền (ví dụ: Nhật ký hoạt động).
3. **M24**: Xử lý triệt để lỗi phân trang khi dùng hàm cửa sổ `COUNT(*) OVER()` bị trả về `total = 0` khi trang hiện tại rỗng (vượt quá số bản ghi). Đã chuẩn hoá bằng truy vấn đếm riêng và helper dùng chung `paginationMeta`.
4. **M25**: Sửa lỗi hàm `notify()` nuốt lỗi xác thực (validation error); trả lỗi tường minh lên tầng gọi, đồng thời bảo vệ giới hạn độ dài tiêu đề và nội dung sự kiện.

---

## 2. Chi tiết các tập tin đã thay đổi và gốc rễ xử lý

### M17: Triển khai 3 thẻ chi tiết khách hàng

- **Tập tin đã sửa**:
  - `apps/api/src/services/customers.service.ts`:
    - Dòng 671 đến 740: Viết hàm `listCustomerOrders` truy vấn bảng `orders`, hỗ trợ lọc theo trạng thái (`status`, chuyển đổi `full_return`/`partial_return` thành `refunded`), lọc theo khoảng thời gian (`dateFrom`, `dateTo`), phân trang chuẩn xác.
    - Dòng 747 đến 792: Viết hàm `getCustomerDebts` truy vấn bảng `debts` kết hợp (join) bảng `orders`, tính toán công nợ hiện tại, hạn mức hiệu lực và tỷ lệ sử dụng nợ (`usagePercent`).
    - Dòng 795 đến 856: Viết hàm `getCustomerStats` thống kê top 10 sản phẩm mua nhiều nhất theo số lượng (từ `order_items` kết hợp `orders`) và doanh số theo 12 tháng gần nhất (`monthlySales`).
- **Gốc rễ xử lý**: Các hàm trước đây là mã giữ chỗ (stub) trả về mảng rỗng cứng (`items: []`), khiến giao diện người dùng luôn trống dù khách hàng đã có phát sinh đơn và nợ.
- **Tập tin kiểm thử**: `apps/api/src/__tests__/m17-customer-tabs.integration.test.ts` (7 bài kiểm thử tích hợp).

### M20: Phân quyền hiển thị thanh điều hướng Cài đặt

- **Tập tin đã sửa**:
  - `apps/web/src/components/layout/nav-items.ts`: Dòng 119, đổi `requiredPermission` của mục `/settings` từ `'store.manage'` sang `'audit.viewOwn'`.
- **Gốc rễ xử lý**: Tuyến đường (route) `/settings` bên trong đã hỗ trợ chuyển hướng theo quyền từng vai trò (`/settings/store` cho chủ cửa hàng (owner), `/settings/staff` cho quản lý (manager), `/settings/audit` cho nhân viên có quyền xem nhật ký), nhưng thanh điều hướng lại yêu cầu quyền cao nhất `store.manage` khiến menu bị ẩn hoàn toàn với nhân viên và quản lý.

### M24: Chuẩn hoá phân trang và xử lý trang rỗng

- **Tập tin đã sửa và tạo mới**:
  - `apps/api/src/lib/pagination.ts`: Tạo hàm dùng chung `paginationMeta({ total, page, pageSize })` trả về cấu trúc phân trang chuẩn mực (`total`, `page`, `pageSize`, `totalPages`).
  - `apps/api/src/services/customer-prices.service.ts`: Dòng 140 đến 153, tách truy vấn dữ liệu và truy vấn đếm tổng riêng biệt, dùng `paginationMeta`.
  - `apps/api/src/services/customers.service.ts`: Áp dụng `paginationMeta` cho các hàm `listCustomers`, `listTrashedCustomers`, `listCustomerOrders`.
- **Gốc rễ xử lý**: `COUNT(*) OVER()` là hàm cửa sổ trong cơ sở dữ liệu (SQL window function), chỉ tồn tại trên các dòng kết quả trả về. Khi vị trí bắt đầu (offset) vượt quá tổng số bản ghi, tập kết quả rỗng khiến `total` bị gán về 0, làm giao diện người dùng ẩn thanh phân trang sai lệch.
- **Tập tin kiểm thử**: `apps/api/src/__tests__/m24-pagination-empty-page.integration.test.ts` (2 bài kiểm thử tích hợp).

### M25: Xử lý lỗi xác thực sự kiện thông báo

- **Tập tin đã sửa**:
  - `packages/notifications/src/index.ts`: Dòng 39 đến 45, khi xác thực dữ liệu qua Zod thất bại, ném ngoại lệ `Error` kèm thông báo chi tiết và đối tượng lỗi gốc (`cause`).
  - `apps/api/src/services/notification-emitter.ts`: Dòng 18 đến 28, thêm giới hạn độ dài an toàn cho `title` (tối đa 200 ký tự) và `body` (tối đa 2000 ký tự), đồng thời bắt lỗi và ghi nhật ký (log) thay vì để ngoại lệ ngầm.
  - `apps/api/src/routes/notifications.routes.ts`: Dòng 84 đến 90, bọc khối `try / catch` khi gọi `notify()`, trả về mã lỗi 400 kèm thông điệp lỗi rõ ràng cho client.
- **Gốc rễ xử lý**: Trước đây hàm `notify()` bắt lỗi xác thực rồi trả về mảng kết quả thất bại `[{ ok: false }]` thay vì ném lỗi, dẫn đến tầng gọi dùng `.catch()` không phát hiện được lỗi để ghi log cảnh báo.
- **Tập tin kiểm thử**: `apps/api/src/__tests__/m25-notify-validation-error.integration.test.ts` (6 bài kiểm thử tích hợp).

---

## 3. Kết quả xác thực 4 bước (Verification)

| Lệnh kiểm tra                 | Trạng thái | Chi tiết                                                                                                                                               |
| :---------------------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                   | ✅ ĐẠT     | 0 lỗi (0 errors), 6 cảnh báo cũ của giao diện (pre-existing warnings).                                                                                 |
| `pnpm -r typecheck`           | ✅ ĐẠT     | Toàn bộ 4 gói (`shared`, `notifications`, `web`, `api`) vượt qua kiểm tra kiểu dữ liệu TypeScript không có lỗi.                                        |
| `pnpm test` (Trực tiếp Pha 5) | ✅ ĐẠT     | 100% các bài kiểm thử liên quan (15/15 bài kiểm thử tích hợp của M17, M24, M25 và 48 tập tin kiểm thử của shared, notifications, web) chạy thành công. |
| `pnpm -r build`               | ✅ ĐẠT     | Biên dịch thành công gói giao diện web và dịch vụ API backend.                                                                                         |

---

## 4. Rủi ro còn tồn và việc cần lưu ý

1. **Hạ tầng kiểm thử tích hợp**: Các bài kiểm thử tích hợp dùng cơ sở dữ liệu nhúng PGlite trong bộ nhớ và chạy di chuyển cấu trúc bảng (migration) trên từng trường hợp kiểm thử. Khi chạy đồng thời toàn bộ kho mã nguồn với số lượng luồng cao, CPU có thể bị nghẽn dẫn đến vượt quá thời gian chờ (timeout). Khuyến nghị trên môi trường tích hợp liên tục (CI) nên cấu hình giới hạn số tác vụ đồng thời hoặc chạy theo từng nhóm dự án con.
2. **Dữ liệu lớn thống kê khách hàng**: Truy vấn thống kê 12 tháng (`getCustomerStats`) tổng hợp trực tiếp từ bảng `orders` và `order_items`. Trong tương lai nếu dữ liệu của một khách hàng đạt hàng chục nghìn đơn, có thể cân nhắc lưu bảng tổng hợp sẵn (materialized / aggregate table).
