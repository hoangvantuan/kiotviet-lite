# ADR-0002: Máy chủ đối chiếu đơn giá bán thay vì tin số máy khách gửi

- Trạng thái: Đã chốt
- Ngày: 2026-08-28
- Phạm vi: `apps/api/src/services/orders.service.ts`, `apps/api/src/services/pricing.service.ts`,
  `packages/shared/src/schema/order-management.ts`

## Bối cảnh

Lược đồ đơn hàng chỉ kiểm tính nhất quán nội bộ của các con số máy khách gửi lên:
`lineTotal = unitPrice × quantity − discountAmount`, `subtotal = Σ lineTotal`,
`total = subtotal − discountAmount`. Một bộ số sai giá vẫn "khớp" với nhau, nên tài khoản
nhân viên gọi thẳng API bán được bất kỳ giá nào.

Cờ `priceOverridePinUsed` cũng do máy khách gửi. Giao diện có gọi `/verify-pin`, nhưng lần
xác thực đó không ràng buộc gì với đơn hàng, nên máy khách tự đặt cờ là qua được.

## Quyết định

Máy chủ tự tính giá chuẩn cho từng dòng hàng bằng `resolveProductPrice` (thang 6 bậc đã có:
giá riêng khách, bảng giá nhóm, giá sỉ theo bậc, chiết khấu danh mục, đơn vị quy đổi, giá lẻ)
rồi đối chiếu với số máy khách gửi.

| Nguồn đơn      | Dòng hàng                    | Xử lý                                                                                                                       |
| -------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pos`          | không sửa giá, giá lệch      | Từ chối `VALIDATION_ERROR`                                                                                                  |
| `pos`          | có sửa giá, không kèm mã PIN | Từ chối                                                                                                                     |
| `pos`          | có sửa giá, mã PIN đúng      | Chấp nhận, `price_override_pin_used` do máy chủ đặt                                                                         |
| `offline_sync` | không sửa giá, giá lệch      | Nhận đơn, áp giá máy chủ, tính lại tổng và số nợ, ghi audit `order.price_mismatch_adjusted`, cảnh báo chủ cửa hàng          |
| `offline_sync` | có sửa giá, không có PIN     | Nhận đơn, GIỮ giá máy khách, ghi audit `order_item.price_overridden` với `pinUsed = false`, cảnh báo `audit.price_override` |

Riêng dòng cuối là điểm dễ gây tranh cãi. Ép giá máy chủ cho đơn ngoại tuyến đã sửa giá sẽ
làm sổ sách lệch với số tiền khách thực trả tại quầy. Theo đúng nguyên tắc của ADR-0001,
ứng dụng ghi nhận sự việc đã xảy ra và báo cho chủ cửa hàng, thay vì viết lại lịch sử.

## Hệ quả

- Đóng được đường bán phá giá qua API mà không cần mã PIN.
- Mỗi dòng hàng phát sinh một lượt tính giá phía máy chủ. Đơn nhiều dòng sẽ nặng hơn trước;
  đây là đánh đổi chấp nhận được so với rủi ro thất thoát.
- Giao diện bán hàng phải giữ mã PIN vừa nhập trong bộ nhớ phiên và gửi kèm khi tạo đơn.
  Mã PIN không được ghi xuống `localStorage` hay cơ sở dữ liệu phía trình duyệt.
- Nếu giá phía máy chủ và giá hiển thị lệch nhau, cửa hàng sẽ không bán được. Bộ kiểm thử
  `order-price-guard.integration.test.ts` phủ đủ các bậc giá để chặn rủi ro này.
