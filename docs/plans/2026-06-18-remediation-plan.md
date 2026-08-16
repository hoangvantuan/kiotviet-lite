# Kế hoạch xử lý lỗi — kiotviet-lite

- **Ngày**: 2026-06-18
- **Nguồn**: [docs/reviews/2026-06-12-comprehensive-review.md](../reviews/2026-06-12-comprehensive-review.md) (26 lỗi: 4 critical, 8 high, 13 medium, 1 low)
- **Trạng thái**: nhóm CRITICAL (C1–C4) đã sửa + verify, **chưa commit/migrate**. Tài liệu này lập kế hoạch cho phần còn lại.

---

## 1. Nguyên tắc dẫn đường

1. **Tiền trước hết**: ưu tiên các lỗi gây mất/sai tiền, hàng, nợ trước UX.
2. **Fix gốc, không vá triệu chứng**: nơi nhiều lỗi cùng một nguyên nhân (vd 16 chỗ lọc `status='completed'`), sửa bằng một thay đổi cấu trúc thay vì N bản vá.
3. **Mỗi pha ship được**: kết thúc mỗi pha là một trạng thái deploy được, không để dở nửa luồng.
4. **Test cho luồng tiền/kho/nợ**: mọi thay đổi đụng tiền phải kèm integration test (hạ tầng đã có sẵn, xem §3).

## 2. Bản đồ gốc rễ → triệu chứng

Review chỉ ra 3 gốc cấu trúc. Phân loại lại các lỗi theo gốc để fix đúng tầng:

| Gốc cấu trúc | Triệu chứng (lỗi) | Hướng fix gốc |
|---|---|---|
| **G1 — Logic nghiệp vụ trùng lặp giữa các entry point** (POS online / sync offline / returns) | C1, H8, M26, (C2-sync) | Hợp nhất 1 hàm `createOrder(options)` cho mọi nguồn |
| **G2 — Server tin client tuyệt đối** (subtotal/total/giá do FE gửi) | C2, H6, M13, M16 | Shared pricing module; server recompute & verify |
| **G3 — Thiếu invariant ở tầng DB + sai tầng tính toán** | C3, H5, H7, H11 | Unique index/check constraint; helper lọc trạng thái doanh thu; convention timezone |

> Đã xử lý ở nhóm CRITICAL: C1 (G1+G3), C2 (G2), C3 (G3), C4. Phần còn lại bám theo cùng các gốc này.

## 3. Hạ tầng test (đính chính & enabler)

- `apps/api` **đã có 12+ integration test** tại `src/__tests__/*.integration.test.ts` (audit, receipts, reports, products, notifications, …), chạy qua `vitest run` ở root (project `api` trong [vitest.workspace.ts](../../vitest.workspace.ts)). **Cần Postgres test DB** (`DATABASE_URL`).
- Hiện chưa chạy được trong phiên này vì thiếu test DB. **Enabler bắt buộc của Pha 0**: dựng/kết nối test DB, chạy được suite api, viết test cho `orders`/`returns`/`sync`/`users` theo pattern có sẵn.
- `shared` (schema invariants) + `web` (utils) test chạy không cần DB — đã pass.

---

## 4. Các pha

### Pha 0 — Chốt CRITICAL (đang chờ) · effort S–M

> **Quyết định 2026-06-18**: dev hiện **không có DB cũ** (chỉ dev/seed, mất thoải mái) → **không reset**, tạo DB mới sạch khi cần. Trên DB rỗng, migrate `0030` chạy sạch, **không cần §6**. SQL §6 (dò/dọn data trùng) **chỉ dành cho lần lên production thật đầu tiên**.

| Việc | Chi tiết |
|---|---|
| Dựng DB dev mới | Postgres rỗng → `db:migrate` (0000→0030) → `db:seed`. Không lo data trùng. |
| Seed tương thích | Rà `seed.ts` không vi phạm unique index mới (đặc biệt `uniq_categories_store_parent_sort`). |
| Integration test C1/C3/C4 | sync push trùng clientId → 1 đơn; trả hàng trùng orderItemId → reject; tạo/khóa owner thứ 2 → reject. |
| Commit | Một commit `fix: CRITICAL C1-C4` (khi bạn duyệt). |
| §6 (dò data) | **Hoãn** đến lần migrate production đầu tiên. |

### Pha 1 — Tính đúng tiền sau bán & trả hàng (HIGH, gốc G2+G3) · effort M–L · rủi ro CAO (số liệu tài chính)

| # | Lỗi | File | Hướng fix |
|---|---|---|---|
| H5 | Đơn `partial_return` biến mất khỏi báo cáo (**16 chỗ** lọc `'completed'` ở 6 service) | revenue-report, profit-report, dashboard, inventory-report, orders, returns | **Fix gốc**: helper `revenueOrderStatuses`/điều kiện dùng chung `in(['completed','partial_return'])` + trừ refund từ `order_returns`. Không vá lẻ 16 chỗ. |
| H6 | Hoàn tiền bỏ chiết khấu (hoàn > khách trả) | returns.service.ts:254 | Tính theo tỷ lệ `lineTotal/quantity`; phân bổ chiết khấu cấp đơn. |
| H7 | Điều chỉnh nợ lệch 2 nguồn, `currentDebt` âm | debt-adjustments.service.ts:195 | Settle `debts.remaining` tương ứng khi điều chỉnh `currentDebt`. |
| H11 | Báo cáo lệch 7h timezone (hardcode `Z`) | revenue-report.service.ts:28, profit-report.service.ts:11 | `+07:00` + `date_trunc(... AT TIME ZONE 'Asia/Ho_Chi_Minh')` (config hóa). |

### Pha 2 — Offline sync vững (HIGH, gốc G1) · effort L · rủi ро CAO (đụng cả 2 luồng tạo đơn)

| # | Lỗi | File | Hướng fix |
|---|---|---|---|
| H8 | `processSyncOrder` là bản copy trôi dạt của `createOrder` (mất audit, hạn mức nợ, storeId check) | sync.routes.ts:322, orders.service.ts | **Fix gốc G1**: refactor `createOrder({source, clientId?, skipDebtLimitCheck?})` dùng chung; xóa bản copy. Hấp thụ luôn C1/C2-sync (vá tạm) + M26. |
| H9 | Sync kẹt vĩnh viễn khi token hết hạn; `retry/resetErrorOrders` không có call-site | order-sync.ts, sync-engine.ts, offline-orders.ts | Dùng `apiFetch` (api-client.ts có refresh) thay fetch tự chế; thêm UI retry đơn lỗi. |
| H12 | Offline checkout crash dialog (thiếu `items`…) | use-checkout.ts:74 | Nhánh offline trả object đầy đủ từ cart, hoặc dialog xử lý `order.offline`. |
| M22 | `useNetworkStatus` dead code → indicator không đổi giữa phiên | use-network-status.ts:5 | Gọi hook ở App layout hoặc tích hợp listener vào store. |
| M26 | unitConversion không check productId/storeId | orders.service.ts:362, sync.routes.ts:428 | Thêm điều kiện `productId` + `storeId` (gộp trong H8). |

### Pha 3 — Auth & phiên (HIGH/MEDIUM) · effort M · rủi ро: bảo mật

| # | Lỗi | File | Hướng fix |
|---|---|---|---|
| H10 | Refresh token rotation race (2 phiên từ 1 token) | auth.service.ts:194 | `UPDATE ... WHERE id=X AND revokedAt IS NULL RETURNING *` (atomic), affected=0 → token đã dùng. |
| M19 | JWT iss/aud bắt buộc → phiên cũ 401 sau deploy | jwt.ts:56 | Grace period verify chấp nhận token thiếu iss/aud trong X ngày. (Đã xảy ra 1 lần — phòng tương lai.) |

### Pha 4 — POS pricing & cart UX (MEDIUM, gốc G2) · effort M–L

M13 (giá 0đ hợp lệ bị bỏ), M14 (reprice sai/thiếu khi search/barcode/biến thể), M15 (race +/- giỏ), M16 (đơn vị quy đổi giá 0 → bán 0đ), M18 (cảnh báo vượt tồn chết), M21 (ngưỡng nợ hardcode 80%), M23 (tab ghi nợ debtAmount=0 → BE 400).

### Pha 5 — Tính đúng dữ liệu & misc (MEDIUM) · effort M

M17 (3 tab chi tiết khách stub rỗng — implement query), M20 (menu Cài đặt ẩn với staff/manager), M24 (`COUNT(*) OVER()` trả total=0 trang rỗng), M25 (`notify()` nuốt lỗi validate).

### Pha 6 — LOW + cleanup cấu trúc · effort M–L (làm dần)

- L27 (toast lỗi đôi), L28 (requestId undefined), L29 (graceful-shutdown skip cleanup).
- **Hiệu năng**: N+1 tạo đơn/nhập hàng, `Promise.all` sparkline, pagination inventory-report.
- **Hợp nhất code trùng** (đòn bẩy chống trôi dạt tương lai): `formatVnd` (12 bản), `formatDate` (24), `handleApiError` (18), `slugify`, `PHONE_REGEX`, công thức chiết khấu.
- **Altitude (fix gốc G2 triệt để)**: shared pricing module trong `packages/shared` để server recompute — khép lại toàn bộ lớp lỗi "server tin client".

---

## 5. Phụ thuộc & thứ tự đề xuất

```
Pha 0 (chốt CRITICAL) ──> Pha 1 (tiền) ──> Pha 2 (sync, gồm H8 refactor)
                                   │
                                   └─> Pha 3 (auth) chạy song song được
Pha 4, 5 (MEDIUM) sau Pha 1-3.  Pha 6 (cleanup) xen kẽ, làm dần.
```

- **H8 nên làm ở Pha 2, không sớm hơn**: nó hợp nhất luồng tạo đơn và sẽ hấp thụ phần vá C1/C2-sync. Làm critical trước (đã xong), refactor gốc sau — tránh đập đi làm lại khi đang chữa cháy.
- **H5 trước H6/H7**: thống nhất định nghĩa "doanh thu hợp lệ" trước, rồi mới sửa returns/debt cho khớp.

## 6. SQL kiểm tra data trước migrate (Pha 0)

```sql
-- C3: phiếu trả đã có dòng trùng?
SELECT return_id, order_item_id, COUNT(*) FROM order_return_items
GROUP BY 1,2 HAVING COUNT(*) > 1;
-- categories trùng (thay đổi pending sẵn trong repo)?
SELECT store_id, parent_id, sort_order, COUNT(*) FROM categories
GROUP BY 1,2,3 HAVING COUNT(*) > 1;
```
Có kết quả → phải dọn data trước, nếu không `CREATE UNIQUE INDEX` sẽ fail.

## 7. Định nghĩa hoàn thành (mỗi pha)

- Code sửa theo hướng gốc (không vá lẻ nơi có thể hợp nhất).
- Integration/unit test phủ hành vi đã sửa, chạy pass.
- `pnpm typecheck` (toàn repo) + `eslint` sạch + `vitest run` (root, gồm api) pass.
- Migration (nếu có) đã kiểm tra data + generate qua `db:generate` (không tự viết SQL).
- Commit theo nhóm, mô tả rõ mã lỗi.

## 8. Quyết định đã chốt (2026-06-18)

1. **Deploy CRITICAL**: ✅ **Hotfix ngay sau Pha 0** — migrate + commit + deploy riêng nhóm CRITICAL trước Pha 1.
2. **Mức đầu tư test**: ✅ **Integration test cho mọi fix đụng tiền/kho/nợ** (dùng hạ tầng api có sẵn).
3. **Thứ tự**: ✅ **Theo đề xuất: tiền (Pha 1) → sync (Pha 2) → auth (Pha 3)**, rồi Pha 4–6.
