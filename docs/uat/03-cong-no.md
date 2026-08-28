# Kịch Bản UAT 03: Quản Lý Công Nợ Khách Hàng

## 1. Mục tiêu

Xác thực nghiệp vụ quản lý sổ nợ khách hàng bao gồm: tra cứu danh sách khách hàng có nợ, xem chi tiết số dư nợ hiện tại và hạn mức nợ khả dụng, lập phiếu thu tiền nợ từ khách hàng (thu một phần hoặc thu toàn bộ), thực hiện điều chỉnh tăng hoặc giảm nợ thủ công kèm theo ghi chú lý do, và kiểm tra lịch sử biến động công nợ trong sổ chi tiết.

## 2. Điều kiện chuẩn bị

- Đăng nhập bằng tài khoản Quản lý hoặc Chủ cửa hàng:
  - Số điện thoại: `0901000001`
  - Mật khẩu: `matkhau123`
- Khách hàng thử nghiệm:
  - **Khách hàng 1**: "Trần Quốc Toản" (Số điện thoại `0902000001`, đang có số dư nợ: 2.000.000 đ, Hạn mức nợ: 10.000.000 đ).
  - **Khách hàng 2**: "Phạm Thị Lan" (Số điện thoại `0902000002`, đang có số dư nợ: 500.000 đ, Hạn mức nợ: 2.000.000 đ).

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 3.1: Tra cứu danh sách và xem chi tiết sổ nợ khách hàng

| Bước | Thao tác thực hiện                                                          | Dữ liệu mẫu               | Kết quả mong đợi                                                                                                           | Kết quả thực tế | Ghi chú |
| :--- | :-------------------------------------------------------------------------- | :------------------------ | :------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập danh sách Khách hàng từ menu "Khách hàng" (`/customers`).          | Đường dẫn: `/customers`   | Hiển thị bảng danh sách khách hàng gồm các cột: Tên, Số điện thoại, Tổng chi tiêu, Nợ hiện tại, Hạn mức.                   |                 |         |
| 2    | Sử dụng bộ lọc hoặc ô tìm kiếm để tìm khách hàng "Trần Quốc Toản".          | Từ khóa: `Trần Quốc Toản` | Hiển thị thông tin khách: Nợ hiện tại `2.000.000 đ`, Hạn mức `10.000.000 đ`.                                               |                 |         |
| 3    | Bấm vào dòng khách hàng để mở trang chi tiết khách hàng (`/customers/$id`). |                           | Mở trang chi tiết, có các thẻ: "Thông tin", "Lịch sử đơn hàng", "Công nợ", "Thống kê mua hàng".                            |                 |         |
| 4    | Chuyển sang thẻ "Công nợ".                                                  |                           | Hiển thị danh sách các lần phát sinh nợ từ đơn hàng, các phiếu thu nợ trước đó và số dư nợ lũy kế khớp đúng `2.000.000 đ`. |                 |         |

### Kịch bản 3.2: Lập phiếu thu nợ khách hàng (Thu tiền mặt hoặc Chuyển khoản)

| Bước | Thao tác thực hiện                                                                                     | Dữ liệu mẫu                                    | Kết quả mong đợi                                                                                                              | Kết quả thực tế | Ghi chú |
| :--- | :----------------------------------------------------------------------------------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Trên trang chi tiết công nợ của "Trần Quốc Toản", bấm nút "Lập phiếu thu" (hoặc truy cập `/receipts`). |                                                | Mở hộp thoại lập phiếu thu nợ khách hàng.                                                                                     |                 |         |
| 2    | Nhập số tiền thu nợ (thu một phần).                                                                    | Số tiền thu: `1.000.000 đ`                     | Ô số tiền định dạng đúng phân cách hàng nghìn.                                                                                |                 |         |
| 3    | Chọn phương thức thanh toán.                                                                           | Phương thức: "Chuyển khoản ngân hàng"          | Ghi nhận phương thức chuyển khoản.                                                                                            |                 |         |
| 4    | Nhập ghi chú nội dung thu nợ.                                                                          | Ghi chú: "Khách chuyển khoản trả nợ đơn đợt 1" | Ghi chú được lưu đầy đủ.                                                                                                      |                 |         |
| 5    | Bấm nút "Tạo phiếu thu".                                                                               |                                                | Hệ thống lưu phiếu thu thành công, tạo mã phiếu thu mới (ví dụ: `PT0001`).                                                    |                 |         |
| 6    | Kiểm tra lại số dư nợ của khách hàng.                                                                  |                                                | Số nợ hiện tại của khách tự động giảm từ 2.000.000 đ xuống còn đúng `1.000.000 đ`. Hạn mức nợ khả dụng tăng thêm 1.000.000 đ. |                 |         |

### Kịch bản 3.3: Điều chỉnh nợ thủ công (Tăng / Giảm nợ kèm lý do)

| Bước | Thao tác thực hiện                                                                              | Dữ liệu mẫu                                                                             | Kết quả mong đợi                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Trên trang chi tiết khách hàng "Phạm Thị Lan" (nợ hiện tại 500.000 đ), bấm nút "Điều chỉnh nợ". | Khách hàng: `Phạm Thị Lan`                                                              | Mở hộp thoại điều chỉnh công nợ thủ công.                                            |                 |         |
| 2    | Chọn loại điều chỉnh là "Giảm nợ" (ví dụ: chiết khấu đặc biệt hoặc bù trừ ngoài hệ thống).      | Loại: "Giảm nợ", Giá trị: `100.000 đ`                                                   | Hiển thị số nợ sau điều chỉnh dự kiến: `400.000 đ`.                                  |                 |         |
| 3    | Nhập bắt buộc lý do điều chỉnh nợ.                                                              | Lý do: "Chiết khấu thương mại dịp sinh nhật khách hàng"                                 | Hệ thống yêu cầu bắt buộc nhập lý do, không được để trống.                           |                 |         |
| 4    | Bấm nút "Xác nhận điều chỉnh".                                                                  |                                                                                         | Hệ thống ghi nhận phiếu điều chỉnh nợ thành công, ghi nhật ký hoạt động (audit log). |                 |         |
| 5    | Chọn tiếp "Điều chỉnh nợ" loại "Tăng nợ".                                                       | Loại: "Tăng nợ", Giá trị: `50.000 đ`, Lý do: "Phí vận chuyển phát sinh thỏa thuận thêm" | Nợ hiện tại tăng từ 400.000 đ lên đúng `450.000 đ`.                                  |                 |         |
| 6    | Kiểm tra lịch sử giao dịch nợ trong thẻ Công nợ.                                                |                                                                                         | Thể hiện rõ 2 dòng điều chỉnh tăng và giảm kèm chính xác lý do đã nhập.              |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Danh sách công nợ hiển thị chính xác số dư nợ thực tế của từng khách hàng.
- Lập phiếu thu nợ lập tức cập nhật giảm số dư nợ và giải phóng hạn mức nợ.
- Điều chỉnh nợ thủ công yêu cầu bắt buộc ghi chú lý do và ghi nhận nhật ký kiểm toán minh bạch.
- Sổ chi tiết công nợ thể hiện đầy đủ các giao dịch phát sinh nợ, thu nợ, điều chỉnh nợ theo thứ tự thời gian.
