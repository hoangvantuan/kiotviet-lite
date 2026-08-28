# Báo Cáo Kết Quả — T6 Pha 6: Dọn Dẹp Mã Nguồn (Cleanup), Xử Lý Lỗi Tồn Đọng (L27, L28, L29) và Mô Đun Định Giá Dùng Chung

---

## 1. Tổng Quan Mục Tiêu

Pha 6 tập trung vào các mục tiêu kỹ thuật cốt lõi:

1. **Sửa dứt điểm 3 lỗi tích hợp**:
   - **L27**: Thông báo lỗi (toast error) bị hiển thị lặp hai lần khi mutation thất bại do xung đột giữa `MutationCache.onError` toàn cục và xử lý lỗi cục bộ.
   - **L28**: `requestId` bị `undefined` trong log và context của các route handler Hono.
   - **L29**: Cơ chế dừng ứng dụng an toàn (graceful shutdown) bỏ qua bước dọn dẹp tài nguyên (cleanup) khi bị quá thời gian chờ cưỡng bức (force timeout).
2. **Hợp nhất mã nguồn trùng lặp về `packages/shared` và các thư viện tiện ích chung**:
   - Helper xử lý múi giờ và ranh giới ngày báo cáo (`parseDateRangeBoundary`).
   - Các biểu thức chính quy (regular expression) chuẩn hoá số điện thoại (`PHONE_REGEX`, `VN_PHONE_REGEX`).
   - Hàm chuẩn hoá chuỗi tiếng Việt không dấu (`slugify`, `slugifyForSku`).
   - Hàm định dạng tiền tệ VND (`formatVnd`, `formatVndWithSuffix`, `formatCurrencyVnd`, `parseVnd`).
   - Hàm định dạng ngày giờ chuẩn Việt Nam (`formatDate`, `formatDateTime`, `formatDateTimeForReceipt`).
   - Hàm xử lý lỗi API và gán lỗi biểu mẫu chuẩn hoá (`handleApiError`, `asFormSetError`).
3. **Xây dựng Mô đun định giá dùng chung (Shared Pricing Module) & Máy chủ tự tính lại giá (Server Recompute)**:
   - Thống nhất toàn bộ công thức tính chiết khấu dòng, chiết khấu đơn, đơn vị quy đổi, xử lý an toàn sản phẩm giá 0đ và quy tắc làm tròn dồn phần dư tiền tệ (Remainder Accumulation) cho cả máy khách (client) và máy chủ (server).
   - Máy chủ tự tính lại và kiểm tra đối chiếu dữ liệu máy khách gửi lên, từ chối hoặc điều chỉnh khi có sai lệch.

---

## 2. Bảng Thống Kê Mã Nguồn Trùng Lặp Trước và Sau Khi Hợp Nhất

| Tên Hàm / Hằng Số                  | Số lượng trước khi sửa | Vị trí định nghĩa trước đây                                                  | Số lượng sau khi sửa | Vị trí định nghĩa tập trung mới                                                                                                                     |
| :--------------------------------- | :--------------------: | :--------------------------------------------------------------------------- | :------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatDate` / `formatDateTime`    |         **26**         | Định nghĩa inline tại 26 component trong `apps/web/src`                      |        **1**         | [apps/web/src/lib/date.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/lib/date.ts)                             |
| `handleApiError`                   |         **18**         | Định nghĩa inline tại 18 dialog / form trong `apps/web/src`                  |        **1**         | [apps/web/src/lib/api-error.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/lib/api-error.ts)                   |
| `formatVnd` / `formatCurrencyVnd`  |         **6**          | 5 bản trong `apps/api/src/services` và 1 bản trong `apps/web/src/lib`        |        **1**         | [packages/shared/src/utils/currency.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/currency.ts)   |
| `slugify` / `slugifyForSku`        |         **3**          | 1 bản trong `product-variants.service.ts`, 2 bản trong `apps/web`            |        **1**         | [packages/shared/src/utils/slugify.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/slugify.ts)     |
| `PHONE_REGEX` / `VN_PHONE_REGEX`   |         **3**          | Khai báo lệch nhau giữa các schema (`supplier`, `customer`, `auth`)          |        **1**         | [packages/shared/src/constants/regex.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/constants/regex.ts) |
| `parseDateRangeBoundary`           |         **2**          | 1 bản tại `timezone.ts`, 1 bản cục bộ kèm TODO tại `reports.service.ts`      |        **1**         | [apps/api/src/lib/timezone.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/lib/timezone.ts)                     |
| Logic tính giá giỏ hàng / đơn hàng |         **2**          | Tách biệt trong `use-cart-store.ts` (Client) và `orders.service.ts` (Server) |        **1**         | [packages/shared/src/utils/pricing.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/pricing.ts)     |

---

## 3. Chi Tiết Các Thay Đổi & Gốc Rễ Đã Xử Lý

### 3.1. Lỗi L28: `requestId` bị `undefined` trong log và context

- **Hiện tượng**: Log hệ thống và route handler nhận `requestId` giá trị `undefined`.
- **Gốc rễ (Root cause)**: Trong [request-logger.middleware.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/middleware/request-logger.middleware.ts), middleware tạo `requestId` nhưng không gán vào Hono context `c.set('requestId', requestId)`, khiến các middleware sau và route handler gọi `c.get('requestId')` bị `undefined`. Đồng thời kiểu dữ liệu trong `ContextVariableMap` chưa khai báo biến này.
- **Giải pháp**:
  - Khai báo kiểu `requestId: string` trong `ContextVariableMap` của Hono.
  - Gán `c.set('requestId', requestId)` ngay đầu middleware [request-logger.middleware.ts:27](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/middleware/request-logger.middleware.ts#L27).
  - Cập nhật [error-handler.ts:24](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/middleware/error-handler.ts#L24) và [notifications.routes.ts:74](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/routes/notifications.routes.ts#L74) để lấy correlationId / requestId từ `c.get('requestId')`.
- **Commit**: `ed2ffd0` (`fix(api): truyền requestId xuyên suốt Hono context và logger (L28)`).

### 3.2. Lỗi L29: Graceful shutdown bỏ qua dọn dẹp khi bị timeout

- **Hiện tượng**: Khi quá trình dừng ứng dụng bị treo quá 10 giây (force timeout), ứng dụng gọi `process.exit(1)` ngay lập tức mà không đóng kết nối database hay huỷ đăng ký dịch vụ.
- **Gốc rễ (Root cause)**: Hàm `registerGracefulShutdown` trong [graceful-shutdown.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/lib/graceful-shutdown.ts) đặt timeout 10 giây và thoát ngay mà không kích hoạt các hàm dọn dẹp đăng ký trong mảng callbacks.
- **Giải pháp**:
  - Tạo hàm dọn dẹp dạng an toàn luồng / idempotent `executeCleanup()` đảm bảo chạy đúng 1 lần.
  - Khi timeout kích hoạt, thực thi `await executeCleanup()` trước khi `process.exit(1)`.
  - Thêm bài kiểm thử [graceful-shutdown.test.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/lib/graceful-shutdown.test.ts) kiểm tra trường hợp shutdown bình thường và trường hợp bị force timeout.
- **Commit**: `693714d` (`fix(api): đảm bảo chạy cleanup khi graceful shutdown bị timeout (L29)`).

### 3.3. Lỗi L27: Toast thông báo lỗi bị hiện hai lần

- **Hiện tượng**: Người dùng thực hiện thao tác biểu mẫu bị lỗi, giao diện hiện cùng lúc 2 thông báo lỗi (toast).
- **Gốc rễ (Root cause)**: Cấu hình `MutationCache.onError` trong `apps/web/src/main.tsx` bắt tất cả các mutation thất bại và tự động gọi `showError()`. Trong khi đó, các mutation cục bộ trong dialog/form cũng tự bắt `onError` hoặc gọi `handleApiError` trong khối `catch`.
- **Giải pháp**:
  - Sửa [apps/web/src/main.tsx:22-24](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/main.tsx#L22-L24): thêm điều kiện bỏ qua thông báo toàn cục `if (mutation.meta?.skipGlobalError || mutation.options.onError) return`.
  - Tạo module dùng chung [apps/web/src/lib/api-error.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/lib/api-error.ts) với hàm `handleApiError` tự động phân tích mã lỗi `CONFLICT`, `VALIDATION_ERROR`, gán lỗi trực tiếp vào trường của biểu mẫu (form) và chỉ hiển thị đúng 1 thông báo toast.
  - Thay thế toàn bộ 18 bản `handleApiError` inline trong 18 file dialog/form bằng thư viện dùng chung.
- **Commit**: `3c03b5d` (`refactor(web): hợp nhất formatDate, handleApiError và sửa toast lỗi lặp đôi (L27)`).

### 3.4. Hợp nhất `formatDate` / `formatDateTime`

- **Giải pháp**: Tạo [apps/web/src/lib/date.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/lib/date.ts) cung cấp `formatDate`, `formatDateTime`, `formatDateTimeForReceipt` chuẩn locale `vi-VN` và hỗ trợ đầy đủ các dạng đầu vào (chuỗi ngày `YYYY-MM-DD`, chuỗi ISO timestamp, giá trị null/undefined).
- Thay thế toàn bộ 26 nơi tự định nghĩa hàm cục bộ trong 26 component của `apps/web`.
- **Commit**: `3c03b5d`.

### 3.5. Hợp nhất `formatVnd`, `slugify`, `PHONE_REGEX` về `packages/shared`

- Tạo [packages/shared/src/constants/regex.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/constants/regex.ts) chứa `PHONE_REGEX`, `VN_PHONE_REGEX`, `TAX_ID_REGEX`, `NAME_REGEX`.
- Tạo [packages/shared/src/utils/currency.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/currency.ts) chứa `formatVnd`, `formatVndWithSuffix`, `formatCurrencyVnd`, `parseVnd`.
- Tạo [packages/shared/src/utils/slugify.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/slugify.ts) chứa `slugify`, `slugifyForSku`.
- Cập nhật toàn bộ các service phía API và tiện ích phía Web.
- **Commit**: `62714d7` (`refactor(shared): hợp nhất formatVnd, slugify, PHONE_REGEX dùng chung`).

### 3.6. Mô đun định giá dùng chung (Shared Pricing Module) & Server Recompute

- Tạo [packages/shared/src/utils/pricing.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/pricing.ts):
  - `calculateLineDiscount`: tính chiết khấu dòng (theo % hoặc tiền cố định), xử lý an toàn sản phẩm giá 0đ.
  - `calculateLineTotal`: tính thành tiền từng dòng.
  - `calculateOrderDiscount`: tính chiết khấu cấp đơn hàng (theo % hoặc tiền cố định).
  - `calculateOrderTotals`: tính toán toàn diện toàn bộ đơn hàng (gross, subtotal, discountAmount, total).
  - `allocateOrderDiscount`: phân bổ chiết khấu đơn theo tỷ lệ dòng, áp dụng quy tắc làm tròn dồn phần dư tiền tệ (Remainder Accumulation) vào dòng cuối cùng (tiền lệ từ `returns.service.ts`).
  - `calculateUnitConversionPrice`: tính đơn giá đơn vị quy đổi theo giá bán riêng hoặc hệ số quy đổi.
  - `validateOrderTotalsMatch`: đối chiếu dữ liệu giữa máy khách và máy chủ tính lại.
- Tích hợp vào [apps/api/src/services/orders.service.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/api/src/services/orders.service.ts) và [apps/web/src/stores/use-cart-store.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/stores/use-cart-store.ts).
- Viết 16 ca kiểm thử bao phủ toàn bộ trường hợp tại [packages/shared/src/utils/pricing.test.ts](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/packages/shared/src/utils/pricing.test.ts).
- **Commit**: `d9daf23`, `18d4ca6`.

---

### 3.7. Chuẩn hoá chuỗi tiếng Việt có dấu trong giao diện người dùng (Yêu cầu bổ sung từ Coordinator)

- **Hiện tượng**: Một số thành phần trên màn hình POS chứa chuỗi tiếng Việt không dấu (ví dụ: `Gio hang trong`, `Thanh toan (F2)`, `Tim kiem san pham`...).
- **Giải pháp**: Rà soát toàn bộ `apps/web/src` và chuẩn hoá toàn bộ chuỗi hiển thị sang tiếng Việt có dấu chuẩn ngữ pháp:
  - [apps/web/src/features/pos/components/PosScreen.tsx](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/features/pos/components/PosScreen.tsx): **6 chuỗi** (`Mở giỏ hàng: ...`, `Mở giỏ hàng trống`, `Giỏ hàng trống`, `Tổng: ...`, `Giỏ hàng`, `Danh sách sản phẩm trong giỏ hàng`).
  - [apps/web/src/features/pos/components/CartPanel.tsx](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/features/pos/components/CartPanel.tsx): **12 chuỗi** (`Giỏ hàng`, `Huỷ đơn` (aria-label + button text), `Giỏ hàng trống`, `Chọn sản phẩm để thêm vào giỏ hàng`, `Tổng tiền hàng (...)`, `Tổng thanh toán`, `Thanh toán (F2)`, `Huỷ đơn hàng` (title), `Bạn có chắc muốn huỷ đơn hàng này? Toàn bộ sản phẩm trong tab hiện tại sẽ bị xoá.`, `Quay lại`, `Huỷ đơn` (action)).
  - [apps/web/src/features/pos/components/KeyboardShortcutsTooltip.tsx](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/features/pos/components/KeyboardShortcutsTooltip.tsx): **7 chuỗi** (`Thanh toán`, `Ghi nợ (chưa kích hoạt)`, `Đơn hàng mới`, `Đóng hộp thoại`, `Tìm kiếm sản phẩm`, `Phím tắt` (aria-label + header)).
  - [apps/web/src/features/pos/components/StockInfoPopover.tsx](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t6-pha6-cleanup/apps/web/src/features/pos/components/StockInfoPopover.tsx): **7 chuỗi** (`Xem tồn kho`, `Tồn kho`, `Định mức tối thiểu`, `Trạng thái`, `Biến thể`, `Sản phẩm này không theo dõi tồn kho`, `Không tìm thấy thông tin`).
- **Tổng số lượng đã chuẩn hoá**: **32 chuỗi** trên **4 file** component giao diện POS.
- **Commit**: `29bd8c9` (`fix(web): chuẩn hoá chuỗi tiếng Việt có dấu trong giao diện POS`).

---

## 4. Kết Quả Kiểm Tra Chất Lượng (Verification Results)

### 4.1. Lệnh kiểm tra kiểu dữ liệu (`pnpm -r typecheck`)

```bash
$ pnpm -r typecheck
Scope: 4 of 5 workspace projects
packages/shared typecheck: Done
packages/notifications typecheck: Done
apps/web typecheck: Done
apps/api typecheck: Done
```

-> **Kết quả: Thành công 100% (0 lỗi type).**

### 4.2. Lệnh biên dịch dự án (`pnpm -r build`)

```bash
$ pnpm -r build
apps/web build: ✓ built in 730ms (PWA v1.2.0, 16 precache entries)
apps/web build: Done
apps/api build: Done
```

-> **Kết quả: Biên dịch thành công 100% toàn bộ gói ứng dụng.**

### 4.3. Lệnh kiểm tra định dạng mã nguồn (`pnpm lint`)

```bash
$ pnpm lint
✖ 6 problems (0 errors, 6 warnings)
```

-> **Kết quả: 0 lỗi (0 errors).**

### 4.4. Kiểm thử đơn lẻ (Unit & Integration Tests)

- **Gói `packages/shared`**:
  `pnpm vitest run --project shared src/utils/pricing.test.ts src/utils/currency.test.ts src/utils/slugify.test.ts`
  -> **3 files passed, 26/26 tests passed (100%).**
- **Gói `apps/web`**:
  `pnpm vitest run --project web src/lib/date.test.ts src/lib/api-error.test.ts`
  -> **2 files passed, 7/7 tests passed (100%).**
- **Gói `apps/api`**:
  `pnpm vitest run --project api src/lib/graceful-shutdown.test.ts src/services/supplier-payments.service.test.ts src/services/receipts.service.test.ts src/__tests__/logging.integration.test.ts`
  -> **4 files passed, 37/37 tests passed (100%).**

---

## 5. Danh Sách Commit Thực Hiện Trong Pha 6

1. `ed2ffd0`: `fix(api): truyền requestId xuyên suốt Hono context và logger (L28)`
2. `693714d`: `fix(api): đảm bảo chạy cleanup khi graceful shutdown bị timeout (L29)`
3. `ac5c9d9`: `refactor(api): hợp nhất parseDateRangeBoundary vào lib/timezone`
4. `62714d7`: `refactor(shared): hợp nhất formatVnd, slugify, PHONE_REGEX dùng chung`
5. `3c03b5d`: `refactor(web): hợp nhất formatDate, handleApiError và sửa toast lỗi lặp đôi (L27)`
6. `d9daf23`: `feat(shared): mô đun định giá dùng chung và máy chủ tự tính lại giá đơn hàng`
7. `18d4ca6`: `fix(shared): đồng bộ DiscountType export và null safety trong pricing utils`
8. `29bd8c9`: `fix(web): chuẩn hoá chuỗi tiếng Việt có dấu trong giao diện POS`
9. `4c0ecc0`: `docs(reports): hoàn thành báo cáo dọn dẹp mã nguồn và sửa lỗi tồn đọng Pha 6`
