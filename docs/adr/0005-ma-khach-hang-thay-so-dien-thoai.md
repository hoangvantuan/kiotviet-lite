# ADR-0005: Mã khách hàng là định danh chính, số điện thoại không còn bắt buộc

- Trạng thái: Đã chốt
- Ngày: 2026-09-22
- Phạm vi: `packages/shared/src/schema/customers.ts`, `packages/shared/src/schema/suppliers.ts`,
  `apps/api/src/services/customers.service.ts`, `apps/api/src/services/receipts.service.ts`

## Bối cảnh

Trong 287 khách hàng thật mang sang từ KiotViet, 71 khách không có số điện thoại. Đây là
khách quen mua tại quầy, cửa hàng biết mặt chứ không lưu số.

Mô hình hiện tại đặt số điện thoại là bắt buộc và duy nhất trong phạm vi cửa hàng, đồng
thời dùng nó làm thứ để tra cứu khách tại quầy. Không có cách nào lưu 71 khách kia.

Ngoài ra, cửa hàng sẽ sửa danh sách khách hàng và nhà cung cấp bằng cách xuất ra bảng
tính, sửa, rồi nhập lại. Việc này cần một khóa đối chiếu ổn định, không đổi khi sửa tên
hay sửa số điện thoại.

## Quyết định

1. Số điện thoại khách hàng được phép bỏ trống. Khi có thì vẫn không được trùng trong
   cùng cửa hàng, khi trống thì nhiều bản ghi cùng trống là hợp lệ. Đây đúng là cách
   nhà cung cấp đang làm, nên chỉ là áp lại khuôn có sẵn.
2. Khách hàng và nhà cung cấp đều có mã định danh riêng, mọi bản ghi đều có, không trùng
   trong cùng cửa hàng. Mã này là khóa đối chiếu khi nhập liệu hàng loạt và là cách tra
   cứu thay thế khi khách không có số điện thoại.
3. Mã của bản ghi tạo mới do hệ thống tự sinh theo bộ đếm, nhưng người dùng được sửa đè
   bằng mã tự đặt. Quầy bán hàng không được dừng lại chỉ vì một cái mã, nên mặc định phải
   tự chạy; còn khi chủ cửa hàng sửa danh sách bằng bảng tính thì chính họ là người đặt mã,
   nên không khóa cứng.

### Phương án đã loại

**Bịa số điện thoại giả cho 71 khách.** Số giả trông y hệt số thật, nhân viên sẽ gọi vào
đó. Nó cũng chiếm chỗ trong chỉ mục duy nhất, nên khách thật có số đó sau này sẽ không
tạo được. Sai lầm này không có đường lùi vì không cách nào phân biệt số bịa với số thật.

**Bỏ mã, đối chiếu bằng số điện thoại khi nhập lại.** Không dùng được, vì chính 71 khách
không có số là những khách cần đối chiếu nhất. Ngoài ra sửa số điện thoại trong tệp sẽ
biến thành tạo mới một khách trùng.

## Hệ quả

- Tìm khách tại quầy phải chấp nhận cả mã lẫn số điện thoại. Chỉ tìm theo số thì 71 khách
  kia coi như không tồn tại với người bán hàng.
- Mọi chỗ đang coi số điện thoại khách là có sẵn đều phải chịu được giá trị trống, kể cả
  mẫu in và màn hình phiếu thu.
- Mã khách hàng in ra giấy và lưu trong tệp bảng tính của cửa hàng. Sau khi đã dùng thật
  thì việc đổi cách sinh mã là không đảo ngược được.
- Mã sinh ra từ hai đường, nên phải kiểm trùng ở cả hai. Bộ đếm cũng phải nhảy qua những
  mã mà người dùng đã tự chiếm, nếu không lần sinh tự động kế tiếp sẽ đâm vào mã đã có.
