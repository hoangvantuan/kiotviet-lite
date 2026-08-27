# Báo cáo xử lý Issue GitHub #1 và #2 (Nhiệm vụ T7)

Ngày hoàn thành: 28/08/2026
Nhánh thực hiện: `hoangvantuan/t7-issues`

---

## 1. Tổng quan các vấn đề và nguyên nhân gốc rễ

### Issue #2: Báo cáo tuổi nợ bỏ qua bộ lọc khoảng thời gian và lỗi múi giờ

- **Hiện tượng**:
  1. Báo cáo tuổi nợ (`/reports/debt-aging` và export CSV) nhận tham số `from` và `to` từ giao diện nhưng kết quả trả về luôn quét toàn bộ dữ liệu công nợ lịch sử, không lọc theo ngày.
  2. Khi truyền chuỗi ngày dạng `YYYY-MM-DD` (định dạng chuẩn của input date HTML), hàm `new Date('YYYY-MM-DD')` mặc định hiểu là `00:00 UTC` (tức `07:00 sáng giờ Việt Nam +07:00`), làm mất các giao dịch từ `07:01` đến `23:59` của ngày `to`, và kéo lẫn dữ liệu từ ngày hôm trước với ngày `from`.
- **Nguyên nhân gốc rễ**:
  - `apps/api/src/services/reports.service.ts`: Hàm `getDebtAgingReport` trước đó không nhận tham số truy vấn `query: ReportQuery` và không áp dụng điều kiện `gte(debts.createdAt, fromDate)` và `lte(debts.createdAt, toDate)`.
  - Thiếu hàm quy đổi biên thời gian theo múi giờ Việt Nam (`+07:00`) cho chuỗi `YYYY-MM-DD`.
  - Schema `debtAgingQuerySchema` và `debtSummaryQuerySchema` trong `packages/shared/src/schema/debt-report-management.ts` dùng `z.string().datetime()` nên từ chối chuỗi `YYYY-MM-DD`.
- **Giải pháp**:
  - Cập nhật `debtAgingQuerySchema` và `debtSummaryQuerySchema` chấp nhận cả chuỗi `YYYY-MM-DD`, ISO datetime có timezone offset `+07:00` hoặc UTC `Z`.
  - Thêm helper `parseDateRangeBoundary` trong `reports.service.ts` để quy đổi `from` về đầu ngày (`00:00:00.000+07:00`) và `to` về cuối ngày (`23:59:59.999+07:00`). Nếu chuỗi đã là ISO datetime có giờ cụ thể thì giữ nguyên.
  - Bổ sung điều kiện lọc `fromDate` và `toDate` cho các bản ghi công nợ trong bảng `debts`.
  - _Ghi chú điều phối_: TODO (Pha 6): Hợp nhất logic chuyển đổi múi giờ này về helper timezone dùng chung (`apps/api/src/lib/timezone.ts`).

### Issue #1: Cài đặt in: phần lớn toggle không có tác dụng trên hóa đơn thật

- **Hiện tượng**: Trong cài đặt in có 8 toggle (`showOldDebt`, `showNewDebt`, `showCostPrice`, `showDiscount`, `showNotes`, `showCustomerName`, `showCustomerPhone`, `showSku`) cùng cấu hình `footerText`, `logoUrl`, `slogan`. Khi in qua máy in nhiệt Web Serial hoặc qua trình duyệt (A4, A5), phần lớn các toggle này không thay đổi nội dung trên hóa đơn.
- **Nguyên nhân gốc rễ**:
  1. **Tầng API & Dữ liệu Backend**:
     - `apps/api/src/services/orders.service.ts`: API `getOrderDetail` và hàm tạo đơn `createOrder` không trả về `sku`, `costPrice` trong `OrderDetailItem`, cũng như thiếu `oldDebt` (công nợ trước đơn) và `customerCurrentDebt` (công nợ sau đơn) trong `OrderDetail`.
  2. **Tầng Máy in nhiệt ESC/POS (Web Serial)**:
     - `apps/web/src/lib/thermal-printer.ts`: Interface `PrintOptions` và `ThermalOrder` thiếu các cờ và trường dữ liệu. Hàm `buildOrderReceipt` bỏ qua `showCustomerName`, `showCustomerPhone`, `showSku`, `showCostPrice`, `showNotes`, `showOldDebt`.
     - `apps/web/src/features/orders/use-print-order.ts`: Hàm `settingsToOptions` chỉ map 4 thuộc tính thay vì 8 toggle và `footerText`. Hàm `toThermalOrder` chưa map `sku`, `costPrice`, `oldDebt`.
  3. **Tầng Template Hóa đơn trình duyệt (Thermal fallback, A4, A5)**:
     - `apps/web/src/features/orders/order-invoice-template.tsx`: Component `OrderInvoiceA4` và `OrderInvoiceA5` nhận `printSettings` nhưng bỏ qua hoàn toàn và render cứng dữ liệu. `OrderInvoiceThermal` chỉ đọc 3/8 toggle.
  4. **Tầng POS Dialog**:
     - `apps/web/src/features/pos/types.ts` và `OrderCompletionDialog.tsx`: Hàm mapping `toOrderDetailResponse` thiếu `sku`, `costPrice`, `oldDebt`, `customerCurrentDebt`.

---

## 2. Chi tiết các tệp và dòng mã nguồn đã chỉnh sửa

| Tệp                                                              | Dòng sửa | Mô tả nội dung thay đổi                                                                                                                              |
| ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/schema/debt-report-management.ts`           | 1-30     | Mở rộng `debtAgingQuerySchema` và `debtSummaryQuerySchema` chấp nhận cả định dạng `YYYY-MM-DD` và ISO datetime.                                      |
| `packages/shared/src/schema/debt-report-management.test.ts`      | 10-26    | Bổ sung unit test cho schema chấp nhận định dạng ngày `YYYY-MM-DD`.                                                                                  |
| `apps/api/src/services/reports.service.ts`                       | 19-60    | Thêm `parseDateRangeBoundary` quy đổi `from` (đầu ngày `00:00:00+07:00`) và `to` (cuối ngày `23:59:59+07:00`), áp dụng lọc cho `getDebtAgingReport`. |
| `apps/api/src/services/orders.service.ts`                        | 44-78    | Bổ sung `sku`, `costPrice` vào `OrderDetailItem` và `oldDebt`, `customerCurrentDebt` vào `OrderDetail`.                                              |
| `apps/api/src/services/orders.service.ts`                        | 337-395  | Đính kèm `sku` và `costPrice` vào từng dòng sản phẩm khi tạo đơn trong `createOrder`.                                                                |
| `apps/api/src/services/orders.service.ts`                        | 468-668  | Tính toán `oldDebt` và `customerCurrentDebt` trả về cho client sau khi tạo đơn.                                                                      |
| `apps/api/src/services/orders.service.ts`                        | 993-1120 | Truy vấn SQL join `products`, `productVariants`, `customers` để lấy `sku`, `costPrice`, `oldDebt`, `customerCurrentDebt` trong `getOrderDetail`.     |
| `apps/web/src/features/orders/orders-api.ts`                     | 28-68    | Mở rộng kiểu dữ liệu `OrderDetailResponse` và `OrderDetailItem` khớp với backend.                                                                    |
| `apps/web/src/features/pos/types.ts`                             | 6-36     | Thêm các trường `sku`, `costPrice`, `customerName`, `customerPhone`, `oldDebt`, `customerCurrentDebt` vào `OrderDetailItem` và `OrderDetail`.        |
| `apps/web/src/features/pos/components/OrderCompletionDialog.tsx` | 30-50    | Cập nhật hàm `toOrderDetailResponse` map đầy đủ thông tin khách hàng, công nợ, SKU và giá vốn cho template in.                                       |
| `apps/web/src/lib/thermal-printer.ts`                            | 54-328   | Mở rộng `PrintOptions`, `ThermalOrder`, `ThermalOrderItem` và cập nhật `buildOrderReceipt` xử lý đầy đủ 8 toggle, `footerText`, `slogan`.            |
| `apps/web/src/features/orders/use-print-order.ts`                | 22-140   | Cập nhật `settingsToOptions` và `toThermalOrder` truyền đủ cấu hình in và dữ liệu order.                                                             |
| `apps/web/src/features/orders/order-invoice-template.tsx`        | 1-450    | Đồng bộ xử lý cả 8 toggle, `logoUrl`, `slogan`, `footerText` trên cả 3 template `OrderInvoiceThermal`, `OrderInvoiceA4`, `OrderInvoiceA5`.           |
| `vitest.workspace.ts`                                            | 31-38    | Bổ sung `resolve.alias` cho project `web` để chạy test vitest mượt mà.                                                                               |

---

## 3. Các bài kiểm thử đã thêm mới

### 1. Integration Test cho Backend (API)

- `apps/api/src/__tests__/reports.integration.test.ts`:
  - `filters by date range (from/to)`: Kiểm tra `GET /api/v1/reports/debt-aging` lọc đúng bản ghi nợ trong khoảng ngày `from` và `to`.
  - `xử lý chính xác múi giờ Việt Nam (+07:00) với bộ lọc YYYY-MM-DD`:
    - Khoản nợ lúc 23:00 giờ Việt Nam (+07:00) của đúng ngày `to` vẫn xuất hiện trong báo cáo.
    - Khoản nợ lúc 00:30 giờ Việt Nam (+07:00) của ngày `from` vẫn xuất hiện trong báo cáo.
    - Khoản nợ của ngày trước `from` và sau `to` bị loại bỏ chính xác.
  - `filters CSV export by date range`: Kiểm tra xuất CSV của báo cáo tuổi nợ lọc đúng khoảng ngày.
- `apps/api/src/__tests__/orders-detail.integration.test.ts`:
  - `createOrder và getOrderDetail trả về đúng sku, costPrice, oldDebt, customerCurrentDebt`: Kiểm tra toàn trình tạo đơn nợ qua POS và truy vấn chi tiết đơn hàng, xác nhận SKU (kể cả từ variant), giá vốn, công nợ trước đơn và công nợ sau đơn.

### 2. Unit Test cho Frontend (Web) & Shared Schemas

- `packages/shared/src/schema/debt-report-management.test.ts`:
  - Kiểm tra validation schema chấp nhận cả định dạng `YYYY-MM-DD` và ISO datetime đầy đủ.
- `apps/web/src/lib/thermal-printer.test.ts`:
  - `in đúng thông tin cơ bản với cấu hình mặc định (58mm)`: Kiểm tra format ESC/POS mặc định.
  - `tôn trọng các toggle tắt: ẩn tên KH, SĐT, chiết khấu, nợ, ghi chú`: Kiểm tra tắt các toggle.
  - `in SKU, Nợ cũ, Giá vốn khi các toggle tương ứng được bật`: Kiểm tra in SKU, Nợ cũ và Giá vốn khi bật toggle.
  - `in đúng nhãn BẢN IN LẠI khi isReprint=true`: Kiểm tra cờ in lại.
- `apps/web/src/features/orders/order-invoice-template.test.tsx`:
  - `OrderInvoiceThermal`: Kiểm tra render bật/tắt các toggle cho khổ in nhiệt.
  - `OrderInvoiceA4`: Kiểm tra render bật/tắt các toggle, hiển thị cột CK, SKU, Nợ cũ, Giá vốn, Ghi chú, Chữ ký trên khổ A4.
  - `OrderInvoiceA5`: Kiểm tra render bật/tắt các toggle trên khổ A5.

---

## 4. Kết quả 4 lệnh kiểm tra chuẩn

1. `pnpm lint`:
   - **Kết quả**: THÀNH CÔNG (0 lỗi, 6 cảnh báo không liên quan có sẵn).
2. `pnpm -r typecheck`:
   - **Kết quả**: THÀNH CÔNG trên cả 4 workspace projects (`packages/shared`, `packages/notifications`, `apps/web`, `apps/api`).
3. `pnpm test` (`pnpm vitest run --fileParallelism=false`):
   - **Kết quả**: THÀNH CÔNG 100% (91/91 test files, 1322/1322 tests pass).
4. `pnpm -r build`:
   - **Kết quả**: THÀNH CÔNG (Build production thành công cho `apps/web`, `apps/api`, `packages/*`).

---

## 5. Rủi ro còn tồn tại và lưu ý vận hành

- Không có rủi ro phá vỡ tương thích ngược: Các trường mới thêm vào (`sku`, `costPrice`, `oldDebt`, `customerCurrentDebt`) đều là optional (`?`) và có fallback giá trị mặc định chuẩn xác.
- Khi in trên máy in nhiệt thực tế khổ 58mm (độ rộng 32 ký tự), nếu tên sản phẩm hoặc mã SKU quá dài, hệ thống sẽ tự động xuống dòng hoặc cắt bớt hợp lý để không làm vỡ bố cục in.
- TODO (Pha 6): Khi nhánh tạo `apps/api/src/lib/timezone.ts` được merge, sẽ hợp nhất hàm `parseDateRangeBoundary` về helper chung để tái sử dụng trên toàn hệ thống.

---

## 6. Mẫu bình luận đề xuất cho Coordinator dán lên GitHub

### Mẫu bình luận cho Issue #2 (Báo cáo tuổi nợ bỏ qua bộ lọc khoảng thời gian)

```markdown
Đã xử lý xong nguyên nhân gốc rễ và xác minh hoàn tất:

1. **Nguyên nhân gốc rễ**:
   - Hàm `getDebtAgingReport` trong `apps/api/src/services/reports.service.ts` trước đó không nhận tham số `query: ReportQuery`, dẫn đến việc truy vấn công nợ bỏ qua điều kiện ngày bắt đầu (`fromDate`) và ngày kết thúc (`toDate`).
   - Lỗi múi giờ: Chuỗi `YYYY-MM-DD` trước đó bị parse thành 00:00 UTC (07:00 sáng giờ VN), làm mất dữ liệu sau 7h sáng của ngày `to` và kéo lẫn dữ liệu ngày trước `from`.
2. **Khắc phục**:
   - Cập nhật `debtAgingQuerySchema` và `debtSummaryQuerySchema` chấp nhận cả định dạng `YYYY-MM-DD` và ISO datetime.
   - Thêm helper `parseDateRangeBoundary` quy đổi `from` về đầu ngày (`00:00:00.000+07:00`) và `to` về cuối ngày (`23:59:59.999+07:00`) theo giờ Việt Nam.
   - Cập nhật `getDebtAgingReport` nhận `query: ReportQuery` và thêm điều kiện lọc `gte(debts.createdAt, fromDate)` cùng `lte(debts.createdAt, toDate)` cho các khoảng tuổi nợ (0 đến 30 ngày, 31 đến 60 ngày, 61 đến 90 ngày, trên 90 ngày).
   - Áp dụng đồng bộ cho cả API JSON và API trích xuất CSV.
3. **Kiểm thử tự động**:
   - Bổ sung integration test trong `apps/api/src/__tests__/reports.integration.test.ts` kiểm tra biên múi giờ: khoản nợ lúc 23:00 ngày `to` và 00:30 ngày `from` đều xuất hiện chính xác; khoản nợ ngày trước `from` và sau `to` bị loại bỏ.
   - Toàn bộ 18/18 tests trong file reports integration và 19/19 tests trong shared schema đều đạt.
4. **Xác minh toàn hệ thống**: Vượt qua 4 bước kiểm tra tiêu chuẩn (`lint`, `typecheck`, `test` 1322/1322 tests, `build`).
```

### Mẫu bình luận cho Issue #1 (Cài đặt in: phần lớn toggle không có tác dụng trên hóa đơn thật)

```markdown
Đã khắc phục toàn diện việc áp dụng cấu hình in hóa đơn trên tất cả các khổ in:

1. **Nguyên nhân gốc rễ**:
   - Backend `orders.service.ts` thiếu trả về các trường `sku`, `costPrice`, `oldDebt`, `customerCurrentDebt`.
   - Hàm dựng lệnh in nhiệt ESC/POS (`thermal-printer.ts`) và hook in (`use-print-order.ts`) bỏ qua các cờ `showCustomerName`, `showCustomerPhone`, `showSku`, `showCostPrice`, `showNotes`, `showOldDebt`.
   - Các template hóa đơn trình duyệt A4, A5 (`order-invoice-template.tsx`) nhận `printSettings` nhưng render cứng dữ liệu, template Thermal chỉ đọc 3/8 cờ.
2. **Khắc phục**:
   - Backend: Cập nhật `createOrder` và `getOrderDetail` join thông tin sản phẩm, variant và khách hàng để trả về đầy đủ `sku`, `costPrice`, `oldDebt`, `customerCurrentDebt`.
   - Máy in nhiệt ESC/POS: Cập nhật `buildOrderReceipt` xử lý chính xác cả 8 toggle (`showOldDebt`, `showNewDebt`, `showCostPrice`, `showDiscount`, `showNotes`, `showCustomerName`, `showCustomerPhone`, `showSku`), cùng `footerText` và `slogan`.
   - Template A4/A5/Thermal: Áp dụng đồng bộ cả 8 toggle, `logoUrl`, `slogan`, `footerText` cho cả 3 khổ in.
3. **Kiểm thử tự động**:
   - Thêm integration test `apps/api/src/__tests__/orders-detail.integration.test.ts` kiểm tra dữ liệu in từ backend.
   - Thêm unit test `apps/web/src/lib/thermal-printer.test.ts` và `apps/web/src/features/orders/order-invoice-template.test.tsx` kiểm tra bật/tắt toàn bộ các toggle trên từng mẫu hóa đơn.
4. **Xác minh toàn hệ thống**: Vượt qua đầy đủ 4 lệnh kiểm tra chuẩn (`lint`, `typecheck`, `test` 1322/1322 tests, `build`).
```
