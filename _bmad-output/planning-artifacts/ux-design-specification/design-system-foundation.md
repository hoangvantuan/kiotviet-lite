# Design System Foundation

## Lựa chọn Design System

**Quyết định: Tailwind CSS + Headless UI / Radix UI**

Hệ thống themeable, utility-first — tốc độ phát triển nhanh nhưng visual hoàn toàn custom.

## Lý do lựa chọn

1. **Tốc độ phát triển** — team 1-2 dev, timeline 8-12 tuần. Tailwind + Headless UI cho phép build nhanh mà không bị lock vào visual identity của Material/Ant Design
2. **Mobile-first native** — Tailwind responsive classes (`sm:`, `md:`, `lg:`) thiết kế cho mobile-first workflow
3. **Customization hoàn toàn** — không bị giới hạn bởi component library visual. Brand KiotViet Lite có identity riêng
4. **Bundle size nhỏ** — purge CSS chỉ giữ class dùng, phù hợp target < 300KB gzipped
5. **Accessibility built-in** — Headless UI/Radix cung cấp accessible primitives (focus trap, ARIA, keyboard nav) mà không áp style

## Cách triển khai

- **Design tokens** qua `tailwind.config.js` — colors, spacing, typography, breakpoints
- **Component primitives** từ Radix UI — Dialog, Dropdown, Select, Toast, Tabs
- **Custom components** build bằng Tailwind classes — POS grid, barcode scanner, invoice template
- **Icon set** — Lucide Icons (nhẹ, consistent, tree-shakeable)

## Chiến lược tùy biến

- Tạo design tokens cho brand colors, spacing scale, font stack
- Wrap Radix primitives thành project components có sẵn styling
- Tạo component variants bằng `class-variance-authority` (CVA)
- Không dùng `@apply` quá nhiều — giữ utility classes inline cho readability

---
