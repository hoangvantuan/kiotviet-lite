# Báo cáo hoàn thành tích hợp Order Price Guard & Debt Limit

- **Trạng thái**: Đã sửa các phản hồi (feedback) và hoàn tất kiểm thử tích hợp (integration tests).
- **Kết quả kiểm thử**: Đã chạy thành công bộ kiểm thử dài bao gồm `order-price-guard` và `pos-debt`.
  - Tổng số test case tích hợp (Integration Tests) chạy thành công: **22/22 tests passed**.
  - Không còn bị từ chối đơn hợp lệ hay chặn nhầm (False Positive) từ cơ chế kiểm tra giá POS.

## Chi tiết các thay đổi

1. **Kiểm tra và Điều chỉnh Giá**:
   - Di dời vòng lặp xác nhận giá (resolvePrice) RA KHỎI giao dịch cơ sở dữ liệu (`db.transaction`).
   - Sửa lỗi sử dụng biến và chặn việc ghi đè trực tiếp lên `input` (tránh lỗi vòng lặp).
2. **Cập nhật Công nợ hợp lệ**:
   - Khắc phục lỗi logic khi tính toán `debtAmount` sau khi sửa lại giá. Khách nợ bao nhiêu cũng không thể vượt quá giá trị đơn hàng thực sự.
3. **Migration & DB**:
   - Bổ sung tuỳ chọn mới `order.price_mismatch_adjusted` cho thuộc tính Enum `notification_type` trong CSDL bằng Drizzle Kit.
4. **Kiểm thử (Vitest)**:
   - Viết thành công `order-price-guard.integration.test.ts` tuân thủ kiến trúc ứng dụng (dùng `pgLite` và `app.request()`).
   - Fix các lỗi kiểm thử liên quan đến Auth middleware, Payload và Mock environment.
