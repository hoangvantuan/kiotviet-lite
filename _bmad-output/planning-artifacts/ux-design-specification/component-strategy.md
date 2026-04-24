# Component Strategy

## Components từ Design System (Radix UI + Tailwind)

| Component         | Source            | Customization                                                           |
| ----------------- | ----------------- | ----------------------------------------------------------------------- |
| Button            | Radix + CVA       | 4 variants: primary, secondary, ghost, destructive. 3 sizes: sm, md, lg |
| Input             | Radix             | Thêm prefix (icon), suffix (đơn vị), error state                        |
| Select / Dropdown | Radix             | Search-enabled cho danh sách dài (SP, KH)                               |
| Dialog / Modal    | Radix             | Bottom sheet trên mobile, centered modal trên desktop                   |
| Toast             | Radix             | 4 types: success, error, warning, info                                  |
| Tabs              | Radix             | Scrollable tabs trên mobile                                             |
| Tooltip           | Radix             | Cho nguồn giá, helper text                                              |
| Table             | Custom + Tailwind | Responsive: table trên desktop, card list trên mobile                   |


## Custom Components

### POSProductGrid

**Mục đích:** Grid sản phẩm cho POS, hiển thị ảnh + tên + giá, tap để thêm vào giỏ.
**Content:** Ảnh SP (1:1), tên (1 dòng truncate), giá bán (mono bold)
**Actions:** Tap → thêm 1 vào giỏ, long-press → chọn SL/biến thể
**States:** Default, out-of-stock (xám + badge "Hết hàng"), loading (skeleton)
**Responsive:** Grid 3 cột (mobile), 4 cột (tablet), 5-6 cột (desktop)

### POSCart (Giỏ hàng POS)

**Mục đích:** Hiển thị items đã chọn, tổng tiền, nút thanh toán.
**Content:** Tên SP, SL (editable), đơn giá, thành tiền, badge nguồn giá, tổng cộng
**Actions:** Sửa SL (stepper +/-), xóa item (swipe hoặc icon X), sửa giá (nếu có quyền), áp CK
**States:** Empty, has-items, checkout-mode
**Responsive:** Bottom sheet kéo lên (mobile), panel bên phải (tablet/desktop)

### PriceSourceBadge

**Mục đích:** Hiển thị nguồn giá cạnh mỗi dòng SP trên POS.
**Content:** Text ngắn: "Giá riêng KH", "Giá ĐL C1", "Giá theo SL", "Giá bán lẻ"
**States:** Mỗi source 1 màu nhạt khác nhau (blue, purple, green, gray)
**Size:** `text-xs`, pill shape, padding 2px 6px

### OfflineIndicator

**Mục đích:** Hiển thị trạng thái kết nối, nhẹ nhàng, không intrusive.
**States:**

- Online: Không hiển thị gì (default = online)
- Offline: Icon `cloud-off` nhỏ trên top bar, color `neutral-400`
- Syncing: Icon `cloud-sync` spinning nhẹ, color `primary-500`
- Sync error: Icon `cloud-alert`, color `warning-500`, tap → xem chi tiết

### DebtSummaryCard

**Mục đích:** Hiển thị tổng nợ KH trên POS khi chọn KH, hoặc trên trang chi tiết KH.
**Content:** Tổng nợ (font lớn, đỏ nếu > hạn mức), hạn mức, % đã dùng, progress bar
**Actions:** Tap → xem chi tiết hóa đơn nợ
**States:** Trong hạn mức (xanh), sắp hạn mức ≥80% (vàng), vượt hạn mức (đỏ)

### InvoicePrintTemplate

**Mục đích:** Template in hóa đơn cho thermal 58/80mm và A4.
**Variants:**

- Thermal 58mm: Logo nhỏ, SP table compress, font 8-10pt
- Thermal 80mm: Logo, SP table, nợ cũ/mới
- A4: Full header, bảng SP đầy đủ, tổng bằng chữ, ký tên

### DashboardMetricCard

**Mục đích:** Card hiển thị 1 metric trên dashboard (doanh thu, lợi nhuận, số đơn, v.v.)
**Content:** Label, value (font lớn mono), trend (↑↓), sparkline 7 ngày
**States:** Loading (skeleton), data, empty, error
**Size:** 2 columns trên mobile, 4 columns trên desktop

## Lộ trình triển khai Component

**Phase 1 — Core (tuần 1-4):**

- Button, Input, Select, Dialog, Toast (Radix wrappers)
- POSProductGrid, POSCart, PriceSourceBadge
- OfflineIndicator
- Table/List responsive

**Phase 2 — Business Logic (tuần 5-8):**

- DebtSummaryCard
- InvoicePrintTemplate (thermal + A4)
- DashboardMetricCard
- Form components (Product form, Customer form, Price list form)

**Phase 3 — Polish (tuần 9-12):**

- Barcode scanner component (camera integration)
- Chart components (sparkline, bar chart cho dashboard)
- Empty states, error states, skeleton loading
- Keyboard shortcut handler

---
