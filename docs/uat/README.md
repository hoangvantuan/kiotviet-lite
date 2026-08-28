# Bộ Kịch Bản Nghiệm Thu Người Dùng (UAT - User Acceptance Testing)

Tài liệu này hướng dẫn người dùng thực tế (chủ cửa hàng, quản lý, nhân viên thu ngân, chuyên viên kiểm thử chất lượng) thực hiện nghiệm thu toàn diện các phân hệ của phần mềm quản lý bán hàng KiotViet Lite.

---

## 1. Mục đích và Phạm vi

- **Mục đích**: Đảm bảo toàn bộ quy trình nghiệp vụ bán hàng, quản lý tồn kho, công nợ, in ấn và khả năng hoạt động ngoại tuyến vận hành chính xác theo đúng nhu cầu sử dụng thực tế của cửa hàng.
- **Phạm vi áp dụng**: Áp dụng trên phiên bản ứng dụng KiotViet Lite kết nối với máy chủ backend và cơ sở dữ liệu thật.

---

## 2. Thông tin môi trường và Tài khoản thử nghiệm

Dữ liệu thử nghiệm đã được nạp sẵn thông qua kịch bản khởi tạo dữ liệu (`db:seed`). Người kiểm thử sử dụng các tài khoản sau:

| Vai trò                        | Họ và tên     | Số điện thoại | Mật khẩu     | Mã PIN xác thực |
| :----------------------------- | :------------ | :------------ | :----------- | :-------------- |
| **Chủ cửa hàng (Owner)**       | Nguyễn Văn An | `0901000001`  | `matkhau123` | `111111`        |
| **Quản lý (Manager)**          | Trần Thị Bình | `0901000002`  | `matkhau123` | `222222`        |
| **Nhân viên thu ngân (Staff)** | Lê Minh Cường | `0901000003`  | `matkhau123` | `333333`        |

- **Địa chỉ giao diện Web**: `http://localhost:5173`
- **Địa chỉ máy chủ API**: `http://localhost:3000`

---

## 3. Danh mục và Thứ tự thực hiện các Kịch bản

Các kịch bản được sắp xếp theo đúng chu trình nghiệp vụ thực tế của một cửa hàng bán lẻ:

1. **[`01-ban-hang-pos.md`](./01-ban-hang-pos.md)**: Mở ca bán hàng, bán thu tiền mặt, chuyển khoản qua mã QR, bán ghi nợ có kiểm tra hạn mức tín dụng.
2. **[`02-tra-hang.md`](./02-tra-hang.md)**: Tìm kiếm hóa đơn, trả hàng một phần, trả hàng toàn phần, kiểm tra hoàn tiền và hoàn tồn kho.
3. **[`03-cong-no.md`](./03-cong-no.md)**: Tra cứu sổ nợ khách hàng, lập phiếu thu tiền nợ, điều chỉnh tăng giảm nợ thủ công.
4. **[`04-nhap-hang-ton-kho.md`](./04-nhap-hang-ton-kho.md)**: Tạo phiếu nhập hàng từ nhà cung cấp, kiểm kê kho thực tế, cân bằng kho và theo dõi cảnh báo tồn kho.
5. **[`05-bao-cao-cuoi-ngay.md`](./05-bao-cao-cuoi-ngay.md)**: Xem báo cáo doanh thu, lợi nhuận gộp theo mặt hàng, phân tích tuổi nợ khách hàng, xuất dữ liệu ra file bảng tính (CSV/Excel).
6. **[`06-in-hoa-don.md`](./06-in-hoa-don.md)**: Cấu hình bật/tắt các trường thông tin mẫu in (tên cửa hàng, địa chỉ, ghi chú, mã QR) và kiểm tra mẫu in hóa đơn.
7. **[`07-ngoai-tuyen.md`](./07-ngoai-tuyen.md)**: Mô phỏng mất mạng, bán hàng trong chế độ ngoại tuyến (offline), kết nối lại mạng và xác thực tự động đồng bộ không trùng đơn.

---

## 4. Quy ước Đánh giá và Ghi nhận kết quả

Trong từng bảng bước thực hiện, người kiểm thử ghi nhận kết quả tại cột **Kết quả thực tế**:

- **Đạt**: Tính năng hoạt động đúng như kết quả mong đợi, không phát sinh lỗi giao diện hay dữ liệu.
- **Không đạt**: Tính năng không hoạt động, hiển thị sai dữ liệu, ném lỗi giao diện, hoặc kết quả khác biệt so với mô tả.
- **Chặn (Blocked)**: Không thể thực hiện bước kiểm thử do lỗi nghiêm trọng từ bước trước đó.

---

## 5. Quy trình Báo cáo lỗi (Khi phát hiện lỗi)

Khi gặp bước kiểm thử **Không đạt**, người kiểm thử vui lòng ghi lại thông tin theo biểu mẫu sau:

1. **Mã kịch bản và Bước lỗi**: (Ví dụ: Kịch bản 01, Bước 1.4 - Bán ghi nợ vượt hạn mức).
2. **Mô tả hành vi thực tế**: Hệ thống xử lý thế nào thay vì kết quả mong đợi.
3. **Dữ liệu đầu vào đã nhập**: Giá trị cụ thể đã điền trên giao diện.
4. **Ảnh chụp màn hình (Screenshot)**: Hình ảnh giao diện tại thời điểm xảy ra lỗi.
5. **Nhật ký bảng điều khiển trình duyệt (Console Log / Network Log)**: Mở phím F12, sao chép các dòng lỗi màu đỏ (nếu có).
6. **Mức độ nghiêm trọng**: Khẩn cấp (gây sập ứng dụng/mất dữ liệu), Cao (sai lệch tiền/tồn kho), Trung bình (lỗi giao diện/thông báo khó hiểu), Thấp (lỗi chính tả/trình bày).
