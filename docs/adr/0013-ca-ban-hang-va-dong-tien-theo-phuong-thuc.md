# ADR-0013: Ca bán hàng và dòng tiền theo phương thức

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `apps/api/src/lib/cash-flow.ts`, `apps/api/src/services/shifts.service.ts`,
  `apps/api/src/services/cash-flow-report.service.ts`, `packages/shared/src/schema/cash-shifts.ts`,
  `packages/shared/src/schema/cash-management.ts`, `apps/web/src/features/shifts/`,
  `apps/web/src/features/cash-flow/`, `apps/web/src/lib/vietqr.ts`
- Bổ sung cho: [ADR-0008](0008-so-cong-no-khach-duy-nhat.md),
  [ADR-0011](0011-khach-tra-truoc-la-no-dau-ky-am.md)

## Bối cảnh

Cuối ngày cửa hàng cần biết ngăn kéo phải có bao nhiêu tiền mặt và tài khoản phải nhận bao nhiêu
chuyển khoản. Trước đây chỉ đơn hàng có phương thức thanh toán; phiếu thu, phiếu chi và tiền hoàn
của phiếu trả không ghi kênh tiền (TIEN-05, TIEN-02), nên không tách được tiền mặt với chuyển
khoản. Cũng chưa có ca để gắn tiền với người trực quầy (POS-06), và báo cáo dễ lấy nhầm
`debts.paid` làm tiền thu (TIEN-01).

## Quyết định

1. **Mỗi khoản tiền thực nhận hay thực chi ghi đúng một phương thức**: tiền mặt, chuyển khoản
   hoặc QR. Phiếu thu, phiếu chi bắt buộc chọn; phiếu trả mặc định hoàn theo cách khách đã trả đơn
   gốc (`defaultRefundMethod`). Chứng từ cũ lập trước thay đổi này giữ NULL và hiện là "Chưa rõ
   (chứng từ cũ)", không đoán là tiền mặt.
2. **Một nguồn chân lý cho tiền thực nhận**: các biểu thức trong `lib/cash-flow.ts` tách tiền của
   đơn theo cách trả (tiền mặt giữ lại sau khi thối, phần chuyển khoản, phần ghi nợ). Đóng ca và
   báo cáo dòng tiền cùng đọc các biểu thức này, không cộng `debts.paid`.
3. **Ca là tùy chọn của cửa hàng, mặc định tắt.** Bật thì đơn POS trực tuyến bị máy chủ từ chối
   (`reason = shift_required`) khi người bán chưa mở ca. Mỗi người bán tối đa một ca mở (chỉ mục
   unique một phần).
4. **Chứng từ tiền mặt gắn vào ca nhận hay chi tiền, không phải ca của người lập.** Phiếu trả,
   phiếu thu, phiếu chi thường do quản lý lập thay thu ngân. Máy chủ chọn ca theo thứ tự: ca được
   gửi kèm (`shiftId`, phải đang mở và cùng cửa hàng), ca đang mở của người lập, ca duy nhất đang
   mở của cửa hàng. Có nhiều ca mở mà khoản tiền là tiền mặt thì từ chối (`reason =
shift_choice_required`, kèm danh sách ca) để giao diện hỏi chọn ca; khoản không phải tiền mặt
   thì để trống ca. Ca được đọc với khóa FOR SHARE nên không đóng được khi chứng từ đang ghi.
5. **Đơn ngoại tuyến không bị chặn vì ca.** Khi đồng bộ, đơn gắn vào ca của người bán có giờ bán
   nằm trong khoảng mở, đóng ca; không khớp thì để trống và hiện ở mục "chưa gắn ca" của báo cáo.
   Giờ bán lưu ở `orders.sold_at` (đơn trực tuyến bằng giờ tạo, đơn ngoại tuyến bằng giờ bán trên
   máy); báo cáo dòng tiền lọc đơn theo `sold_at`, nên đơn bán 21:00 đồng bộ sáng hôm sau vẫn
   thuộc ngày bán, cùng ngày với ca đã gắn.
6. **Chênh lệch ca = tiền đếm - (quỹ đầu ca + tiền mặt thu - tiền mặt chi và hoàn).** Số liệu
   lúc đóng được chụp vào `close_summary`; chứng từ gắn vào ca sau khi đóng (đơn ngoại tuyến đồng
   bộ muộn) làm số tính lại khác số đã chụp, và màn chi tiết ca cho thấy điều đó.
7. **Đối soát trong kỳ đi theo từng ca.** Ca thuộc ngày mở ca (ca vắt qua nửa đêm tính cho ngày
   mở). Chênh lệch của kỳ là tổng chênh lệch các ca đã đóng; tiền đầu kỳ là quỹ đầu ca của ca mở
   sớm nhất, không cộng dồn quỹ đầu ca của các ca nối tiếp (tiền ca trước bàn giao cho ca sau).
8. **VietQR sinh trên máy khách** theo chuẩn EMVCo của NAPAS, nên dùng được khi mất mạng. Nội dung
   chuyển khoản là `TT` cộng 8 ký tự đầu của khóa chống trùng của đơn, có trước khi máy chủ cấp mã
   HD. Khóa này được lưu vào `orders.client_id` (cả đơn trực tuyến lẫn ngoại tuyến), nhưng nội
   dung chỉ mang 8 ký tự đầu và chưa có màn nào tìm đơn theo tiền tố đó; hiện người bán đối chiếu
   sao kê theo số tiền và giờ bán.
9. **Chứng từ hủy (ADR-0012) không rút ngược số của ngày cũ hay ca đã đóng.** Phiếu thu, phiếu chi
   đã hủy không tính vào ca và dòng tiền. Đơn bị hủy giữ tiền bán ở ngày bán, ca bán; phần khách
   đã trả lúc bán là một khoản chi riêng ghi trên đơn (`cancel_refund_amount`, kênh
   `cancel_refund_method`, ca `cancel_shift_id`), tính vào ngày hủy và ca hủy theo quy tắc chọn ca
   ở mục 4. Phần doanh thu vẫn loại đơn hủy. Tiền nhà cung cấp hoàn (phiếu trả hàng nhập theo ngày
   lập, phiếu nhập bị hủy theo ngày hủy) là tiền vào theo kênh nhận, cũng gắn ca theo mục 4.

## Hệ quả

- Đối soát tiền mặt khi không dùng ca chỉ tính trên màn báo cáo (tiền đầu ngày nhập tay), không
  lưu lại.
- Phiếu chi chưa có mã chứng từ riêng; phiếu thu có mã `PT-yymmdd-nnnn` từ bộ đếm chứng từ.
- Báo cáo phương thức có thêm một dòng "Chưa rõ" cho tới khi hết kỳ có chứng từ cũ.
- Báo cáo doanh thu cũ (màn Báo cáo) vẫn lọc đơn theo `created_at`; chỉ báo cáo dòng tiền đi theo
  `sold_at`. Hai màn có thể lệch nhau ở đơn ngoại tuyến đồng bộ qua ngày.
- Dấu chênh lệch thống nhất: thực đếm trừ phải có (âm là thiếu, dương là thừa).
- Tiền đã trả lúc nhập hàng (`purchase_orders.paid_amount`) không có phương thức nên chưa vào
  dòng tiền ra, trong khi khoản NCC hoàn khi hủy phiếu thì vào dòng tiền vào. Đơn hủy và phiếu
  hoàn lập trước thay đổi này có kênh NULL, hiện ở dòng "Chưa rõ".
