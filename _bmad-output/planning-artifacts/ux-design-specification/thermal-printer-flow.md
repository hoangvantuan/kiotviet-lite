# Thermal Printer Flow

Liên quan FR50-FR51, NF18. Bổ sung từ Implementation Readiness Report 2026-04-24: thống nhất UX và Architecture cho in ấn.

## Mục tiêu

Thống nhất printing strategy: Web Serial API là primary, CSS @media print + window.print() là fallback. Spec permission dialog, error handling, device pairing UX.

## Printing Strategy (Thống nhất)

| Ưu tiên | Phương thức | Điều kiện | Kết quả |
|---------|-------------|-----------|---------|
| 1 | Web Serial API | Browser hỗ trợ + printer đã pair | ESC/POS binary trực tiếp → thermal printer |
| 2 | CSS @media print | Fallback mọi trường hợp | window.print() → browser print dialog |

**Loại bỏ:** Image generation fallback (không cần thiết, CSS @media print đã đủ).

## Device Pairing Flow (Lần đầu)

### Entry Point
Nút "In hóa đơn" trên màn hình PaymentSuccess hoặc chi tiết hóa đơn.

### Bước 1: User Gesture Trigger
- Nhân viên nhấn "In hóa đơn"
- Browser hiển thị Web Serial device picker (native dialog)
- Nhân viên chọn thermal printer từ danh sách

### Bước 2: Permission Granted
- Toast success: "Đã kết nối máy in [tên máy]"
- Device ID lưu vào localStorage cho auto-reconnect
- In job gửi ngay lập tức

### Bước 3: Lần In Tiếp Theo
- Auto-connect đến device đã lưu (không dialog)
- Nếu device không tìm thấy → inline alert + nút "Kết nối lại"

## Quản lý Máy In (Settings)

### Đường dẫn: Cài đặt > Máy in

- Hiển thị máy in đã kết nối: tên, trạng thái (Online/Offline), nút "Ngắt kết nối"
- Nút "Kết nối máy in mới" → trigger Web Serial picker
- Dropdown: Khổ giấy mặc định (58mm / 80mm)
- Toggle: "Tự động in sau thanh toán" (default: tắt)

## Error Handling UX

| Lỗi | Hiển thị | Hành động |
|-----|----------|-----------|
| Máy in không phản hồi | Toast warning "Máy in không phản hồi" | [Thử lại] [In qua trình duyệt] |
| Hết giấy | Toast "Hết giấy. Nạp giấy rồi thử lại" | [Thử lại] |
| Mất kết nối giữa lúc in | Toast error "Mất kết nối máy in" | Tự động retry 1 lần |
| Web Serial không hỗ trợ (Safari, Firefox) | Auto-fallback browser print | Banner info "Trình duyệt không hỗ trợ in trực tiếp. Đang dùng chế độ in trình duyệt" |
| User từ chối permission | Toast info "Bạn có thể kết nối máy in sau tại Cài đặt > Máy in" | Fallback browser print |
| Offline | In bình thường (render client-side) | Template + logo từ Service Worker cache |

## Fallback Flow (Browser Print)

1. Render invoice HTML với CSS `@media print`
2. Gọi `window.print()`
3. Toast info "Đang dùng chế độ in trình duyệt"
4. Hoạt động offline (template render client-side, logo cache Service Worker)

## Print Template Customization UX

### Đường dẫn: Cài đặt > Mẫu in

**Layout:**
- Cột trái: Form cài đặt
  - Upload logo (preview realtime, ≤2MB jpg/png)
  - Input slogan
  - Toggle fields: nợ cũ, nợ mới, giá vốn, chiết khấu, ghi chú cuối
  - Dropdown: Loại mẫu (thermal 58mm, thermal 80mm, A4/A5)
- Cột phải: Preview panel (cập nhật realtime khi thay đổi)
- Mobile: tabs Cài đặt / Preview

**Lưu:** per store_id. Bảng `print_settings` (store_id, template_type, logo_url, slogan, show_old_debt, show_new_debt, show_cost, show_discount, show_note, footer_text).

## Components

| Component | Mô tả |
|-----------|-------|
| PrinterSetupPanel | Quản lý kết nối máy in (Settings) |
| PrintPreview | Preview mẫu in realtime |
| PrintTemplateEditor | Form tùy chỉnh mẫu in |
| PrintErrorBanner | Banner lỗi in ấn với fallback actions |
