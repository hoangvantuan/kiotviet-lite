# Responsive Design & Accessibility

## Chiến lược Responsive

**Mobile (375px - 767px) — Layout chính:**

- Bottom tab navigation (5 tabs)
- Full-width content, 1 cột
- POS: Grid SP phía trên, giỏ hàng bottom sheet kéo lên
- Forms: 1 cột, full-width inputs
- Tables → Card list (swipe for actions)
- FAB (Floating Action Button) cho tạo mới

**Tablet (768px - 1023px):**

- Bottom tab hoặc sidebar (user chọn)
- POS: 2 cột — SP grid bên trái (60%), giỏ hàng bên phải (40%)
- Forms: 2 cột cho field groups
- Tables: responsive table với horizontal scroll nếu cần

**Desktop (≥ 1024px):**

- Sidebar navigation cố định
- POS: 2 cột rộng — SP grid + info KH trên giỏ hàng
- Dashboard: 4 cột metric cards
- Forms: 2-3 cột, spacious
- Full tables với sort/filter

## Breakpoint Strategy

```css
/* Mobile-first approach */
/* Base: ≥ 375px (mobile) */

@media (min-width: 768px) {
  /* Tablet: sidebar/2-col layout */
}

@media (min-width: 1024px) {
  /* Desktop: full sidebar, wide layout */
}

@media (min-width: 1280px) {
  /* Large desktop: max-width container, extra spacing */
}
```

**Tailwind classes tương ứng:** `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px)

## POS Layout Responsive chi tiết

**Mobile (375px):**

```
┌──────────────────────┐
│ 🔍 Tìm SP...   [📷] │  ← Search + camera scan
├──────────────────────┤
│ [SP1] [SP2] [SP3]   │
│ [SP4] [SP5] [SP6]   │  ← Grid 3 cột
│ [SP7] [SP8] [SP9]   │
├──────────────────────┤
│ ▲ Giỏ hàng (3 SP)   │  ← Bottom sheet, kéo lên xem
│   Tổng: 450.000đ    │
│   [Thanh toán]       │
└──────────────────────┘
```

**Tablet (768px):**

```
┌──────────────┬───────────┐
│ 🔍 Tìm SP.. │ KH: --    │
│──────────────│───────────│
│ [SP] [SP]    │ SP1  x2   │
│ [SP] [SP]    │ SP2  x1   │
│ [SP] [SP]    │───────────│
│ [SP] [SP]    │ Tổng 450k │
│              │[Thanh toán]│
└──────────────┴───────────┘
```

**Desktop (1024px):**

```
┌────┬────────────────┬─────────────┐
│Menu│ 🔍 Tìm SP...  │ KH: Anh Ba  │
│    │────────────────│ Nhóm: ĐL C1 │
│ POS│ [SP] [SP] [SP] │ Nợ: 5tr     │
│ SP │ [SP] [SP] [SP] │─────────────│
│ ĐH │ [SP] [SP] [SP] │ SP1 x2 170k│
│ KH │ [SP] [SP] [SP] │ SP2 x1 280k│
│ Nợ │                │─────────────│
│ BC │                │ Tổng: 450k  │
│    │                │[Thanh toán] │
└────┴────────────────┴─────────────┘
```

## Accessibility Strategy

**Mức tuân thủ: WCAG 2.1 Level AA**

Lý do: đối tượng user 35-45 tuổi, có thể thị lực giảm, cần AA để đảm bảo readability. Level AAA quá strict cho timeline.

**Yêu cầu cụ thể:**

| Tiêu chí       | Yêu cầu                                  | Cách implement                      |
| -------------- | ---------------------------------------- | ----------------------------------- |
| Color contrast | ≥ 4.5:1 text bình thường, ≥ 3:1 text lớn | Đã verify trong color system        |
| Keyboard nav   | Tab focus tất cả interactive elements    | `tabindex`, focus ring visible      |
| Screen reader  | Tất cả images có alt, ARIA labels        | Radix built-in + custom labels      |
| Touch targets  | ≥ 44x44px trên mobile                    | Min-height 44px cho buttons/links   |
| Font size      | Min 14px body, scalable                  | Dùng `rem` units, không fixed `px`  |
| Motion         | `prefers-reduced-motion` respected       | Disable animations khi user prefer  |
| Language       | `lang="vi"` trên html                    | Hỗ trợ screen reader đọc tiếng Việt |


**Focus Management:**

- Modal mở → focus trap bên trong
- Modal đóng → focus trả về trigger element
- Page navigation → focus về heading chính
- Error → focus về field lỗi đầu tiên

## Testing Strategy

**Responsive Testing:**

- Chrome DevTools device emulation cho tất cả breakpoints
- Test thật trên: iPhone SE (375px), iPhone 15 (393px), iPad (768px), laptop (1366px)
- Kiểm tra landscape mode trên tablet

**Accessibility Testing:**

- `eslint-plugin-jsx-a11y` trong CI
- Lighthouse accessibility audit ≥ 90 điểm
- Manual keyboard-only testing cho POS flow
- VoiceOver (macOS/iOS) cho screen reader testing

**Performance Testing:**

- FCP < 1.5s trên 4G
- TTI < 3s trên 4G
- Bundle size < 300KB gzipped
- POS search autocomplete < 200ms

---
