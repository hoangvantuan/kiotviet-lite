# UX Consistency Patterns

## Button Hierarchy

| Level           | Style                             | Dùng cho                   | Ví dụ                          |
| --------------- | --------------------------------- | -------------------------- | ------------------------------ |
| **Primary**     | Filled, `primary-500`, text trắng | Hành động chính trên trang | "Thanh toán", "Lưu", "Tạo mới" |
| **Success**     | Filled, `success-500`, text trắng | Xác nhận thanh toán        | "Thanh toán 1.500.000đ"        |
| **Secondary**   | Outlined, border `neutral-300`    | Hành động phụ              | "Hủy", "Quay lại", "Ghi nợ"    |
| **Ghost**       | Text only, no border              | Hành động nhẹ              | "Xem thêm", "Bỏ qua"           |
| **Destructive** | Filled, `error-500`               | Xóa, hủy không reversible  | "Xóa sản phẩm", "Hủy đơn"      |


**Quy tắc:**

- Mỗi trang chỉ có 1 Primary button
- Success chỉ dùng cho nút thanh toán/xác nhận tiền
- Destructive luôn cần confirmation dialog
- Touch target ≥ 44px height trên mobile

## Feedback Patterns

| Type        | Visual                           | Behavior               | Duration                 |
| ----------- | -------------------------------- | ---------------------- | ------------------------ |
| **Success** | Toast xanh lá, icon check, top   | Auto-dismiss           | 3 giây                   |
| **Error**   | Toast đỏ, icon X, top            | Cần tap dismiss        | Persist đến khi dismiss  |
| **Warning** | Banner vàng, icon !, top page    | Có action button       | Persist đến khi resolved |
| **Info**    | Toast xanh dương, icon info, top | Auto-dismiss           | 4 giây                   |
| **Loading** | Skeleton shimmer                 | Replace content areas  | Đến khi loaded           |
| **Offline** | Icon nhỏ trên top bar            | Persistent khi offline | Đến khi online           |


**Quy tắc:**

- Toast không chồng: tối đa 1 toast hiện tại, toast mới thay thế cũ
- Error phải kèm gợi ý: "Giá không được bằng 0. Nhập giá > 0 hoặc liên hệ chủ cửa hàng."
- Loading: dùng skeleton cho content areas, spinner chỉ cho actions (nút đang xử lý)

## Form Patterns

**Validation:**

- Validate khi blur (rời field) — không validate realtime khi đang gõ
- Error message hiện ngay dưới field, text đỏ, font `text-sm`
- Field error: border đỏ + error message + icon !

**Layout:**

- 1 cột trên mobile, 2 cột trên desktop (cho form có nhiều field)
- Label phía trên input (không inline)
- Required fields đánh dấu `*` đỏ
- Group related fields bằng section heading

**Đặc biệt cho số tiền:**

- Input số tiền luôn format tự động khi blur: 1500000 → 1.500.000
- Đơn vị "đ" hiện ở suffix
- Keyboard numeric trên mobile (`inputmode="decimal"`)

## Navigation Patterns

**Mobile (≥ 375px):**

```
┌──────────────────────┐
│  KiotViet Lite   [☁] │  ← Top bar: logo, offline indicator
├──────────────────────┤
│                      │
│    Content Area      │  ← Scrollable content
│                      │
├──────────────────────┤
│ 🏪  📦  🛒  💰  ⋯  │  ← Bottom tab: POS, SP, Đơn, Nợ, Thêm
└──────────────────────┘
```

**Tablet/Desktop (≥ 768px):**

```
┌────────┬─────────────────────┐
│ Logo   │    Content Area     │
│────────│                     │
│ POS    │                     │
│ Hàng   │                     │
│ Đơn    │                     │
│ KH     │                     │
│ Nợ     │                     │
│ BC     │                     │
│────────│                     │
│ CĐ     │                     │
└────────┴─────────────────────┘
```

**Quy tắc:**

- Back button: top-left, luôn có trên detail pages
- Breadcrumb: chỉ trên desktop, cho navigation sâu > 2 levels
- Tab trong trang: horizontal tabs, scrollable trên mobile
- Search: sticky top, luôn visible trên POS và danh sách

## Empty States

Mỗi danh sách rỗng có:

1. Illustration đơn giản (line art, neutral)
2. Heading mô tả ("Chưa có sản phẩm nào")
3. Mô tả ngắn ("Thêm sản phẩm đầu tiên để bắt đầu bán hàng")
4. CTA button ("Thêm sản phẩm")

## Confirmation Patterns

| Mức độ         | Pattern              | Ví dụ                                 |
| -------------- | -------------------- | ------------------------------------- |
| **Nhẹ**        | Inline toggle/switch | Bật/tắt theo dõi tồn kho              |
| **Trung bình** | Bottom sheet + 2 nút | Ghi nợ, trả hàng                      |
| **Nặng**       | Dialog + gõ lại tên  | Xóa sản phẩm, xóa bảng giá            |
| **Nhạy cảm**   | PIN Owner            | Sửa giá dưới vốn, override hạn mức nợ |


---
