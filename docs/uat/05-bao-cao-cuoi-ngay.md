# Kịch Bản UAT 05: Báo Cáo Kinh Doanh và Tài Chính Cuối Ngày

## 1. Mục tiêu

Xác thực hệ thống báo cáo quản trị tổng kết cuối ngày dành cho chủ cửa hàng và quản lý bao gồm: báo cáo tổng hợp doanh thu theo ca bán hàng và theo ngày, phân tích lợi nhuận gộp theo từng mặt hàng/nhóm ngành hàng, báo cáo phân tích tuổi nợ của khách hàng (chia theo các mốc thời gian), và tính năng xuất dữ liệu báo cáo ra tệp bảng tính định dạng CSV/Excel.

## 2. Điều kiện chuẩn bị

- Đăng nhập bằng tài khoản Chủ cửa hàng hoặc Quản lý:
  - Số điện thoại: `0901000001` (Chủ cửa hàng)
  - Mật khẩu: `matkhau123`
- Đã có phát sinh các giao dịch trong ngày: bán hàng thu tiền mặt, chuyển khoản, ghi nợ, trả hàng hoàn tiền, và nhập hàng từ nhà cung cấp.

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 5.1: Báo cáo Doanh thu và Dòng tiền cuối ngày

| Bước | Thao tác thực hiện                                                                                 | Dữ liệu mẫu                                                           | Kết quả mong đợi                                                                                                      | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập Báo cáo Doanh thu từ menu "Báo cáo" -> "Doanh thu" (`/reports/revenue`).                  | Đường dẫn: `/reports/revenue`                                         | Hiển thị biểu đồ và bảng số liệu doanh thu theo mốc thời gian.                                                        |                 |         |
| 2    | Chọn khoảng thời gian xem báo cáo là "Hôm nay" (Today).                                            | Bộ lọc: "Hôm nay"                                                     | Hiển thị chính xác các chỉ số: Tổng doanh thu bán hàng, Doanh thu thuần (sau trừ trả hàng), Số lượng đơn hàng đã bán. |                 |         |
| 3    | Xem phân tích doanh thu theo phương thức thanh toán.                                               |                                                                       | Thống kê phân chia rõ ràng: Tổng tiền mặt thu được, Tổng tiền nhận qua chuyển khoản QR, Tổng tiền ghi nợ.             |                 |         |
| 4    | Đối soát số tiền mặt thực tế trong ngăn kéo với số tiền mặt trên báo cáo doanh thu và tiền đầu ca. | Tiền thực tế = Tiền đầu ca + Doanh thu tiền mặt - Tiền hoàn trả khách | Khớp chính xác với dòng tiền thực tế tại quầy thu ngân.                                                               |                 |         |

### Kịch bản 5.2: Báo cáo Lợi nhuận gộp theo Mặt hàng

| Bước | Thao tác thực hiện                                                                  | Dữ liệu mẫu                  | Kết quả mong đợi                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------- | :--------------------------- | :----------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập Báo cáo Lợi nhuận từ menu "Báo cáo" -> "Lợi nhuận" (`/reports/profit`).    | Đường dẫn: `/reports/profit` | Hiển thị bảng tổng hợp lợi nhuận gộp của toàn cửa hàng và theo từng sản phẩm.        |                 |         |
| 2    | Kiểm tra công thức tính toán: `Lợi nhuận gộp = Doanh thu thuần - Giá vốn hàng bán`. |                              | Số liệu lợi nhuận và tỷ suất lợi nhuận (%) hiển thị chính xác theo từng mã sản phẩm. |                 |         |
| 3    | Sắp xếp cột "Lợi nhuận" theo thứ tự giảm dần để xem top sản phẩm sinh lời cao nhất. | Bấm tiêu đề cột "Lợi nhuận"  | Danh sách sắp xếp mượt mà, đưa các sản phẩm có lợi nhuận cao nhất lên đầu bảng.      |                 |         |

### Kịch bản 5.3: Báo cáo Phân tích Tuổi nợ Khách hàng

| Bước | Thao tác thực hiện                                                                             | Dữ liệu mẫu                                     | Kết quả mong đợi                                                                       | Kết quả thực tế | Ghi chú |
| :--- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Truy cập Báo cáo Tổng quan hoặc Báo cáo Công nợ (`/reports/dashboard` hoặc `/customers`).      | Mục: Báo cáo công nợ / Tuổi nợ                  | Hiển thị tổng dư nợ phải thu của toàn bộ khách hàng.                                   |                 |         |
| 2    | Kiểm tra bảng phân loại tuổi nợ theo các phân đoạn thời gian.                                  | Phân đoạn: < 30 ngày, 30 đến 60 ngày, > 60 ngày | Phân bổ chính xác các khoản nợ của từng khách hàng vào đúng nhóm thời gian quá hạn.    |                 |         |
| 3    | Nhận diện danh sách khách hàng có nợ xấu (nợ quá hạn trên 60 ngày) để lên kế hoạch thu hồi nợ. | Lọc nhóm nợ quá hạn                             | Hiển thị thông tin tên khách, số điện thoại, số tiền nợ và ngày phát sinh nợ lâu nhất. |                 |         |

### Kịch bản 5.4: Xuất dữ liệu Báo cáo ra tệp CSV/Excel

| Bước | Thao tác thực hiện                                                                                          | Dữ liệu mẫu                        | Kết quả mong đợi                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------------------------- | :--------------------------------- | :----------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Trên trang Báo cáo Doanh thu (hoặc Báo cáo Tồn kho), bấm nút "Xuất dữ liệu" (Export CSV / Excel).           | Nút: "Xuất CSV"                    | Trình duyệt tải xuống tệp dữ liệu dạng `.csv` hoặc `.xlsx`.                          |                 |         |
| 2    | Mở tệp vừa tải xuống bằng phần mềm bảng tính (Microsoft Excel, LibreOffice hoặc Numbers).                   | Tên tệp: `bao-cao-doanh-thu-*.csv` | Tệp mở bình thường, không bị lỗi font chữ tiếng Việt (hỗ trợ đầy đủ UTF-8 with BOM). |                 |         |
| 3    | Kiểm tra các cột dữ liệu trong tệp (Thời gian, Mã đơn, Tên hàng, Số lượng, Đơn giá, Thành tiền, Lợi nhuận). |                                    | Dữ liệu trong tệp bảng tính khớp hoàn toàn với số liệu hiển thị trên giao diện web.  |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Doanh thu phân bổ chính xác theo từng phương thức thanh toán (tiền mặt, chuyển khoản, nợ).
- Lợi nhuận gộp tính đúng theo giá vốn và doanh số thực tế.
- Báo cáo tuổi nợ phân loại chuẩn xác theo thời gian phát sinh đơn nợ.
- Tính năng xuất tệp hoạt động ổn định, tệp tải về đọc tốt tiếng Việt có dấu và khớp số liệu.
