# T10 — Khép lỗ hổng "máy chủ tin máy khách" về giá bán (G2)

## Bối cảnh

Điều phối viên rà soát bảo mật phát hiện 2 lỗ hổng còn lại trong luồng tạo đơn POS:

1. **Đơn giá không được đối chiếu**: `createOrder` (apps/api/src/services/orders.service.ts)
   ghi thẳng `item.unitPrice` do máy khách gửi. Schema chỉ kiểm tính nhất quán nội bộ
   (lineTotal = unitPrice\*quantity - discountAmount, subtotal = tổng lineTotal,
   total = subtotal - discountAmount) nên máy khách vẫn có thể gửi unitPrice tuỳ ý.
   Chỉ có nhánh M16 tính lại khi đơn vị quy đổi có giá <= 0.
2. **PIN sửa giá không được xác thực khi tạo đơn**: `priceOverridePinUsed` là boolean do
   máy khách gửi. Máy khách có thể tự đặt `priceOverride: true, priceOverridePinUsed: true`
   mà máy chủ không kiểm PIN. (Giao diện có gọi `/verify-pin` riêng, nhưng không có ràng buộc
   nào giữa lần xác thực đó và đơn hàng.)

Hệ quả: một tài khoản nhân viên gọi thẳng API có thể bán bất kỳ giá nào, không PIN, không audit.

## Việc phải làm

### 1. Máy chủ đối chiếu đơn giá với giá tự tính

- Tái sử dụng `resolveProductPrice` trong `apps/api/src/services/pricing.service.ts`
  (KHÔNG viết lại logic 6 bậc giá). Gọi cho từng dòng hàng với đúng
  `productId, variantId, unitConversionId, quantity, customerId`.
- Với dòng KHÔNG có `priceOverride`:
  - `unitPrice` khớp giá máy chủ tính -> hợp lệ.
  - Lệch (cao hơn hoặc thấp hơn) và `source === 'pos'` -> ném
    `ApiError('VALIDATION_ERROR', 'Đơn giá không khớp giá hệ thống, vui lòng tải lại giỏ hàng')`
    kèm chi tiết productId, giá gửi lên, giá máy chủ.
  - Lệch và `source === 'offline_sync'` -> KHÔNG từ chối (đơn đã thu tiền ngoại tuyến):
    dùng giá máy chủ để tính lại `unitPrice`, `lineTotal`, `subtotal`, `discountAmount`, `total`
    của đơn, ghi audit `order.price_mismatch_adjusted` và phát thông báo cảnh báo chủ cửa hàng
    (theo đúng tiền lệ đã áp dụng cho `order.debt_limit_exceeded` ở T2b — đọc code đó làm mẫu).
- Giữ nguyên nhánh M16 hiện có, hoặc gộp vào cơ chế mới nếu sạch hơn (không được mất hành vi).

### 2. Xác thực PIN thật cho sửa giá

- Bổ sung trường tuỳ chọn `priceOverridePin` ở CẤP ĐƠN trong `createOrderSchema`
  (packages/shared/src/schema/order-management.ts), giống cách `debtLimitOverridePin` đang làm.
- Trong `createOrder`: nếu có bất kỳ dòng nào `priceOverride === true` thì BẮT BUỘC gọi
  `verifyPin` (apps/api/src/services/pin.service.ts) đúng như luồng vượt hạn mức nợ ở dòng ~240.
  Thiếu PIN hoặc PIN sai -> ném lỗi như luồng nợ đang ném (giữ nhất quán mã lỗi).
  Chỉ khi PIN hợp lệ mới ghi `priceOverridePinUsed: true` (máy chủ tự quyết, không tin máy khách).
- Với `source === 'offline_sync'`: nếu không có PIN thì KHÔNG từ chối, mà xử lý như mục 1
  (dùng giá máy chủ + audit + cảnh báo).
- Giao diện POS: truyền PIN mà người dùng vừa nhập trong `EditUnitPriceDialog` xuống
  `PaymentDialog`/`PosScreen` để gửi kèm khi tạo đơn. KHÔNG lưu PIN vào localStorage/IndexedDB,
  chỉ giữ trong bộ nhớ phiên bán hàng, xoá sau khi tạo đơn xong.

### 3. Kiểm thử

Bổ sung integration test (PGlite, theo mẫu `apps/api/src/__tests__/`):

- POS gửi `unitPrice` thấp hơn giá hệ thống, không override -> 400/VALIDATION_ERROR, không tạo đơn.
- POS gửi `priceOverride: true` không kèm PIN -> bị từ chối.
- POS gửi `priceOverride: true` kèm PIN đúng -> tạo đơn, `priceOverridePinUsed = true`, có audit.
- Đơn ngoại tuyến (`/sync/push`) gửi giá lệch -> vẫn tạo đơn, tổng tiền theo giá máy chủ,
  có audit và thông báo cảnh báo.
- Đơn POS bình thường (giá đúng, giá theo bảng giá / giá riêng khách / giá sỉ theo bậc /
  đơn vị quy đổi) -> KHÔNG bị từ chối nhầm.

## Ràng buộc bắt buộc

- KHÔNG chạy `pnpm test` toàn bộ (máy đang bị nghẽn CPU). Chỉ chạy đúng phạm vi:
  `pnpm vitest run --project api <đường dẫn file test liên quan>` cho các file:
  pos-debt, orders, sync, sync-orders-h8-m26, volume-prices, customer-prices,
  price-lists, category-discounts, unit-conversions, và file test mới của bạn.
  Sau đó `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build`.
- Nhánh làm việc: nhánh hiện tại của thư mục này. Commit tiếng Việt có dấu.
  KHÔNG merge, KHÔNG tạo pull request.
- Viết báo cáo `docs/reports/t10-gia-server.md`: hiện tượng, nguyên nhân gốc, cách xử lý,
  bảng file thay đổi, kết quả chạy kiểm thử THẬT (dán số liệu thật, không phỏng đoán).
- Toàn bộ chuỗi hiển thị và bình luận bằng tiếng Việt CÓ DẤU.
