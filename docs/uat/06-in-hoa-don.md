# Kịch Bản UAT 06: Cài Đặt và In Hóa Đơn

## 1. Mục tiêu

Xác thực tính linh hoạt của hệ thống thiết lập mẫu in hóa đơn bán hàng bao gồm: tùy chỉnh thông tin thương hiệu (logo cửa hàng, khẩu hiệu slogan, lời chào chân trang), lựa chọn khổ giấy in (Thermal 58mm, Thermal 80mm, A4, A5), bật hoặc tắt từng trường thông tin hiển thị trên hóa đơn (tên khách, số điện thoại khách, mã SKU, chiết khấu, nợ cũ, nợ mới, giá vốn, ghi chú), kiểm tra cột xem trước hóa đơn (Preview) cập nhật tức thì theo thời gian thực và xác thực mẫu in thực tế khi thực hiện in từ máy in nhiệt hoặc trình duyệt.

## 2. Điều kiện chuẩn bị

- Đăng nhập bằng tài khoản Chủ cửa hàng hoặc Quản lý có quyền quản trị cửa hàng (`store.manage`):
  - Số điện thoại: `0901000001`
  - Mật khẩu: `matkhau123`
- Truy cập trang Cài đặt mẫu in: `/settings/print`.

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 6.1: Tùy chỉnh Logo, Slogan, Khổ giấy và Lời chào chân trang

| Bước | Thao tác thực hiện                                       | Dữ liệu mẫu                                            | Kết quả mong đợi                                                                            | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------ | :-------------- | :------ |
| 1    | Truy cập menu "Cài đặt" -> "Mẫu in" (`/settings/print`). | Đường dẫn: `/settings/print`                           | Hiển thị giao diện cài đặt bên trái và khung xem trước (Preview) mẫu in bên phải.           |                 |         |
| 2    | Nhập câu khẩu hiệu (slogan) của cửa hàng.                | Slogan: "Chất lượng là danh dự"                        | Khung xem trước bên phải xuất hiện ngay dòng chữ "Chất lượng là danh dự" dưới tên cửa hàng. |                 |         |
| 3    | Thay đổi Khổ giấy in mặc định từ `58mm` sang `80mm`.     | Chọn: "Thermal 80mm"                                   | Khung xem trước bên phải tự động mở rộng chiều rộng phù hợp với khổ giấy 80mm.              |                 |         |
| 4    | Nhập nội dung chú thích chân trang (Footer text).        | Footer: "Hẹn gặp lại quý khách - Đổi trả trong 3 ngày" | Chân trang của mẫu xem trước cập nhật đúng nội dung vừa nhập.                               |                 |         |
| 5    | Bấm nút "Lưu cài đặt".                                   |                                                        | Thông báo thành công: "Đã lưu cài đặt mẫu in".                                              |                 |         |

### Kịch bản 6.2: Kiểm tra bật/tắt từng công tắc (Toggle) hiển thị thông tin hóa đơn

| Bước | Thao tác thực hiện                                                                     | Dữ liệu mẫu | Kết quả mong đợi                                                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------------------------- | :---------- | :------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | **Bật công tắc "Mã SKU" (`showSku`)**: Bật switch "Mã SKU".                            | Switch: BẬT | Từng dòng sản phẩm trong mẫu xem trước xuất hiện thêm mã SKU trước tên sản phẩm (ví dụ: `SKU001 Sữa tươi Vinamilk`). |                 |         |
| 2    | **Tắt công tắc "Tên khách hàng" (`showCustomerName`)**: Gạt switch sang TẮT.           | Switch: TẮT | Dòng hiển thị thông tin khách hàng (KH: ...) biến mất khỏi mẫu xem trước.                                            |                 |         |
| 3    | **Tắt công tắc "SĐT khách hàng" (`showCustomerPhone`)**: Gạt switch sang TẮT.          | Switch: TẮT | Dòng SĐT khách hàng biến mất khỏi mẫu xem trước.                                                                     |                 |         |
| 4    | **Bật công tắc "Nợ cũ" (`showOldDebt`) và "Nợ mới" (`showNewDebt`)**: Bật cả 2 switch. | Switch: BẬT | Khung xem trước xuất hiện thêm khối thông tin công nợ: dòng "Nợ cũ: 500.000 đ" và "Nợ mới: 0 đ".                     |                 |         |
| 5    | **Bật/Tắt công tắc "Giá vốn" (`showCostPrice`)**: Bật switch giá vốn để kiểm tra.      | Switch: BẬT | Mẫu xem trước xuất hiện dòng "Giá vốn: 120.000 đ" (dành cho quản lý kiểm soát). Tắt đi thì dòng này ẩn đi.           |                 |         |
| 6    | **Bật/Tắt công tắc "Chiết khấu" (`showDiscount`)**: Bật switch chiết khấu.             | Switch: BẬT | Dòng tiền chiết khấu (-5.000 đ) hiển thị rõ ràng. Khi tắt đi, tiền chiết khấu được ẩn.                               |                 |         |
| 7    | **Bật/Tắt công tắc "Ghi chú cuối hóa đơn" (`showNotes`)**: Bật switch ghi chú.         | Switch: BẬT | Hiển thị khối ghi chú đơn hàng. Khi tắt đi thì ẩn phần ghi chú.                                                      |                 |         |
| 8    | Bấm nút "Lưu cài đặt".                                                                 |             | Dữ liệu cấu hình được lưu vào máy chủ thành công.                                                                    |                 |         |

### Kịch bản 6.3: Tải lại trang (F5) để kiểm tra lưu trữ bền vững của cấu hình

| Bước | Thao tác thực hiện                                                   | Dữ liệu mẫu   | Kết quả mong đợi                                                                                                  | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------- | :------------ | :---------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Nhấn F5 (hoặc tải lại trang) trên trình duyệt tại `/settings/print`. | Tải lại trang | Trạng thái các công tắc (Switch), Slogan, Khổ giấy và Chân trang giữ nguyên chính xác trạng thái đã lưu trước đó. |                 |         |
| 2    | Khung xem trước bên phải tải đúng dữ liệu cấu hình đã lưu.           |               | Mẫu hóa đơn hiển thị đúng các trường đã bật/tắt.                                                                  |                 |         |

### Kịch bản 6.4: Bán hàng tại POS và in hóa đơn kiểm tra thực tế

| Bước | Thao tác thực hiện                                                | Dữ liệu mẫu                                  | Kết quả mong đợi                                                                                                                  | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Chuyển sang màn hình Bán hàng POS (`/pos`), tạo một đơn hàng mới. | Chọn: 2 Lon Coca-Cola, Khách: Nguyễn Văn Nam | Đơn hàng sẵn sàng thanh toán.                                                                                                     |                 |         |
| 2    | Thực hiện thanh toán và bấm lệnh "In hóa đơn".                    | Hộp thoại in trình duyệt mở ra               | Hóa đơn hiển thị đúng các thông số đã cấu hình ở bước 6.2 (có mã SKU, có slogan, có thông tin nợ cũ/mới, có lời chào chân trang). |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Khung xem trước (Preview) phản hồi tức thì và chính xác khi người dùng bật/tắt từng công tắc hoặc thay đổi trường thông tin.
- Lưu cấu hình thành công vào cơ sở dữ liệu và duy trì nguyên vẹn sau khi tải lại trang.
- Mẫu in hóa đơn thực tế từ POS tuân thủ đúng 100% các cài đặt đã thiết lập.
