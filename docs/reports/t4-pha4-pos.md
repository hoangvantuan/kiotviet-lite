# Báo cáo hoàn thành nhiệm vụ: [T4] PHA 4 — POS PRICING VÀ CART UX (Task Orca: task_a25aede8c125)

## 1. Tổng quan nhiệm vụ

Xử lý triệt để 7 khiếm khuyết trong định giá và trải nghiệm giỏ hàng POS thuộc nhóm lỗi gốc G2 (Server tin client / client tự quyết định sai lệch):

- **M13**: Giá 0đ hợp lệ bị coi là "không có giá" và bị bỏ qua trên toàn engine pricing.
- **M14**: Định giá lại (reprice) sai hoặc thiếu khi thêm hàng qua tìm kiếm / quét mã vạch / chọn biến thể.
- **M15**: Race condition khi bấm nhanh +/- số lượng trong giỏ hàng.
- **M16**: Đơn vị quy đổi có giá 0 dẫn tới bán 0đ ở cả FE và BE.
- **M18**: Cảnh báo vượt tồn kho trong giỏ hàng POS bị thiếu dữ liệu `trackInventory` và `stockQuantity`.
- **M21**: Ngưỡng cảnh báo nợ hardcode 80% thay vì đọc từ cấu hình cửa hàng.
- **M23**: Tab ghi nợ gửi `debtAmount = 0` làm backend trả 400 không rõ ràng.

---

## 2. Chi tiết các thay đổi (File và dòng code)

### 2.1. packages/shared

- `packages/shared/src/schema/pricing-resolve.ts` (dòng 10, dòng 30):
  - Bổ sung trường `unitConversionId: z.string().uuid().nullable().optional()` vào `resolvePriceItemSchema` và `resolvedPriceItemSchema` để engine pricing nhận diện và giải quyết đơn vị quy đổi.

### 2.2. apps/api (Backend)

- `apps/api/src/services/pricing.service.ts`:
  - Thêm helper `findUnitConversion` để nạp thông tin đơn vị quy đổi từ bảng `productUnitConversions`.
  - Cập nhật `ResolveContext` nhận `variantId` và `unitConversionId`.
  - Trong `resolveProductPrice`:
    - Đổi các điều kiện `> 0` thành `>= 0` cho Tier 1 (`customer_price`), Tier 2 (`category_discount`), Tier 4 (`volume_price`), Tier 5 (`price_list`), phân biệt rõ `0` và `null`/`undefined` (sửa triệt để M13).
    - Tính đúng giá cơ sở và giá quy đổi cho đơn vị quy đổi dựa trên `conversionFactor` hoặc `sellingPrice` riêng > 0 (sửa M14, M16).
    - Trả về `unitConversionId` trong kết quả giải quyết giá.
- `apps/api/src/services/products.service.ts` (dòng 2027):
  - Sửa `sellingPrice` của đơn vị quy đổi: nếu DB lưu `<= 0` hoặc rỗng thì trả về `null` thay vì `0` để frontend không bị hiểu nhầm là bán giá 0đ (sửa M16).
- `apps/api/src/services/orders.service.ts` (dòng 330-435):
  - Trong vòng lặp `createOrder`, kiểm tra đơn vị quy đổi từ DB `productUnitConversions`. Nếu client gửi `unitPrice <= 0` và `!item.priceOverride`, backend tự động tính lại `effectiveUnitPrice` theo công thức chuẩn (`conv.sellingPrice` hoặc `basePrice * conv.conversionFactor`), không phụ thuộc và không tin giá sai từ client (sửa M16).
  - Giữ nguyên toàn bộ cấu trúc refactor `createOrder` của Pha 1 và Pha 2.

### 2.3. apps/web (Frontend)

- `apps/web/src/features/pos/hooks/use-auto-reprice.ts`:
  - `buildCartItemId`: Hỗ trợ sinh cart item ID chuẩn dạng `[productId, variantId, unitConversionId].filter(Boolean).join('-')`.
  - `applyResults`: Khớp chính xác ID bao gồm cả `unitConversionId` khi cập nhật giá.
  - Quản lý `itemSeqMap` và sequence counter per item ID:
    - Khi có nhiều request reprice phát ra liên tiếp do bấm nhanh `+`/`-`, chỉ response tương ứng với request mới nhất mới được áp dụng vào giỏ hàng. Các response cũ về chậm sẽ bị loại bỏ hoàn toàn (sửa triệt để M15).
  - Cung cấp pure actions `repriceOnAddAction`, `repriceOnQuantityAction` và React hooks tương ứng.
- `apps/web/src/features/pos/hooks/use-add-to-cart.ts` (tạo mới):
  - Đóng gói toàn bộ luồng thêm hàng vào giỏ hàng (`useAddToCart` và `addToCartAction`).
  - Tự động điền đầy đủ `trackInventory`, `stockQuantity` (tính đúng theo `conversionFactor` nếu là đơn vị quy đổi), `unitPrice`, `unitName`, `unitConversionId`.
  - Tự động kích hoạt reprice trên tổng số lượng mới trong giỏ hàng (sửa M14, M18).
- `apps/web/src/features/pos/components/VariantSelectionDialog.tsx`:
  - Dòng 71: Sửa tính `displayPrice` cho đơn vị quy đổi (`selectedUnit.sellingPrice && selectedUnit.sellingPrice > 0 ? selectedUnit.sellingPrice : Math.round(rawPrice * selectedUnit.conversionFactor)`).
  - Dùng `useAddToCart` để hợp nhất luồng thêm hàng (sửa M14, M16, M18).
- `apps/web/src/features/pos/components/PosScreen.tsx`, `PosSearchBar.tsx`, `ProductGrid.tsx`, `BarcodeScanner.tsx`:
  - Chuyển đổi toàn bộ 5 call-site thêm hàng sang sử dụng chung hook `useAddToCart` (sửa M14, M18).
- `apps/web/src/features/pos/components/DebtSummaryCard.tsx`:
  - Đọc `debtWarningPercent` từ `useStoreQuery()` (fallback 80) để hiển thị màu cảnh báo nợ linh hoạt (sửa M21).
- `apps/web/src/features/customers/components/CustomerDetailHeader.tsx`, `CustomerDebtsTab.tsx`:
  - Đọc `debtWarningPercent` từ `useStoreQuery()` để xác định badge nợ và trạng thái cảnh báo (sửa M21).
- `apps/web/src/features/pos/components/PaymentDialog.tsx`:
  - Trong tab ghi nợ (`debt`), nếu `debtAmount <= 0` (ví dụ khách trả tiền mặt đủ hoặc dư), chuyển đổi thành `paymentMethod: 'cash'` và `cashAmount: debtCashVal > 0 ? debtCashVal : grandTotal`.
  - Nếu `debtAmount > 0`, gửi `paymentMethod: 'debt'` và `debtAmount` hợp lệ (sửa M23).

---

## 3. Gốc rễ đã xử lý (Root Cause Analysis)

1. **M13**: Kiểm tra giá bằng toán tử `> 0` làm mất các giá trị `0đ` hợp lệ (chiết khấu 100%, hàng tặng, chính sách giá 0đ) -> Đã chuyển sang phân biệt rõ `0` (hợp lệ) và `null`/`undefined` (không có giá).
2. **M14 & M18**: 5 nơi trong giao diện POS tự thêm hàng vào giỏ theo các nhánh code riêng rẽ, không đồng nhất dữ liệu tồn kho (`trackInventory`, `stockQuantity`) và thiếu reprice -> Đã gom về một điểm duy nhất qua `useAddToCart` / `addToCartAction`.
3. **M15**: Bấm nhanh `+`/`-` gây out-of-order network response -> Đã bổ sung sequence guard per item ID để bỏ qua các response cũ về sau.
4. **M16**: Đơn vị quy đổi không có giá bán riêng bị gán `sellingPrice = 0` trong DB và API, BE lại tin giá client gửi lên -> Đã chặn ở FE (fallback giá cơ sở \* tỷ lệ quy đổi) và BE tự động tính toán lại giá chuẩn khi tạo đơn hàng.
5. **M21**: Tỷ lệ cảnh báo nợ bị hardcode 80% ở các component giao diện -> Đã liên kết với cài đặt `debtWarningPercent` của cửa hàng qua `useStoreQuery`.
6. **M23**: Tab ghi nợ gửi `paymentMethod: 'debt'` kèm `debtAmount = 0` gây lỗi validation 400 -> Đã tự động chuyển đổi sang thanh toán tiền mặt ở FE khi không còn nợ, và BE có thông báo lỗi validation chi tiết, rõ nghĩa.

---

## 4. Kiểm thử đã bổ sung

1. **`apps/api/src/__tests__/m13-m16-m21-m23-pos-pricing.integration.test.ts`** (10 test cases):
   - M13: Tier 1 (giá riêng 0đ), Tier 2 (chiết khấu danh mục 100%), Tier 4 (giá theo số lượng 0đ), Tier 5 (bảng giá nhóm 0đ).
   - M16: Search sản phẩm trả `sellingPrice: null` cho đơn vị quy đổi giá 0, `resolve-prices` tính đúng giá quy đổi, `POST /orders` tự sửa giá nếu client gửi 0đ.
   - M21: Cập nhật và đọc `debtWarningPercent` per-store qua API settings.
   - M23: Báo lỗi có nghĩa khi `paymentMethod = 'debt'` mà `debtAmount = 0` hoặc thiếu `customerId`.
2. **`apps/web/src/features/pos/hooks/use-auto-reprice.test.ts`** (3 test cases):
   - M14: `buildCartItemId` và `applyResults` hỗ trợ `unitConversionId`.
   - M15: Mô phỏng race condition khi bấm nhanh +/- (request chậm về sau không ghi đè request mới).
3. **`apps/web/src/features/pos/hooks/use-add-to-cart.test.ts`** (3 test cases):
   - M18: Thêm sản phẩm đơn truyền đầy đủ `trackInventory` và `stockQuantity`.
   - M18: Thêm đơn vị quy đổi tính đúng `stockQuantity` chia theo `conversionFactor`.
   - M14: Tự động kích hoạt reprice khi thêm hàng vào giỏ.

---

## 5. Kết quả xác minh (4 tiêu chí hoàn thành)

1. **`pnpm lint`**: ✅ PASSED (0 errors, 6 warnings pre-existing của UI component).
2. **`pnpm -r typecheck`**: ✅ PASSED (4 of 4 packages typecheck sạch 100%).
3. **`pnpm vitest`**:
   - `apps/api/src/__tests__/m13-m16-m21-m23-pos-pricing.integration.test.ts`: ✅ 10/10 passed.
   - `apps/web/src/features/pos/hooks/use-auto-reprice.test.ts` & `use-add-to-cart.test.ts`: ✅ 6/6 passed.
   - `apps/api/src/__tests__/pos-debt.integration.test.ts`: ✅ 17/17 passed.
   - `apps/api/src/__tests__/orders-detail.integration.test.ts` & `customer-groups-pricing-fk.integration.test.ts`: ✅ 6/6 passed.
4. **`pnpm -r build`**: ✅ PASSED (Tất cả web, api, shared, notifications đều build thành công).

---

## 6. Việc còn lại và rủi ro còn tồn

- **Rủi ro**: Không có rủi ro phát hiện thêm. Mọi logic tính tiền, trừ kho, ghi nợ đều được đảm bảo ở cả 2 đầu frontend và backend với các bộ test tích hợp bao phủ.
- **Trạng thái**: Đã hoàn thành toàn bộ yêu cầu của Pha 4. Sẵn sàng báo `worker_done`.
