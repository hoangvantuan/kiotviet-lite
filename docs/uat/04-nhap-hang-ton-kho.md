# Kịch Bản UAT 04: Nhập Hàng và Kiểm Kê Tồn Kho

## 1. Mục tiêu

Xác thực quy trình quản lý chuỗi cung ứng và kho hàng bao gồm: tạo phiếu nhập hàng từ nhà cung cấp, cập nhật giá nhập và tự động tăng số lượng tồn kho sau khi nhập, thực hiện tạo phiếu kiểm kê kho thực tế, xử lý cân bằng kho khi phát sinh chênh lệch thực tế so với sổ sách (thừa hoặc thiếu hàng), và kiểm tra báo cáo tồn kho kèm cảnh báo dưới định mức tồn tối thiểu.

## 2. Điều kiện chuẩn bị

- Đăng nhập bằng tài khoản Quản lý hoặc Chủ cửa hàng:
  - Số điện thoại: `0901000001` (Chủ cửa hàng) hoặc `0901000002` (Quản lý)
  - Mật khẩu: `matkhau123`
- Nhà cung cấp có sẵn trong hệ thống (ví dụ: "Công ty Thực phẩm Sạch Á Châu").
- Sản phẩm thử nghiệm:
  - Sản phẩm A: "Nước mắm Nam Ngư" (`NM001`, tồn kho ban đầu: 60 chai, tồn tối thiểu: 10 chai, giá vốn: 17.000 đ).
  - Sản phẩm B: "Ớt chuông đỏ" (`OC001`, tồn kho ban đầu: 15 Kg, tồn tối thiểu: 5 Kg, giá vốn: 40.000 đ).

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 4.1: Tạo đơn và hoàn tất Phiếu nhập hàng từ Nhà cung cấp

| Bước | Thao tác thực hiện                                                                                 | Dữ liệu mẫu                                                     | Kết quả mong đợi                                       | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :----------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập danh sách Đơn nhập hàng từ menu "Kho hàng" -> "Nhập hàng" (`/inventory/purchase-orders`). | Đường dẫn: `/inventory/purchase-orders`                         | Hiển thị danh sách các phiếu nhập hàng trước đó.       |                 |         |
| 2    | Bấm nút "Tạo phiếu nhập" (`/inventory/purchase-orders/new`).                                       |                                                                 | Chuyển đến màn hình tạo phiếu nhập hàng mới.           |                 |         |
| 3    | Chọn Nhà cung cấp.                                                                                 | Nhà cung cấp: "Công ty Thực phẩm Sạch Á Châu"                   | Tên và thông tin nhà cung cấp hiển thị trên phiếu.     |                 |         |
| 4    | Thêm sản phẩm "Nước mắm Nam Ngư" vào danh sách nhập.                                               | Mã: `NM001`, Số lượng nhập: `40 chai`, Đơn giá nhập: `17.000 đ` | Thành tiền tự động tính: `680.000 đ`.                  |                 |         |
| 5    | Nhập số tiền đã thanh toán cho nhà cung cấp.                                                       | Thanh toán: `680.000 đ` (Tiền mặt)                              | Đơn nhập ghi nhận thanh toán đủ.                       |                 |         |
| 6    | Bấm nút "Hoàn thành phiếu nhập" (hoặc "Nhập kho").                                                 |                                                                 | Phiếu nhập chuyển trạng thái "Đã nhập kho".            |                 |         |
| 7    | Kiểm tra tồn kho của Nước mắm Nam Ngư tại danh sách Sản phẩm (`/products`).                        |                                                                 | Tồn kho tăng từ 60 chai lên đúng `100 chai` (60 + 40). |                 |         |

### Kịch bản 4.2: Tạo phiếu Kiểm kho thực tế và Cân bằng kho (Chênh lệch kho)

| Bước | Thao tác thực hiện                                                                        | Dữ liệu mẫu                                | Kết quả mong đợi                                                                         | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập chức năng Kiểm kho từ menu "Kho hàng" -> "Kiểm kho" (`/inventory/stock-checks`). | Đường dẫn: `/inventory/stock-checks`       | Hiển thị danh sách các lần kiểm kho trước đây.                                           |                 |         |
| 2    | Bấm nút "Tạo phiếu kiểm kho" (`/inventory/stock-checks/new`).                             |                                            | Mở giao diện tạo phiếu kiểm kê kho.                                                      |                 |         |
| 3    | Thêm sản phẩm "Ớt chuông đỏ" (`OC001`) vào phiếu kiểm.                                    | Mã: `OC001`                                | Hiển thị: Tồn trên hệ thống = `15 Kg`.                                                   |                 |         |
| 4    | Nhập số lượng thực tế kiểm đếm được tại quầy (bị hao hụt hoặc hư hỏng).                   | Số lượng thực tế: `12 Kg`                  | Hệ thống tự động tính chênh lệch: `Lệch -3 Kg` (giá trị hao hụt: -120.000 đ).            |                 |         |
| 5    | Thêm sản phẩm "Nước mắm Nam Ngư" (`NM001`) vào phiếu kiểm.                                | Mã: `NM001`, Thực tế: `102 chai`           | Hệ thống tự động tính chênh lệch: `Lệch +2 chai` (thừa 2 chai).                          |                 |         |
| 6    | Nhập ghi chú kiểm kho.                                                                    | Ghi chú: "Kiểm kho định kỳ tuần 4 tháng 8" | Ghi chú được lưu trên phiếu.                                                             |                 |         |
| 7    | Bấm nút "Cân bằng kho" (hoặc "Hoàn thành kiểm kho").                                      |                                            | Hệ thống cập nhật điều chỉnh tồn kho theo số liệu thực tế, sinh giao dịch kho tương ứng. |                 |         |
| 8    | Kiểm tra lại số lượng tồn kho trên hệ thống.                                              |                                            | Tồn kho Ớt chuông đỏ chuyển thành `12 Kg`, Nước mắm Nam Ngư chuyển thành `102 chai`.     |                 |         |

### Kịch bản 4.3: Xem Báo cáo tồn kho và Cảnh báo dưới định mức tối thiểu

| Bước | Thao tác thực hiện                                                                      | Dữ liệu mẫu                     | Kết quả mong đợi                                                                                                         | Kết quả thực tế | Ghi chú |
| :--- | :-------------------------------------------------------------------------------------- | :------------------------------ | :----------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập Báo cáo tồn kho từ menu "Báo cáo" -> "Báo cáo tồn kho" (`/reports/inventory`). | Đường dẫn: `/reports/inventory` | Hiển thị tổng quan: Tổng số lượng tồn, Tổng giá trị tồn kho theo giá vốn và giá bán.                                     |                 |         |
| 2    | Lọc theo danh mục "Rau củ quả".                                                         | Danh mục: "Rau củ quả"          | Bảng dữ liệu lọc hiển thị đúng các mặt hàng rau củ kèm số lượng tồn và giá trị.                                          |                 |         |
| 3    | Chọn tab hoặc bộ lọc "Dưới định mức tồn" (hoặc "Cần nhập hàng").                        |                                 | Hiển thị danh sách các sản phẩm có số tồn thực tế nhỏ hơn hoặc bằng số lượng tồn tối thiểu (`currentStock <= minStock`). |                 |         |
| 4    | Kiểm tra thông tin cảnh báo đối với các mặt hàng sắp hết.                               |                                 | Hiển thị chỉ báo màu vàng/đỏ nổi bật nhắc nhở người quản lý cần tạo đơn nhập hàng.                                       |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Tạo phiếu nhập hàng thành công, tính đúng thành tiền và tăng ngay số lượng tồn kho.
- Kiểm kho cho phép ghi nhận số thực tế, tính đúng chênh lệch thừa/thiếu.
- Thao tác cân bằng kho cập nhật ngay số tồn kho thực tế vào sổ dữ liệu.
- Báo cáo tồn kho phản ánh chính xác giá trị tồn kho và lọc đúng các sản phẩm chạm ngưỡng tồn tối thiểu.
