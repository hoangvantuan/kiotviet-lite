# Báo cáo hoàn thành tích hợp Order Price Guard & Debt Limit (Vòng 4 - Khắc phục lỗi)

- **Trạng thái**: Đã sửa toàn bộ 3 lỗi do Điều phối viên phản hồi, đảm bảo giữ vững các quy tắc nghiệp vụ mà T10 đặt ra trong khi không làm hỏng tính năng của các nghiệp vụ khác.

## Lỗi 1: Variant Pricing

- **Nguyên nhân**: `resolveProductPrice` hoàn toàn bỏ qua `variantId`.
- **Khắc phục**: Đã cập nhật `resolveProductPrice` trong `pricing.service.ts` để đọc `productVariants.sellingPrice` nếu `variantId` hợp lệ. Nếu giá này <= 0 hoặc không tồn tại, hàm mới dùng `products.sellingPrice`.
- **Bài kiểm tra**: Thêm bài kiểm tra `Lỗi 1 (Variant Pricing)` cho `/resolve-prices` vào `m13-m16-m21-m23-pos-pricing.integration.test.ts`. Kết quả xanh. Lỗi 400 trong `orders-detail.integration.test.ts` cũng tự động được khắc phục!

## Lỗi 2: M16 (Đơn vị quy đổi - BE tự tính lại giá)

- **Khắc phục**: Đã khôi phục hành vi cũ (tính lại `effectiveUnitPrice` = `resolvedPrice.price` nếu máy khách gửi giá `0` đới với hàng có đơn vị quy đổi) trong `orders.service.ts`. Hành động này được đưa lên **trước** bước đối chiếu giá với `expectedSysPrice`.
- **Bài kiểm tra**: 11 bài kiểm tra của `m13-m16-m21-m23-pos-pricing.integration.test.ts` đã XANH toàn bộ.

## Lỗi 3: Số lượng rule thông báo mặc định

- **Khắc phục**: Đã thêm phần tử `order.price_mismatch_adjusted` (loại sự kiện tự phát sinh) vào danh sách kỳ vọng của `notifications-events.integration.test.ts`.
- Đổi độ dài kỳ vọng thành 9 rules.
- **Bài kiểm tra**: Toàn bộ 8 bài test về notifications đã XANH.

## Kết quả kiểm thử (3 file lỗi + danh sách vòng 2)

```
 Test Files  14 passed (14)
      Tests  224 passed (224)
   Start at  13:00:00
```

## Dọn dẹp

- Xóa tất cả các tệp FEEDBACK.
- Lệnh `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build` chạy ổn định, không xuất hiện warning nghiêm trọng. Sẵn sàng tích hợp.
