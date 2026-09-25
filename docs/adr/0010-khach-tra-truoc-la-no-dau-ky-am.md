# ADR-0010: Tiền khách trả trước là nợ đầu kỳ âm trong sổ công nợ

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `apps/api/src/services/customer-debt-ledger.service.ts`,
  `apps/api/src/services/customers.service.ts`, `packages/shared/src/schema/debts.ts`,
  `packages/shared/src/schema/debt-management.ts`,
  `apps/web/src/features/customers/components/OpeningDebtDialog.tsx`, `apps/api/scripts/invariants.sql`
- Bổ sung cho: [ADR-0003](0003-no-dau-ky-khong-gan-don-hang.md),
  [ADR-0008](0008-so-cong-no-khach-duy-nhat.md)

## Bối cảnh

Lúc cắt chuyển từ KiotViet, 4 khách có công nợ âm (tổng -33.500 đ): khách đã trả dư hoặc trả
trước, cửa hàng đang giữ tiền của khách. Mô hình nợ chỉ có số không âm (CHECK
`chk_debts_non_negative`, schema `min(1)`), nên số dư này không mang sang được (GL-09). Để trống
ô số tiền còn hiện thông báo tiếng Anh thô của zod.

## Quyết định

1. **Tiền trả trước là một khoản nợ đầu kỳ có số âm.** Chủ cửa hàng chọn "Khách trả trước" trong
   hộp thoại nạp nợ đầu kỳ; khoản nợ loại `opening` được ghi với `amount = remaining = -X`.
   `current_debt` âm theo, và bất biến `current_debt = sum(debts.remaining)` của ADR-0008 giữ
   nguyên mà không phải sửa chỗ đọc nào.
2. **Nợ phát sinh sau tự cấn vào tiền trả trước theo FIFO**, ngay trong `addCustomerDebt` của sổ
   công nợ, nên bán nợ, điều chỉnh tăng nợ và mọi luồng tạo nợ về sau đều được cấn mà không phải
   sửa từng luồng. Phần cấn là một khoản cấn trừ, ghi vào `reduced` của khoản mới và `reduced` âm
   bằng đúng số đó trên khoản trả trước. `paid` vẫn chỉ tăng qua phiếu thu (ADR-0008, bất biến I5
   `paid = tổng phân bổ phiếu thu`): tiền trả trước đã thu ở hệ thống cũ, không phải tiền thu
   trong hệ thống này.
3. **Ràng buộc CHECK `chk_debts_sign`** thay `chk_debts_non_negative`: khoản thường vẫn không âm;
   chỉ khoản `opening` có `amount < 0` được âm, với `paid = 0`, `reduced <= 0`, `remaining <= 0`
   (kết hợp `chk_debts_balance` thì `remaining` luôn nằm giữa `amount` và 0).
4. **Không có trạng thái vừa nợ vừa trả trước.** Nạp nợ đầu kỳ vẫn đòi `current_debt = 0`
   (ADR-0003), sổ từ chối ghi tiền trả trước khi khách còn khoản nợ dương, và nợ mới luôn cấn hết
   tiền trả trước trước khi thành nợ phải thu.
5. **Phía nhà cung cấp giữ nguyên số dương**: chưa có bảng khoản nợ (ADR-0003), và tệp thật không
   có NCC nợ âm.
6. Thông báo lỗi của ô số tiền và ngày phát sinh dùng `invalid_type_error` tiếng Việt, vì ô để
   trống gửi `null` chứ không phải `undefined`.

### Các phương án đã loại

**Thêm loại nợ `prepayment` vào enum.** Rõ nghĩa hơn khi đọc bảng, nhưng `ALTER TYPE ... ADD
VALUE` không dùng được giá trị mới trong cùng transaction, mà bộ chạy migration gói mọi migration
đang chờ vào một transaction; ràng buộc CHECK nhắc tới giá trị mới sẽ hỏng lúc triển khai. Số âm
trên loại `opening` cũng đúng nghĩa: đó là số dư đầu kỳ, chỉ là có dấu.

**Cột số dư có riêng trên khách hàng.** Quay lại hai nguồn sự thật mà ADR-0008 vừa bỏ; phiếu thu,
bán nợ và báo cáo đều phải nhớ trừ cột này.

**Không cấn tự động, để phiếu thu xử lý.** Khách có tiền trả trước mua nợ thì `current_debt` đúng
về tổng, nhưng khoản nợ mới còn nguyên số dương; phiếu thu bị chặn vì số thu vượt `current_debt`,
khoản nợ treo mãi và báo cáo tuổi nợ báo sai.

## Hệ quả

- Báo cáo tuổi nợ, nợ quá hạn và danh sách khoản nợ để thu đã lọc `remaining > 0`, nên không thấy
  tiền trả trước. Tổng công nợ ở báo cáo khách lọc `current_debt > 0`, cũng không trừ tiền trả
  trước; tổng nào cộng thẳng `current_debt` của mọi khách sẽ ra số ròng.
- Khoản nợ bán được cấn hết bằng tiền trả trước có `remaining = 0`, nhưng đơn vẫn giữ trạng thái
  thanh toán lúc bán, giống phiếu thu không đổi trạng thái đơn (ADR-0008).
- Khách còn tiền trả trước không xoá được, như khách còn nợ.
- Hạn mức nợ (ADR-0009) tính phần còn được nợ là `hạn mức - current_debt`, nên khách "không cho
  nợ" (hạn mức 0) mà có X đ trả trước vẫn mua ghi nợ được tới X đ, đúng bằng phần được cấn.
- Luồng bán khóa sản phẩm trước khi gọi sổ, nên cập nhật khoản trả trước diễn ra sau khóa sản phẩm.
  Không tạo vòng chờ vì mọi bút toán đụng khoản nợ của một khách đều giữ khóa khách trước, và luồng
  bán đã khóa khách trước sản phẩm.
