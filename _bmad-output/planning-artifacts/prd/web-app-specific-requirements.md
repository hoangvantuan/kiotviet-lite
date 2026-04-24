# Web App Specific Requirements

## Platform & Browser

| Tiêu chí        | Yêu cầu                                                     |
| --------------- | ----------------------------------------------------------- |
| Kiến trúc       | SPA (Single Page Application)                               |
| Deployment      | PWA (Progressive Web App) — installable trên mobile         |
| Browser support | Chrome ≥ 90, Safari ≥ 15, Firefox ≥ 90, Edge ≥ 90           |
| Mobile browser  | Chrome Android, Safari iOS (≥ iOS 15)                       |
| SEO             | Không cần — đây là app nội bộ, không phải website công khai |


## Responsive Design

| Breakpoint         | Mô tả                     | Layout POS                                  |
| ------------------ | ------------------------- | ------------------------------------------- |
| ≥ 375px (mobile)   | Điện thoại — layout chính | Grid SP phía trên, giỏ hàng kéo lên từ dưới |
| ≥ 768px (tablet)   | Tablet ngang              | 2 cột: SP bên trái, giỏ hàng bên phải       |
| ≥ 1024px (desktop) | Máy tính                  | 2 cột rộng, thêm thông tin KH trên giỏ hàng |


## Offline & Caching

- Service Worker cache toàn bộ shell app + assets tĩnh
- IndexedDB / PGlite cache dữ liệu: sản phẩm, KH, bảng giá, cài đặt
- Đơn hàng tạo offline lưu local với `sync_status = pending`
- Background Sync API đồng bộ khi có mạng
- Conflict resolution: server wins (tồn kho), client wins (đơn hàng)
- Tồn kho âm sau sync → cảnh báo chủ cửa hàng

## Real-time

- Không yêu cầu real-time collaboration (1-5 nhân viên, conflict thấp)
- Polling hoặc long-polling đủ cho đồng bộ trạng thái
- WebSocket chỉ cần nếu mở rộng đa chi nhánh (v2+)

## Performance Targets

| Metric                      | Target          | Điều kiện                |
| --------------------------- | --------------- | ------------------------ |
| First Contentful Paint      | < 1.5s          | 4G connection            |
| Time to Interactive         | < 3s            | 4G connection            |
| Tìm sản phẩm (autocomplete) | < 200ms         | Local cache, ≤ 10.000 SP |
| Tạo đơn hàng                | < 500ms         | Local + sync             |
| Tải danh sách (100 items)   | < 1s            | Paginated                |
| Kích thước bundle initial   | < 300KB gzipped | Code splitting           |

