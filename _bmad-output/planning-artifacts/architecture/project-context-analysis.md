# Project Context Analysis

## Tổng quan yêu cầu

**Functional Requirements:**
67 FR chia thành 9 nhóm chức năng:

| Nhóm            | FR        | Mô tả                                                      | Độ phức tạp kiến trúc |
| --------------- | --------- | ---------------------------------------------------------- | --------------------- |
| Hàng hóa        | FR1-FR7   | CRUD SP, biến thể, đơn vị quy đổi, danh mục 2 cấp, tồn kho | Trung bình            |
| Nhập hàng & NCC | FR8-FR12  | Phiếu nhập, giá vốn BQ gia quyền, kiểm kho, NCC            | Trung bình            |
| Đơn giá         | FR13-FR25 | 6 tầng ưu tiên, chain formula, cascade, CK danh mục        | **Cao**               |
| POS             | FR26-FR35 | Mobile-first, barcode camera, đa phương thức, 5 tab        | **Cao**               |
| Offline         | FR36-FR39 | Full offline POS, sync, conflict resolution                | **Cao**               |
| Khách hàng      | FR40-FR45 | Nhóm KH, hạn mức nợ, lịch sử, tạo nhanh từ POS             | Thấp                  |
| Hóa đơn         | FR46-FR51 | In thermal/A4, trả hàng, tùy chỉnh mẫu in                  | Trung bình            |
| Công nợ         | FR52-FR58 | FIFO allocation, hạn mức, phiếu thu/chi, cảnh báo          | **Cao**               |
| Báo cáo         | FR59-FR64 | Dashboard, doanh thu, lợi nhuận, tồn kho, export           | Trung bình            |
| Quyền hạn       | FR65-FR67 | 3 role, PIN override, audit log                            | Thấp                  |


**Non-Functional Requirements:**
19 NFR chia 5 nhóm:

| Nhóm          | Yêu cầu quan trọng nhất                                              |
| ------------- | -------------------------------------------------------------------- |
| Performance   | Tìm SP < 200ms, tạo đơn < 500ms, tải trang < 2s, POS ≥ 30fps         |
| Security      | TLS 1.2+, bcrypt/argon2, JWT + refresh rotation, PIN hash, audit log |
| Scalability   | ≤ 10.000 SP, ≤ 5.000 KH, ≤ 5 nhân viên đồng thời                     |
| Offline       | 100% POS offline, sync ≤ 100 đơn trong < 30s                         |
| Compatibility | Mobile ≥ 375px, thermal 58/80mm ESC/POS, camera barcode              |


## Đánh giá độ phức tạp

| Chỉ số           | Mức                                                       |
| ---------------- | --------------------------------------------------------- |
| Real-time        | Thấp — polling đủ, không cần WebSocket cho MVP            |
| Multi-tenancy    | Đơn giản — mỗi store 1 tenant, không share data           |
| Regulatory       | Không — chưa cần hóa đơn điện tử cho MVP                  |
| Integration      | Thấp — không tích hợp bên thứ 3 trong MVP                 |
| User interaction | **Cao** — POS cần responsive, nhanh, offline              |
| Data complexity  | **Cao** — 6-tier pricing, FIFO debt, weighted avg cost    |
| Tổng thể         | **Medium-High** — business logic phức tạp, infra đơn giản |


## Technical Constraints

1. **Offline-first bắt buộc** — toàn bộ luồng POS phải hoạt động không internet
2. **Mobile-first** — thiết kế cho màn hình nhỏ trước, mở rộng lên desktop
3. **Team nhỏ** (1-2 dev) — cần stack đơn giản, ít boilerplate, DX tốt
4. **Target device** — Android mid-range + Safari iOS ≥ 15
5. **Thermal printer** — ESC/POS protocol qua WebUSB hoặc Web Serial

## Cross-Cutting Concerns

1. **Offline/Sync** — ảnh hưởng mọi module có write data
2. **Pricing Engine** — cần chạy cả client (offline) và server (sync verify)
3. **Authentication & Authorization** — 3 role, PIN cho thao tác nhạy cảm
4. **Audit Trail** — mọi thay đổi giá, nợ, override phải ghi log
5. **Printing** — thermal + A4, dùng chung template engine
6. **Validation** — Zod schema dùng chung client/server

---
