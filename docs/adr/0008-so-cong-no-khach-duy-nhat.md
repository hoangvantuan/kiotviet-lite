# ADR-0008: Một sổ công nợ khách hàng duy nhất

- Trạng thái: Đã chốt
- Ngày: 2026-09-25
- Phạm vi: `apps/api/src/services/customer-debt-ledger.service.ts`,
  `apps/api/src/services/orders.service.ts`, `apps/api/src/services/returns.service.ts`,
  `apps/api/src/services/receipts.service.ts`, `apps/api/src/services/debt-adjustments.service.ts`,
  `packages/shared/src/schema/debts.ts`,
  `apps/api/src/db/migrations/0047_debt_ledger_backfill.sql`
- Thay đổi hệ quả của: [ADR-0003](0003-no-dau-ky-khong-gan-don-hang.md)

## Bối cảnh

ADR-0003 ghi nhận công nợ khách hàng có hai nguồn sự thật song song: con số tổng trên hồ sơ
khách (`customers.current_debt`) và tổng các khoản nợ chưa trả hết. Mỗi luồng tự sửa hai con số
này theo cách riêng, và chúng đã lệch nhau:

- Điều chỉnh nợ chỉ sửa con số tổng. Điều chỉnh tăng không tạo khoản nợ, nên phiếu thu báo còn
  tiền để thu mà không tìm ra khoản nào để trừ (TIEN-03).
- Trả hàng cấn nợ và điều chỉnh giảm đều ghi vào "đã trả", nên "đã trả" không còn là tiền thực
  thu. Trạng thái thanh toán của đơn và báo cáo thu tiền đọc sai theo (TIEN-01).
- Điều chỉnh nợ gõ số nợ mới, nên chỉ cần mở hộp thoại cũ rồi bấm lưu là ghi đè thay đổi của
  người khác, hoặc lỡ tay xóa sạch nợ (TIEN-102, TIEN-110).
- Bán, trả, thu và điều chỉnh khóa khách, khoản nợ và sản phẩm theo thứ tự khác nhau, nên hai
  giao dịch đồng thời trên cùng khách có thể deadlock (TIEN-103).

## Quyết định

1. **Khoản nợ là nguồn sự thật.** `current_debt` chỉ là tổng giữ sẵn của `debts.remaining`.
   Mọi thay đổi số dư đi qua `customer-debt-ledger.service.ts`, và mỗi lần ghi kiểm bất biến
   `current_debt = sum(debts.remaining)` ngay trong transaction; lệch thì hủy cả transaction.
2. **Tách tiền thu khỏi giảm trừ.** Mỗi khoản nợ có `amount = paid + reduced + remaining`, do
   ràng buộc CHECK giữ. `paid` chỉ tăng qua phiếu thu, `reduced` nhận trả hàng cấn nợ và điều
   chỉnh giảm.
3. **Điều chỉnh nợ là bút toán.** Người dùng chọn tăng hoặc giảm và nhập số chênh lệch kèm số
   nợ đang thấy (`expectedCurrentDebt`). Số thật đã khác thì trả 409. Tăng nợ tạo khoản nợ loại
   `adjustment`; giảm nợ giảm trừ các khoản nợ theo FIFO. Bảng điều chỉnh nợ vẫn ghi số trước và
   sau để tra lịch sử.
4. **Một thứ tự khóa toàn hệ thống**: chứng từ gốc (`orders`), `customers`, `debts` theo id,
   `products` theo id, `product_variants`. Deadlock hay xung đột tuần tự hóa còn sót (40P01, 40001) được trả 409 "Hệ thống đang bận xử lý giao dịch khác, vui lòng thử lại" để người dùng
   thử lại.
5. **Điền ngược dữ liệu cũ** (migration 0047): giữ `current_debt` vì đó là số khách đang thấy và
   chủ cửa hàng đã đối chiếu, sửa các khoản nợ cho khớp. Mỗi khách bị sửa có một dòng nhật ký
   thao tác `debt_ledger.backfilled`.

### Các phương án đã loại

**Bỏ cột `current_debt`, luôn tính tổng khi đọc.** Danh sách khách, kiểm hạn mức nợ lúc bán và
báo cáo đều cần con số này; tính tổng mỗi lần đọc tốn truy vấn gộp trên bảng lớn nhất của phần
công nợ. Giữ cột nhưng chỉ cho sổ ghi và kiểm bất biến mỗi lần ghi thì vẫn có một nguồn sự thật.

**Điền ngược bằng cách tính lại `current_debt` từ khoản nợ.** Số khách đang thấy sẽ đổi sau khi
cập nhật phần mềm mà không ai giải thích được. Các lệch cũ phần lớn do điều chỉnh tăng không tạo
khoản nợ, tức con số tổng mới là số đúng.

**Gom "giảm trừ" vào "đã trả" như cũ và ghi loại vào bảng phụ.** Mọi báo cáo thu tiền phải trừ
ngược phần giảm trừ, quên một chỗ là số sai.

## Hệ quả

- Mã mới muốn đổi công nợ khách phải gọi sổ công nợ, không cập nhật thẳng `customers.current_debt`
  hay `debts.remaining`. Bất biến được kiểm mỗi lần ghi, nên sai sót lộ ra ngay thành lỗi thay vì
  lệch âm thầm.
- Luồng mới đụng khách, khoản nợ hay sản phẩm phải khóa đúng thứ tự trên, kể cả khóa ngầm do
  chèn dòng có khóa ngoại. Thứ tự được ghi ở đầu `customer-debt-ledger.service.ts` và được kiểm
  bằng test ghi lại câu lệnh khóa.
- Trả hàng cấn hết khoản nợ của đơn thì đơn chỉ đổi thành "đã thanh toán" khi khách thực có trả
  tiền cho đơn đó (khoản nợ có `paid > 0`, hoặc đơn vốn trả một phần lúc bán); không thu đồng nào
  thì giữ nguyên trạng thái. Phiếu thu vẫn không đổi trạng thái thanh toán của đơn như trước.
  Migration không sửa trạng thái thanh toán của đơn cũ, nên đơn nợ cũ đã được mã cũ chuyển sang
  "đã thanh toán" nhờ trả hàng vẫn giữ trạng thái đó.
- Phiếu thu, sổ công nợ và màn hình lập phiếu thu ghi nhãn khoản nợ theo loại: mã đơn, "Nợ đầu
  kỳ" hoặc "Điều chỉnh tăng nợ".
- Phía nhà cung cấp chưa có bảng khoản nợ, nên chưa áp mô hình này; vẫn như ADR-0003.
