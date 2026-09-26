# ADR-0012: Ca bán hàng và dòng tiền theo phương thức

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
   unique một phần). Phiếu thu, phiếu chi, phiếu trả chỉ gắn ca nếu người lập đang có ca mở, không
   chặn.
4. **Đơn ngoại tuyến không bị chặn vì ca.** Khi đồng bộ, đơn gắn vào ca của người bán có giờ bán
   nằm trong khoảng mở, đóng ca; không khớp thì để trống và hiện ở mục "chưa gắn ca" của báo cáo.
5. **Chênh lệch ca = tiền đếm - (quỹ đầu ca + tiền mặt thu - tiền mặt chi và hoàn).** Số liệu
   lúc đóng được chụp vào `close_summary`; chứng từ gắn vào ca sau khi đóng (đơn ngoại tuyến đồng
   bộ muộn) làm số tính lại khác số đã chụp, và màn chi tiết ca cho thấy điều đó.
6. **VietQR sinh trên máy khách** theo chuẩn EMVCo của NAPAS, nên dùng được khi mất mạng. Nội dung
   chuyển khoản là `TT` cộng 8 ký tự đầu của khóa chống trùng của đơn (cũng là `clientId` của đơn
   ngoại tuyến), có trước khi máy chủ cấp mã HD.

## Hệ quả

- Đối soát tiền mặt khi không dùng ca chỉ tính trên màn báo cáo (tiền đầu ngày nhập tay), không
  lưu lại.
- Phiếu chi chưa có mã chứng từ riêng; phiếu thu có mã `PT-yymmdd-nnnn` từ bộ đếm chứng từ.
- Báo cáo phương thức có thêm một dòng "Chưa rõ" cho tới khi hết kỳ có chứng từ cũ.
