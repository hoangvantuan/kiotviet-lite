---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - /Users/tuanhv/Desktop/2BRAIN/deep-research/KiotViet_Research_20260418/PRD_POS_simplified.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 1
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: web_app
  domain: retail_pos
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - kiotviet-lite

**Author:** shun
**Date:** 2026-04-18

## Executive Summary

KiotViet Lite là phần mềm quản lý bán hàng (POS) dành riêng cho hộ kinh doanh nhỏ tại Việt Nam (1-5 nhân viên), tập trung vào hai mô hình bán buôn và bán lẻ. Sản phẩm giải quyết vấn đề cốt lõi: các POS hiện tại (KiotViet, Sapo, Nhanh.vn) phình to tính năng, phức tạp, và ngày càng đắt — trong khi hộ kinh doanh nhỏ chỉ cần lên đơn nhanh, quản lý nhiều bảng giá, và theo dõi công nợ khách hàng.

**Đối tượng mục tiêu:**

| Persona             | Mô tả                                              | Nhu cầu chính                           |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| Chủ cửa hàng nhỏ    | 1-5 nhân viên, bán tạp hóa/VLXD/thời trang/mỹ phẩm | Tồn kho chính xác, biết lãi lỗ, quản nợ |
| Nhân viên bán hàng  | Trình độ công nghệ thấp-trung bình                 | Lên đơn nhanh, không phải nhớ giá       |
| Khách buôn (đại lý) | Mua số lượng lớn, trả nợ dần                       | Giá buôn riêng, ghi nợ, nhận phiếu thu  |


**Nguyên tắc thiết kế:**

1. Ít hơn = tốt hơn — mỗi màn hình chỉ làm 1 việc
2. Mobile-first — mọi thao tác bán hàng hoàn thành trên điện thoại
3. Offline-first — bán hàng không cần internet, đồng bộ khi có mạng
4. 5 phút setup — từ đăng ký đến bán hàng đầu tiên ≤ 5 phút
5. Minh bạch giá — không chi phí ẩn, export dữ liệu bất kỳ lúc nào

### Điều Làm Sản Phẩm Đặc Biệt

**Hệ thống 6 tầng giá tự động:** KiotViet Lite giải quyết bài toán đau đầu nhất của bán buôn VN — mỗi khách một giá, mỗi đợt mua một mức. Hệ thống 6 tầng ưu tiên (giá riêng KH → chiết khấu danh mục → sửa tay → giá theo SL → bảng giá nhóm KH → giá bán lẻ) tự động áp giá đúng mà nhân viên không cần nhớ gì. Bảng giá hỗ trợ chain formula (kế thừa từ bảng giá khác), cascade khi giá gốc thay đổi, và hiển thị rõ nguồn giá trên POS.

**Offline-first thực sự:** Không chỉ "có offline mode" — toàn bộ luồng bán hàng, tạo đơn, in hóa đơn hoạt động offline hoàn toàn với IndexedDB/PGlite. Đồng bộ tự động khi có mạng với conflict resolution rõ ràng (server wins cho tồn kho, client wins cho đơn hàng).

**Quản lý công nợ tích hợp sâu:** Ghi nợ, phiếu thu, hạn mức nợ, phân bổ thanh toán FIFO — tất cả tích hợp trực tiếp vào luồng bán hàng thay vì là module tách biệt.

## Project Classification

| Tiêu chí        | Giá trị                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Project Type    | Web App (PWA, SPA, offline-first)                                                                                       |
| Domain          | Retail / Commerce (POS)                                                                                                 |
| Complexity      | Medium — business logic phức tạp (6-tier pricing, debt management, offline sync) nhưng không regulatory compliance nặng |
| Project Context | Greenfield                                                                                                              |


## Success Criteria

### User Success

- **Chủ cửa hàng:** Biết chính xác lãi/lỗ theo sản phẩm và tổng thể trong vòng 30 giây từ dashboard. Tồn kho khớp thực tế sau kiểm kho ≥ 98%. Nắm được ai nợ bao nhiêu, nợ bao lâu trong 1 click.
- **Nhân viên bán hàng:** Hoàn thành 1 đơn hàng (3-5 sản phẩm) trong ≤ 30 giây. Không cần hỏi chủ cửa hàng về giá — hệ thống tự áp đúng giá theo KH/SL/nhóm. Sử dụng thành thạo POS trong ≤ 30 phút training.
- **Khách buôn:** Nhận hóa đơn rõ ràng (giá buôn, nợ cũ, nợ mới) ngay sau khi mua. Trả nợ dần, xem lịch sử thanh toán.

### Business Success

| Mốc thời gian       | Chỉ số                            | Mục tiêu           |
| ------------------- | --------------------------------- | ------------------ |
| 3 tháng sau launch  | Số cửa hàng active                | ≥ 100              |
| 3 tháng sau launch  | Tỷ lệ retention tháng 2           | ≥ 60%              |
| 6 tháng sau launch  | Số cửa hàng active                | ≥ 500              |
| 6 tháng sau launch  | Đơn hàng/ngày trung bình/cửa hàng | ≥ 10               |
| 12 tháng sau launch | Tỷ lệ chuyển đổi từ KiotViet/Sapo | ≥ 5% target market |
| 12 tháng sau launch | NPS                               | ≥ 40               |


### Technical Success

- Thời gian từ đăng ký → bán hàng đầu tiên: ≤ 5 phút
- Tìm sản phẩm trên POS: < 200ms
- Tạo và lưu đơn hàng: < 500ms
- Tải trang bất kỳ: < 2 giây
- 100% chức năng bán hàng hoạt động offline
- Đồng bộ offline → server không mất đơn hàng
- Hỗ trợ thermal printer 58mm/80mm (ESC/POS) và A4/A5

### Measurable Outcomes

- Giảm thời gian lên đơn so với sổ tay/Excel: ≥ 70%
- Giảm sai sót giá bán (nhân viên áp sai giá): ≥ 90%
- Giảm nợ xấu (nhờ hạn mức nợ + cảnh báo): ≥ 30% sau 6 tháng sử dụng
- Thời gian kiểm kho giảm: ≥ 50%

## Product Scope

### MVP — Minimum Viable Product

7 module cốt lõi:

| #   | Module             | Mô tả                                                                                                                        |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| M1  | Quản lý hàng hóa   | Sản phẩm, danh mục (2 cấp), biến thể (2 thuộc tính), đơn vị quy đổi, tồn kho, nhập hàng, kiểm kho, NCC                       |
| M2  | Quản lý đơn giá    | Nhiều bảng giá (chain formula), giá riêng KH, giá theo SL, CK danh mục, hệ thống 6 tầng ưu tiên, kiểm soát sửa giá           |
| M3  | Bán hàng (POS)     | Lên đơn nhanh, quét barcode, 2 chế độ (nhanh/thường), thanh toán đa phương thức, ghi nợ, offline mode, xử lý đồng thời 5 đơn |
| M4  | Quản lý khách hàng | Thông tin KH, nhóm KH, lịch sử mua, nhóm giá, hạn mức nợ                                                                     |
| M5  | Quản lý hóa đơn    | Danh sách, lọc, chi tiết, in lại, trả hàng, mẫu in thermal + A4                                                              |
| M6  | Quản lý công nợ    | Phải thu (KH), phải trả (NCC), phiếu thu/chi, phân bổ FIFO, điều chỉnh nợ, cảnh báo                                          |
| M7  | Báo cáo cơ bản     | Dashboard, doanh thu, lợi nhuận, tồn kho, công nợ, sổ quỹ                                                                    |


### Growth Features (Post-MVP)

- Import dữ liệu từ KiotViet qua API
- Import Excel nâng cao
- Barcode generation + in tem mã vạch
- PWA install trên mobile
- Webhook + API công khai

### Vision (Future)

- Đa chi nhánh / đa kho
- Tích hợp sàn TMĐT (Shopee, Lazada, TikTok Shop)
- Hóa đơn điện tử (liên kết MISA/eInvoice)
- Tích hợp vận chuyển (GHN, GHTK, Viettel Post)
- Chương trình tích điểm / khuyến mãi phức tạp

## User Journeys

### Journey 1: Chị Hoa — Chủ cửa hàng VLXD lần đầu dùng POS

**Persona:** Chị Hoa, 38 tuổi, chủ cửa hàng vật liệu xây dựng ở quận Bình Tân. 3 nhân viên. Hiện ghi sổ tay + Excel. Mỗi tháng mất 2 ngày đối chiếu công nợ. Đã thử KiotViet nhưng thấy quá nhiều tính năng không dùng, giá tăng dần.

**Opening Scene:** Chị Hoa nghe bạn giới thiệu KiotViet Lite. Mở trình duyệt trên điện thoại, đăng ký bằng SĐT. Trang setup hỏi tên cửa hàng, SĐT, nghành hàng — xong trong 2 phút.

**Rising Action:** Chị import danh sách 200 sản phẩm từ file Excel. Hệ thống map cột tự động, preview trước khi import. Chị tạo 3 nhóm KH (Khách lẻ, Khách buôn, Đại lý) và 3 bảng giá tương ứng. Bảng giá buôn = giá gốc - 15%, bảng giá đại lý = giá buôn - 5% (chain formula). Chị thêm giá riêng cho anh Ba — khách quen lấy gạch men luôn 72k/cái.

**Climax:** Buổi chiều, anh Ba đến lấy 50 viên gạch men + 20 bao xi măng. Nhân viên Lan mở POS, chọn "Anh Ba" — hệ thống tự áp giá riêng cho gạch (72k) và giá đại lý cho xi măng. Tổng đơn 5.5 triệu. Anh Ba trả 3 triệu tiền mặt, ghi nợ 2.5 triệu. Hóa đơn in ra từ máy thermal: rõ giá, nợ cũ 5 triệu, nợ mới 7.5 triệu. Toàn bộ ≤ 1 phút.

**Resolution:** Cuối ngày, chị Hoa mở dashboard: doanh thu 15.2 triệu, lợi nhuận 3.8 triệu, 47 đơn. Tab công nợ: 3 KH nợ quá 30 ngày, tổng phải thu 45 triệu. 5 sản phẩm cần nhập thêm. Chị Hoa biết chính xác tình hình cửa hàng mà không cần mở sổ.

### Journey 2: Lan — Nhân viên bán hàng, bán lẻ nhanh

**Persona:** Lan, 22 tuổi, nhân viên bán hàng. Dùng smartphone thành thạo nhưng chưa từng dùng POS. Chị Hoa vừa cho Lan tài khoản staff.

**Opening Scene:** Lan mở POS trên điện thoại. Giao diện đơn giản: thanh tìm kiếm + grid sản phẩm + giỏ hàng bên dưới. Không có menu phức tạp.

**Rising Action:** Khách lẻ mua 3 món. Lan quét barcode bằng camera — sản phẩm tự thêm vào giỏ, giá bán lẻ tự áp. Khách hỏi thêm 2 lon sơn — Lan gõ "sơn" trong thanh tìm kiếm, chọn từ grid. Tổng 450k. Khách trả 500k tiền mặt. Lan bấm "Thanh toán" → nhập 500k → hệ thống hiện "Thừa 50k". In hóa đơn xong, đơn mới tự mở.

**Climax:** Đột nhiên wifi cửa hàng mất. Lan vẫn bán bình thường — POS hoạt động offline. Quét barcode, thêm sản phẩm, thanh toán, in hóa đơn — tất cả OK. Đơn hàng đánh dấu "pending sync".

**Resolution:** 30 phút sau wifi có lại. POS tự đồng bộ 5 đơn hàng offline lên server. Tồn kho cập nhật. Không mất đơn nào. Lan không hề biết có sự cố.

### Journey 3: Chị Hoa — Nhập hàng và quản lý giá khi giá nhập thay đổi

**Persona:** Chị Hoa (chủ cửa hàng từ Journey 1).

**Opening Scene:** Nhà cung cấp giao 500 viên gạch men, giá nhập tăng từ 70k lên 78k/viên.

**Rising Action:** Chị Hoa tạo phiếu nhập kho: chọn NCC, quét barcode gạch men, nhập SL 500, đơn giá 78k. Hệ thống tự tính giá vốn bình quân gia quyền mới: (200 × 70k + 500 × 78k) / 700 = 75.7k. Tổng phiếu 39 triệu, chị trả 20 triệu, ghi nợ NCC 19 triệu.

**Climax:** Vì cài đặt chế độ "Cảnh báo", hệ thống hiện thông báo: "Giá vốn gạch men tăng 8.1% (70k → 75.7k). Giá bán hiện tại: bán lẻ 95k (margin 25.5%), buôn 85k (margin 12.3%), ĐL C1 80k (margin 5.7%). Cần điều chỉnh giá bán?" Chị Hoa thấy margin ĐL C1 quá thấp, vào sửa giá gốc từ 100k lên 110k. Hệ thống preview cascade: bán lẻ → 104.5k, buôn → 93.5k, ĐL C1 → 88.8k, ĐL C2 → 90.7k. OK — chị xác nhận.

**Resolution:** Từ giờ mọi đơn mới tự áp giá mới. Giá riêng anh Ba (72k) vẫn giữ nguyên vì đó là thỏa thuận cố định. Chị vào "Lịch sử giá nhập" xem biến động giá gạch men 6 tháng qua.

### Journey 4: Anh Minh — Khách buôn trả nợ

**Persona:** Anh Minh, chủ đại lý cấp 2, mua hàng của chị Hoa hàng tuần, thường ghi nợ và trả theo đợt.

**Opening Scene:** Anh Minh tới trả nợ 10 triệu. Nhân viên Lan mở POS, tìm "Anh Minh" → tab Công nợ: tổng nợ 25 triệu, gồm 4 hóa đơn (HD-001: 8tr, HD-002: 7tr, HD-003: 5tr, HD-004: 5tr).

**Rising Action:** Lan nhập "Thu 10 triệu" bằng tiền mặt. Hệ thống phân bổ FIFO: HD-001 trả hết 8tr, HD-002 trả 2tr/7tr (còn nợ 5tr). Phiếu thu in ra: chi tiết phân bổ, nợ cũ 25tr, đã thu 10tr, nợ mới 15tr.

**Climax:** Anh Minh muốn mua thêm 100 bao xi măng. Hệ thống kiểm tra: nợ hiện tại 15tr + đơn mới ~9tr = 24tr. Hạn mức nợ nhóm ĐL cấp 2: 30tr. Còn trong hạn mức — cho phép ghi nợ. Nếu vượt, sẽ cần PIN chủ cửa hàng để override.

**Resolution:** Anh Minh ra về với hóa đơn rõ ràng. Chị Hoa xem báo cáo "Nợ phải thu theo thời gian": phân nhóm 0-30 ngày, 31-60, 61-90, >90 ngày. Phát hiện 2 KH nợ >60 ngày — gọi điện nhắc.

### Journey Requirements Summary

| Journey                     | Capabilities Revealed                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| J1 — Setup & bán buôn       | Đăng ký nhanh, import Excel, bảng giá chain formula, giá riêng KH, ghi nợ, dashboard, cảnh báo tồn kho |
| J2 — Bán lẻ nhanh + offline | POS mobile-first, quét barcode camera, thanh toán tiền mặt/thừa, offline mode, auto-sync               |
| J3 — Nhập hàng & giá        | Phiếu nhập kho, bình quân gia quyền, cascade giá, cảnh báo margin, lịch sử giá nhập                    |
| J4 — Công nợ                | Phiếu thu, phân bổ FIFO, kiểm tra hạn mức, override PIN, báo cáo nợ theo thời gian                     |


## Web App Specific Requirements

### Platform & Browser

| Tiêu chí        | Yêu cầu                                                     |
| --------------- | ----------------------------------------------------------- |
| Kiến trúc       | SPA (Single Page Application)                               |
| Deployment      | PWA (Progressive Web App) — installable trên mobile         |
| Browser support | Chrome ≥ 90, Safari ≥ 15, Firefox ≥ 90, Edge ≥ 90           |
| Mobile browser  | Chrome Android, Safari iOS (≥ iOS 15)                       |
| SEO             | Không cần — đây là app nội bộ, không phải website công khai |


### Responsive Design

| Breakpoint         | Mô tả                     | Layout POS                                  |
| ------------------ | ------------------------- | ------------------------------------------- |
| ≥ 375px (mobile)   | Điện thoại — layout chính | Grid SP phía trên, giỏ hàng kéo lên từ dưới |
| ≥ 768px (tablet)   | Tablet ngang              | 2 cột: SP bên trái, giỏ hàng bên phải       |
| ≥ 1024px (desktop) | Máy tính                  | 2 cột rộng, thêm thông tin KH trên giỏ hàng |


### Offline & Caching

- Service Worker cache toàn bộ shell app + assets tĩnh
- IndexedDB / PGlite cache dữ liệu: sản phẩm, KH, bảng giá, cài đặt
- Đơn hàng tạo offline lưu local với `sync_status = pending`
- Background Sync API đồng bộ khi có mạng
- Conflict resolution: server wins (tồn kho), client wins (đơn hàng)
- Tồn kho âm sau sync → cảnh báo chủ cửa hàng

### Real-time

- Không yêu cầu real-time collaboration (1-5 nhân viên, conflict thấp)
- Polling hoặc long-polling đủ cho đồng bộ trạng thái
- WebSocket chỉ cần nếu mở rộng đa chi nhánh (v2+)

### Performance Targets

| Metric                      | Target          | Điều kiện                |
| --------------------------- | --------------- | ------------------------ |
| First Contentful Paint      | < 1.5s          | 4G connection            |
| Time to Interactive         | < 3s            | 4G connection            |
| Tìm sản phẩm (autocomplete) | < 200ms         | Local cache, ≤ 10.000 SP |
| Tạo đơn hàng                | < 500ms         | Local + sync             |
| Tải danh sách (100 items)   | < 1s            | Paginated                |
| Kích thước bundle initial   | < 300KB gzipped | Code splitting           |


## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approach:** Problem-solving MVP — giải quyết đúng 3 pain point lớn nhất của hộ kinh doanh nhỏ VN: (1) lên đơn nhanh với giá đúng, (2) quản lý công nợ, (3) biết lãi lỗ tồn kho.

**Timeline:** 8-12 tuần cho toàn bộ 7 module MVP.

**Resource:** 1-2 full-stack developer + 1 designer (part-time).

### MVP Feature Set (Phase 1)

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

### Post-MVP Features (Phase 2 — 4 tuần sau MVP)

- Import dữ liệu từ KiotViet qua API
- Import Excel nâng cao (biến thể, bảng giá)
- Barcode generation + in tem mã vạch
- PWA install prompt trên mobile

### Expansion Features (Phase 3 — 3-6 tháng sau MVP)

- Đa chi nhánh / đa kho
- Tích hợp sàn TMĐT (Shopee, Lazada)
- Hóa đơn điện tử
- Webhook + API công khai
- Tích hợp vận chuyển
- Chương trình tích điểm / khuyến mãi

### Risk Mitigation Strategy

| Loại risk | Risk                                         | Mitigation                                                                                              |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Technical | Offline sync conflict phức tạp               | Giữ conflict resolution đơn giản (server wins tồn kho, client wins đơn). Không hỗ trợ edit đơn offline. |
| Technical | Performance với 10.000+ sản phẩm trên mobile | Virtual scrolling, lazy load, index trên barcode/SKU/tên                                                |
| Market    | User quen KiotViet, ngại chuyển              | Import data từ KiotViet (v1.1), 5-phút setup, free tier hào phóng                                       |
| Market    | Hộ kinh doanh nhỏ ít sẵn sàng trả tiền SaaS  | Freemium model, giá thấp hơn KiotViet 50%+                                                              |
| Resource  | Team nhỏ, scope 7 module                     | Module ưu tiên: M3 (POS) → M1 (Hàng hóa) → M2 (Giá) → M6 (Nợ) → M4 (KH) → M5 (HĐ) → M7 (BC)             |


## Functional Requirements

### Quản lý Hàng hóa

- FR1: Chủ cửa hàng có thể tạo, sửa, xoá sản phẩm với thông tin: tên, SKU (auto-gen), barcode, danh mục, đơn vị tính, giá gốc, giá bán lẻ, mô tả, hình ảnh (1 ảnh), trạng thái (đang bán/ngừng bán)
- FR2: Chủ cửa hàng có thể tạo biến thể sản phẩm với tối đa 2 thuộc tính (VD: Màu + Size), mỗi thuộc tính tối đa 20 giá trị, mỗi biến thể có SKU, barcode, giá, tồn kho riêng
- FR3: Chủ cửa hàng có thể tạo đơn vị quy đổi cho sản phẩm (VD: 1 thùng = 24 lon) với hệ số quy đổi và giá riêng theo đơn vị
- FR4: Chủ cửa hàng có thể tạo danh mục sản phẩm tối đa 2 cấp (cha → con), sắp xếp thứ tự hiển thị bằng kéo-thả
- FR5: Chủ cửa hàng có thể bật/tắt theo dõi tồn kho cho từng sản phẩm và đặt định mức tồn tối thiểu
- FR6: Hệ thống tự tính giá vốn bình quân gia quyền từ phiếu nhập hàng
- FR7: Hệ thống hiển thị cảnh báo (badge đỏ + thông báo) khi sản phẩm dưới định mức tồn tối thiểu

### Nhập hàng & Nhà cung cấp

- FR8: Chủ cửa hàng có thể tạo phiếu nhập kho với: NCC, danh sách SP (quét barcode hoặc tìm tên), SL, đơn giá nhập, chiết khấu (% hoặc cố định, theo dòng hoặc tổng), trạng thái thanh toán
- FR9: Hệ thống tự cập nhật giá vốn bình quân gia quyền và tồn kho sau mỗi phiếu nhập
- FR10: Chủ cửa hàng có thể tạo phiếu kiểm kho: chọn SP → nhập SL thực tế → hệ thống tính chênh lệch → xác nhận → tự điều chỉnh tồn kho + tạo log
- FR11: Chủ cửa hàng có thể quản lý NCC (tên, SĐT, địa chỉ, email, công nợ NCC)
- FR12: Hệ thống lưu lịch sử mọi lần nhập hàng (giá nhập, SL, NCC, giá vốn BQ sau nhập)

### Quản lý Đơn giá

- FR13: Chủ cửa hàng có thể tạo nhiều bảng giá song song, mỗi bảng giá gán cho 1 nhóm KH
- FR14: Bảng giá hỗ trợ 5 cách thiết lập: nhập giá trực tiếp, công thức từ giá nền (giá gốc/bán lẻ/giá vốn ± %), công thức kế thừa từ bảng giá khác (chain formula), nhân bản (clone), import Excel
- FR15: Hệ thống chống vòng lặp chain formula (A → B → C → A) khi lưu bảng giá
- FR16: Bảng giá hỗ trợ làm tròn (100đ/500đ/1.000đ/10.000đ, hướng lên/xuống/gần nhất) và ngày hiệu lực
- FR17: Chủ cửa hàng có thể đặt giá riêng cho từng KH cụ thể trên từng SP (ưu tiên cao nhất, override mọi bảng giá)
- FR18: Chủ cửa hàng có thể thiết lập giá theo SL (tối đa 5 bậc/SP, VD: 1-9 cái = 85k, 10-49 = 80k, ≥50 = 75k)
- FR19: Chủ cửa hàng có thể tạo CK danh mục (discount rules): cho KH cụ thể hoặc nhóm KH, theo danh mục hoặc toàn bộ SP, % hoặc cố định, có SL tối thiểu và ngày hiệu lực
- FR20: POS áp giá theo hệ thống 6 tầng ưu tiên: (1) giá riêng KH → (2) CK danh mục → (3) sửa tay → (4) giá theo SL → (5) bảng giá nhóm KH → (6) giá bán lẻ
- FR21: POS hiển thị nguồn giá cạnh mỗi dòng SP ("Giá riêng KH", "Giá theo SL", "Giá ĐL C1", v.v.)
- FR22: Nhân viên có quyền `can_edit_price` có thể sửa giá trên đơn. Sửa giá dưới giá vốn cần PIN chủ cửa hàng. Sửa giá = 0 bị block. Hệ thống lưu `original_price` + `price_override = true`
- FR23: Chủ cửa hàng có thể chọn chế độ cascade khi giá gốc thay đổi: real-time (mặc định), xác nhận (preview trước), hoặc tự động
- FR24: Chủ cửa hàng có thể xem so sánh nhiều bảng giá song song với margin % so với giá vốn, cảnh báo SP bán dưới vốn
- FR25: Chủ cửa hàng có thể chọn chiến lược khi giá nhập thay đổi: thủ công (mặc định), cảnh báo (khi thay đổi > 5%), hoặc tự động (bảng giá công thức từ giá vốn)

### Bán hàng (POS)

- FR26: Nhân viên có thể thêm SP vào đơn bằng: quét barcode (camera hoặc máy quét), gõ tên/mã SP (autocomplete), hoặc chọn từ grid ảnh
- FR27: POS hỗ trợ 2 chế độ: bán nhanh (quét = tự thêm + tăng SL) và bán thường (chọn từ grid)
- FR28: Nhân viên có thể chọn KH (tìm theo tên/SĐT) hoặc bỏ qua (khách lẻ). Chọn KH → hệ thống tự áp bảng giá theo nhóm
- FR29: Nhân viên có thể áp chiết khấu: theo dòng (% hoặc cố định) và theo tổng đơn (% hoặc cố định)
- FR30: Nhân viên có thể thanh toán bằng: tiền mặt (nhập số tiền → tính thừa), chuyển khoản, QR Code, kết hợp nhiều phương thức, hoặc ghi nợ
- FR31: Khi ghi nợ, hệ thống kiểm tra hạn mức: `nợ hiện tại + nợ mới ≤ hạn mức`. Vượt → block + cần PIN chủ cửa hàng override. Hỗ trợ trả 1 phần + ghi nợ phần còn lại
- FR32: POS hỗ trợ mở tối đa 5 tab đơn hàng đồng thời
- FR33: Nhân viên có thể tra tồn kho nhanh và xem giá nhập gần nhất trực tiếp từ POS
- FR34: POS hỗ trợ phím tắt: Enter (thêm SP), F2 (thanh toán), F4 (ghi nợ), Esc (hủy)
- FR35: Sau thanh toán, hệ thống tự: in hóa đơn (tùy chọn), trừ tồn kho, cập nhật công nợ KH, mở đơn mới

### Bán hàng Offline

- FR36: Toàn bộ luồng bán hàng (thêm SP, thanh toán, in hóa đơn) hoạt động khi không có internet
- FR37: Dữ liệu SP, KH, bảng giá được cache local (IndexedDB/PGlite)
- FR38: Đơn hàng offline đánh dấu `sync_status = pending`, tự đồng bộ khi có mạng
- FR39: Conflict resolution: server wins (tồn kho), client wins (đơn hàng). Tồn kho âm sau sync → cảnh báo

### Quản lý Khách hàng

- FR40: Chủ cửa hàng có thể quản lý KH: tên (bắt buộc), SĐT (bắt buộc, unique), email, địa chỉ, MST, ghi chú, hạn mức nợ riêng
- FR41: Chủ cửa hàng có thể tạo nhóm KH, mỗi nhóm gắn bảng giá mặc định và hạn mức nợ mặc định
- FR42: Mỗi KH thuộc đúng 1 nhóm. Thay đổi nhóm → tự đổi bảng giá. Hạn mức KH override hạn mức nhóm
- FR43: Hệ thống tự tính: tổng đã mua, số lần mua, nợ hiện tại
- FR44: Trang chi tiết KH hiển thị: tab Đơn hàng (lọc theo ngày, trạng thái), tab Công nợ, tab Thống kê (SP mua nhiều nhất, tháng mua nhiều nhất)
- FR45: Nhân viên có thể tạo KH mới nhanh từ POS (chỉ cần tên + SĐT)

### Quản lý Hóa đơn

- FR46: Hệ thống hiển thị danh sách hóa đơn với: mã (auto-gen HD-YYYYMMDD-XXXX), ngày, KH, tổng tiền, đã trả, còn nợ, trạng thái, người tạo
- FR47: Hỗ trợ lọc hóa đơn theo: ngày (hôm nay/tuần/tháng/tùy chọn), trạng thái, KH, phương thức thanh toán, trạng thái nợ
- FR48: Nhân viên có thể xem chi tiết hóa đơn (SP, KH, thanh toán, lịch sử trả nợ) và in lại
- FR49: Manager/Owner có thể tạo phiếu trả hàng từ hóa đơn gốc: chọn SP + SL trả + lý do → hệ thống tự cộng tồn kho, giảm doanh thu, hoàn tiền hoặc giảm nợ
- FR50: Hệ thống hỗ trợ 2 mẫu in: thermal (58mm/80mm) và A4/A5 (cho bán buôn, có bảng SP, tổng bằng chữ, ký tên)
- FR51: Chủ cửa hàng có thể tùy chỉnh mẫu in: logo, slogan, thông tin hiển thị, ẩn/hiện nợ cũ/mới/giá vốn/CK, ghi chú cuối

### Quản lý Công nợ

- FR52: Nhân viên có thể ghi nợ toàn bộ hoặc 1 phần khi bán hàng (tích hợp trực tiếp trong POS)
- FR53: Hệ thống kiểm tra hạn mức nợ trước khi ghi nợ. Vượt hạn mức → block. Owner override bằng PIN
- FR54: Nhân viên có thể tạo phiếu thu (thu nợ KH): tìm KH → xem tổng nợ + DS hóa đơn nợ → nhập số tiền → phân bổ tự động FIFO hoặc chọn hóa đơn cụ thể
- FR55: Owner có thể điều chỉnh nợ thủ công (xoá nợ xấu, sửa sai): nhập số nợ mới + lý do → tạo phiếu điều chỉnh
- FR56: Chủ cửa hàng có thể tạo phiếu chi để trả nợ NCC
- FR57: Hệ thống cảnh báo: KH sắp đạt hạn mức (≥ 80%), KH vượt hạn mức (block đơn), nợ quá hạn (30/60/90 ngày, cấu hình được)
- FR58: Báo cáo công nợ: tổng hợp phải thu, chi tiết theo KH, phân nhóm theo thời gian (0-30, 31-60, 61-90, >90 ngày), tổng hợp phải trả, sổ quỹ

### Báo cáo

- FR59: Dashboard tổng quan: doanh thu, lợi nhuận, số đơn (hôm nay/tuần/tháng/năm), biểu đồ 7 ngày, cảnh báo tồn kho + nợ quá hạn, top 5 SP bán chạy
- FR60: Báo cáo doanh thu: theo ngày/tuần/tháng, theo SP, theo KH, theo nhân viên
- FR61: Báo cáo lợi nhuận: tổng (doanh thu - giá vốn), theo SP
- FR62: Báo cáo tồn kho: tồn hiện tại + giá trị, SP cần nhập (dưới mức), hàng chậm bán (>30 ngày)
- FR63: Báo cáo giá: đơn hàng có sửa giá, so sánh bảng giá + margin, lịch sử giá nhập
- FR64: Tất cả danh sách (SP, KH, đơn hàng, công nợ) hỗ trợ export CSV/Excel

### Quyền hạn & Quản trị

- FR65: Hệ thống hỗ trợ 3 vai trò: Owner, Manager, Staff với ma trận quyền chi tiết (xem bảng permissions trong tài liệu gốc)
- FR66: Owner có thể quản lý nhân viên (tạo, sửa, vô hiệu hóa) và cài đặt cửa hàng
- FR67: Hệ thống hỗ trợ xác thực bằng PIN cho các thao tác nhạy cảm (sửa giá dưới vốn, override hạn mức nợ)

## Non-Functional Requirements

### Performance

- NF1: Tìm sản phẩm (autocomplete) hoàn thành trong < 200ms với ≤ 10.000 sản phẩm, đo trên thiết bị Android mid-range
- NF2: Tạo và lưu đơn hàng hoàn thành trong < 500ms (local + sync)
- NF3: Tải trang bất kỳ hoàn thành trong < 2 giây trên kết nối 4G
- NF4: POS giỏ hàng render mượt ≥ 30fps khi thao tác thêm/xoá/sửa SP

### Security

- NF5: Mã hoá dữ liệu truyền tải bằng TLS 1.2+
- NF6: Hash password bằng bcrypt/argon2 với salt
- NF7: Authentication bằng JWT với refresh token rotation
- NF8: PIN owner không lưu plaintext, hash + rate-limit (5 lần sai → khoá 15 phút)
- NF9: Tất cả thao tác sửa giá, điều chỉnh nợ, override hạn mức tạo audit log không xoá được

### Scalability

- NF10: Hỗ trợ ≤ 10.000 sản phẩm/cửa hàng trong MVP
- NF11: Hỗ trợ ≤ 5.000 khách hàng/cửa hàng trong MVP
- NF12: Hỗ trợ ≤ 5 nhân viên bán cùng lúc trên 1 cửa hàng không conflict
- NF13: Database backup tự động hàng ngày

### Offline & Sync

- NF14: 100% chức năng bán hàng (POS, tạo đơn, in hóa đơn) hoạt động offline
- NF15: Đồng bộ tự động khi có mạng, không mất đơn hàng
- NF16: Thời gian sync ≤ 100 đơn hàng offline trong < 30 giây

### Compatibility

- NF17: Hoạt động trên mobile ≥ 375px, tablet, desktop
- NF18: Hỗ trợ in ấn: thermal printer 58mm/80mm (ESC/POS protocol), A4/A5
- NF19: Camera quét barcode hoạt động trên Chrome Android và Safari iOS
