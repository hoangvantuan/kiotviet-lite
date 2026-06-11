# Code Review toàn diện: kiotviet-lite

- **Ngày**: 2026-06-12
- **Phạm vi**: toàn bộ source code (568 file TS/TSX)
- **Phương pháp**: 9 góc tìm song song (line-by-line, removed-behavior, cross-file, language-pitfall, wrapper/proxy, reuse, simplification, efficiency, altitude) + xác minh từng candidate + quét bổ sung
- **Tổng phát hiện xác minh**: 26 lỗi (4 critical, 8 high, 13 medium, 1 low)

## Mục lục

1. [Tóm tắt ưu tiên hành động](#1-tom-tat-uu-tien-hanh-dong)
2. [CRITICAL: Mất tiền, hàng, quyền kiểm soát](#2-critical)
3. [HIGH: Sai số liệu, mất tính năng, gián đoạn vận hành](#3-high)
4. [MEDIUM: Sai giá, tính năng hỏng, UX lỗi](#4-medium)
5. [LOW: UX nhỏ, phòng ngừa](#5-low)
6. [Cleanup và hiệu năng (không phải bug)](#6-cleanup)
7. [Phân tích gốc rễ](#7-phan-tich-goc-re)

---

## 1. Tóm tắt ưu tiên hành động

### Sprint ngay (tuần này)

| # | Lỗi | Tác hại | Effort |
|---|------|---------|--------|
| C1 | Đơn offline sync tạo đôi | Trừ kho + ghi nợ gấp 2 | Medium |
| C2 | Server không validate tổng tiền đơn | Trừ kho miễn phí, doanh thu ghi 0 | Small |
| C3 | Phiếu trả hàng trùng orderItemId | Hoàn tiền gấp N lần | Small |
| C4 | Tạo owner thứ 2 chiếm quyền | Mất quyền kiểm soát cửa hàng | Small |
| H5 | Đơn partial_return biến mất khỏi báo cáo | Doanh thu sai hàng triệu | Medium |
| H6 | Hoàn tiền bỏ chiết khấu | Lỗ tiền mỗi phiếu trả | Small |

### Sprint sau

| # | Lỗi | Tác hại | Effort |
|---|------|---------|--------|
| H7 | Nợ 2 nguồn lệch, currentDebt âm | Đòi nợ sai, số liệu mâu thuẫn | Medium |
| H8 | Sync offline trôi dạt (mất audit/hạn mức) | Bypass chính sách bán hàng | Large |
| H9 | Sync kẹt vĩnh viễn khi token hết hạn | Mất đơn offline | Medium |
| H10 | Refresh token rotation race | Replay attack | Medium |
| H11 | Báo cáo lệch 7h timezone | Doanh thu theo ngày sai | Medium |
| H12 | Offline checkout crash dialog | Màn POS vỡ | Small |

### Backlog

Tất cả lỗi MEDIUM (M13-M26) và cleanup items.

---

## 2. CRITICAL

### C1. Đơn offline sync tạo đôi, trừ kho và ghi nợ gấp 2 lần

- **File**: `apps/api/src/routes/sync.routes.ts:333`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Chống trùng đơn offline bằng `SELECT note LIKE '%offline:<clientId>%'` nằm NGOÀI transaction
  - Không lock, không unique constraint theo clientId
  - Schema bảng `orders` không có cột `clientId` riêng, clientId nhét vào cột `note` dạng text
- **Kịch bản kích hoạt**:
  1. Client push batch 50 đơn, mạng rớt giữa chừng khi server xử lý đơn 30
  2. Client retry sau 2 giây (order-sync.ts retry logic) trong khi server vẫn chạy tiếp
  3. Request retry SELECT dedup đơn 31 trước khi transaction gốc commit
  4. Cả 2 request tạo đơn thành công: kho bị trừ 2 lần, nợ khách ghi 2 lần
- **Hậu quả**: Tồn kho âm hoặc thiếu so với thực tế, công nợ khách sai
- **Cách sửa**:
  1. Thêm cột `clientId` vào bảng `orders` với unique index `(storeId, clientId)`
  2. Đưa check dedup VÀO transaction, dùng `INSERT ... ON CONFLICT DO NOTHING` hoặc `SELECT ... FOR UPDATE`
  3. Hoặc tốt hơn: gọi thẳng `createOrder` từ service thay vì copy logic vào route

### C2. Server không validate tổng tiền đơn hàng, cho phép trừ kho doanh thu 0

- **File**: `apps/api/src/services/orders.service.ts:216`
- **Schema**: `packages/shared/src/schema/order-management.ts`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Zod refine check từng dòng: `lineTotal === unitPrice * quantity - discountAmount` (OK)
  - Zod refine check tổng: `total === subtotal - discountAmount` (OK)
  - THIẾU: `subtotal === sum(items[].lineTotal)` (KHÔNG CÓ)
  - Server insert trực tiếp `input.subtotal` và `input.total` mà không tính lại
- **Kịch bản kích hoạt**:
  ```json
  {
    "items": [
      {"productId": "X", "unitPrice": 100000, "quantity": 3, "discountAmount": 0, "lineTotal": 300000}
    ],
    "subtotal": 0,
    "discountAmount": 0,
    "total": 0,
    "paymentMethod": "cash",
    "cashAmount": 0
  }
  ```
  Zod pass vì: lineTotal khớp (item level), total(0) === subtotal(0) - discountAmount(0), cashAmount(0) >= total(0).
- **Hậu quả**: Kho trừ 3 sản phẩm, đơn hàng ghi doanh thu 0đ. Thất thoát hàng không dấu vết.
- **Cách sửa**: Thêm superRefine kiểm tra `subtotal === items.reduce((s, i) => s + i.lineTotal, 0)`. Hoặc tốt hơn: server tự tính subtotal/total từ items, không tin client.

### C3. Phiếu trả hàng cho phép trùng orderItemId, hoàn tiền gấp N lần

- **File**: `apps/api/src/services/returns.service.ts:246`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Vòng lặp `for (const returnItem of input.items)` tra `itemMap.get(returnItem.orderItemId)`
  - `itemMap` là snapshot từ DB đầu transaction, không cập nhật sau mỗi vòng
  - Schema zod chỉ có `.min(1)` trên quantity, không chặn trùng orderItemId
  - Bảng `order_return_items` không có unique index `(returnId, orderItemId)`
- **Kịch bản kích hoạt**:
  ```json
  {
    "items": [
      {"orderItemId": "X", "quantity": 5},
      {"orderItemId": "X", "quantity": 5}
    ]
  }
  ```
  Dòng hàng mua 5 cái. Cả 2 dòng đều thấy remaining = 5 - 0 = 5 nên pass. Kết quả: trả 10/5 cái.
- **Hậu quả**: Hoàn tiền gấp đôi, tồn kho cộng thừa. Khai thác được không giới hạn qua API.
- **Cách sửa**:
  1. Schema: thêm refine đảm bảo orderItemId không trùng trong mảng items
  2. Hoặc service: gộp các dòng cùng orderItemId trước khi xử lý
  3. DB: thêm unique index `(returnId, orderItemId)` phòng vệ sâu

### C4. Có thể tạo owner thứ 2, chiếm quyền cửa hàng

- **File**: `apps/api/src/services/users.service.ts:76`
- **Verdict**: CONFIRMED
- **Cơ chế (chuỗi 3 lỗ hổng)**:
  1. `userRoleSchema = z.enum(['owner', 'manager', 'staff'])` chấp nhận 'owner'
  2. `createUser` dòng 86 gán `role: input.role` trực tiếp, không kiểm tra
  3. `lockUser` chỉ chặn tự khóa, không chặn owner khóa owner khác
  4. `updateUser` chỉ chặn tự hạ cấp, không chặn owner hạ cấp owner khác
- **Kịch bản kích hoạt**:
  1. Owner A tạo user B với `role: 'owner'`
  2. Owner B gọi `PATCH /users/{ownerA}/lock` hoặc `PATCH /users/{ownerA}` với `{role: 'staff'}`
  3. Owner A mất quyền truy cập
- **Cách sửa**:
  1. Schema `createUserSchema`: loại trừ 'owner' bằng `.refine(r => r !== 'owner')` hoặc dùng `z.enum(['manager', 'staff'])`
  2. `updateUser` + `lockUser`: thêm guard `if (target.role === 'owner') throw FORBIDDEN`

---

## 3. HIGH

### H5. Báo cáo doanh thu mất toàn bộ đơn bị trả hàng một phần

- **File**: `apps/api/src/services/revenue-report.service.ts:63` (lặp tại dashboard.service.ts:88, profit-report.service.ts:41, và ~15 chỗ khác)
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - `createReturn` đổi `orders.status` thành `'partial_return'` hoặc `'full_return'`
  - Mọi query doanh thu lọc cứng `eq(orders.status, 'completed')`
  - Không query nào từ bảng `order_returns` để trừ phần đã trả
- **Kịch bản**: Đơn 10 triệu, trả 1 món 100k → toàn bộ 10 triệu biến mất khỏi mọi báo cáo
- **Cách sửa**: Đổi filter thành `in(orders.status, ['completed', 'partial_return'])` VÀ trừ tổng refund từ `order_returns`. Hoặc giữ status `completed` cho đơn trả 1 phần và chỉ đổi khi trả toàn bộ.

### H6. Hoàn tiền bỏ qua chiết khấu, luôn hoàn nhiều hơn khách trả

- **File**: `apps/api/src/services/returns.service.ts:254`
- **Verdict**: CONFIRMED
- **Cơ chế**: `lineTotal = Number(existing.unitPrice) * returnItem.quantity`. Không đọc `orderItems.discountAmount` hay `orderItems.lineTotal`, không phân bổ `orders.discountAmount`.
- **Kịch bản**: Dòng unitPrice 100k, qty 2, discount 40k → khách trả 160k. Trả cả 2: hoàn 200k thay vì 160k.
- **Cách sửa**: Tính theo tỷ lệ: `refundPerUnit = existing.lineTotal / existing.quantity`, rồi `refundAmount = refundPerUnit * returnQuantity`. Cũng nên phân bổ chiết khấu cấp đơn theo tỷ lệ dòng.

### H7. Điều chỉnh nợ làm 2 nguồn nợ lệch vĩnh viễn, currentDebt có thể âm

- **File**: `apps/api/src/services/debt-adjustments.service.ts:195`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - `createDebtAdjustment` chỉ `UPDATE customers SET currentDebt = input.newAmount`
  - Không đụng bảng `debts` (chứa chi tiết nợ theo đơn, cột `remaining`)
  - Các luồng khác (receipts, returns) dùng `debts.remaining` để quyết định trừ nợ
- **Kịch bản**: Nợ 500k từ đơn A → owner điều chỉnh về 0 → `currentDebt=0` nhưng `debts.remaining=500k` → trả hàng 200k thuộc đơn A → `currentDebt = -200k`
- **Cách sửa**: Khi điều chỉnh, phải settle các `debts.remaining` tương ứng (gán remaining=0 cho nợ cũ, hoặc tạo bản ghi adjustment trong bảng debts).

### H8. processSyncOrder là bản copy trôi dạt của createOrder

- **File**: `apps/api/src/routes/sync.routes.ts:322`
- **Verdict**: CONFIRMED
- **Khác biệt so với createOrder đã xác minh**:

  | Tính năng | createOrder | processSyncOrder |
  |-----------|------------|-----------------|
  | Retry trùng mã đơn | while loop MAX_ATTEMPTS=3 | Không có, fail = INTERNAL_ERROR |
  | escapeLikePattern | Có (orders.service.ts:116) | Không (vô hại hiện tại vì prefix không chứa ký tự đặc biệt) |
  | Audit bán dưới giá vốn | emitEvent 'audit.price_override' | Không có |
  | Check hạn mức nợ | Lock customer FOR UPDATE, check limit, yêu cầu PIN override | Comment: "skip limit check, client already committed" |
  | Validate customer thuộc store | `eq(customers.storeId, actor.storeId)` | Không check storeId khi update nợ |

- **Cách sửa**: Refactor `createOrder` thành hàm nhận option `{ source: 'pos' | 'offline_sync', clientId?: string, skipDebtLimitCheck?: boolean }`, loại bỏ bản copy trong sync.routes.

### H9. Sync offline kẹt vĩnh viễn khi token hết hạn (TTL 15 phút)

- **File**: `apps/web/src/lib/order-sync.ts:30`, `apps/web/src/lib/sync-engine.ts:40`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Hai file tự chế `fetchWithRetry` dùng `fetch()` trực tiếp, bypass `api-client.ts` (nơi có refresh token logic)
  - 401 → `throw new Error('Unauthorized')` nằm TRONG `try-catch` của retry loop → retry 3 lần vô ích (~10 giây)
  - Sau retry hết: `catch` ngoài gọi `markOrderError(pglite, o.clientId, ...)` cho TOÀN BỘ đơn pending
  - `retryErrorOrders` và `resetErrorOrders` KHÔNG có call-site nào trong toàn bộ apps/web
  - Nút "Đồng bộ ngay" (OfflineIndicator) chỉ hiện khi `pendingOrderCount > 0`, sau mark error thì pending = 0
- **Hậu quả**: Đơn offline kẹt ở trạng thái 'error' không có đường thoát. Doanh thu và tồn kho server không bao giờ nhận.
- **Cách sửa**: Dùng `apiFetch` từ `api-client.ts` thay vì tự chế fetch. Hoặc ít nhất: phát hiện 401 → gọi refresh → retry, và thêm nút/cơ chế retry đơn lỗi trong UI.

### H10. Refresh token rotation race condition

- **File**: `apps/api/src/services/auth.service.ts:194`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - SELECT + check `revokedAt` (dòng 194-197): ngoài transaction
  - UPDATE revoke + INSERT token mới (dòng 221-231): trong transaction, nhưng UPDATE `WHERE eq(refreshTokens.id, stored.id)` KHÔNG kèm `AND revokedAt IS NULL`
  - Reuse detection (dòng 197-207) chỉ thấy token đã revoke TRƯỚC khi SELECT
- **Kịch bản**: Request A + B cùng token đồng thời → cả hai SELECT thấy revokedAt=null → A revoke+tạo T1, B ghi đè revokedAt+tạo T2 → 2 phiên hợp lệ từ 1 token
- **Cách sửa**: Đưa SELECT vào transaction với `FOR UPDATE`, hoặc dùng `UPDATE ... SET revokedAt = now() WHERE id = X AND revokedAt IS NULL RETURNING *` (atomic check-and-revoke, nếu affected=0 thì token đã bị dùng).

### H11. Báo cáo doanh thu lệch 7 tiếng do timezone UTC

- **File**: `apps/api/src/services/revenue-report.service.ts:28` (lặp tại profit-report.service.ts:11)
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Server ghim khoảng: `new Date(from + 'T00:00:00Z')` / `new Date(to + 'T23:59:59.999Z')` → hậu tố `Z` cứng = UTC
  - FE gửi ngày local VN: `format(new Date(), 'yyyy-MM-dd')` từ `ReportDateRangePicker`
  - `date_trunc('day', createdAt)` theo timezone session Postgres (mặc định UTC, không nơi nào SET timezone)
- **Hậu quả**: Chọn from=to=2026-06-11: filter thành [07:00 ngày 11 đến 06:59 ngày 12 giờ VN]. Đơn 00:00-07:00 sáng bị loại. Cột ngày biểu đồ dồn theo UTC.
- **Cách sửa**: Đổi `'T00:00:00Z'` thành `'T00:00:00+07:00'` (hoặc dùng config timezone), và `date_trunc('day', createdAt AT TIME ZONE 'Asia/Ho_Chi_Minh')`.

### H12. Bán offline xong, dialog hoàn thành crash TypeError

- **File**: `apps/web/src/features/pos/hooks/use-checkout.ts:74`
- **Verdict**: CONFIRMED
- **Cơ chế**:
  - Nhánh offline: `return { data: { id: clientId, offline: true } } as unknown as CheckoutResponse`
  - Thiếu: `items`, `orderNumber`, `total`, `debtAmount`, ...
  - `PosScreen` onSuccess: `setCompletionOrder(response.data)` → mở `OrderCompletionDialog`
  - Dialog dòng 37: `order.items.map(...)` trên `undefined` → TypeError
- **Cách sửa**: Nhánh offline trả object đầy đủ (lấy từ cart state) hoặc dialog kiểm tra `order.offline` và hiển thị UI rút gọn.

---

## 4. MEDIUM

### M13. Giá 0đ hợp lệ bị engine pricing bỏ qua

- **File**: `apps/api/src/services/pricing.service.ts:191` (tier chiết khấu danh mục), dòng 166 (tier giá riêng KH)
- **Verdict**: CONFIRMED
- **Cơ chế**: `finalPrice > 0` và `cp > 0` coi giá 0 là "không khớp". Schema cho phép tạo CK 100% (discountValue 0-100) và giá riêng KH 0đ (priceSchema min:0).
- **Hậu quả**: Khuyến mãi tặng hàng 100% hoặc giá riêng 0đ → khách bị tính nguyên giá bán lẻ.
- **Cách sửa**: Đổi thành `finalPrice >= 0` / `cp !== null` (hoặc `cp >= 0`) thay vì `> 0`.

### M14. Reprice POS sai/thiếu khi thêm hàng qua search, barcode, dialog biến thể

- **File**: `apps/web/src/features/pos/hooks/use-auto-reprice.ts:12` + `apps/web/src/features/pos/components/VariantSelectionDialog.tsx:128`
- **Verdict**: CONFIRMED
- **Hai lỗi chồng**:
  1. `applyResults` dựng id = `productId-variantId`, thiếu `unitConversionId` (buildCartItemId gồm cả unitConversionId) → giỏ có lẻ + thùng cùng sản phẩm: giá thùng ghi đè lên dòng lẻ, dòng thùng không bao giờ được reprice
  2. Mọi luồng thêm hàng ngoài grid quick-mode (search quick-add, barcode quick-add, dialog biến thể, grid mode normal) đều KHÔNG gọi `repriceOnAdd` → khách VIP chọn trước rồi thêm qua search bị tính giá lẻ
- **Cách sửa**:
  1. `applyResults`: dựng id khớp `buildCartItemId` (gồm unitConversionId)
  2. Mọi call-site `addItem` phải gọi `repriceOnAdd` sau khi thêm, hoặc `useAutoReprice` phải tự watch items changes

### M15. Race condition response khi bấm +/- giỏ hàng

- **File**: `apps/web/src/features/pos/hooks/use-auto-reprice.ts:81`
- **Verdict**: CONFIRMED
- **Cơ chế**: `useRepriceOnQuantity` bắn `resolvePricesApi` mỗi lần bấm +/-, không có AbortController/sequence guard/debounce. Response cũ về sau ghi đè giá đúng.
- **Kịch bản**: Bấm nhanh 9 → 10 (ngưỡng giá sỉ): response qty=9 (giá lẻ) về sau response qty=10 (giá sỉ) → 10 sản phẩm tính giá lẻ.
- **Cách sửa**: Thêm AbortController cancel request cũ, hoặc sequence counter chỉ apply response mới nhất.

### M16. Đơn vị quy đổi giá bán 0 → bán 0đ (fallback chết)

- **File**: `apps/api/src/services/products.service.ts:2027` + `apps/web/src/features/pos/components/VariantSelectionDialog.tsx:71`
- **Verdict**: CONFIRMED
- **Cơ chế**: Cột `sellingPrice` là `bigint notNull default(0)`, BE trả `Number(uc.sellingPrice)` = 0 (number, không bao giờ null). FE fallback `sellingPrice ?? Math.round(rawPrice * conversionFactor)`: vì 0 không phải null/undefined, `??` không kích hoạt.
- **Kịch bản**: Thêm đơn vị "Thùng" (hệ số 24) nhưng để trống giá bán (mặc định 0). POS hiện giá 0đ, bán thùng 24 lon giá 0đ.
- **Cách sửa**: BE trả `sellingPrice: uc.sellingPrice || null` (hoặc `uc.sellingPrice > 0 ? ... : null`). Hoặc FE dùng `sellingPrice > 0 ? sellingPrice : fallback`.

### M17. 3 tab chi tiết khách hàng là stub trả rỗng

- **File**: `apps/api/src/services/customers.service.ts:679` (listCustomerOrders), `:709` (getCustomerDebts), `:726` (getCustomerStats)
- **Verdict**: CONFIRMED
- **Cơ chế**: Cả 3 hàm return hardcode `{ items: [], total: 0 }` / `{ topProducts: [], monthlySales: [] }` mà không query DB.
- **Hậu quả**: Tab Đơn hàng, Công nợ, Thống kê của trang chi tiết khách hàng luôn trống.
- **Cách sửa**: Implement query thật cho 3 hàm.

### M18. Cảnh báo vượt tồn kho trong giỏ POS chết

- **File**: `apps/web/src/stores/use-cart-store.ts:235`
- **Verdict**: CONFIRMED
- **Cơ chế**: `addItem` default `trackInventory: input.trackInventory ?? false`, `stockQuantity: input.stockQuantity ?? 0`. Cả 5 call-site (ProductGrid, PosScreen, PosSearchBar, BarcodeScanner, VariantSelectionDialog) đều KHÔNG truyền 2 field này. CartItem.tsx:68 `overStock = item.trackInventory && quantity > stockQuantity` luôn false.
- **Hậu quả**: Thu ngân bán vượt tồn mà không thấy cảnh báo.
- **Cách sửa**: Mỗi call-site addItem phải truyền `trackInventory: product.trackInventory`, `stockQuantity: product.currentStock`.

### M19. JWT bắt buộc iss/aud sau deploy: mọi phiên cũ bị 401

- **File**: `apps/api/src/lib/jwt.ts:56`
- **Verdict**: CONFIRMED
- **Cơ chế**: Commit e66d134 thêm issuer/audience vào cả sign và verify cùng lúc. Token cũ (thiếu iss/aud) → `JsonWebTokenError: jwt issuer invalid` → 401. Refresh token sống 7 ngày cũng chết.
- **Hậu quả**: Sau deploy, toàn bộ user bị đá ra login giữa ca. Gián đoạn 1 lần.
- **Cách sửa**: Đã deploy rồi thì lỗi đã xảy ra. Phòng tương lai: thêm grace period (verify chấp nhận token thiếu iss/aud trong X ngày đầu).

### M20. Menu Cài đặt ẩn với staff/manager

- **File**: `apps/web/src/components/layout/nav-items.ts:119`
- **Verdict**: CONFIRMED
- **Cơ chế**: `requiredPermission` đổi từ `'audit.viewOwn'` sang `'store.manage'` (chỉ owner). Route /settings vẫn guard bằng `audit.viewOwn`. Staff/manager mất lối vào trang Nhật ký qua menu (chỉ vào được bằng gõ URL).
- **Cách sửa**: Đổi lại `requiredPermission: 'audit.viewOwn'`. Hoặc tách menu "Nhật ký" riêng với permission `audit.viewOwn`.

### M21. Ngưỡng cảnh báo nợ hardcode 80% ở 3 màn hình

- **File**: `apps/web/src/features/pos/components/DebtSummaryCard.tsx:13`, `CustomerDetailHeader.tsx:45`, `CustomerDebtsTab.tsx:113`
- **Verdict**: CONFIRMED
- **Cơ chế**: Setting per-store `debtWarningPercent` (chỉnh được trong Cài đặt) nhưng 3 chỗ hardcode 80/0.8. `CustomerList.tsx:144` và `DebtAgingReport.tsx:31` đọc đúng setting.
- **Hậu quả**: Đổi ngưỡng thành 50%: POS và trang chi tiết khách vẫn cảnh báo theo 80%. Hành vi mâu thuẫn.
- **Cách sửa**: 3 component đọc `storeQuery.data?.debtWarningPercent ?? 80` thay vì hardcode.

### M22. useNetworkStatus dead code, offline indicator không hoạt động giữa phiên

- **File**: `apps/web/src/hooks/use-network-status.ts:5`
- **Verdict**: CONFIRMED
- **Cơ chế**: Hook lắng nghe `online`/`offline` event để set `useOfflineStore.status` là dead code (không ai import). Store chỉ set status 1 lần lúc khởi tạo. Rớt mạng giữa phiên: status vẫn 'online', OfflineIndicator ẩn.
- **Cách sửa**: Gọi `useNetworkStatus()` 1 lần ở App layout, hoặc tích hợp listener trực tiếp vào `useOfflineStore`.

### M23. Tab Ghi nợ POS cho hoàn tất khi debtAmount=0, bị BE 400

- **File**: `apps/web/src/features/pos/components/PaymentDialog.tsx:172`
- **Verdict**: CONFIRMED
- **Cơ chế**: Tab Ghi nợ `canComplete` trả true khi debtAmount=0 (khách trả trước >= tổng). Payload gửi `paymentMethod='debt', debtAmount=undefined`. BE refine: debt phải có `debtAmount > 0` → 400.
- **Cách sửa**: Khi debtAmount <= 0, tự chuyển paymentMethod sang 'cash'. Hoặc disable nút Hoàn thành ở tab Ghi nợ khi debtAmount=0.

### M24. COUNT(*) OVER() trả total=0 khi trang rỗng

- **File**: `apps/api/src/services/customer-prices.service.ts:141`
- **Verdict**: CONFIRMED
- **Cơ chế**: Window function chỉ tồn tại trên rows trả về. Offset vượt dữ liệu → rows rỗng → total ép về 0. UI ẩn phân trang, hiện "Chưa có dữ liệu".
- **Cách sửa**: Dùng subquery COUNT riêng, hoặc khi rows rỗng thì query lại total không offset.

### M25. notify() nuốt lỗi validate, cảnh báo critical mất

- **File**: `packages/notifications/src/index.ts:44`
- **Verdict**: CONFIRMED
- **Cơ chế**: Đổi từ throw ZodError sang return `[{ok: false}]`. `emitEvent` dùng `.catch()` → validate error không phải rejection → không log, không delivery record. Event body > 2000 ký tự (error message dài) bị nuốt.
- **Cách sửa**: `emitEvent` phải await và check return value, hoặc `notify` throw lại khi validate fail.

### M26. unitConversion không check productId/storeId

- **File**: `apps/api/src/services/orders.service.ts:362` (lặp tại sync.routes.ts:428)
- **Verdict**: CONFIRMED
- **Cơ chế**: Query `WHERE eq(productUnitConversions.id, item.unitConversionId)` chỉ lọc PK, không check conversion thuộc đúng productId và storeId.
- **Hậu quả**: Client gửi unitConversionId của sản phẩm khác (conversionFactor khác) → trừ kho sai hệ số.
- **Cách sửa**: Thêm `AND eq(productUnitConversions.productId, product.id) AND eq(productUnitConversions.storeId, actor.storeId)`.

---

## 5. LOW

### L27. Toast lỗi đôi (MutationCache + onError cục bộ)

- **File**: `apps/web/src/main.tsx:23`
- **Verdict**: CONFIRMED
- **Cơ chế**: MutationCache.onError toast mọi lỗi. Nhiều mutation (PosScreen, DebtAdjustmentDialog, PriceListDetail, ...) cũng toast trong onError cục bộ. `meta.skipGlobalError` không mutation nào dùng.
- **Cách sửa**: Thêm `meta: { skipGlobalError: true }` cho các mutation đã tự xử lý lỗi. Hoặc MutationCache chỉ toast khi mutation không có onError.

### L28. error-handler.ts requestId luôn undefined

- **File**: `apps/api/src/middleware/error-handler.ts:52`
- **Verdict**: CONFIRMED
- **Cơ chế**: `c.get('requestId')` nhưng không middleware nào set key 'requestId' (requestId chỉ nằm trong logger child bindings).
- **Cách sửa**: Lấy từ `reqLogger.bindings().requestId` như notifications.routes.ts đã làm.

### L29. graceful-shutdown cleanup bị skip khi force timeout

- **File**: `apps/api/src/lib/graceful-shutdown.ts:24`
- **Verdict**: CONFIRMED
- **Cơ chế**: `closeDbPool()` nằm trong callback `server.close()`. Force timeout 10s gọi `process.exit(1)` trước khi callback chạy.
- **Cách sửa**: Chạy cleanup trước/song song với server.close, hoặc trong handler SIGTERM trực tiếp.

---

## 6. Cleanup và hiệu năng (không phải bug)

### Hiệu năng

| File | Vấn đề | Ảnh hưởng |
|------|--------|-----------|
| orders.service.ts:263 | N+1 trong transaction tạo đơn POS: ~50-60 query/10 món, giữ row lock | +250-500ms checkout, contention 2 quầy cùng sản phẩm |
| orders.service.ts:408 | SELECT đọc lại stock sau UPDATE thay vì .returning() (lặp ở returns.service) | +10 query/10 món |
| purchase-orders.service.ts:190 | N+1 nhập hàng: loadProductForUpdate + INSERT từng dòng | +1-2 giây phiếu nhập 50 dòng |
| dashboard.service.ts:179 | 2 sparkline await tuần tự thay vì Promise.all | +60-150ms mỗi lần mở dashboard |
| inventory-report.service.ts:19 | Kéo toàn bộ bảng products không pagination, tính tổng trong JS | Vài MB JSON cho cửa hàng 10.000 SP |
| auth.service.ts:120 | INSERT refreshTokens + auditLogs await tuần tự | +5-15ms mỗi lần login |

### Code trùng lặp cần hợp nhất

| Vấn đề | Số bản | Nơi hợp nhất |
|--------|--------|-------------|
| formatVnd (format tiền) | 5 bản API + 7 bản web | packages/shared/src/utils |
| formatDateTime/formatDate | 24 component web | apps/web/src/lib |
| DATE_FORMATTER + generateDocumentNumber | 5 bản API | apps/api/src/lib/document-code.ts |
| slugify bỏ dấu tiếng Việt | 3 bản (2 web, 1 API) | packages/shared/src/utils |
| handleApiError (form error handler) | 18 bản web | apps/web/src/lib |
| PHONE_REGEX | 2 bản lệch nhau (shared/schema) | 1 hằng dùng chung |
| PAYMENT_STATUS_LABELS | 3 bản web, đã lệch chữ | apps/web/src/lib/constants.ts |
| Debounce tự cài | 2 bản web | Dùng useDebounced hook có sẵn |
| Công thức chiết khấu | 4 bản, 2 quy tắc làm tròn | packages/shared/src/utils |

### Altitude (fix ở sai tầng)

- Logic tính tiền POS nằm ở FE (use-cart-store), server tin hoàn toàn client. Nên có shared pricing module trong packages/shared để server recompute và verify.
- Hành vi validation/normalization (trim attribute, format tiền) rải rác thay vì tập trung ở schema/middleware.

---

## 7. Phân tích gốc rễ

### Vì sao có nhiều lỗi?

**Gốc**: logic nghiệp vụ tính tiền, trừ kho, ghi nợ bị duplicate giữa nhiều entry point (POS online, sync offline, trả hàng, nhập hàng). Mỗi bản copy trôi dạt độc lập, tạo lỗ hổng mà entry point kia không có.

**3 vấn đề cấu trúc**:

1. **Không có domain layer**: logic nghiệp vụ nằm rải rác trong route handler (sync.routes), service, và cả UI (use-cart-store). Không có nơi duy nhất quyết định giá cuối, tổng đơn, hay hạn mức nợ.

2. **Server tin client hoàn toàn**: subtotal, total, discountAmount, lineTotal đều do FE gửi. Server chỉ validate format (zod) rồi INSERT thẳng. Đây là nguyên nhân của C2.

3. **Thiếu invariant enforcement ở tầng DB**: không unique constraint cho clientId đơn offline, không unique (returnId, orderItemId), không check constraint cho currentDebt >= 0. Logic phòng vệ chỉ nằm ở application code, dễ bị bypass.

### Giải pháp cấu trúc (dài hạn)

1. **Hợp nhất tạo đơn**: 1 hàm `createOrder(options)` duy nhất cho cả POS, sync, import.
2. **Server recompute**: Shared pricing module trong packages/shared, server tính lại và so sánh trước khi lưu.
3. **DB constraints**: unique index, check constraint, trigger cho các bất biến nghiệp vụ.
4. **Timezone convention**: Mọi filter ngày dùng timezone VN (config), không hardcode 'Z'.
