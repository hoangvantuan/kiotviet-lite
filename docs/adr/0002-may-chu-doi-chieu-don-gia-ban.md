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

| Nguồn đơn      | Dòng hàng                    | Xử lý                                                                                                                                                                  |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pos`          | không sửa giá, giá lệch      | Từ chối `VALIDATION_ERROR`                                                                                                                                             |
| `pos`          | có sửa giá, không kèm mã PIN | Từ chối                                                                                                                                                                |
| `pos`          | có sửa giá, mã PIN đúng      | Chấp nhận, `price_override_pin_used` do máy chủ đặt                                                                                                                    |
| `offline_sync` | không sửa giá, giá lệch      | Nhận đơn, GIỮ giá máy khách (giá lúc bán), không tự đổi tổng tiền hay công nợ, ghi audit `order.price_mismatch_adjusted` đối soát kèm nguồn giá, cảnh báo chủ cửa hàng |
| `offline_sync` | có sửa giá, không có PIN     | Nhận đơn, GIỮ giá máy khách, ghi audit `order_item.price_overridden` với `pinUsed = false`, cảnh báo `audit.price_override`                                            |

Khi cửa hàng mất mạng (ngoại tuyến), người bán vẫn hoàn tất đơn hàng với đơn giá, số tiền đã thu và công nợ đã chốt tại quầy. Màn hình bán hàng cảnh báo giá không thể cập nhật và giữ nguyên đơn giá từng dòng.

Trước đây, hệ thống tự động áp giá máy chủ và tính lại tổng tiền cùng công nợ khi đồng bộ đơn không sửa giá bị lệch giá. Tuy nhiên, cách làm này dẫn tới sai lệch giữa số liệu trên hệ thống và số tiền khách thực trả hoặc công nợ khách đã thừa nhận tại quầy.

Theo quyết định cập nhật, nguyên tắc ghi nhận sự việc đã xảy ra của ADR-0001 được áp dụng nhất quán cho mọi đơn ngoại tuyến: máy chủ không tự ý viết lại lịch sử hay sửa các con số đã chốt. Thay vào đó, hệ thống nhận đơn, giữ nguyên giá lúc bán, tổng tiền, tiền thừa và công nợ; đồng thời ghi nhận chênh lệch giữa giá lúc bán và giá hiện hành cùng nguồn giá lưu từ thiết bị và nguồn giá máy chủ đối soát vào nhật ký kiểm toán (audit log), và cảnh báo cho chủ cửa hàng.

## Hệ quả

- Đóng được đường bán phá giá qua API trực tiếp mà không cần mã PIN.
- Với đơn ngoại tuyến, giữ sự việc đã xảy ra và đối soát giúp sổ sách khớp đúng tiền thực tế tại quầy, nhưng đánh đổi lại là hệ thống không thể ngăn tuyệt đối dữ liệu ngoại tuyến bị can thiệp trên thiết bị trước khi đồng bộ. Rủi ro này được quản lý bằng việc ghi nhận chênh lệch đối soát minh bạch và cảnh báo kịp thời cho chủ cửa hàng thay vì tự động viết lại số liệu giao dịch.
- Mỗi dòng hàng phát sinh một lượt tính giá phía máy chủ để phục vụ kiểm tra hoặc đối soát.
- Giao diện bán hàng phải giữ mã PIN vừa nhập trong bộ nhớ phiên và gửi kèm khi tạo đơn. Mã PIN không được ghi xuống `localStorage` hay cơ sở dữ liệu phía trình duyệt.
- Bộ kiểm thử `order-price-guard.integration.test.ts` và `offline-price-sync.integration.test.ts` đảm bảo kiểm soát chặt chẽ luồng giá trực tiếp lẫn luồng đối soát ngoại tuyến.
