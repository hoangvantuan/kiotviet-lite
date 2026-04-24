# Executive Summary

KiotViet Lite là phần mềm quản lý bán hàng (POS) dành riêng cho hộ kinh doanh nhỏ tại Việt Nam (1-5 nhân viên), tập trung vào hai mô hình bán buôn và bán lẻ. Sản phẩm giải quyết vấn đề cốt lõi: các POS hiện tại (KiotViet, Sapo, Nhanh.vn) phình to tính năng, phức tạp, và ngày càng đắt — trong khi hộ kinh doanh nhỏ chỉ cần lên đơn nhanh, quản lý nhiều bảng giá, và theo dõi công nợ khách hàng.

**Đối tượng mục tiêu:**

| Persona             | Mô tả                                              | Nhu cầu chính                           |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| Chủ cửa hàng nhỏ    | 1-5 nhân viên, bán tạp hóa/VLXD/thời trang/mỹ phẩm | Tồn kho chính xác, biết lãi lỗ, quản nợ |
| Nhân viên bán hàng  | Trình độ công nghệ thấp-trung bình                 | Lên đơn nhanh, không phải nhớ giá       |
| Khách buôn (đại lý) | Mua số lượng lớn, trả nợ dần                       | Giá buôn riêng, ghi nợ, nhận phiếu thu  |


**Nguyên tắc thiết kế:**

1. Ít hơn = tốt hơn — mỗi màn hình chỉ làm 1 việc
2. Mobile-first — mọi thao tác bán hàng hoàn thành trên điện thoại
3. Offline-first — bán hàng không cần internet, đồng bộ khi có mạng
4. 5 phút setup — từ đăng ký đến bán hàng đầu tiên ≤ 5 phút
5. Minh bạch giá — không chi phí ẩn, export dữ liệu bất kỳ lúc nào

## Điều Làm Sản Phẩm Đặc Biệt

**Hệ thống 6 tầng giá tự động:** KiotViet Lite giải quyết bài toán đau đầu nhất của bán buôn VN — mỗi khách một giá, mỗi đợt mua một mức. Hệ thống 6 tầng ưu tiên (giá riêng KH → chiết khấu danh mục → sửa tay → giá theo SL → bảng giá nhóm KH → giá bán lẻ) tự động áp giá đúng mà nhân viên không cần nhớ gì. Bảng giá hỗ trợ chain formula (kế thừa từ bảng giá khác), cascade khi giá gốc thay đổi, và hiển thị rõ nguồn giá trên POS.

**Offline-first thực sự:** Không chỉ "có offline mode" — toàn bộ luồng bán hàng, tạo đơn, in hóa đơn hoạt động offline hoàn toàn với IndexedDB/PGlite. Đồng bộ tự động khi có mạng với conflict resolution rõ ràng (server wins cho tồn kho, client wins cho đơn hàng).

**Quản lý công nợ tích hợp sâu:** Ghi nợ, phiếu thu, hạn mức nợ, phân bổ thanh toán FIFO — tất cả tích hợp trực tiếp vào luồng bán hàng thay vì là module tách biệt.
