# Visual Design Foundation

## Hệ thống màu sắc

**Brand Colors:**

| Token         | Hex       | Mục đích                                                |
| ------------- | --------- | ------------------------------------------------------- |
| `primary-500` | `#2563EB` | Hành động chính, link, focus — xanh dương tạo tin tưởng |
| `primary-600` | `#1D4ED8` | Primary hover/active                                    |
| `primary-50`  | `#EFF6FF` | Primary background nhẹ                                  |
| `success-500` | `#16A34A` | Thanh toán, xác nhận, đơn thành công                    |
| `warning-500` | `#F59E0B` | Cảnh báo tồn kho, nợ sắp hạn mức                        |
| `error-500`   | `#DC2626` | Lỗi, nợ quá hạn, hủy                                    |
| `neutral-50`  | `#F8FAFC` | Background chính                                        |
| `neutral-100` | `#F1F5F9` | Card background, section divider                        |
| `neutral-500` | `#64748B` | Text phụ, placeholder                                   |
| `neutral-900` | `#0F172A` | Text chính                                              |


**Semantic Colors:**

| Ngữ cảnh          | Màu           | Ví dụ                               |
| ----------------- | ------------- | ----------------------------------- |
| Nút thanh toán    | `success-500` | Nút "Thanh toán" nổi bật xanh lá    |
| Nợ quá hạn        | `error-500`   | Badge đỏ trên KH nợ > 60 ngày       |
| Cảnh báo tồn kho  | `warning-500` | Icon vàng khi SP dưới mức tối thiểu |
| Offline indicator | `neutral-500` | Icon cloud-off xám nhẹ              |
| Sync pending      | `warning-500` | Dot vàng nhỏ trên đơn chưa sync     |
| Nguồn giá         | `primary-500` | Badge xanh "Giá ĐL C1"              |


**Contrast compliance:** Tất cả text-on-background đạt WCAG AA (≥ 4.5:1 cho text bình thường, ≥ 3:1 cho text lớn).

## Hệ thống Typography

**Font Stack:**

```
--font-sans: 'Inter', 'Noto Sans', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

- **Inter**: Font chính — dễ đọc trên mọi size, hỗ trợ tiếng Việt tốt, free
- **Noto Sans**: Fallback — đảm bảo dấu tiếng Việt hiển thị đúng trên mọi thiết bị
- **JetBrains Mono**: Cho số tiền, mã đơn hàng — monospace giúp căn cột dễ đọc

**Type Scale (base 16px):**

| Token       | Size | Weight | Line Height | Dùng cho                   |
| ----------- | ---- | ------ | ----------- | -------------------------- |
| `text-xs`   | 12px | 400    | 1.5         | Caption, helper text       |
| `text-sm`   | 14px | 400    | 1.5         | Body secondary, label      |
| `text-base` | 16px | 400    | 1.5         | Body chính                 |
| `text-lg`   | 18px | 500    | 1.4         | Subheading, giá trên POS   |
| `text-xl`   | 20px | 600    | 1.3         | Section heading            |
| `text-2xl`  | 24px | 700    | 1.2         | Page title                 |
| `text-3xl`  | 30px | 700    | 1.2         | Dashboard metric lớn       |
| `text-4xl`  | 36px | 700    | 1.1         | Tổng tiền, tiền thừa (POS) |


**Quy tắc đặc biệt:**

- Số tiền: `font-mono`, `font-semibold`, luôn format VNĐ với dấu chấm phân cách nghìn (1.500.000đ)
- Mã đơn hàng / SKU: `font-mono`, `text-sm`
- Nguồn giá badge: `text-xs`, `font-medium`, uppercase

## Spacing & Layout Foundation

**Spacing Scale (base 4px):**

| Token      | Value | Dùng cho                                    |
| ---------- | ----- | ------------------------------------------- |
| `space-1`  | 4px   | Gap nhỏ nhất (icon-text)                    |
| `space-2`  | 8px   | Padding trong button, gap giữa items inline |
| `space-3`  | 12px  | Padding card nội bộ                         |
| `space-4`  | 16px  | Gap giữa section items, padding mặc định    |
| `space-5`  | 20px  | Gap giữa sections                           |
| `space-6`  | 24px  | Padding container, margin section           |
| `space-8`  | 32px  | Spacing lớn giữa major sections             |
| `space-10` | 40px  | Top/bottom page padding                     |


**Layout Principles:**

1. **Mật độ thông tin vừa phải** — không quá thưa (lãng phí mobile), không quá đặc (gây overwhelm). Target: 60-70% content density
2. **Touch targets ≥ 44px** — mọi nút, link, input trên mobile có vùng tap tối thiểu 44x44px
3. **Gutters 16px** — khoảng cách giữa các cột/containers trên mobile
4. **Card-based layout** — dùng cards cho items trong danh sách (SP, KH, đơn hàng). Border radius 8px, shadow nhẹ
5. **Sticky elements** — bottom bar (mobile POS giỏ hàng), top search bar. Sticky giữ action chính luôn trong tầm tay

## Accessibility

- **Contrast ratio**: ≥ 4.5:1 cho text bình thường, ≥ 3:1 cho text ≥ 18px
- **Focus visible**: Ring xanh 2px cho mọi interactive element
- **Touch target**: ≥ 44x44px trên mobile
- **Font size tối thiểu**: 14px cho body text (user thường là 35-45 tuổi, cần đọc thoải mái)
- **Color không phải indicator duy nhất**: Dùng icon + text kèm màu (đỏ + icon X cho lỗi, vàng + icon ! cho cảnh báo)

---
