# Kịch Bản UAT 07: Bán Hàng Ngoại Tuyến (Offline-First) và Đồng Bộ Dữ Liệu

## 1. Mục tiêu

Xác thực cơ chế bán hàng ngoại tuyến (offline-first) vượt trội của KiotViet Lite: thu ngân vẫn có thể tiếp tục thao tác bán hàng, thêm sản phẩm, thanh toán hoàn tất đơn hàng bình thường ngay cả khi xảy ra sự cố mất kết nối mạng internet hoặc ngắt kết nối máy chủ; xác thực hiển thị biểu tượng chỉ báo ngoại tuyến (Offline Indicator) và số lượng đơn hàng chờ đồng bộ; sau đó khôi phục lại kết nối mạng, kiểm tra tiến trình tự động đồng bộ đơn hàng lên máy chủ và đảm bảo tính bất biến (idempotency - không sinh đơn trùng lặp).

## 2. Điều kiện chuẩn bị

- Đăng nhập vào hệ thống bằng tài khoản Thu ngân hoặc Chủ cửa hàng:
  - Số điện thoại: `0901000003`
  - Mật khẩu: `matkhau123`
- Truy cập vào giao diện Bán hàng POS (`/pos`).
- Đảm bảo ứng dụng đã tải xong dữ liệu danh mục và sản phẩm vào cơ sở dữ liệu trình duyệt (PGlite / IndexedDB).
- Công cụ hỗ trợ ngắt mạng:
  - **Cách 1**: Tắt kết nối Wi-Fi / rút dây mạng LAN của máy tính.
  - **Cách 2**: Dùng công cụ nhà phát triển của trình duyệt (phím F12 -> thẻ Network -> chọn chuyển từ "No throttling" sang "Offline").

---

## 3. Các bước thực hiện chi tiết

### Kịch bản 7.1: Ngắt kết nối mạng và kiểm tra chỉ báo ngoại tuyến

| Bước | Thao tác thực hiện                                                                                                  | Dữ liệu mẫu                | Kết quả mong đợi                                                                                                                             | Kết quả thực tế | Ghi chú |
| :--- | :------------------------------------------------------------------------------------------------------------------ | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tại màn hình POS đang mở, tiến hành ngắt kết nối mạng (chuyển sang chế độ Offline trên trình duyệt hoặc tắt Wi-Fi). | Trạng thái mạng: "Offline" | Trên thanh tiêu đề ứng dụng xuất hiện biểu tượng mất kết nối mạng (chỉ báo `WifiOff` màu xám).                                               |                 |         |
| 2    | Bấm vào biểu tượng chỉ báo ngoại tuyến.                                                                             | Bấm icon mạng              | Hiển thị hộp thoại nhỏ thông báo: "Ứng dụng đang hoạt động ở chế độ ngoại tuyến. Dữ liệu sẽ được lưu cục bộ và tự động đồng bộ khi có mạng." |                 |         |

### Kịch bản 7.2: Tạo đơn hàng và thanh toán trong trạng thái ngoại tuyến

| Bước | Thao tác thực hiện                                                                                                      | Dữ liệu mẫu                                    | Kết quả mong đợi                                                                                                                    | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Tìm kiếm và chọn sản phẩm "Mì Hảo Hảo tôm chua cay" (`MH001`) vào giỏ hàng.                                             | Số lượng: `5 gói` (giá 4.000 đ/gói = 20.000 đ) | Sản phẩm thêm vào giỏ mượt mà từ dữ liệu lưu trong bộ nhớ máy tính cục bộ.                                                          |                 |         |
| 2    | Chọn thêm "Nước tương Maggi" (`MG001`).                                                                                 | Số lượng: `1 chai` (giá 18.000 đ)              | Tổng tiền giỏ hàng tính đúng: `38.000 đ`.                                                                                           |                 |         |
| 3    | Bấm nút "Thanh toán", chọn hình thức "Tiền mặt".                                                                        | Tiền khách đưa: `50.000 đ`                     | Tính tiền thừa: `12.000 đ`.                                                                                                         |                 |         |
| 4    | Bấm nút "Hoàn tất thanh toán".                                                                                          |                                                | Đơn hàng hoàn tất ngay lập tức (không bị treo chờ máy chủ), tạo mã đơn hàng tạm thời (ví dụ: `OFF-001`), giỏ hàng làm mới sẵn sàng. |                 |         |
| 5    | Tạo thêm một đơn hàng thứ hai (Đơn hàng 2): 2 lon Nước ngọt Sting dâu (`ST001-DAU`, giá 20.000 đ), thanh toán tiền mặt. | Đơn thứ 2: 20.000 đ                            | Đơn hàng thứ hai tạo thành công ngoại tuyến.                                                                                        |                 |         |
| 6    | Quan sát biểu tượng chỉ báo ngoại tuyến trên thanh tiêu đề.                                                             |                                                | Xuất hiện huy hiệu số màu đỏ (badge) hiển thị số `2` (báo hiệu có 2 đơn hàng đang chờ đồng bộ lên máy chủ).                         |                 |         |

### Kịch bản 7.3: Nối lại kết nối mạng và theo dõi quá trình tự động đồng bộ

| Bước | Thao tác thực hiện                                                                                                             | Dữ liệu mẫu               | Kết quả mong đợi                                                                                                      | Kết quả thực tế | Ghi chú |
| :--- | :----------------------------------------------------------------------------------------------------------------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Bật lại kết nối mạng internet (chuyển trạng thái Network trên trình duyệt từ "Offline" về "No throttling" hoặc bật lại Wi-Fi). | Trạng thái mạng: "Online" | Hệ thống tự động phát hiện mạng đã kết nối trở lại.                                                                   |                 |         |
| 2    | Quan sát biểu tượng chỉ báo trên thanh tiêu đề.                                                                                |                           | Biển tượng chuyển sang trạng thái xoay đồng bộ (Syncing), số đơn chờ giảm dần từ 2 về 0.                              |                 |         |
| 3    | Sau khi đồng bộ hoàn tất.                                                                                                      |                           | Biểu tượng chỉ báo ngoại tuyến tự động biến mất khỏi thanh tiêu đề, trở về trạng thái kết nối trực tuyến bình thường. |                 |         |

### Kịch bản 7.4: Kiểm tra và xác thực chống nhân bản đơn (Không sinh đơn trùng lặp)

| Bước | Thao tác thực hiện                                                                                                | Dữ liệu mẫu          | Kết quả mong đợi                                                                                                     | Kết quả thực tế | Ghi chú |
| :--- | :---------------------------------------------------------------------------------------------------------------- | :------------------- | :------------------------------------------------------------------------------------------------------------------- | :-------------- | :------ |
| 1    | Mở tab trình duyệt mới hoặc chuyển sang màn hình danh sách Đơn hàng (`/orders`).                                  | Đường dẫn: `/orders` | Danh sách đơn hàng xuất hiện đầy đủ 2 đơn hàng vừa được bán trong lúc mất mạng.                                      |                 |         |
| 2    | Kiểm tra chi tiết 2 đơn hàng vừa đồng bộ (mã đơn, thời gian bán, các mặt hàng bên trong, phương thức thanh toán). |                      | Số liệu khớp 100% với các thao tác đã thực hiện lúc ngoại tuyến.                                                     |                 |         |
| 3    | Nhấn F5 tải lại trang danh sách Đơn hàng nhiều lần hoặc bấm thử nút đồng bộ thủ công.                             |                      | **Không xuất hiện thêm bất kỳ đơn hàng trùng lặp nào**. Hệ thống đảm bảo tính duy nhất và toàn vẹn dữ liệu đơn hàng. |                 |         |
| 4    | Kiểm tra tồn kho của các mặt hàng liên quan (Mì Hảo Hảo, Nước tương Maggi, Sting dâu).                            |                      | Tồn kho trên máy chủ được trừ chính xác theo đúng số lượng đã bán trong 2 đơn ngoại tuyến.                           |                 |         |

---

## 4. Tiêu chí Đạt nghiệm thu

- Ứng dụng không bị gián đoạn hay đóng băng khi mất kết nối mạng.
- Cho phép tạo đơn và thanh toán thành công trong chế độ ngoại tuyến.
- Chỉ báo trạng thái ngoại tuyến và bộ đếm đơn chờ đồng bộ hiển thị rõ ràng, trực quan.
- Tự động đồng bộ ngay khi có mạng trở lại mà không cần người dùng can thiệp thủ công phức tạp.
- Đảm bảo tính toàn vẹn dữ liệu tuyệt đối: không mất đơn, không sinh trùng đơn (idempotent sync).
