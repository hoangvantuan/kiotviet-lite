# Dashboard Specification

Liên quan FR59 (Dashboard tổng quan). Bổ sung từ Implementation Readiness Report 2026-04-24.

## Mục tiêu

FR59 yêu cầu dashboard tổng quan: doanh thu, lợi nhuận, số đơn (hôm nay/tuần/tháng/năm), biểu đồ 7 ngày, cảnh báo tồn kho + nợ quá hạn, top 5 SP bán chạy.

## Layout Responsive

### Desktop (≥1024px)
- Row 1: 4 MetricCards (doanh thu, lợi nhuận, số đơn, giá trị TB/đơn)
- Row 2: Biểu đồ doanh thu 7 ngày (2/3 width) + Top 5 SP bán chạy (1/3 width)
- Row 3: Cảnh báo tồn kho (1/2) + Nợ quá hạn (1/2)

### Tablet (768-1023px)
- Row 1: 2×2 grid MetricCards
- Row 2: Biểu đồ full width
- Row 3: Top 5 SP full width
- Row 4: Alert cards stacked

### Mobile (<768px)
- 2-column grid MetricCards (2 rows)
- Biểu đồ full width (horizontal scroll nếu cần)
- Top 5 SP dạng card list
- Alert cards stacked

## Metric Cards Specification

Mỗi card gồm:
- Label: text-sm, color neutral-500
- Value: text-2xl font-mono font-bold
- Trend: icon ↑/↓ + phần trăm + color (xanh lá = tăng, đỏ = giảm, so sánh với kỳ trước)
- Sparkline: 7 điểm SVG, height 24px, stroke 2px
- Period selector: shared cho tất cả cards (hôm nay/tuần/tháng/năm) tabs ở đầu trang
- Loading state: skeleton shimmer
- Empty state: hiển thị "0" với trend "-"

### 4 Metrics

| # | Label | Giá trị | Đơn vị | Trend so sánh |
|---|-------|---------|--------|---------------|
| 1 | Doanh thu | Tổng tiền orders (status=completed) | VNĐ format | Kỳ trước cùng loại |
| 2 | Lợi nhuận | Doanh thu - Giá vốn | VNĐ format | Kỳ trước |
| 3 | Số đơn | Count orders (status=completed) | Số | Kỳ trước |
| 4 | Trung bình/đơn | Doanh thu / Số đơn | VNĐ format | Kỳ trước |

## Biểu đồ Doanh thu 7 Ngày

- Loại: Vertical bar chart (7 bars, mỗi bar 1 ngày)
- Trục X: Label ngày (T2, T3...CN hoặc dd/MM)
- Trục Y: Tiền tệ format (K, M suffixes. VD: 15.2M)
- Interaction: Tap/hover bar → tooltip: doanh thu chính xác + số đơn
- Library: Recharts (lightweight, tương thích React)
- Loading state: Skeleton bars animation
- Empty state: "Chưa có dữ liệu doanh thu trong kỳ này" + icon chart placeholder

## Cảnh báo Tồn kho Thấp

- Header: "Cảnh báo tồn kho" + badge số lượng SP
- Danh sách: max 5 items, mỗi item: tên SP, tồn hiện tại (đỏ nếu = 0), định mức tối thiểu
- Trạng thái: tồn = 0 → badge "Hết hàng" đỏ. Tồn < min → text vàng
- CTA: "Xem tất cả" → /reports?tab=inventory&filter=low-stock
- Empty state: "Tất cả sản phẩm đủ tồn kho" + icon check xanh

## Nợ quá hạn

- Header: "Nợ quá hạn" + badge số KH
- Danh sách: max 5 KH, mỗi KH: tên, tổng nợ (font-mono bold), số ngày quá hạn lớn nhất
- Color coding: >90 ngày = đỏ, >60 = cam, >30 = vàng
- CTA: "Xem tất cả" → /debts?filter=overdue
- Empty state: "Không có khách hàng nợ quá hạn" + icon check xanh

## Top 5 SP Bán Chạy

- Layout: Table nhỏ (desktop) hoặc card list (mobile)
- Columns: Rank (#1-5), Tên SP, SL bán, Doanh thu, % tổng DT
- Period: theo period selector chung
- Empty state: "Chưa có đơn hàng trong kỳ này"

## Data Refresh Strategy

- Initial load: TanStack Query, `staleTime = 5 * 60 * 1000` (5 phút)
- Auto refetch: `refetchInterval = 5 * 60 * 1000` (khi tab active)
- Manual refresh: Pull-to-refresh (mobile) hoặc nút refresh icon (desktop, góc phải)
- Optimistic: Khi đơn hàng mới hoàn thành trên POS → invalidate dashboard queries
- Offline: Hiển thị data cuối cùng từ cache + banner "Dữ liệu offline, có thể chưa cập nhật"

## Components

| Component | Mô tả | Trạng thái |
|-----------|-------|-----------|
| DashboardMetricCard | Card metric với sparkline (đã có skeleton trong component-strategy.md) | Bổ sung chi tiết |
| DashboardBarChart | Biểu đồ doanh thu 7 ngày (Recharts) | Mới |
| DashboardAlertCard | Card cảnh báo tồn kho / nợ quá hạn | Mới |
| DashboardTopProducts | Table/list top 5 SP bán chạy | Mới |
| DashboardPeriodSelector | Tabs chọn kỳ (hôm nay/tuần/tháng/năm) | Mới |

## Phím tắt (Desktop)

| Phím | Hành động |
|------|-----------|
| 1/2/3/4 | Chuyển period: hôm nay/tuần/tháng/năm |
| R | Refresh data |
