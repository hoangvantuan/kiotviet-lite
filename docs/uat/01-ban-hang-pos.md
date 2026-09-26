# Kịch Bản UAT 01: Bán Hàng Tại Quầy (POS)

## 1. Mục tiêu

Xác thực quy trình bán hàng tại quầy thu ngân: vào màn hình bán hàng, thêm sản phẩm vào đơn (tìm theo tên, chọn biến thể), thanh toán tiền mặt (tính tiền thừa), thanh toán chuyển khoản, và bán ghi nợ cho khách hàng kèm kiểm tra hạn mức công nợ.

## 2. Điều kiện chuẩn bị

- Ứng dụng đã khởi động và kết nối cơ sở dữ liệu **vừa nạp lại** dữ liệu mẫu (`FORCE_SEED=1 pnpm --filter @kiotviet-lite/api run db:seed`). Các kịch bản 1.4 và 1.5 dựa vào công nợ ban đầu bằng 0.
- Đăng nhập bằng tài khoản Thu ngân:
  - Số điện thoại: `0901000003`
  - Mật khẩu: `matkhau123`
- Khách hàng mẫu dùng trong kịch bản (có sẵn trong seed):
  - `KH000005` Bùi Thanh Hà, nhóm "Khách lẻ": hạn mức nợ `5.000.000 đ`, nợ hiện tại `0 đ`.
- Sản phẩm mẫu dùng trong kịch bản:

| Mã hàng     | Tên                          | Đơn vị | Giá bán   |
| :---------- | :--------------------------- | :----- | :-------- |
| `RC001`     | Cà rốt                       | Kg     | 25.000 đ  |
| `CC001-330` | Coca-Cola, Dung tích 330ml   | Lon    | 10.000 đ  |
| `BO001`     | Bột giặt Omo                 | Túi    | 85.000 đ  |
| `BH001-LON` | Bia Heineken, Loại Lon 330ml | Lon    | 18.000 đ  |
| `SE001`     | Sữa bột Ensure               | Hộp    | 450.000 đ |

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 1.1: Vào màn hình bán hàng

> Ứng dụng chưa có chức năng mở ca và khai báo tiền đầu ca. Khi có chức năng này, bổ sung kịch bản mở ca vào đây.

| Bước | Thao tác thực hiện                                                          | Dữ liệu mẫu       | Kết quả mong đợi                                                                                                            | Kết quả thực tế | Ghi chú |
| :--- | :-------------------------------------------------------------------------- | :---------------- | :-------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập màn hình Bán hàng (POS) từ thanh điều hướng hoặc đường dẫn `/pos`. | Đường dẫn: `/pos` | Hiển thị giao diện bán hàng: ô tìm "Tìm theo tên, mã hàng hoặc mã vạch", nút chọn khách "Khách lẻ", giỏ hàng trống "Đơn 1". |                 |         |

### Kịch bản 1.2: Bán hàng thanh toán bằng Tiền mặt (tính tiền thừa chuẩn xác)

| Bước | Thao tác thực hiện                                       | Dữ liệu mẫu                         | Kết quả mong đợi                                                                                         | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------- | :---------------------------------- | :------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tìm kiếm và chọn sản phẩm vào giỏ hàng qua ô tìm kiếm.   | Từ khóa: `Cà rốt` (Mã `RC001`)      | Sản phẩm "Cà rốt" xuất hiện trong giỏ, đơn giá 25.000 đ/Kg.                                              |                 |         |
| 2    | Đặt số lượng Cà rốt là 2 Kg.                             | Số lượng: `2`                       | Thành tiền dòng Cà rốt: `50.000 đ`.                                                                      |                 |         |
| 3    | Tìm "Coca-Cola", trong hộp chọn biến thể chọn `330ml`.   | Dung tích: `330ml` (Mã `CC001-330`) | Thêm vào giỏ 1 lon Coca-Cola 330ml, giá 10.000 đ. Tổng tiền giỏ hàng: `60.000 đ`.                        |                 |         |
| 4    | Bấm nút "Thanh toán (F2)" (hoặc phím tắt F2).            |                                     | Mở hộp thoại "Thanh toán", phương thức đang chọn là "Tiền mặt", "Tổng thanh toán" `60.000 đ`.            |                 |         |
| 5    | Nhập số tiền khách đưa lớn hơn tổng tiền cần thanh toán. | Ô "Tiền khách đưa": `100.000 đ`     | Hiển thị "Tiền thừa: 40.000 đ".                                                                          |                 |         |
| 6    | Bấm nút "Hoàn thành".                                    |                                     | Hiện hộp "Đơn hàng hoàn thành!" kèm mã đơn `HD-...`, sau đó giỏ hàng làm mới sẵn sàng cho đơn tiếp theo. |                 |         |

### Kịch bản 1.3: Bán hàng thanh toán Chuyển khoản

> Mã VietQR chỉ hiện khi cửa hàng đã khai tài khoản nhận chuyển khoản trong Cài đặt cửa hàng. Dữ liệu mẫu chưa khai tài khoản nên hộp thanh toán báo "Chưa có tài khoản nhận chuyển khoản" và phương thức "QR Code" chỉ ghi nhận đã nhận tiền, giống "Chuyển khoản". Thu ngân đối chiếu tiền về trên ứng dụng ngân hàng rồi mới bấm "Hoàn thành".

| Bước | Thao tác thực hiện                                             | Dữ liệu mẫu                       | Kết quả mong đợi                                                                               | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------- | :-------------------------------- | :--------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Chọn sản phẩm vào giỏ hàng.                                    | 1 túi `Bột giặt Omo` (Mã `BO001`) | Tổng tiền giỏ hàng hiển thị `85.000 đ`.                                                        |                 |         |
| 2    | Bấm nút "Thanh toán (F2)".                                     |                                   | Mở hộp thoại "Thanh toán" với các phương thức "Tiền mặt", "Chuyển khoản", "QR Code", "Kết hợp" |                 |         |
| 3    | Chọn phương thức "Chuyển khoản".                               |                                   | Hiển thị dòng "Đã nhận chuyển khoản 85.000 đ".                                                 |                 |         |
| 4    | Xác nhận khách đã chuyển khoản thành công và bấm "Hoàn thành". |                                   | Hiện hộp "Đơn hàng hoàn thành!", đơn được ghi nhận thanh toán bằng chuyển khoản.               |                 |         |

### Kịch bản 1.4: Bán hàng Ghi nợ (Trong hạn mức cho phép)

| Bước | Thao tác thực hiện                                          | Dữ liệu mẫu                                                | Kết quả mong đợi                                                                                       | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Bấm nút "Khách lẻ", tìm và gán khách hàng vào đơn.          | Ô "Tìm theo tên, mã hoặc số điện thoại...": `Bùi Thanh Hà` | Khách "Bùi Thanh Hà" được gán vào đơn.                                                                 |                 |         |
| 2    | Tìm "Bia Heineken", chọn biến thể `Lon 330ml`, số lượng 10. | 10 lon `BH001-LON` x 18.000 đ                              | Tổng tiền thanh toán: `180.000 đ`.                                                                     |                 |         |
| 3    | Mở hộp "Thanh toán", chọn phương thức "Ghi nợ".             | "Tiền mặt trả trước (tuỳ chọn)": để trống                  | "Phần ghi nợ" hiển thị `180.000 đ`, không có cảnh báo vượt hạn mức, nút "Hoàn thành" bấm được.         |                 |         |
| 4    | Bấm "Hoàn thành".                                           |                                                            | Đơn hàng tạo thành công, công nợ của khách Bùi Thanh Hà tăng thêm `180.000 đ` (nợ hiện tại 180.000 đ). |                 |         |

### Kịch bản 1.5: Bán hàng Ghi nợ (Vượt quá hạn mức công nợ)

Làm ngay sau kịch bản 1.4, khách Bùi Thanh Hà đang nợ `180.000 đ`, còn được nợ thêm tối đa `4.820.000 đ`.

| Bước | Thao tác thực hiện                                               | Dữ liệu mẫu                                         | Kết quả mong đợi                                                                                                                                                                              | Kết quả thực tế | Ghi chú |
| :--- | :--------------------------------------------------------------- | :-------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Gán khách hàng Bùi Thanh Hà vào đơn mới.                         | Tìm khách: `Bùi Thanh Hà`                           | Khách "Bùi Thanh Hà" được gán vào đơn.                                                                                                                                                        |                 |         |
| 2    | Chọn sản phẩm có tổng giá trị lớn hơn số còn được nợ.            | 11 hộp `Sữa bột Ensure` (Mã `SE001`, 450.000 đ/hộp) | Tổng tiền đơn hàng: `4.950.000 đ`.                                                                                                                                                            |                 |         |
| 3    | Mở hộp "Thanh toán", chọn "Ghi nợ", để trống tiền mặt trả trước. | Phần ghi nợ: `4.950.000 đ`                          | Hiển thị cảnh báo "Vượt hạn mức công nợ" với "Nợ hiện tại: 180.000 đ", "Hạn mức: 5.000.000 đ", "Nợ thêm tối đa: 4.820.000 đ". Nút "Hoàn thành" bị vô hiệu, có nút "Nhập PIN để vượt hạn mức". |                 |         |
| 4    | Khách đưa trước tiền mặt để phần nợ còn trong hạn mức.           | "Tiền mặt trả trước (tuỳ chọn)": `130.000 đ`        | "Phần ghi nợ" còn `4.820.000 đ` (đúng bằng số còn được nợ), cảnh báo biến mất, nút "Hoàn thành" bấm được.                                                                                     |                 |         |
| 5    | Bấm "Hoàn thành".                                                |                                                     | Đơn hàng tạo thành công, nợ hiện tại của khách Bùi Thanh Hà là `5.000.000 đ`, bằng hạn mức.                                                                                                   |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Tính toán chính xác tổng tiền hàng, tiền khách đưa, tiền thừa trả lại.
- Chọn đúng biến thể và giá biến thể khi thêm sản phẩm có biến thể.
- Thanh toán chuyển khoản ghi nhận đúng số tiền.
- Kiểm soát chặt chẽ hạn mức ghi nợ của khách hàng, cảnh báo và chặn kịp thời khi vượt hạn mức; cho phép hoàn tất khi phần nợ nằm trong hạn mức.
