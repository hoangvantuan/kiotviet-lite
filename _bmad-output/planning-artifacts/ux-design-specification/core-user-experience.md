# Core User Experience

## Trải nghiệm định nghĩa sản phẩm

**"Quét — Chọn KH — Thanh toán. 30 giây. Giá đúng. Nợ rõ."**

Trải nghiệm cốt lõi của KiotViet Lite là luồng bán hàng trên POS. Nếu nail được 1 thứ duy nhất, đó là: nhân viên quét barcode hoặc gõ tên sản phẩm → hệ thống tự áp giá đúng theo khách hàng → thanh toán hoặc ghi nợ → in hóa đơn → đơn mới tự mở. Toàn bộ ≤ 30 giây cho 3-5 sản phẩm.

## Chiến lược nền tảng

| Yếu tố            | Quyết định                                                     |
| ----------------- | -------------------------------------------------------------- |
| Nền tảng          | PWA (Progressive Web App) — web-based, installable trên mobile |
| Input chính       | Touch (mobile/tablet) + keyboard shortcuts (desktop)           |
| Thiết kế đầu tiên | Mobile-first (≥ 375px), scale lên tablet/desktop               |
| Offline           | 100% bán hàng offline, sync khi có mạng                        |
| Camera            | Quét barcode bằng camera điện thoại                            |
| In ấn             | Thermal printer 58/80mm (ESC/POS) + A4/A5                      |


## Tương tác không cần suy nghĩ

Những thao tác phải hoàn toàn tự nhiên, không cần training:

1. **Quét barcode → sản phẩm tự thêm vào giỏ** — không cần bước trung gian
2. **Chọn khách hàng → giá tự đổi** — nhân viên không cần nhớ ai được giá nào
3. **Mất mạng → bán bình thường** — không popup, không warning, chỉ icon nhỏ "offline"
4. **Có mạng lại → tự sync** — không cần bấm gì, đơn pending tự lên server
5. **Thanh toán xong → đơn mới tự mở** — zero-click cho đơn tiếp theo
6. **Nhập tiền mặt → tự tính tiền thừa** — hiển thị lớn, rõ

## Khoảnh khắc thành công quan trọng

| Khoảnh khắc                    | Mô tả                                         | Chỉ số                   |
| ------------------------------ | --------------------------------------------- | ------------------------ |
| **"Nó nhanh thật!"**           | Nhân viên hoàn thành đơn đầu tiên trong ≤ 30s | Thời gian đơn hàng < 30s |
| **"Giá đúng rồi!"**            | Chọn KH buôn → giá tự đổi, không cần hỏi chủ  | 0 lần hỏi giá/ngày       |
| **"Wifi mất mà vẫn bán được"** | POS hoạt động bình thường khi offline         | 0 đơn bị mất             |
| **"Biết ai nợ bao nhiêu"**     | Dashboard công nợ 1 click                     | Thời gian xem nợ < 5s    |
| **"5 phút là bán hàng được"**  | Từ đăng ký → bán đơn đầu tiên                 | Setup time ≤ 5 phút      |


## Nguyên tắc trải nghiệm

1. **Tốc độ trên hết** — mọi thao tác bán hàng phải cảm thấy tức thì. Autocomplete < 200ms, tạo đơn < 500ms
2. **Không bất ngờ** — hệ thống luôn cho biết nguồn giá, trạng thái sync, nợ hiện tại. Minh bạch tạo tin tưởng
3. **Touch-first, keyboard-enhanced** — thiết kế cho ngón tay, tối ưu thêm cho bàn phím (F2 thanh toán, F4 ghi nợ)
4. **Progressive disclosure** — nhân viên thấy POS đơn giản, chủ cửa hàng unlock thêm cấu hình/báo cáo
5. **Offline là bình thường** — offline không phải trạng thái lỗi, mà là trạng thái vận hành bình thường

---
