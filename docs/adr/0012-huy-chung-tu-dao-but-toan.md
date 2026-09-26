# ADR-0012: Hủy chứng từ bằng bút toán đảo, trả hàng nhập theo giá nhập thực

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `apps/api/src/lib/document-status.ts`, `apps/api/src/services/document-cancel.helper.ts`,
  `apps/api/src/services/order-cancel.service.ts`, `apps/api/src/services/purchase-order-reversal.service.ts`,
  `apps/api/src/services/receipts.service.ts`, `apps/api/src/services/supplier-payments.service.ts`,
  `apps/api/src/services/inventory-cost.helper.ts`

## Bối cảnh

Đợt kiểm tra go-live (TIEN-107, KHO-11, TIEN-104) thấy cửa hàng không có cách sửa một chứng từ lập nhầm:
phiếu thu, phiếu chi, đơn bán và phiếu nhập đã ghi thì chỉ còn cách điều chỉnh nợ hoặc kiểm kê bù, mất
vết chứng từ gốc. Cũng chưa có nghiệp vụ trả hàng cho nhà cung cấp, và phiếu chi không gắn được với
phiếu nhập nào nên không biết phiếu nhập nào đã trả xong.

## Quyết định

1. **Hủy không xóa.** Chứng từ bị hủy giữ nguyên dòng, chuyển `status = 'cancelled'`, ghi người hủy,
   lúc hủy và lý do (bắt buộc, tối đa 500 ký tự). Hủy lần hai trả 409. Mọi lần hủy ghi audit
   (`receipt.cancelled`, `supplier_payment.cancelled`, `order.cancelled`, `purchase_order.cancelled`).
   Danh sách chứng từ, báo cáo doanh thu, tồn kho, công nợ và số dư chỉ cộng chứng từ còn hiệu lực
   (bộ lọc dùng chung ở `lib/document-status.ts`).
2. **Đảo đúng bút toán đã ghi.** Hủy đọc lại các bút toán chứng từ đã ghi và ghi bút toán ngược, không
   tính lại từ số hiện tại:
   - Phiếu thu: trả `paid` về từng khoản nợ theo dòng phân bổ, công nợ khách tăng lại. Dòng phân bổ
     giữ làm vết; bất biến I5 chỉ cộng phân bổ của phiếu thu còn hiệu lực. Khoản nợ mở lại cấn tiền
     trả trước còn lại của khách trước (ADR-0011).
   - Đơn bán: hoàn kho từng dòng theo hệ số quy đổi và biến thể đã chụp lúc bán (sổ kho loại
     `order_cancel`, đúng số các dòng `sale` của đơn trong sổ kho, không theo cờ theo dõi tồn
     hiện tại), giảm trừ khoản nợ của đơn, hoàn tiền trả trước đã cấn. Đơn đã có phiếu trả hàng
     hoặc đã có phiếu thu phân bổ vào thì không hủy được: hủy phiếu thu trước; đơn đã trả hàng thì
     giữ nguyên.
   - Phiếu chi: công nợ NCC tăng lại đúng số chi; phiếu chi gắn phiếu nhập thì phiếu nhập trả về trạng
     thái thanh toán cũ. Phiếu nhập gắn kèm đã phát sinh tiền NCC phải hoàn (trả hàng sau phiếu chi)
     thì không hủy được phiếu chi đó: hủy lúc này làm nợ NCC tăng đủ số chi trong khi khoản hoàn vẫn
     treo.
   - Phiếu nhập: rút lô khỏi kho (sổ kho loại `purchase_cancel`), giảm nợ phải trả NCC phần còn nợ của
     phiếu (`cancel_debt_reduction`), phần đã trả lúc nhập ghi thành tiền NCC phải hoàn
     (`cancel_supplier_refund`). Tồn hiện tại không đủ để rút (hàng đã bán) thì chặn và nêu tên sản
     phẩm thiếu (số cần rút gộp theo sản phẩm, biến thể). Phiếu đã có phiếu trả hàng nhập (kể cả
     phiếu giá trị 0) hoặc còn phiếu chi gắn phiếu thì không hủy được. Sản phẩm đã xóa mềm thì chặn,
     báo tên để khôi phục trước.
3. **Quyền.** Chủ và quản lý có quyền `documents.cancel`. Nhân viên cần chủ hoặc quản lý nhập PIN theo
   cơ chế người duyệt (ADR-0009, `verifyApproval`); thiếu PIN hoặc PIN của chính nhân viên trả 403.
   Quy tắc này áp cho cả phiếu chi; nhân viên vốn không vào được màn phiếu chi, phiếu nhập
   (`inventory.manage`). Người duyệt ghi vào nhật ký hủy (`approvedBy`). PIN kiểm ở route, trên
   kết nối gốc, trước transaction của `idempotent()` (`cancelDocumentRoute`): PIN sai phải ghi được
   số lần sai dù lệnh hủy không thành, không thì dò được PIN người duyệt.
4. **Thứ tự khóa** theo ADR-0008: phía khách là đơn, khách, khoản nợ, sản phẩm, biến thể; phía NCC là
   chứng từ, NCC, sản phẩm, biến thể.
5. **Giá vốn khi rút lô (hủy phiếu nhập, trả hàng nhập).** Đảo công thức bình quân gia quyền của
   ADR-0007: giá vốn mới = (tồn trước × giá vốn trước − giá trị thực của phần rút) / (tồn trước − số
   rút), làm tròn đồng ở kết quả. Tồn sau ≤ 0, hoặc giá trị còn lại ≤ 0, thì giữ giá vốn trước. Biến
   thể tính trên tồn và giá vốn của biến thể, sau đó đồng bộ tồn và giá vốn tóm tắt của cha như lúc
   nhập. Giá trị thực của phần rút là giá nhập thực của dòng phiếu (sau chiết khấu dòng và chiết khấu
   phiếu phân bổ), cùng số đã cộng vào giá vốn lúc nhập, nên nhập rồi hủy ngay (còn tồn khác) đưa giá
   vốn về đúng số cũ. Riêng khi rút làm tồn về 0 thì giá vốn giữ số hiện tại (bình quân gồm cả lô vừa
   rút), không khôi phục giá vốn trước lần nhập: không còn hàng nên số này chỉ là giá tham chiếu cho
   lần bán, nhập sau.
6. **Trả hàng nhập** là chứng từ mới (mã `THN-YYYYMMDD-NNN`, cấp từ bộ đếm chứng từ): chọn phiếu nhập
   gốc, mỗi dòng trả tối đa số đã nhập trừ số đã trả trước đó. Giá trị trả = giá nhập thực của dòng
   gốc chia theo số lượng, tính lũy kế như trả hàng bán (ADR-0010, `computeReturnLineRefund`): trả
   nhiều lần cộng lại bằng trả một lần, trả hết khớp đúng giá trị dòng.
   Giá trị trả giảm nợ phải trả phần còn nợ của phiếu, phần vượt ghi thành tiền NCC phải hoàn.
7. **Phiếu chi gắn phiếu nhập** (TIEN-104, tùy chọn): số chi không vượt số còn nợ của phiếu (tổng phiếu
   trừ hàng đã trả trừ đã trả ròng). Đã trả ròng = trả lúc nhập + phiếu chi gắn phiếu còn hiệu lực −
   tiền NCC phải hoàn khi trả hàng, phần hoàn chỉ trừ tối đa bằng số đã trả gắn phiếu
   (`purchaseOrderPaidNet`, không âm). Phiếu trả bằng phiếu chi chung (mọi phiếu chi trước TIEN-104)
   thì khoản hoàn không thuộc số đã trả của phiếu, vẫn ghi ở `return_refund_amount`. Trạng thái thanh
   toán của phiếu nhập tính từ số này. Lọc theo trạng thái thanh toán chỉ xét phiếu còn hiệu lực.
   Bảng nợ theo phiếu ở màn NCC chỉ trừ trả lúc nhập và phiếu chi gắn phiếu, nên số theo phiếu không
   vượt công nợ NCC và không liệt kê khi NCC hết nợ.
8. **Idempotency.** Mọi lệnh hủy và lệnh tạo phiếu trả hàng nhập đi qua `idempotent()` (R4); gửi lại
   cùng khóa chỉ đảo một lần.

## Hệ quả

- Bất biến I7 (công nợ NCC) trừ thêm `cancel_debt_reduction`, `purchase_returns.debt_reduction_amount`
  và chỉ cộng phiếu chi còn hiệu lực.
- Giá vốn sau khi rút lô chỉ đúng tuyệt đối khi giữa lúc nhập và lúc rút không có lần nhập khác làm
  pha loãng; có lần nhập xen giữa thì kết quả là xấp xỉ bình quân, cùng cách KiotViet làm. Script
  `cost:recalc` không tự tính lại sản phẩm có `purchase_cancel` hoặc `purchase_return`, chỉ liệt kê
  để xem tay.
- Hủy phiếu nhập đã trả lúc nhập, rồi hủy tiếp phiếu chi không gắn phiếu đã trả phần đó, làm công nợ
  NCC tăng lại: hai chứng từ độc lập, hủy cái nào đảo đúng bút toán của cái đó.
- Tiền NCC phải hoàn chỉ được ghi lên chứng từ, chưa có sổ theo dõi thu hồi riêng.
- Đơn đã hủy không còn đếm là chờ duyệt (ADR-0009) và không duyệt được nữa; `review_status` giữ
  nguyên làm vết.
- Cột `status` của chứng từ chưa có ràng buộc CHECK ở CSDL, giá trị chỉ được kiểm ở tầng ứng dụng
  (`documentStatusSchema`).
