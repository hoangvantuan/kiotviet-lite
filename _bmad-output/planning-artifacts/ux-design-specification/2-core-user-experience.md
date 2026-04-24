# 2. Core User Experience

## 2.1 Trải nghiệm định nghĩa

**"Quét — Bán — Xong. Giá đúng, nợ rõ."**

Tương tự Tinder có "swipe to match", KiotViet Lite có "quét barcode → giá tự áp → thanh toán 1 chạm". Đây là tương tác mà nhân viên sẽ mô tả cho bạn bè: "Quét cái vèo, nó tự biết giá, bấm thanh toán là xong."

## 2.2 Mô hình tư duy người dùng

**Nhân viên bán hàng (Lan):**

- Mental model: "Sổ tay bán hàng trên điện thoại" — tìm SP, ghi giá, tính tiền
- Kỳ vọng: đơn giản như dùng máy tính tiền, nhưng thông minh hơn (tự nhớ giá)
- Điểm gây confused: khi nào cần chọn KH trước (bán buôn) vs. bỏ qua (bán lẻ)

**Chủ cửa hàng (chị Hoa):**

- Mental model: "Excel thông minh" — bảng giá, tồn kho, công nợ nhưng tự tính
- Kỳ vọng: biết tình hình cửa hàng trong 30 giây từ dashboard
- Điểm gây confused: cascade giá (chain formula), conflict resolution khi sync

## 2.3 Tiêu chí thành công

| Tiêu chí          | Metric                      | Target                 |
| ----------------- | --------------------------- | ---------------------- |
| Đơn hàng nhanh    | Thời gian 1 đơn (3-5 SP)    | ≤ 30 giây              |
| Không cần hỏi giá | Số lần NV hỏi chủ về giá    | 0 lần/ngày             |
| Tổng quan nhanh   | Thời gian nắm tình hình     | ≤ 30 giây từ dashboard |
| Training ngắn     | Thời gian NV mới thành thạo | ≤ 30 phút              |
| Setup nhanh       | Đăng ký → bán hàng đầu tiên | ≤ 5 phút               |
| Offline seamless  | Đơn mất khi offline         | 0 đơn                  |


## 2.4 Novel UX Patterns

**Kết hợp quen + mới:**

- **Quen**: Grid sản phẩm (Shopee/Square), bottom tab bar (mọi app VN), pull-to-refresh
- **Mới**: Hiển thị nguồn giá real-time cạnh mỗi dòng SP trên POS ("Giá ĐL C1", "Giá riêng KH")
- **Mới**: Công nợ tích hợp trong luồng thanh toán (không phải module riêng)
- **Mới**: Offline indicator nhẹ nhàng (chỉ icon nhỏ, không popup warning)

**Cách "dạy" pattern mới:**

- Nguồn giá: tooltip "?" giải thích lần đầu, sau đó user tự hiểu
- Công nợ tích hợp: nút "Ghi nợ" hiện ngay cạnh "Thanh toán" khi có KH buôn
- Offline: onboarding slide ngắn "KiotViet Lite hoạt động cả khi mất mạng"

## 2.5 Cơ chế trải nghiệm chi tiết

**Luồng bán hàng (POS) — Core loop:**

```
1. KHỞI TẠO
   → Mở POS → Đơn trống sẵn sàng
   → [Optional] Chọn KH từ thanh tìm kiếm phía trên

2. THÊM SẢN PHẨM
   → Quét barcode (camera) HOẶC gõ tên/mã (autocomplete)
   → SP tự thêm vào giỏ, giá tự áp theo KH (nếu có)
   → Badge nguồn giá hiện cạnh giá: "Giá ĐL C1" / "Giá riêng"
   → Lặp lại cho SP tiếp theo

3. THANH TOÁN
   → Bấm nút "Thanh toán" (nổi bật, xanh lá)
   → Chọn phương thức: Tiền mặt | Chuyển khoản | Ghi nợ
   → [Tiền mặt] Nhập số tiền → Hiện tiền thừa (font lớn)
   → [Ghi nợ] Hệ thống check hạn mức → OK hoặc cần PIN override

4. HOÀN THÀNH
   → Animation check nhẹ → In hóa đơn (tự động hoặc 1 tap)
   → Tồn kho trừ, công nợ cập nhật (background)
   → Đơn mới tự mở → Sẵn sàng cho KH tiếp theo
```

---
