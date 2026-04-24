# User Journeys

## Journey 1: Chị Hoa — Chủ cửa hàng VLXD lần đầu dùng POS

**Persona:** Chị Hoa, 38 tuổi, chủ cửa hàng vật liệu xây dựng ở quận Bình Tân. 3 nhân viên. Hiện ghi sổ tay + Excel. Mỗi tháng mất 2 ngày đối chiếu công nợ. Đã thử KiotViet nhưng thấy quá nhiều tính năng không dùng, giá tăng dần.

**Opening Scene:** Chị Hoa nghe bạn giới thiệu KiotViet Lite. Mở trình duyệt trên điện thoại, đăng ký bằng SĐT. Trang setup hỏi tên cửa hàng, SĐT, nghành hàng — xong trong 2 phút.

**Rising Action:** Chị import danh sách 200 sản phẩm từ file Excel. Hệ thống map cột tự động, preview trước khi import. Chị tạo 3 nhóm KH (Khách lẻ, Khách buôn, Đại lý) và 3 bảng giá tương ứng. Bảng giá buôn = giá gốc - 15%, bảng giá đại lý = giá buôn - 5% (chain formula). Chị thêm giá riêng cho anh Ba — khách quen lấy gạch men luôn 72k/cái.

**Climax:** Buổi chiều, anh Ba đến lấy 50 viên gạch men + 20 bao xi măng. Nhân viên Lan mở POS, chọn "Anh Ba" — hệ thống tự áp giá riêng cho gạch (72k) và giá đại lý cho xi măng. Tổng đơn 5.5 triệu. Anh Ba trả 3 triệu tiền mặt, ghi nợ 2.5 triệu. Hóa đơn in ra từ máy thermal: rõ giá, nợ cũ 5 triệu, nợ mới 7.5 triệu. Toàn bộ ≤ 1 phút.

**Resolution:** Cuối ngày, chị Hoa mở dashboard: doanh thu 15.2 triệu, lợi nhuận 3.8 triệu, 47 đơn. Tab công nợ: 3 KH nợ quá 30 ngày, tổng phải thu 45 triệu. 5 sản phẩm cần nhập thêm. Chị Hoa biết chính xác tình hình cửa hàng mà không cần mở sổ.

## Journey 2: Lan — Nhân viên bán hàng, bán lẻ nhanh

**Persona:** Lan, 22 tuổi, nhân viên bán hàng. Dùng smartphone thành thạo nhưng chưa từng dùng POS. Chị Hoa vừa cho Lan tài khoản staff.

**Opening Scene:** Lan mở POS trên điện thoại. Giao diện đơn giản: thanh tìm kiếm + grid sản phẩm + giỏ hàng bên dưới. Không có menu phức tạp.

**Rising Action:** Khách lẻ mua 3 món. Lan quét barcode bằng camera — sản phẩm tự thêm vào giỏ, giá bán lẻ tự áp. Khách hỏi thêm 2 lon sơn — Lan gõ "sơn" trong thanh tìm kiếm, chọn từ grid. Tổng 450k. Khách trả 500k tiền mặt. Lan bấm "Thanh toán" → nhập 500k → hệ thống hiện "Thừa 50k". In hóa đơn xong, đơn mới tự mở.

**Climax:** Đột nhiên wifi cửa hàng mất. Lan vẫn bán bình thường — POS hoạt động offline. Quét barcode, thêm sản phẩm, thanh toán, in hóa đơn — tất cả OK. Đơn hàng đánh dấu "pending sync".

**Resolution:** 30 phút sau wifi có lại. POS tự đồng bộ 5 đơn hàng offline lên server. Tồn kho cập nhật. Không mất đơn nào. Lan không hề biết có sự cố.

## Journey 3: Chị Hoa — Nhập hàng và quản lý giá khi giá nhập thay đổi

**Persona:** Chị Hoa (chủ cửa hàng từ Journey 1).

**Opening Scene:** Nhà cung cấp giao 500 viên gạch men, giá nhập tăng từ 70k lên 78k/viên.

**Rising Action:** Chị Hoa tạo phiếu nhập kho: chọn NCC, quét barcode gạch men, nhập SL 500, đơn giá 78k. Hệ thống tự tính giá vốn bình quân gia quyền mới: (200 × 70k + 500 × 78k) / 700 = 75.7k. Tổng phiếu 39 triệu, chị trả 20 triệu, ghi nợ NCC 19 triệu.

**Climax:** Vì cài đặt chế độ "Cảnh báo", hệ thống hiện thông báo: "Giá vốn gạch men tăng 8.1% (70k → 75.7k). Giá bán hiện tại: bán lẻ 95k (margin 25.5%), buôn 85k (margin 12.3%), ĐL C1 80k (margin 5.7%). Cần điều chỉnh giá bán?" Chị Hoa thấy margin ĐL C1 quá thấp, vào sửa giá gốc từ 100k lên 110k. Hệ thống preview cascade: bán lẻ → 104.5k, buôn → 93.5k, ĐL C1 → 88.8k, ĐL C2 → 90.7k. OK — chị xác nhận.

**Resolution:** Từ giờ mọi đơn mới tự áp giá mới. Giá riêng anh Ba (72k) vẫn giữ nguyên vì đó là thỏa thuận cố định. Chị vào "Lịch sử giá nhập" xem biến động giá gạch men 6 tháng qua.

## Journey 4: Anh Minh — Khách buôn trả nợ

**Persona:** Anh Minh, chủ đại lý cấp 2, mua hàng của chị Hoa hàng tuần, thường ghi nợ và trả theo đợt.

**Opening Scene:** Anh Minh tới trả nợ 10 triệu. Nhân viên Lan mở POS, tìm "Anh Minh" → tab Công nợ: tổng nợ 25 triệu, gồm 4 hóa đơn (HD-001: 8tr, HD-002: 7tr, HD-003: 5tr, HD-004: 5tr).

**Rising Action:** Lan nhập "Thu 10 triệu" bằng tiền mặt. Hệ thống phân bổ FIFO: HD-001 trả hết 8tr, HD-002 trả 2tr/7tr (còn nợ 5tr). Phiếu thu in ra: chi tiết phân bổ, nợ cũ 25tr, đã thu 10tr, nợ mới 15tr.

**Climax:** Anh Minh muốn mua thêm 100 bao xi măng. Hệ thống kiểm tra: nợ hiện tại 15tr + đơn mới ~9tr = 24tr. Hạn mức nợ nhóm ĐL cấp 2: 30tr. Còn trong hạn mức — cho phép ghi nợ. Nếu vượt, sẽ cần PIN chủ cửa hàng để override.

**Resolution:** Anh Minh ra về với hóa đơn rõ ràng. Chị Hoa xem báo cáo "Nợ phải thu theo thời gian": phân nhóm 0-30 ngày, 31-60, 61-90, >90 ngày. Phát hiện 2 KH nợ >60 ngày — gọi điện nhắc.

## Journey Requirements Summary

| Journey                     | Capabilities Revealed                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| J1 — Setup & bán buôn       | Đăng ký nhanh, import Excel, bảng giá chain formula, giá riêng KH, ghi nợ, dashboard, cảnh báo tồn kho |
| J2 — Bán lẻ nhanh + offline | POS mobile-first, quét barcode camera, thanh toán tiền mặt/thừa, offline mode, auto-sync               |
| J3 — Nhập hàng & giá        | Phiếu nhập kho, bình quân gia quyền, cascade giá, cảnh báo margin, lịch sử giá nhập                    |
| J4 — Công nợ                | Phiếu thu, phân bổ FIFO, kiểm tra hạn mức, override PIN, báo cáo nợ theo thời gian                     |

