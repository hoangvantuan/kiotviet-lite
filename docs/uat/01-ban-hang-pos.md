# Kịch Bản UAT 01: Bán Hàng Tại Quầy (POS)

## 1. Mục tiêu

Xác thực toàn bộ quy trình bán hàng tại quầy thu ngân bao gồm: mở ca bán hàng, thêm sản phẩm vào đơn bằng nhiều cách thức (tìm kiếm tên, danh mục, chọn biến thể), thực hiện thanh toán bằng tiền mặt (tính tiền thừa), thanh toán chuyển khoản qua mã QR (VietQR), và bán hàng ghi nợ cho khách hàng kèm kiểm tra hạn mức tín dụng công nợ.

## 2. Điều kiện chuẩn bị

- Ứng dụng đã khởi động và kết nối cơ sở dữ liệu đã nạp dữ liệu mẫu (seed).
- Đăng nhập bằng tài khoản Thu ngân:
  - Số điện thoại: `0901000003`
  - Mật khẩu: `matkhau123`
- Khách hàng mẫu có trong hệ thống:
  - Khách hàng A (Khách quen có hạn mức nợ): Nguyễn Văn Nam (Hạn mức nợ: 5.000.000 đ, Nợ hiện tại: 0 đ).
  - Khách hàng B (Khách có hạn mức nợ nhỏ): Lê Thị Hoa (Hạn mức nợ: 500.000 đ, Nợ hiện tại: 450.000 đ).

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 1.1: Mở ca bán hàng đầu ngày

| Bước | Thao tác thực hiện                                                          | Dữ liệu mẫu                | Kết quả mong đợi                                                                 | Kết quả thực tế | Ghi chú |
| :--- | :-------------------------------------------------------------------------- | :------------------------- | :------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập màn hình Bán hàng (POS) từ thanh điều hướng hoặc đường dẫn `/pos`. | Đường dẫn: `/pos`          | Hiển thị hộp thoại yêu cầu mở ca bán hàng (nếu chưa có ca mở).                   |                 |         |
| 2    | Nhập số tiền tiền mặt đầu ca có trong ngăn kéo thu ngân.                    | Tiền đầu ca: `1.000.000 đ` | Ô nhập tiền định dạng đúng dấu phân cách hàng nghìn.                             |                 |         |
| 3    | Bấm nút "Mở ca".                                                            |                            | Hệ thống ghi nhận mở ca thành công, chuyển vào giao diện bán hàng chính của POS. |                 |         |

### Kịch bản 1.2: Bán hàng thanh toán bằng Tiền mặt (tính tiền thừa chuẩn xác)

| Bước | Thao tác thực hiện                                       | Dữ liệu mẫu                              | Kết quả mong đợi                                                                                       | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------- | :--------------------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tìm kiếm và chọn sản phẩm 1 vào giỏ hàng qua ô tìm kiếm. | Từ khóa: `Cà rốt` (Mã `RC001`)           | Sản phẩm "Cà rốt" xuất hiện trong giỏ, số lượng mặc định là 1 Kg, đơn giá 25.000 đ.                    |                 |         |
| 2    | Tăng số lượng sản phẩm lên 2 Kg.                         | Số lượng: `2`                            | Thành tiền cập nhật thành: `50.000 đ`.                                                                 |                 |         |
| 3    | Chọn thêm sản phẩm có biến thể từ danh mục "Nước ngọt".  | Chọn: `Coca-Cola`, chọn biến thể `330ml` | Thêm vào giỏ 1 lon Coca-Cola 330ml, giá 10.000 đ. Tổng tiền giỏ hàng: `60.000 đ`.                      |                 |         |
| 4    | Bấm nút "Thanh toán" (hoặc phím tắt F9).                 |                                          | Mở hộp thoại thanh toán, phương thức mặc định là "Tiền mặt".                                           |                 |         |
| 5    | Nhập số tiền khách đưa lớn hơn tổng tiền cần thanh toán. | Tiền khách đưa: `100.000 đ`              | Hệ thống tự động tính tiền thừa trả khách: `40.000 đ`.                                                 |                 |         |
| 6    | Bấm nút "Hoàn tất thanh toán".                           |                                          | Đơn hàng hoàn tất, hiển thị thông báo thành công, giỏ hàng tự động làm mới sẵn sàng cho đơn tiếp theo. |                 |         |

### Kịch bản 1.3: Bán hàng thanh toán Chuyển khoản quét mã QR

| Bước | Thao tác thực hiện                                                      | Dữ liệu mẫu                         | Kết quả mong đợi                                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Chọn sản phẩm vào giỏ hàng.                                             | 1 gói `Bột giặt Omo` (giá 85.000 đ) | Tổng tiền giỏ hàng hiển thị `85.000 đ`.                                                              |                 |         |
| 2    | Bấm nút "Thanh toán".                                                   |                                     | Hiển thị màn hình chọn phương thức thanh toán.                                                       |                 |         |
| 3    | Chọn phương thức thanh toán "Chuyển khoản / QR Code".                   |                                     | Hiển thị mã VietQR động chứa chính xác số tiền `85.000 đ` và nội dung chuyển khoản theo mã đơn hàng. |                 |         |
| 4    | Xác nhận khách đã chuyển khoản thành công và bấm "Xác nhận thanh toán". |                                     | Đơn hàng chuyển sang trạng thái đã thanh toán thành công, ghi nhận doanh thu qua ngân hàng.          |                 |         |

### Kịch bản 1.4: Bán hàng Ghi nợ (Trong hạn mức cho phép)

| Bước | Thao tác thực hiện                                 | Dữ liệu mẫu                                         | Kết quả mong đợi                                                                                         | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tìm kiếm và gán khách hàng quen vào đơn hàng.      | Tìm khách: `Nguyễn Văn Nam`                         | Thông tin khách hàng được gán vào đơn, hiển thị hạn mức nợ còn lại: `5.000.000 đ`.                       |                 |         |
| 2    | Chọn sản phẩm vào giỏ hàng.                        | 2 thùng `Bia Heineken` (tổng tiền ví dụ: 500.000 đ) | Tổng tiền thanh toán: `500.000 đ`.                                                                       |                 |         |
| 3    | Mở màn hình thanh toán, chọn phương thức "Ghi nợ". | Số tiền trả trước: `0 đ`, Nợ lại: `500.000 đ`       | Hệ thống kiểm tra số nợ mới (500.000 đ) nằm trong hạn mức cho phép (5.000.000 đ), cho phép bấm xác nhận. |                 |         |
| 4    | Bấm "Hoàn tất đơn hàng".                           |                                                     | Đơn hàng tạo thành công, công nợ của khách Nguyễn Văn Nam được cộng thêm 500.000 đ.                      |                 |         |

### Kịch bản 1.5: Bán hàng Ghi nợ (Vượt quá hạn mức tín dụng)

| Bước | Thao tác thực hiện                                                | Dữ liệu mẫu                                  | Kết quả mong đợi                                                                                   | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tìm kiếm và gán khách hàng có hạn mức nợ thấp.                    | Tìm khách: `Lê Thị Hoa`                      | Hiển thị thông tin khách: Hạn mức 500.000 đ, Nợ hiện tại: 450.000 đ, Còn có thể nợ: `50.000 đ`.    |                 |         |
| 2    | Chọn sản phẩm có giá trị lớn hơn hạn mức còn lại vào giỏ.         | 1 hộp `Sữa bột Ensure` (giá 450.000 đ)       | Tổng tiền đơn hàng: `450.000 đ`.                                                                   |                 |         |
| 3    | Chọn phương thức thanh toán "Ghi nợ" với số tiền nợ là 450.000 đ. | Nợ lại: `450.000 đ` (Vượt hạn mức 400.000 đ) | Hệ thống hiển thị cảnh báo đỏ hoặc chặn hoàn tất đơn: "Vượt hạn mức nợ cho phép của khách hàng".   |                 |         |
| 4    | Khách hàng đưa trước tiền mặt 400.000 đ, chỉ nợ lại 50.000 đ.     | Tiền mặt: `400.000 đ`, Nợ: `50.000 đ`        | Hệ thống kiểm tra số nợ hợp lệ (đúng bằng hạn mức còn lại 50.000 đ) và cho phép hoàn tất đơn hàng. |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Mở ca ghi nhận đúng số tiền mặt đầu ngày.
- Tính toán chính xác tổng tiền hàng, tiền khách đưa, tiền thừa trả lại.
- Tạo mã QR chuyển khoản đúng số tiền và nội dung.
- Kiểm soát chặt chẽ hạn mức ghi nợ của khách hàng, cảnh báo và chặn kịp thời khi vượt hạn mức.
