# ADR-0007: Giá vốn tính theo giá nhập thực, riêng cho từng biến thể

- Trạng thái: Đã chốt
- Ngày: 2026-09-25
- Phạm vi: phiếu nhập hàng, nhập kho thủ công, `apps/api/src/services/inventory-cost.helper.ts`,
  `apps/api/src/services/purchase-orders.service.ts`, `apps/api/src/services/inventory-transactions.service.ts`

## Bối cảnh

Đợt kiểm tra go-live (KHO-04, KHO-05, KHO-10) thấy ba chỗ làm sai giá vốn và tồn kho khi nhập hàng:

- Giá vốn bình quân dùng đơn giá ghi trên phiếu, trước chiết khấu. Chiết khấu phiếu còn được tính sau
  khi giá vốn đã ghi. Phiếu 300.000 đ chiết khấu 10% làm giá trị tồn tăng 300.000 đ thay vì 270.000 đ.
- Nhập cho biến thể chỉ tăng tồn biến thể. Giá vốn bình quân tính trên tổng tồn các biến thể rồi ghi vào
  sản phẩm cha, giá vốn biến thể đứng yên, tồn cha không đồng bộ.
- Phiếu nhập không nhận đơn vị quy đổi, nhập một thùng bị ghi thành một đơn vị tính.

Chuẩn mực kế toán VAS 02 (Hàng tồn kho) đoạn 06: chiết khấu thương mại được trừ khỏi chi phí mua.
KiotViet cũng lấy giá vốn nhập là đơn giá sau chiết khấu và phân bổ chiết khấu phiếu theo giá trị dòng.

## Quyết định

1. **Giá nhập thực.** Với mỗi dòng: tiền hàng thực = thành tiền dòng (đã trừ chiết khấu dòng) trừ phần
   chiết khấu phiếu phân bổ cho dòng. Chiết khấu phiếu phân bổ theo tỷ lệ thành tiền dòng bằng phương pháp
   phần dư lớn nhất: mỗi dòng lấy phần nguyên, số đồng còn lại cộng cho các dòng có phần lẻ lớn nhất (hòa
   thì dòng đứng trước). Tổng phân bổ luôn đúng bằng chiết khấu phiếu, không dòng nào nhận quá thành tiền
   của nó, dòng 0 đồng không nhận chiết khấu. Tổng tiền hàng thực các dòng bằng tổng phiếu.
2. **Bình quân gia quyền.** Giá vốn mới = (tồn trước × giá vốn trước + tiền hàng thực của lô) / tồn sau,
   làm tròn đồng một lần ở kết quả, không làm tròn đơn giá lô trước. Tồn trước ≤ 0 hoặc chưa có giá vốn thì
   giá vốn mới = tiền hàng thực / số lượng.
3. **Sổ giao dịch kho** ghi `unit_cost` là giá nhập thực trên một đơn vị tính (làm tròn đồng), `quantity`
   theo đơn vị tính. Dòng phiếu nhập lưu thêm `order_discount_allocated` và `unit_cost`; hai cột này null
   nghĩa là phiếu lập trước quy tắc này.
4. **Biến thể.** Giá vốn bình quân tính riêng cho biến thể trên tồn của biến thể. Biến thể chưa có giá
   vốn riêng thì lấy giá vốn cha làm giá vốn trước. Trong cùng transaction, tồn cha = tổng tồn biến thể.
5. **Giá vốn sản phẩm cha có biến thể** (`products.cost_price`) là số tóm tắt: bình quân giá vốn các biến
   thể theo tồn dương, bỏ qua biến thể chưa có giá vốn. Tính lại mỗi lần nhập hàng hay điều chỉnh tồn biến
   thể. Báo cáo cấp sản phẩm dùng số này; giá vốn để chụp vào đơn bán là giá vốn biến thể, lấy qua
   `getEffectiveCostPrice` (biến thể trước, không có thì cha).
6. **Đơn vị quy đổi.** Dòng phiếu nhập có thể chọn một đơn vị quy đổi đã khai báo của sản phẩm. Số lượng,
   đơn giá, chiết khấu dòng và thành tiền giữ theo đơn vị đó như trên hóa đơn nhà cung cấp; máy chủ nhân
   hệ số ra đơn vị tính cho tồn kho, giá vốn và sổ, và chụp tên đơn vị cùng hệ số vào dòng phiếu.

## Hệ quả

- Giá vốn của các sản phẩm đã từng nhập có chiết khấu trước bản sửa vẫn đang bị thổi. Script
  `pnpm --filter @kiotviet-lite/api cost:recalc` đi lại sổ nhập, in chênh lệch (mặc định chỉ báo cáo) và
  với `--apply` thì ghi lại giá vốn, kèm audit `inventory.cost_recalculated`. Sản phẩm có giá vốn đã bị sửa
  tay sau lần nhập cuối, và giá vốn biến thể cũ, không tự tái lập được: script chỉ liệt kê để xem tay.
- Bán, trả hàng, kiểm kê không tính lại giá vốn tóm tắt của sản phẩm cha, nên số này có thể lệch nhẹ so
  với tổng giá trị biến thể giữa hai lần nhập. Báo cáo cần giá trị tồn tuyệt đối đúng nên cộng theo biến thể.
- `unit_cost` trên sổ là số làm tròn; giá vốn bình quân dùng tiền hàng thực chưa làm tròn nên không cộng dồn
  sai số làm tròn qua các lần nhập.
