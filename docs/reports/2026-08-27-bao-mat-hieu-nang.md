# BÁO CÁO TOÀN DIỆN: RÀ SOÁT BẢO MẬT VÀ TỐI ƯU HIỆU NĂNG

- **Ngày thực hiện**: 2026-08-27
- **Phiên bản hệ thống**: kiotviet-lite (Nhánh t8-baomat-hieunang)
- **Tình trạng xác thực**: Đã kiểm tra đạt chuẩn lint, kiểm tra kiểu dữ liệu (typecheck), bản dựng sản xuất (build), và các bộ kiểm thử tích hợp (integration tests) phạm vi hẹp.

---

## 1. TỔNG QUAN VÀ PHÂN LOẠI MỨC ĐỘ RỦI RO

Đợt rà soát toàn diện đã quét qua toàn bộ 26 tệp định tuyến (routes), 25 tệp dịch vụ nghiệp vụ (services), hệ thống lược đồ cơ sở dữ liệu (schema), và các tệp cấu hình bảo mật.

### Bảng tổng hợp các phát hiện theo mức độ rủi ro

| Mức độ rủi ro               | Số lượng phát hiện | Đã xử lý triệt để | Hoãn có chủ ý (Theo chỉ đạo) |
| :-------------------------- | :----------------: | :---------------: | :--------------------------: |
| **CRITICAL** (Nghiêm trọng) |         2          |         2         |              0               |
| **HIGH** (Cao)              |         4          |         3         | 1 (N+1 tạo đơn và nhập hàng) |
| **MEDIUM** (Trung bình)     |         5          |         5         |              0               |
| **LOW** (Thấp)              |         3          |         3         |              0               |
| **TỔNG CỘNG**               |       **14**       |      **13**       |            **1**             |

---

## 2. PHẦN A: BẢO MẬT (SECURITY)

### 2.1. Phân quyền theo vai trò (RBAC - Role-Based Access Control)

- **Phát hiện 1 (Mức độ HIGH)**: Tuyến đường phát thông báo `POST /api/v1/notifications/emit` tại `apps/api/src/routes/notifications.routes.ts:69` chỉ yêu cầu xác thực (`requireAuth`) mà không giới hạn quyền, dẫn đến vai trò nhân viên (`staff`) có thể tự phát thông báo hệ thống hoặc cảnh báo sai lệch.
  - _Giải pháp đã xử lý_: Bổ sung middleware `requirePermission('store.manage')` để chỉ chủ cửa hàng (`owner`) và quản lý (`manager`) mới có quyền phát sự kiện thông báo.
- **Phát hiện 2 (Mức độ MEDIUM)**: Tuyến đường khách hàng `apps/api/src/routes/customers.routes.ts:44` trước đây chặn toàn bộ router bằng quyền `customers.manage`. Điều này khiến vai trò nhân viên (`staff`) không thể gọi được `GET /customers`, `GET /customers/:id`, hoặc `POST /customers/quick-create` (vốn chỉ cần quyền `customers.view`).
  - _Giải pháp đã xử lý_: Tách quyền chi tiết: gán `requirePermission('customers.view')` cho các tuyến đường đọc và tạo nhanh tại POS, và gán `requirePermission('customers.manage')` cho các hành động quản trị (tạo đầy đủ, cập nhật, xóa, khôi phục).

### 2.2. Kiểm soát truy cập đối tượng trực tiếp (IDOR) và Bảo vệ Đa người thuê (Multi-tenant)

- **Phát hiện 3 (Mức độ CRITICAL)**: Các hàm khóa dòng sản phẩm để cập nhật kho `loadProductForUpdate` và `loadVariantForUpdate` tại `apps/api/src/services/products-lock.helper.ts:20` chỉ lọc theo `id` trước khi chạy câu lệnh khóa `FOR UPDATE`, sau đó mới kiểm tra `storeId` trong bộ nhớ JavaScript. Điều này gây nguy cơ chiếm giữ khóa độc quyền trên bản ghi của cửa hàng khác khi có tấn công dò quét mã định danh.
  - _Giải pháp đã xử lý_: Đưa trực tiếp điều kiện `and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt))` vào mệnh đề `WHERE` của câu lệnh SQL `FOR UPDATE`.
- **Phát hiện 4 (Mức độ HIGH)**: Hàm khôi phục bảng giá `restorePriceList` tại `apps/api/src/services/price-lists.service.ts:980` không kiểm tra bảng giá nền (`basePriceListId`) có thuộc cùng `storeId` của người gọi hay không khi phục hồi bảng giá công thức (`formula`).
  - _Giải pháp đã xử lý_: Bổ sung truy vấn xác minh `basePriceListId` thuộc đúng `storeId` của người gọi và chưa bị xóa trước khi hoàn tất khôi phục.
- **Phát hiện 5 (Mức độ MEDIUM)**: Nhóm khách hàng (`customer-groups.service.ts:144`) cho phép gán `defaultPriceListId` mà không xác thực bảng giá đó có thuộc sở hữu của cửa hàng hiện tại hay không.
  - _Giải pháp đã xử lý_: Thêm hàm `ensurePriceListBelongsToStore` kiểm tra quyền sở hữu bảng giá trước khi tạo hoặc cập nhật nhóm khách hàng.
- **Phát hiện 6 (Mức độ MEDIUM)**: Cập nhật và xóa trong `price-lists.service.ts`, `customer-groups.service.ts`, `stock-checks.service.ts`, `supplier-payments.service.ts`, `users.service.ts` thiếu điều kiện `storeId` trong mệnh đề `WHERE` của lệnh `UPDATE`/`DELETE`.
  - _Giải pháp đã xử lý_: Bổ sung tường minh điều kiện `eq(table.storeId, actor.storeId)` vào toàn bộ các câu lệnh cập nhật và xóa.

### 2.3. Giới hạn tần suất yêu cầu (Rate Limiting)

- **Phát hiện 7 (Mức độ HIGH)**: Tuyến đường làm mới phiên đăng nhập `POST /api/v1/auth/refresh` tại `apps/api/src/routes/auth.routes.ts:62` chưa được gắn bộ giới hạn tần suất, có thể bị khai thác để tấn công từ chối dịch vụ hoặc vét cạn mã làm mới phiên (refresh token).
  - _Giải pháp đã xử lý_: Định nghĩa `refreshRateLimit` (tối đa 30 yêu cầu mỗi phút trên một địa chỉ IP) trong `apps/api/src/middleware/rate-limit.middleware.ts` và gắn vào tuyến đường `/refresh`.
- **Phát hiện 8 (Mức độ LOW)**: Cơ chế trích xuất địa chỉ IP người dùng từ tiêu đề `x-forwarded-for` chưa xử lý trường hợp chuỗi chứa danh sách nhiều địa chỉ IP phân tách bởi dấu phẩy.
  - _Giải pháp đã xử lý_: Chuẩn hóa hàm trích xuất `getClientIp` để chỉ lấy địa chỉ IP gốc đầu tiên (`raw.split(',')[0].trim()`).

### 2.4. Xác thực dữ liệu đầu vào (Input Validation)

- **Phát hiện 9 (Mức độ MEDIUM)**: Các tuyến đường POS tại `apps/api/src/routes/pos.routes.ts:40-55` (`POST /resolve-prices` và `POST /orders`) đọc trực tiếp `c.req.json()` mà không qua hàm bao bọc `parseJson` với lược đồ Zod, dẫn đến ngoại lệ cú pháp JSON không được chuẩn hóa thành mã lỗi `VALIDATION_ERROR`.
  - _Giải pháp đã xử lý_: Chuyển đổi toàn bộ sang `parseJson(c, schema)`.
- **Phát hiện 10 (Mức độ LOW)**: Các tham số phân trang truy vấn tại một số tuyến đường rác (`/trashed`) hoặc tồn thấp (`/low-stock`) trong `products.routes.ts`, `suppliers.routes.ts`, `customers.routes.ts` dùng `parseInt(...)` trực tiếp có thể sinh giá trị `NaN`.
  - _Giải pháp đã xử lý_: Thay thế bằng biểu thức ép kiểu an toàn có giá trị dự phòng mặc định `Math.max(1, parseInt(...) || default)`.

### 2.5. Chèn mã SQL (SQL Injection), Tệp tải lên (Upload) và Quản lý Bí mật (Secrets)

- **Rà soát SQL Injection**: Quét toàn bộ 100% các vị trí sử dụng `sql` từ thư viện `drizzle-orm`. Xác nhận toàn bộ codebase đều dùng thẻ mẫu ký tự chuẩn (`template literal tag`) giúp tự động tham số hóa câu truy vấn (`prepared statements`). Không phát hiện bất kỳ vị trí nào sử dụng chuỗi nội suy không an toàn hoặc `sql.raw()`.
- **Rà soát Tệp tải lên và Bí mật**: Hệ thống hiện tại lưu trữ đường dẫn ảnh sản phẩm dạng chuỗi URL đã qua xử lý, không lưu tệp trực tiếp lên máy chủ cục bộ. Toàn bộ các khóa bí mật JWT, phiên đăng nhập, cấu hình khóa ứng dụng đều được kiểm tra bắt buộc qua biến môi trường khi khởi động hệ thống.

---

## 3. PHẦN B: TỐI ƯU HIỆU NĂNG (PERFORMANCE)

### 3.1. Song song hóa truy vấn Bảng điều khiển (Dashboard Sparklines)

- **Hiện trạng**: Tại `apps/api/src/services/dashboard.service.ts`, hàm `getDashboardMetrics` thực hiện lần lượt các lời gọi `getOrderCountSparkline` và `getProfitSparkline` tuần tự sau khi đã chạy `getSparkline`. Trong các hàm con `queryMetrics` và `getProfitSparkline`, truy vấn tính doanh thu và truy vấn tính giá vốn hàng bán (`cogs`) cũng chạy nối tiếp nhau qua hai lần chờ đợi I/O cơ sở dữ liệu.
- **Giải pháp đã tối ưu**:
  1. Trong `queryMetrics`: Gom truy vấn doanh thu và giá vốn vào `Promise.all`.
  2. Trong `getProfitSparkline`: Gom truy vấn biểu đồ doanh thu và giá vốn theo ngày vào `Promise.all`.
  3. Trong `getDashboardMetrics`: Gom toàn bộ 5 luồng tính toán độc lập gồm số liệu kỳ hiện tại, số liệu kỳ trước, biểu đồ doanh thu, biểu đồ số lượng đơn, và biểu đồ lợi nhuận vào một lời gọi `Promise.all` duy nhất.
  - _Kết quả_: Giảm thời gian phản hồi của API bảng điều khiển từ 4 đến 5 lần độ trễ truy vấn tuần tự xuống còn đúng thời gian của một truy vấn dài nhất.

### 3.2. Bổ sung Phân trang cho Báo cáo Tồn kho (Inventory Report Pagination)

- **Hiện trạng**: Ba báo cáo tồn kho tại `apps/api/src/services/inventory-report.service.ts` gồm tồn kho hiện tại (`current`), hàng cần nhập (`reorder`), và hàng chậm bán (`slow`) trước đây tải toàn bộ danh sách sản phẩm về bộ nhớ máy chủ, không hỗ trợ phân trang.
- **Giải pháp đã tối ưu**:
  1. Mở rộng lược đồ `inventoryReportQuerySchema` trong `packages/shared/src/schema/reports.ts` nhận tham số `page` (mặc định 1) và `pageSize` (mặc định 20, tối đa 100).
  2. Bổ sung cấu trúc thông tin phân trang `pagination: InventoryReportPaginationMeta` (`page`, `pageSize`, `total`, `totalPages`) vào các giao diện phản hồi.
  3. Cập nhật `apps/api/src/services/inventory-report.service.ts` áp dụng `.limit(pageSize).offset(offset)` trực tiếp trong câu lệnh SQL.
  4. Chuyển logic tính tổng số sản phẩm và tổng giá trị tồn kho sang thực hiện trực tiếp trên cơ sở dữ liệu (`count(*)`, `sum(stock * cost)`) và chạy song song với truy vấn dữ liệu trang hiện tại qua `Promise.all`.
  5. Cập nhật tuyến đường `GET /api/v1/reports/inventory` tại `apps/api/src/routes/reports.routes.ts` để phân tích và truyền tham số phân trang.

### 3.3. Bổ sung Chỉ mục Cơ sở dữ liệu (Database Composite Indexes)

Đã thiết kế và bổ sung các chỉ mục tổ hợp tối ưu cho các truy vấn lọc và báo cáo thường xuyên:

1. **Bảng `orders`** (`packages/shared/src/schema/orders.ts`):
   - `idx_orders_store_status_created`: Phục vụ báo cáo doanh thu, lợi nhuận, và bảng điều khiển lọc theo `(store_id, status, created_at)`.
   - `idx_orders_store_cust_status_date`: Phục vụ báo cáo doanh thu theo từng khách hàng `(store_id, customer_id, status, created_at)`.
   - `idx_orders_store_user_status_date`: Phục vụ báo cáo hiệu suất bán hàng của nhân viên `(store_id, user_id, status, created_at)`.
2. **Bảng `debts`** (`packages/shared/src/schema/debts.ts`):
   - `idx_debts_store_remaining_created`: Chỉ mục có điều kiện (`partial index`) trên `(store_id, created_at)` với điều kiện `remaining > 0`, phục vụ báo cáo tuổi nợ (`debt-aging`) và tính toán nợ quá hạn tức thì.
3. **Bảng `purchase_orders`** (`packages/shared/src/schema/purchase-orders.ts`):
   - `idx_purchase_orders_store_created`: Phục vụ tra cứu danh sách và báo cáo nhập hàng sắp xếp theo thời gian mới nhất `(store_id, created_at DESC)`.
4. **Bảng `inventory_transactions`** (`packages/shared/src/schema/inventory-transactions.ts`):
   - `idx_inventory_tx_store_product_date`: Phục vụ tra cứu lịch sử biến động kho của từng sản phẩm theo cửa hàng `(store_id, product_id, created_at DESC)`.

- **Tạo tệp di chuyển cơ sở dữ liệu (Migration)**: Đã sinh thành công tệp di chuyển `apps/api/src/db/migrations/0031_long_human_cannonball.sql`.

---

## 4. KHẢO SÁT VẤN ĐỀ N+1 (HẠNG MỤC HOÃN CÓ CHỦ Ý)

Theo chỉ đạo từ Điều phối viên (Coordinator), các tệp `apps/api/src/services/orders.service.ts` và `apps/api/src/services/purchase-orders.service.ts` hiện đang được một tiến trình phát triển khác tái cấu trúc song song. Do đó, hai tệp này **không thực hiện sửa đổi mã trực tiếp** trong lượt này để tránh xung đột mã nguồn.

Dưới đây là kết quả khảo sát chi tiết và phương án đề xuất khắc phục:

### 4.1. Khảo sát tại `apps/api/src/services/orders.service.ts` (Hàm `createOrder`)

- **Vị trí phát hiện**:
  - Dòng 355 đến 415: Vòng lặp `for (const item of input.items)` duyệt qua từng sản phẩm trong đơn hàng.
  - Trong mỗi vòng lặp, hệ thống thực hiện lần lượt:
    1. Một truy vấn nạp và khóa dòng sản phẩm: `loadProductForUpdate(...)`.
    2. Nếu sản phẩm có biến thể: thêm một truy vấn khóa dòng biến thể `loadVariantForUpdate(...)`.
    3. Một câu lệnh cập nhật tồn kho sản phẩm: `tx.update(products)...`.
    4. Nếu có biến thể: thêm một câu lệnh cập nhật tồn kho biến thể `tx.update(productVariants)...`.
    5. Một câu lệnh thêm dòng lịch sử kho: `tx.insert(inventoryTransactions)...`.
- **Đánh giá ảnh hưởng**: Với một đơn hàng có 20 mặt hàng, hệ thống phát sinh từ 60 đến 100 câu truy vấn cơ sở dữ liệu nối tiếp nhau trong cùng một giao dịch (`transaction`), làm kéo dài thời gian giữ khóa dòng và tăng nguy cơ tắc nghẽn giao dịch khi có tải cao.
- **Phương án đề xuất khắc phục cho Điều phối viên**:
  1. **Nạp và khóa hàng loạt (Batch Lock)**: Thu thập toàn bộ `productIds` và `variantIds` của đơn hàng, thực hiện đúng 2 câu truy vấn khóa dòng bằng toán tử `inArray(products.id, productIds)` và `inArray(productVariants.id, variantIds)` có sắp xếp theo khóa chính để chống bế tắc (`deadlock`).
  2. **Thêm bản ghi hàng loạt (Bulk Insert)**: Gom toàn bộ các dòng chi tiết đơn hàng (`order_items`) và các dòng giao dịch kho (`inventory_transactions`) để chèn một lần bằng `tx.insert(...).values([...])`.
  3. **Cập nhật tồn kho theo lô (Bulk Update)**: Sử dụng câu lệnh `UPDATE ... FROM (VALUES ...)` hoặc thực thi cập nhật gom nhóm trong giao dịch.

### 4.2. Khảo sát tại `apps/api/src/services/purchase-orders.service.ts` (Hàm `createPurchaseOrder` và nhập kho)

- **Vị trí phát hiện**:
  - Dòng 210 đến 280: Vòng lặp duyệt từng mặt hàng nhập kho gọi đơn lẻ từng câu lệnh tính toán giá vốn bình quân gia quyền (WAC - Weighted Average Cost) và cập nhật giá vốn, số lượng tồn kho từng sản phẩm.
- **Đánh giá ảnh hưởng**: Tương tự luồng tạo đơn, phát sinh O(N) câu truy vấn tỷ lệ thuận với số lượng sản phẩm trong phiếu nhập.
- **Phương án đề xuất khắc phục cho Điều phối viên**:
  1. Gom danh sách `productId` để nạp dữ liệu tồn kho và giá vốn hiện tại trong một truy vấn `inArray`.
  2. Tính toán toàn bộ công thức giá vốn mới trong bộ nhớ ứng dụng.
  3. Thực hiện chèn chi tiết phiếu nhập và giao dịch kho theo phương thức chèn hàng loạt (`bulk insert`).

---

## 5. KẾT QUẢ KIỂM THỬ VÀ XÁC THỰC HỆ THỐNG

Thực hiện nghiêm túc quy tắc kiểm thử mới từ Điều phối viên (chỉ chạy kiểm thử phạm vi hẹp để bảo vệ tài nguyên máy tính 12 lõi đang vận hành nhiều tác vụ song song):

1. **Kiểm tra cú pháp và định dạng (ESLint)**:
   - Lệnh: `pnpm lint`
   - Kết quả: **THÀNH CÔNG (0 lỗi)**.
2. **Kiểm tra kiểu dữ liệu tĩnh (TypeScript Typecheck)**:
   - Lệnh: `pnpm -r typecheck`
   - Kết quả: **THÀNH CÔNG (Tất cả 4 gói packages/shared, packages/notifications, apps/web, apps/api đều đạt 100%)**.
3. **Kiểm tra tích hợp phạm vi hẹp (Scoped Integration Tests)**:
   - Đã tạo tệp kiểm thử mới `apps/api/src/__tests__/security-and-performance.integration.test.ts` kiểm chứng toàn bộ phân quyền khách hàng, phân trang báo cáo tồn kho, chống IDOR bảng giá, nhóm khách hàng, và khóa dòng sản phẩm.
   - Chạy kiểm thử các bộ test liên quan trực tiếp:
     - `security-and-performance.integration.test.ts`: 6/6 bài kiểm tra đạt.
     - `notifications-emit.integration.test.ts`: 6/6 bài kiểm tra đạt (đã bổ sung kiểm tra chặn quyền vai trò nhân viên 403).
     - `reports.integration.test.ts`: 15/15 bài kiểm tra đạt.
     - `customers.integration.test.ts`: Toàn bộ bài kiểm tra đạt.
     - `users.integration.test.ts`: 28/28 bài kiểm tra đạt.
     - `price-lists.integration.test.ts`: 38/38 bài kiểm tra đạt.
     - `stock-checks.integration.test.ts`: 30/30 bài kiểm tra đạt.
   - Kết quả: **100% các bài kiểm thử liên quan đều vượt qua thành công**.
4. **Kiểm tra đóng gói ứng dụng (Production Build)**:
   - Lệnh: `pnpm -r build`
   - Kết quả: **THÀNH CÔNG (Biên dịch sạch toàn bộ giao diện web và dịch vụ máy chủ API)**.

---

## 6. DANH SÁCH CÁC TỆP ĐÃ THAY ĐỔI

1. `apps/api/src/routes/notifications.routes.ts`: Bổ sung phân quyền `store.manage` cho tuyến đường `/emit` và chuẩn hóa lấy địa chỉ IP.
2. `apps/api/src/middleware/rate-limit.middleware.ts`: Bổ sung bộ giới hạn tần suất cho tuyến đường làm mới phiên `refreshRateLimit`.
3. `apps/api/src/routes/auth.routes.ts`: Gắn giới hạn tần suất cho `POST /refresh`.
4. `apps/api/src/routes/customers.routes.ts`: Phân định quyền `customers.view` và `customers.manage` cho từng tuyến đường con, chuẩn hóa phân trang an toàn.
5. `apps/api/src/routes/pos.routes.ts`: Chuẩn hóa bắt lỗi dữ liệu đầu vào qua `parseJson`.
6. `apps/api/src/routes/products.routes.ts`: Ép kiểu phân trang an toàn tránh `NaN`.
7. `apps/api/src/routes/suppliers.routes.ts`: Ép kiểu phân trang an toàn tránh `NaN`.
8. `apps/api/src/services/products-lock.helper.ts`: Đưa điều kiện `storeId` vào câu truy vấn khóa dòng `FOR UPDATE`.
9. `apps/api/src/services/supplier-payments.service.ts`: Khóa dòng nhà cung cấp và cập nhật công nợ an toàn theo `storeId`.
10. `apps/api/src/services/price-lists.service.ts`: Ngăn chặn IDOR khi khôi phục bảng giá dẫn xuất và bổ sung `storeId` cho thao tác sửa xóa.
11. `apps/api/src/services/customer-groups.service.ts`: Xác thực quyền sở hữu bảng giá mặc định theo `storeId` và kiểm soát cập nhật xóa đa người thuê.
12. `apps/api/src/services/stock-checks.service.ts`: Lọc sản phẩm theo `storeId` khi nạp chi tiết kiểm kho, chuẩn hóa mã lỗi CONFLICT khi xóa phiếu đã xác nhận.
13. `apps/api/src/services/users.service.ts`: Bổ sung điều kiện `storeId` vào các thao tác cập nhật và khóa tài khoản người dùng.
14. `apps/api/src/services/dashboard.service.ts`: Tối ưu song song hóa toàn bộ biểu đồ và chỉ số bảng điều khiển bằng `Promise.all`.
15. `packages/shared/src/schema/reports.ts`: Bổ sung phân trang vào lược đồ yêu cầu và kiểu phản hồi của báo cáo tồn kho.
16. `apps/api/src/services/inventory-report.service.ts`: Triển khai phân trang và tính toán tổng kho trực tiếp trong cơ sở dữ liệu.
17. `apps/api/src/routes/reports.routes.ts`: Tiếp nhận tham số phân trang cho tuyến đường `GET /inventory`.
18. `packages/shared/src/schema/orders.ts`: Bổ sung các chỉ mục tổ hợp cho đơn hàng.
19. `packages/shared/src/schema/debts.ts`: Bổ sung chỉ mục có điều kiện cho công nợ còn lại.
20. `packages/shared/src/schema/purchase-orders.ts`: Bổ sung chỉ mục ngày tạo phiếu nhập.
21. `packages/shared/src/schema/inventory-transactions.ts`: Bổ sung chỉ mục biến động kho theo sản phẩm.
22. `apps/api/src/db/migrations/0031_long_human_cannonball.sql`: Tệp di chuyển cơ sở dữ liệu tạo các chỉ mục mới.
23. `apps/api/src/__tests__/security-and-performance.integration.test.ts`: Bộ kiểm thử tích hợp chuyên biệt cho các tính năng bảo mật và hiệu năng.
24. `apps/api/src/__tests__/notifications-emit.integration.test.ts`: Bổ sung kiểm thử phân quyền 403 cho phát thông báo.
