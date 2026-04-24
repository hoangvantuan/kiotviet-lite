# UX Pattern Analysis & Inspiration

## Phân tích sản phẩm truyền cảm hứng

**1. Grab — Super app quen thuộc với user VN**

- Onboarding cực nhanh (SĐT + OTP)
- Giao diện đơn giản, action chính luôn nổi bật
- Xử lý offline/lỗi mạng mượt mà
- Bài học: Đăng ký bằng SĐT, OTP, minimal fields

**2. Shopee Seller Center — Quản lý đơn hàng quen với SME VN**

- Dashboard tổng quan doanh thu/đơn hàng
- Quản lý sản phẩm với ảnh + biến thể
- Bài học: Dashboard layout, product management patterns

**3. Square POS — Benchmark toàn cầu cho POS mobile**

- Grid sản phẩm visual, quét barcode camera
- Thanh toán mượt, ít bước
- Offline mode hoạt động tốt
- Bài học: POS layout mobile-first, thanh toán flow

**4. Notion — Progressive disclosure đỉnh**

- Giao diện đơn giản nhưng powerful khi cần
- Keyboard shortcuts tăng productivity
- Bài học: Progressive disclosure cho chủ cửa hàng vs. nhân viên

## Pattern chuyển đổi được

**Navigation:**

- Bottom tab bar cho mobile (POS, Sản phẩm, Đơn hàng, Công nợ, Thêm) — pattern quen từ Grab/Shopee
- Sidebar cho desktop/tablet — hiện menu đầy đủ

**Interaction:**

- Pull-to-refresh cho danh sách — quen từ mọi app
- Swipe actions trên list items (xem chi tiết, sửa nhanh)
- Floating action button cho hành động chính (Tạo đơn mới)

**Data Display:**

- Card-based dashboard cho số liệu tổng quan
- Infinite scroll + search cho danh sách lớn (SP, KH)
- Tab navigation cho chi tiết (KH: Đơn hàng | Công nợ | Thống kê)

## Anti-pattern cần tránh

1. **Menu hamburger phức tạp** — KiotViet hiện tại có quá nhiều menu lồng nhau. Tránh > 2 cấp
2. **Form dài trên mobile** — chia nhỏ thành steps hoặc wizard, không đổ hết vào 1 trang
3. **Modal chồng modal** — tối đa 1 layer modal, không chồng
4. **Loading spinner vô hạn** — luôn có skeleton loading hoặc cached data
5. **Xác nhận quá nhiều** — "Bạn có chắc?" chỉ khi thao tác không reversible (xóa, trả hàng)

## Chiến lược áp dụng cảm hứng

| Chiến lược             | Pattern                                          | Lý do                                    |
| ---------------------- | ------------------------------------------------ | ---------------------------------------- |
| **Áp dụng nguyên bản** | Bottom tab bar, pull-to-refresh, card dashboard  | User VN đã quen, không cần dạy           |
| **Điều chỉnh**         | Square POS grid → thêm barcode camera prominence | POS cần quét barcode nhiều hơn chọn grid |
| **Điều chỉnh**         | Shopee seller dashboard → đơn giản hóa cho SME   | Bớt metric, focus 3-4 số quan trọng      |
| **Tránh**              | Desktop-first responsive (KiotViet)              | Mobile-first là yêu cầu cốt lõi          |


---
