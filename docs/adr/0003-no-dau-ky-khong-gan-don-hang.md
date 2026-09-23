# ADR-0003: Khoản nợ không bắt buộc gắn với đơn hàng

- Trạng thái: Đã chốt
- Ngày: 2026-09-22
- Phạm vi: `packages/shared/src/schema/debts.ts`, `apps/api/src/services/customers.service.ts`,
  `apps/api/src/services/receipts.service.ts`, `apps/api/src/services/reports.service.ts`,
  `apps/api/src/services/supplier-payments.service.ts`,
  `apps/api/src/services/supplier-debt-adjustments.service.ts`

## Bối cảnh

Cửa hàng chuyển từ KiotViet sang. Tại thời điểm cắt chuyển, sổ sách đang có
422.158.349 đ khách nợ cửa hàng trải trên 46 khách, và 305.431.600 đ cửa hàng nợ
nhà cung cấp trải trên 8 nhà cung cấp. Số này có thật, phải mang sang, nhưng không
gắn với đơn hàng nào trong hệ thống vì lịch sử đơn hàng không được chuyển sang.

Mô hình hiện tại buộc mọi khoản nợ phải trỏ tới một đơn hàng. Không có đường nào
đưa nợ đầu kỳ vào mà không bịa ra đơn hàng giả.

Phía nhà cung cấp còn thiếu hơn: phiếu chi trừ thẳng vào tổng công nợ, không hề có
bảng khoản nợ để phân bổ, nên cũng không có nơi nào ghi được số nợ mở đầu.

## Quyết định

Nới mô hình nợ sẵn có thay vì dựng bảng mới:

1. Khoản nợ được phép không gắn đơn hàng.
2. Thêm thuộc tính loại nợ để phân biệt nợ sinh từ bán hàng với nợ đầu kỳ.
3. Phía nhà cung cấp bổ sung cơ chế điều chỉnh nợ tương tự phía khách hàng, để nạp
   được số nợ mở đầu và để sửa sai khi cần.
4. Chỉ chủ cửa hàng được nạp nợ đầu kỳ. Hệ thống từ chối nạp nếu công nợ hiện tại
   của đối tượng đó khác 0, để không cộng trùng.
5. Số tiền và ngày phát sinh của nợ đầu kỳ do người dùng gõ tay trên màn hình, không
   đọc tự động từ tệp.

### Các phương án đã loại

**Bịa đơn hàng giả để treo nợ.** Đơn giả sẽ chảy thẳng vào báo cáo doanh thu, lợi
nhuận gộp và báo cáo mặt hàng bán chạy. Muốn loại nó ra thì mọi truy vấn báo cáo phải
mang thêm một điều kiện lọc, và chỉ cần quên một chỗ là số liệu sai.

**Dựng bảng nợ đầu kỳ riêng.** Phiếu thu phân bổ theo thứ tự cũ trước mới sau, và báo
cáo tuổi nợ xếp nhóm theo ngày phát sinh. Cả hai đều phải đọc gộp hai bảng rồi trộn lại
theo thời gian. Chi phí này kéo dài mãi mãi, đổi lấy một lợi ích chỉ có giá trị đúng
một lần lúc chuyển dữ liệu.

**Để ngày phát sinh của nợ đầu kỳ là ngày nạp.** Toàn bộ nợ cũ sẽ hiện ra như nợ mới
tinh trong báo cáo tuổi nợ, và nằm cuối hàng đợi phân bổ phiếu thu. Nghĩa là khách trả
tiền thì hệ thống trừ vào nợ mới trước, còn nợ thật sự lâu năm thì treo mãi. Đúng ngược
với thực tế.

## Hệ quả

- Mọi phép nối từ khoản nợ sang đơn hàng phải là nối trái. Hiện có đúng một chỗ đang
  nối trong là `getCustomerDebts` trong `customers.service.ts`; để nguyên thì nợ đầu kỳ
  biến mất khỏi sổ nợ của khách, lỗi im lặng và rất khó thấy.
- Chỗ nào đang hiển thị mã đơn hàng của một khoản nợ đều phải chịu được giá trị trống.
- Công nợ khách hàng vốn đã có hai nguồn sự thật song song: con số tổng trên hồ sơ khách
  và tổng các khoản nợ chưa trả hết. Nợ đầu kỳ phải ghi vào cả hai, nếu không phiếu thu
  sẽ báo còn tiền để thu mà không tìm ra khoản nào để trừ, hoặc ngược lại.
- Ngày phát sinh gõ tay là số liệu do người nhập chịu trách nhiệm. Sai ngày thì báo cáo
  tuổi nợ sai theo, hệ thống không có cách nào tự phát hiện.
- Phía nhà cung cấp hiện chưa có bảng khoản nợ để phân bổ: nợ đầu kỳ là một bản ghi
  điều chỉnh có loại `opening` và ngày phát sinh, đồng thời cập nhật tổng công nợ trên
  hồ sơ nhà cung cấp. Phiếu chi sau đó trừ trực tiếp vào tổng này như trước; không có
  phân bổ FIFO hoặc báo cáo tuổi nợ nhà cung cấp trong phạm vi quyết định này.
