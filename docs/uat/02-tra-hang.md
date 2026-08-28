# Kịch Bản UAT 02: Trả Hàng và Hoàn Tiền

## 1. Mục tiêu

Xác thực quy trình xử lý khách hàng đổi trả hàng hóa bao gồm: tìm kiếm hóa đơn gốc đã bán, thực hiện trả hàng một phần (trả một vài món trong đơn hoặc giảm số lượng của một món), thực hiện trả hàng toàn bộ (trả toàn bộ hóa đơn), kiểm tra tính toán số tiền hoàn trả cho khách hàng (theo phương thức tiền mặt hoặc trừ nợ) và xác thực việc tự động cập nhật cộng lại số lượng tồn kho của các sản phẩm được hoàn trả.

## 2. Điều kiện chuẩn bị

- Đăng nhập bằng tài khoản Quản lý hoặc Chủ cửa hàng:
  - Số điện thoại: `0901000001` (Chủ cửa hàng) hoặc `0901000002` (Quản lý)
  - Mật khẩu: `matkhau123`
- Chuẩn bị sẵn 2 đơn hàng đã bán thành công trước đó:
  - **Đơn hàng HD01**: Gồm 3 Kg Cà rốt (`RC001` - giá 25.000 đ/Kg = 75.000 đ) và 2 chai Dầu ăn Neptune (`DN001` - giá 45.000 đ/chai = 90.000 đ). Tổng tiền: 165.000 đ (đã thanh toán tiền mặt).
  - **Đơn hàng HD02**: Gồm 1 hộp Sữa bột Ensure (`SE001` - giá 450.000 đ, khách mua nợ).
- Ghi nhận số lượng tồn kho hiện tại của Cà rốt và Dầu ăn Neptune trước khi tiến hành trả hàng.

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 2.1: Tra cứu và mở hóa đơn cần trả hàng

| Bước | Thao tác thực hiện                                         | Dữ liệu mẫu          | Kết quả mong đợi                                                                         | Kết quả thực tế | Ghi chú |
| :--- | :--------------------------------------------------------- | :------------------- | :--------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập danh sách Đơn hàng từ menu "Hóa đơn" (`/orders`). | Đường dẫn: `/orders` | Hiển thị danh sách các đơn hàng đã tạo, có trạng thái "Đã hoàn thành".                   |                 |         |
| 2    | Nhập mã hóa đơn `HD01` hoặc lọc theo ngày vào ô tìm kiếm.  | Mã đơn: `HD01`       | Tìm thấy chính xác đơn hàng `HD01` với đầy đủ danh sách sản phẩm và tổng tiền 165.000 đ. |                 |         |
| 3    | Bấm vào đơn hàng để xem chi tiết và bấm nút "Trả hàng".    |                      | Chuyển sang màn hình tạo phiếu trả hàng, hiển thị danh sách các mặt hàng có thể trả.     |                 |         |

### Kịch bản 2.2: Trả một phần số lượng sản phẩm trong đơn

| Bước | Thao tác thực hiện                                                                                                | Dữ liệu mẫu                            | Kết quả mong đợi                                                                                                | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Trên màn hình trả hàng của `HD01`, chọn trả 1 Kg Cà rốt (trong tổng số 3 Kg đã mua), giữ nguyên Dầu ăn không trả. | Cà rốt trả: `1 Kg`, Dầu ăn trả: `0`    | Số tiền hoàn trả tự động tính: `25.000 đ`.                                                                      |                 |         |
| 2    | Chọn hình thức hoàn trả tiền cho khách.                                                                           | Hình thức: "Tiền mặt"                  | Hiển thị số tiền mặt cần xuất quỹ trả khách: `25.000 đ`.                                                        |                 |         |
| 3    | Nhập lý do trả hàng.                                                                                              | Lý do: "Khách đổi ý muốn bớt số lượng" | Ô lý do lưu đúng nội dung văn bản.                                                                              |                 |         |
| 4    | Bấm nút "Xác nhận trả hàng".                                                                                      |                                        | Hệ thống tạo phiếu trả hàng thành công, trạng thái hóa đơn gốc chuyển thành "Đã trả một phần" (Partial Return). |                 |         |
| 5    | Kiểm tra tồn kho của Cà rốt (`RC001`) tại mục Hàng hóa (`/products`).                                             |                                        | Số lượng tồn kho của Cà rốt tăng thêm đúng `1 Kg` so với trước khi trả. Tồn kho Dầu ăn không đổi.               |                 |         |

### Kịch bản 2.3: Trả toàn bộ đơn hàng và trừ nợ khách hàng

| Bước | Thao tác thực hiện                                                               | Dữ liệu mẫu                       | Kết quả mong đợi                                                                  | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------------------- | :-------------------------------- | :-------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Mở chi tiết đơn hàng `HD02` (khách hàng mua ghi nợ 450.000 đ) và bấm "Trả hàng". | Đơn hàng: `HD02`                  | Màn hình trả hàng hiển thị sản phẩm Sữa bột Ensure số lượng 1 hộp, giá 450.000 đ. |                 |         |
| 2    | Chọn trả toàn bộ số lượng (`1 hộp`).                                             | Số lượng trả: `1`                 | Tổng tiền hoàn trả: `450.000 đ`.                                                  |                 |         |
| 3    | Chọn hình thức hoàn trả là "Giảm trừ công nợ".                                   | Hình thức: "Trừ vào nợ của khách" | Hệ thống không xuất tiền mặt từ quỹ mà tự động cấn trừ vào sổ nợ của khách hàng.  |                 |         |
| 4    | Bấm "Xác nhận trả hàng".                                                         |                                   | Đơn hàng gốc chuyển trạng thái thành "Đã trả toàn bộ" (Full Return).              |                 |         |
| 5    | Kiểm tra lại sổ nợ của khách hàng tại mục Khách hàng (`/customers`).             |                                   | Số nợ của khách hàng giảm đi đúng `450.000 đ`.                                    |                 |         |
| 6    | Kiểm tra tồn kho Sữa bột Ensure (`SE001`).                                       |                                   | Tồn kho tăng thêm đúng `1 hộp`.                                                   |                 |         |

### Kịch bản 2.4: Kiểm tra giới hạn số lượng khi trả hàng

| Bước | Thao tác thực hiện                                                           | Dữ liệu mẫu      | Kết quả mong đợi                                                                                                                | Kết quả thực tế | Ghi chú |
| :--- | :--------------------------------------------------------------------------- | :--------------- | :------------------------------------------------------------------------------------------------------------------------------ | :-------------- | :------ |
| 1    | Mở lại đơn hàng `HD01` đã trả 1 Kg Cà rốt trước đó, tiếp tục bấm "Trả hàng". | Đơn hàng: `HD01` | Màn hình hiển thị số lượng Cà rốt tối đa còn có thể trả là `2 Kg` (không phải 3 Kg).                                            |                 |         |
| 2    | Cố ý nhập số lượng trả là `3 Kg` cho Cà rốt.                                 | Nhập: `3`        | Hệ thống báo lỗi hoặc tự động giới hạn không cho nhập vượt quá 2 Kg: "Số lượng trả không thể lớn hơn số lượng còn lại của đơn". |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Tìm kiếm và lọc hóa đơn cũ chính xác, nhanh chóng.
- Tính toán chính xác số tiền hoàn trả tương ứng với đơn giá tại thời điểm mua.
- Cập nhật tăng tồn kho chuẩn xác cho đúng từng mã hàng hóa được trả.
- Khấu trừ công nợ tự động và chính xác khi chọn phương thức trừ nợ.
- Chặn không cho phép trả vượt quá số lượng hàng còn lại của hóa đơn gốc.
