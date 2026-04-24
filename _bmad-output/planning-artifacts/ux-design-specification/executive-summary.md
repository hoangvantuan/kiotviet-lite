# Executive Summary

## Tầm nhìn sản phẩm

KiotViet Lite là phần mềm quản lý bán hàng (POS) dành riêng cho hộ kinh doanh nhỏ tại Việt Nam (1-5 nhân viên). Sản phẩm tập trung vào hai mô hình bán buôn và bán lẻ, giải quyết 3 pain point lớn nhất: (1) lên đơn nhanh với giá đúng, (2) quản lý công nợ minh bạch, (3) biết lãi lỗ tồn kho chính xác.

Triết lý thiết kế: **ít hơn = tốt hơn**. Mỗi màn hình chỉ làm 1 việc. Mọi thao tác bán hàng hoàn thành trên điện thoại. Bán hàng không cần internet. Từ đăng ký đến bán hàng đầu tiên ≤ 5 phút.

## Người dùng mục tiêu

| Persona                        | Đặc điểm                                                                                                  | Nhu cầu UX chính                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Chủ cửa hàng nhỏ** (chị Hoa) | 35-45 tuổi, 1-5 NV, bán tạp hóa/VLXD/thời trang. Hiện dùng sổ tay + Excel. Trình độ công nghệ trung bình. | Tổng quan nhanh (doanh thu, lãi lỗ, nợ), quản lý giá linh hoạt, setup dễ |
| **Nhân viên bán hàng** (Lan)   | 20-30 tuổi, dùng smartphone OK nhưng chưa dùng POS. Cần training ≤ 30 phút.                               | Lên đơn nhanh ≤ 30s, không cần nhớ giá, giao diện đơn giản               |
| **Khách buôn** (anh Minh)      | Đại lý cấp 2, mua SL lớn, trả nợ dần. Cần hóa đơn rõ ràng.                                                | Thấy rõ giá buôn, nợ cũ/mới, lịch sử thanh toán                          |


## Thách thức thiết kế chính

1. **Hệ thống 6 tầng giá phức tạp** — phải trình bày đơn giản cho nhân viên (auto-áp giá) nhưng linh hoạt cho chủ cửa hàng (cấu hình cascade, chain formula)
2. **Offline-first trên mobile** — toàn bộ luồng bán hàng phải mượt khi mất mạng, sync trạng thái phải rõ ràng không gây hoang mang
3. **Đa dạng trình độ người dùng** — nhân viên cần giao diện tối giản, chủ cửa hàng cần báo cáo + cấu hình nâng cao, cùng 1 ứng dụng
4. **Công nợ tích hợp sâu** — ghi nợ, thu nợ, FIFO, hạn mức phải tự nhiên trong luồng bán hàng, không phải module tách biệt

## Cơ hội thiết kế

1. **5-phút onboarding** — trải nghiệm setup đơn giản hơn hẳn KiotViet/Sapo tạo ấn tượng mạnh ngay lần đầu
2. **POS mobile-first thực sự** — đối thủ thiết kế cho desktop rồi responsive, KiotViet Lite thiết kế cho mobile trước
3. **Hiển thị nguồn giá minh bạch** — nhân viên thấy "Giá riêng KH" hay "Giá ĐL C1" cạnh mỗi dòng, tăng tin tưởng và giảm hỏi chủ

---
