# Project Scoping & Phased Development

## MVP Strategy & Philosophy

**Approach:** Problem-solving MVP — giải quyết đúng 3 pain point lớn nhất của hộ kinh doanh nhỏ VN: (1) lên đơn nhanh với giá đúng, (2) quản lý công nợ, (3) biết lãi lỗ tồn kho.

**Timeline:** 8-12 tuần cho toàn bộ 7 module MVP.

**Resource:** 1-2 full-stack developer + 1 designer (part-time).

## MVP Feature Set (Phase 1)

**Core Journeys Supported:** J1 (setup + bán buôn), J2 (bán lẻ + offline), J3 (nhập hàng), J4 (công nợ).

**Must-Have:**

- M1: Sản phẩm, biến thể, danh mục 2 cấp, đơn vị quy đổi, tồn kho, nhập hàng, kiểm kho, NCC
- M2: Bảng giá (chain formula + clone), giá riêng KH, giá theo SL, CK danh mục, 6 tầng ưu tiên, kiểm soát sửa giá
- M3: POS mobile-first, 2 chế độ bán, quét barcode camera, thanh toán đa phương thức, ghi nợ tích hợp, offline mode, 5 tab đồng thời
- M4: KH, nhóm KH, lịch sử, hạn mức nợ
- M5: Hóa đơn, trả hàng, mẫu in thermal 58/80mm + A4
- M6: Phải thu, phải trả, phiếu thu/chi, FIFO, điều chỉnh, cảnh báo
- M7: Dashboard, báo cáo doanh thu/lợi nhuận/tồn kho/công nợ/sổ quỹ

**Có thể manual ban đầu:**

- Import Excel (v1.1)
- In mã vạch (v1.1)
- Import từ KiotViet API (v1.1)

## Post-MVP Features (Phase 2 — 4 tuần sau MVP)

- Import dữ liệu từ KiotViet qua API
- Import Excel nâng cao (biến thể, bảng giá)
- Barcode generation + in tem mã vạch
- PWA install prompt trên mobile

## Expansion Features (Phase 3 — 3-6 tháng sau MVP)

- Đa chi nhánh / đa kho
- Tích hợp sàn TMĐT (Shopee, Lazada)
- Hóa đơn điện tử
- Webhook + API công khai
- Tích hợp vận chuyển
- Chương trình tích điểm / khuyến mãi

## Risk Mitigation Strategy

| Loại risk | Risk                                         | Mitigation                                                                                              |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Technical | Offline sync conflict phức tạp               | Giữ conflict resolution đơn giản (server wins tồn kho, client wins đơn). Không hỗ trợ edit đơn offline. |
| Technical | Performance với 10.000+ sản phẩm trên mobile | Virtual scrolling, lazy load, index trên barcode/SKU/tên                                                |
| Market    | User quen KiotViet, ngại chuyển              | Import data từ KiotViet (v1.1), 5-phút setup, free tier hào phóng                                       |
| Market    | Hộ kinh doanh nhỏ ít sẵn sàng trả tiền SaaS  | Freemium model, giá thấp hơn KiotViet 50%+                                                              |
| Resource  | Team nhỏ, scope 7 module                     | Module ưu tiên: M3 (POS) → M1 (Hàng hóa) → M2 (Giá) → M6 (Nợ) → M4 (KH) → M5 (HĐ) → M7 (BC)             |

