# Design Direction Decision

## Hướng thiết kế đã chọn

**Direction: "Clean Utility" — Tối giản, hiệu quả, đáng tin cậy**

Phong cách thiết kế lấy cảm hứng từ Square POS + Notion — giao diện sạch, trắng làm chủ đạo, typography rõ ràng, màu sắc chỉ dùng có mục đích (highlight action, trạng thái). Không gradient, không illustration phức tạp, không animation fancy.

## Đặc trưng visual

1. **Background trắng sáng** (`neutral-50`) — tạo cảm giác sạch sẽ, chuyên nghiệp
2. **Cards nổi nhẹ** — `shadow-sm`, `rounded-lg` (8px), border nhạt `neutral-200`
3. **Một accent color** — `primary-500` (xanh dương) cho mọi action chính
4. **Typography hierarchy rõ** — heading bold, body regular, số tiền mono bold
5. **Whitespace có chủ đích** — đủ thoáng để scan nhanh, đủ compact cho mobile
6. **Icon outline style** — Lucide icons, stroke 1.5px, consistent

## Lý do lựa chọn

- **Phù hợp đối tượng**: Chủ cửa hàng VN cần giao diện "nghiêm túc, đáng tin" — không quá trẻ trung (Canva style) hay quá corporate (SAP style)
- **Dễ implement**: Team nhỏ, 8-12 tuần. Style đơn giản = ít CSS phức tạp, ít asset cần design
- **Mobile-first tốt**: Clean style scale tốt từ 375px → 1024px+
- **Accessible**: High contrast, rõ ràng, không phụ thuộc gradient/color phức tạp

## Triển khai

- Tailwind config với custom colors/spacing/typography tokens
- Component library: Button, Input, Card, Badge, Modal, Toast, Table, Tab, Dropdown
- Layout templates: POS screen, List screen, Detail screen, Dashboard screen, Form screen

---
