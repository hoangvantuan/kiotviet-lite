# Báo cáo Thực hiện Gói Công việc T2: Đồng bộ Ngoại tuyến và Hợp nhất Tạo Đơn (Phase 2 - Sync & Order Creation)

## 1. Tổng quan Mục tiêu và Phạm vi

Gói công việc T2 tập trung khắc phục triệt để các lỗi nghiêm trọng (H8, H9, H12, M22, M26) thuộc hệ thống đồng bộ ngoại tuyến (offline sync) và luồng xử lý đơn hàng POS, loại bỏ mã nguồn sao chép trôi dạt (code drift), bảo đảm tính toàn vẹn dữ liệu, kiểm toán và độ ổn định khi mất kết nối mạng.

---

## 2. Chi tiết các Hạng mục đã Thực hiện

### 2.1. H8 và M26: Hợp nhất Luồng Tạo Đơn Hàng Backend (Backend Order Creation Unification)

- **Vấn đề trước khi sửa**: Tuyến đường đồng bộ ngoại tuyến `/api/v1/sync/push` sử dụng hàm sao chép riêng biệt `processSyncOrder` gây trôi dạt logic: không ghi nhật ký kiểm toán (audit log) `order.created`, không ghi log nợ `debt.created`, bỏ qua kiểm tra hạn mức công nợ (debt limit check), không phát sự kiện cảnh báo giá vốn / tồn kho âm, và thiếu kiểm tra quan hệ sở hữu đối với đơn vị quy đổi (M26).
- **Giải pháp thực hiện**:
  - Mở rộng hàm `createOrder` trong [`orders.service.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/api/src/services/orders.service.ts) nhận các tham số bổ sung: `source` (nguồn tạo đơn, ví dụ: `'pos'` hoặc `'offline_sync'`), `clientId` (mã định danh duy nhất phía máy trạm), `skipDebtLimitCheck`.
  - Bổ sung cơ chế chống trùng đơn tuần tự và bắt lỗi tranh chấp khóa duy nhất `uniq_orders_store_client` khi có yêu cầu đồng thời, trả về bản ghi đơn đã tạo với cờ `isDuplicate: true`.
  - Khắc phục lỗi M26: bổ sung kiểm tra bắt buộc `productId` và `storeId` khi truy vấn bảng quy đổi đơn vị `productUnitConversions`, ném lỗi `VALIDATION_ERROR` nếu đơn vị quy đổi không thuộc về sản phẩm hoặc cửa hàng hiện tại.
  - Xóa bỏ hoàn toàn hai hàm sao chép trôi dạt `processSyncOrder` và `generateSyncOrderNumber` trong [`sync.routes.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/api/src/routes/sync.routes.ts), chuyển toàn bộ tuyến `/push` sang gọi trực tiếp `createOrder`.
  - Đồng nhất Zod schema `syncPushOrderDataSchema` và `syncPushOrderItemSchema` dùng chung `createOrderSchema` và `createOrderItemSchema` trong gói chia sẻ [`sync-management.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/packages/shared/src/schema/sync-management.ts).
- **Kiểm thử tích hợp**:
  - Tạo mới bộ kiểm thử tích hợp [`sync-orders-h8-m26.integration.test.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/api/src/__tests__/sync-orders-h8-m26.integration.test.ts) kiểm tra toàn diện 8 trường hợp: chống trùng đơn, ghi nhật ký kiểm toán đầy đủ, chặn vượt hạn mức nợ khi không có mã PIN, cho phép nợ khi có mã PIN phê duyệt hợp lệ, từ chối quy đổi sai sản phẩm, từ chối quy đổi sai cửa hàng, tính đúng tồn kho theo hệ số quy đổi, và phát sinh cảnh báo bán dưới giá vốn. Kết quả đạt 8/8 bài kiểm tra.

### 2.2. H9: Khắc phục Kẹt Đồng bộ khi Hết hạn Mã Xác thực (Token Expiration Sync Recovery)

- **Vấn đề trước khi sửa**: Các module [`order-sync.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/lib/order-sync.ts) và [`sync-engine.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/lib/sync-engine.ts) sử dụng hàm `fetch` tự chế không có cơ chế tự động làm mới mã truy cập (token refresh), dẫn tới việc đồng bộ bị kẹt vĩnh viễn khi mã xác thực hết hạn sau 15 phút. Người dùng không có giao diện xem lý do lỗi hoặc thử lại từng đơn.
- **Giải pháp thực hiện**:
  - Chuyển toàn bộ các lệnh gọi API sang `apiFetch` trong [`api-client.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/lib/api-client.ts) (tự động xử lý HTTP 401 qua tuyến `/api/v1/auth/refresh`).
  - Thêm các hàm `resetSingleErrorOrder` và `retrySingleOrder` trong [`offline-orders.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/lib/offline-orders.ts) và [`order-sync.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/lib/order-sync.ts).
  - Nâng cấp giao diện thành phần [`OfflineIndicator.tsx`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/components/shared/OfflineIndicator.tsx): hiển thị danh sách chi tiết các đơn hàng lỗi kèm mã đơn, tổng tiền, thông báo lỗi cụ thể, nút "Thử lại tất cả" và nút "Thử lại" cho từng đơn riêng biệt.
  - Tích hợp `OfflineIndicator` vào thanh tiêu đề bán hàng [`PosHeader.tsx`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/features/pos/components/PosHeader.tsx).

### 2.3. H12: Khắc phục Sập Hộp thoại Hoàn tất Đơn Ngoại tuyến (Offline Checkout Crash Fix)

- **Vấn đề trước khi sửa**: Khi hoàn tất thanh toán ngoại tuyến, hàm `useCheckoutMutation` chỉ trả về đối tượng `{ data: { id: clientId, offline: true } }` dẫn tới việc hộp thoại [`OrderCompletionDialog.tsx`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/features/pos/components/OrderCompletionDialog.tsx) bị sập (crash) do truy cập thuộc tính `items` không tồn tại.
- **Giải pháp thực hiện**:
  - Sửa [`use-checkout.ts`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/features/pos/hooks/use-checkout.ts) để dựng và trả về đối tượng `OrderDetail` hoàn chỉnh từ dữ liệu giỏ hàng (bao gồm mã đơn giả lập dạng `OFFLINE-XXXXXXXX`, danh sách `items`, tiền thối lại `change`, trạng thái thanh toán `paymentStatus`, công nợ).
  - Bổ sung cơ chế phòng thủ an toàn `(order.items ?? [])` và tính toán số tiền đã trả `paidAmount` an toàn trong [`OrderCompletionDialog.tsx`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/features/pos/components/OrderCompletionDialog.tsx).

### 2.4. M22: Kích hoạt Theo dõi Trạng thái Mạng (Network Status Hook Activation)

- **Vấn đề trước khi sửa**: Hook `useNetworkStatus` tại `apps/web/src/hooks/use-network-status.ts` không được gọi ở bất kỳ đâu, khiến ứng dụng không tự động chuyển đổi trạng thái mạng trong kho lưu trữ trạng thái.
- **Giải pháp thực hiện**: Kích hoạt gọi trực tiếp hook `useNetworkStatus()` tại thành phần gốc `RootComponent` trong [`router.tsx`](file:///Users/tuanhv/orca/workspaces/kiotviet-lite/t2-pha2-sync/apps/web/src/router.tsx).

---

## 3. Kết quả Xác minh và Kiểm thử (Verification Results)

1. **Kiểm tra cú pháp và định dạng (Lint)**:
   - Lệnh: `pnpm lint`
   - Kết quả: **Thành công (0 lỗi, 6 cảnh báo không chặn)**.
2. **Kiểm tra kiểu dữ liệu toàn bộ dự án (Typecheck)**:
   - Lệnh: `pnpm -r typecheck`
   - Kết quả: **Thành công 100% trên cả 4 gói (shared, api, web, notifications)**.
3. **Kiểm thử tích hợp (Integration Tests)**:
   - `pnpm vitest run --project api src/__tests__/sync-orders-h8-m26.integration.test.ts`: **8/8 bài kiểm tra ĐẠT**.
   - `pnpm vitest run --project api src/__tests__/crit-c1-sync-dedup.integration.test.ts`: **2/2 bài kiểm tra ĐẠT**.
   - `pnpm vitest run --project api src/__tests__/pos-debt.integration.test.ts`: **17/17 bài kiểm tra ĐẠT**.
   - `pnpm vitest run packages/shared/`: **495/495 bài kiểm tra ĐẠT**.
4. **Biên dịch toàn bộ dự án (Build)**:
   - Lệnh: `pnpm -r build`
   - Kết quả: **Biên dịch thành công toàn bộ gói giao diện web và dịch vụ api**.
