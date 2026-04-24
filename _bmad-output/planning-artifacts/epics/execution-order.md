# Execution Order

> **Lưu ý:** Thứ tự thực thi KHÁC thứ tự đánh số. Epic 4 (KH & Giá) phải hoàn thành TRƯỚC Epic 3 (POS) vì POS cần customers + pricing system để hoạt động đúng.

| Thứ tự | Epic | Lý do |
|---|---|---|
| 1 | Epic 1: Khởi tạo & Quản trị | Nền tảng monorepo, auth, roles — prerequisite cho tất cả |
| 2 | Epic 2: Hàng h��a | Products — prerequisite cho POS và pricing |
| 3 | **Epic 4: KH & Đơn giá** | Customers + pricing system — prerequisite cho POS áp giá đúng |
| 4 | **Epic 3: POS** | Giờ có đủ products, customers, pricing → POS hoạt động đầy đủ |
| 5 | Epic 5: Công nợ | Ghi nợ, phiếu thu/chi — mở rộng POS payment |
| 6 | Epic 6: Nhập hàng & NCC | Phiếu nhập, kiểm kho — độc lập |
| 7 | Epic 7: Hóa đơn & In ấn | Cần orders từ Epic 3 |
| 8 | Epic 8: Báo cáo | Cần data từ tất cả modules trước |
| 9 | Epic 9: Offline & PWA | Wrap toàn bộ hệ thống với PGlite + sync |
