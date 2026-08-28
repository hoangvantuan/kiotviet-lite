# Báo cáo nghiệm thu kỹ thuật: Pha 1 (Tính đúng tiền sau bán và trả hàng)

**Nhiệm vụ:** Xử lý triệt để 4 lỗi mức độ Cao (HIGH): H5, H6, H7, H11.  
**Nhánh:** `hoangvantuan/t1-pha1-tien`  
**Trạng thái:** HOÀN THÀNH

---

## 1. Gốc rễ vấn đề đã xử lý

### H5: Đơn `partial_return` biến mất khỏi báo cáo và doanh thu chưa trừ tiền hoàn

- **Gốc rễ:** Các truy vấn báo cáo doanh thu, lợi nhuận, kho, và bảng điều khiển (dashboard) chỉ lọc cứng `orders.status = 'completed'`, khiến các đơn chuyển sang `partial_return` bị loại bỏ hoàn toàn. Đồng thời, khi đơn có trả hàng một phần, tổng doanh thu chỉ lấy `orders.total` mà không trừ tiền đã hoàn trả từ bảng `order_returns` và số lượng trả từ `order_return_items`.
- **Giải pháp:**
  - Xây dựng nguồn chân lý duy nhất tại `apps/api/src/lib/order-status.ts` với `REVENUE_ORDER_STATUSES = ['completed', 'partial_return']`.
  - Cung cấp các helper biểu thức SQL: `revenueStatusFilter()`, `orderRefundSubquery()`, `orderNetRevenueExpr()`, `orderItemNetQuantityExpr()`, `orderItemNetRevenueExpr()`.
  - Áp dụng vào toàn bộ các service báo cáo (`revenue-report.service.ts`, `profit-report.service.ts`, `dashboard.service.ts`, `inventory-report.service.ts`).

### H6: Hoàn tiền bỏ qua chiết khấu và xử lý làm tròn không để rơi vãi

- **Gốc rễ:** Trong `apps/api/src/services/returns.service.ts`, tiền hoàn trả trước đây tính bằng `orderItem.unitPrice * returnQty`, bỏ qua chiết khấu dòng và chiết khấu cấp đơn hàng. Hơn nữa, việc làm tròn xuống hai lần ở cấp dòng và cấp đơn có thể làm thất thoát vài đồng tiền lẻ (ví dụ 100.000đ chia 3 món thì mỗi món 33.333đ, trả cả 3 chỉ hoàn 99.999đ).
- **Giải pháp:**
  - Với từng dòng hàng: Nếu trả hết toàn bộ số lượng còn lại của dòng đó (kể cả qua nhiều đợt), tiền hoàn của dòng bằng `item.lineTotal - tổng tiền đã hoàn của dòng đó ở các phiếu trước` thay vì nhân đơn giá làm tròn xuống.
  - Với chiết khấu cấp đơn: Nếu đợt trả này làm đơn hàng được trả hết 100%, tổng tiền hoàn bằng `orders.total - tổng tiền đã hoàn của đơn ở các phiếu trước`.
  - Phân bổ chiết khấu đơn hàng vào từng dòng và dồn phần dư làm tròn vào dòng cuối cùng trong danh sách để tổng các dòng luôn khớp chính xác 100% với `order_returns.totalAmount`.

### H7: Điều chỉnh nợ bị lệch giữa 2 nguồn chân lý

- **Gốc rễ:** Bảng `customers.currentDebt` và bảng `debts.remaining` cùng lưu công nợ khách hàng. Khi tạo phiếu điều chỉnh nợ tại `apps/api/src/services/debt-adjustments.service.ts`, hệ thống chỉ cập nhật `customers.currentDebt` mà không cập nhật các bản ghi trong `debts`. Do đó, khi khách trả hàng từ đơn nợ cũ, hệ thống tiếp tục trừ nợ theo `debts.remaining`, làm `customers.currentDebt` bị âm.
- **Giải pháp:**
  - Khi điều chỉnh giảm nợ về 0: Tự động đánh dấu tất cả các khoản nợ còn lại của khách `debts.remaining = 0`, `debts.paid = debts.amount`.
  - Khi điều chỉnh giảm nợ một phần: Phân bổ khoản giảm trừ theo thứ tự nợ cũ nhất trước (FIFO), trừ dần `debts.remaining` với `GREATEST(0, ...)`.
  - Bổ sung kiểm tra chặn số nợ mới âm ở tầng dịch vụ và chặn nợ âm khi trả hàng.

### H11: Báo cáo lệch 7 giờ do ép múi giờ UTC cứng ('Z')

- **Gốc rễ:** Các hàm phân tích khoảng ngày parse chuỗi ngày dạng `${from}T00:00:00.000Z`, khiến ngày 2026-06-11 bắt đầu lúc 00:00 UTC (tức 07:00 sáng giờ Việt Nam). Các đơn phát sinh từ 00:00 đến 06:59 sáng giờ Việt Nam bị trôi sang ngày hôm trước. Đồng thời, `date_trunc` trên PostgreSQL không có `AT TIME ZONE` nên gom nhóm theo UTC.
- **Giải pháp:**
  - Tạo module tập trung `apps/api/src/lib/timezone.ts` đọc cấu hình `STORE_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) và `STORE_TIMEZONE_OFFSET` (mặc định `+07:00`).
  - Hàm `parseDateRangeLocal` tạo thời gian chuẩn theo offset `+07:00` (`${from}T00:00:00+07:00` tới `${to}T23:59:59.999+07:00`).
  - Hàm `dateTruncLocal` gom nhóm chính xác theo múi giờ cửa hàng với `sql.raw` an toàn cho mệnh đề `GROUP BY`.

---

## 2. Chi tiết các tệp và dòng mã nguồn đã chỉnh sửa

1. `apps/api/src/lib/order-status.ts` (Mới):
   - Định nghĩa `REVENUE_ORDER_STATUSES`, `revenueStatusFilter`, `orderRefundSubquery`, `orderNetRevenueExpr`, `orderItemNetQuantityExpr`, `orderItemNetRevenueExpr`.
2. `apps/api/src/lib/timezone.ts` (Mới):
   - Cung cấp `getStoreTimezone`, `getTimezoneOffset`, `parseDateRangeLocal`, `dateTruncLocal`.
3. `apps/api/src/services/returns.service.ts`:
   - Dòng 195 đến 330: Tính tiền hoàn chuẩn xác có chiết khấu dòng và chiết khấu cấp đơn; xử lý dồn phần dư làm tròn vào dòng cuối; bảo toàn hoàn đúng 100% `orders.total` khi trả hết đơn; chặn nợ âm với `GREATEST(0, ...)`.
4. `apps/api/src/services/debt-adjustments.service.ts`:
   - Dòng 145 đến 180: Đồng bộ bảng `debts` khi giảm nợ (xử lý về 0 hoặc giảm theo FIFO).
5. `apps/api/src/services/revenue-report.service.ts`:
   - Dòng 30 đến 165: Thay thế `inArray` bằng `revenueStatusFilter()`, dùng `orderNetRevenueExpr()`, `orderItemNetQuantityExpr()`, `orderItemNetRevenueExpr()`, `parseDateRangeLocal` và `dateTruncLocal`.
6. `apps/api/src/services/profit-report.service.ts`:
   - Dòng 24 đến 88: Tính đúng doanh thu ròng và giá vốn hàng bán sau khi trừ các mặt hàng hoàn trả.
7. `apps/api/src/services/dashboard.service.ts`:
   - Dòng 120 đến 350: Cập nhật các chỉ số dashboard, biểu đồ sparkline, biểu đồ 7 ngày và top sản phẩm bán chạy sang dùng doanh thu ròng và múi giờ địa phương.
8. `apps/api/src/services/inventory-report.service.ts`:
   - Cập nhật điều kiện trạng thái đơn sinh doanh thu bằng `revenueStatusFilter()`.
9. `apps/api/src/services/pricing-report.service.ts`:
   - Chuyển sang dùng `parseDateRangeLocal`.
10. `apps/api/src/__tests__/pha1-h5-h6-h7-h11.integration.test.ts` (Mới):
    - 15 test case chuyên sâu cho H5, H6 (bao gồm 3 test case làm tròn và trả nhiều lần), H7, H11.

---

## 3. Kiểm thử đã thực hiện và kết quả

Theo chỉ dẫn của coordinator về tải CPU và quy tắc test độc lập:

1. **Kiểm thử tích hợp Pha 1 (`pha1-h5-h6-h7-h11.integration.test.ts`):**
   - H5: Doanh thu sau trả một phần = Tổng đơn trừ tiền hoàn ở mọi báo cáo (PASS)
   - H5: Đơn `full_return` không tính vào doanh thu hoặc lợi nhuận (PASS)
   - H6: Hoàn tiền có chiết khấu dòng: hoàn = lineTotal/quantity \* qty trả (PASS)
   - H6: Hoàn tiền có chiết khấu cấp đơn: hoàn ≤ tổng khách thực trả (PASS)
   - H6: Kết hợp cả chiết khấu dòng + chiết khấu cấp đơn (PASS)
   - H6 (Làm tròn): Dòng hàng `lineTotal = 100000`, `quantity = 3` (chia không hết): trả cả 3 hoàn đúng 100.000đ (PASS)
   - H6 (Làm tròn): Đơn có chiết khấu cấp đơn, trả hết toàn bộ hàng: tổng hoàn đúng bằng `orders.total` (PASS)
   - H6 (Làm tròn): Trả làm 2 lần (một phần rồi phần còn lại): tổng hoàn 2 lần cộng lại đúng bằng `orders.total` (PASS)
   - H7: Điều chỉnh nợ về 0 → debts.remaining = 0 (PASS)
   - H7: Điều chỉnh nợ giảm 1 phần → debts.remaining giảm tương ứng (PASS)
   - H7: Điều chỉnh nợ giảm qua nhiều khoản nợ theo FIFO (PASS)
   - H7: Chặn điều chỉnh nợ số âm (PASS)
   - H7: Sau điều chỉnh về 0, trả hàng không làm currentDebt âm (PASS)
   - H11: `parseDateRangeLocal` tạo ngày theo offset +07:00 thay vì Z (PASS)
   - H11: Đơn hàng tạo lúc 01:00 sáng VN thuộc đúng ngày báo cáo (PASS)
   - **Kết quả:** 15/15 test cases PASS.

2. **Kiểm tra chất lượng mã nguồn:**
   - `pnpm lint`: ĐẠT (0 lỗi)
   - `pnpm -r typecheck`: ĐẠT (0 lỗi)
   - `pnpm -r build`: ĐẠT (Build thành công toàn bộ workspace)

---

## 4. Đánh giá rủi ro và các lưu ý tiếp theo

- **Rủi ro hồi quy:** Không có, toàn bộ API giữ nguyên hợp đồng giao tiếp, chỉ làm giàu và chính xác hóa dữ liệu tính toán.
- **Lưu ý triển khai:** Mặc định múi giờ là `Asia/Ho_Chi_Minh`. Trong trường hợp chuỗi cửa hàng mở rộng sang múi giờ khác, có thể cấu hình biến môi trường `STORE_TIMEZONE` và `STORE_TIMEZONE_OFFSET` mà không cần sửa mã nguồn.
