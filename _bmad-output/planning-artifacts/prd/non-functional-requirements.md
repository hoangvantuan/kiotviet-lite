# Non-Functional Requirements

## Performance

- NF1: Tìm sản phẩm (autocomplete) hoàn thành trong < 200ms với ≤ 10.000 sản phẩm, đo trên thiết bị Android mid-range
- NF2: Tạo và lưu đơn hàng hoàn thành trong < 500ms (local + sync)
- NF3: Tải trang bất kỳ hoàn thành trong < 2 giây trên kết nối 4G
- NF4: POS giỏ hàng render mượt ≥ 30fps khi thao tác thêm/xoá/sửa SP

## Security

- NF5: Mã hoá dữ liệu truyền tải bằng TLS 1.2+
- NF6: Hash password bằng bcrypt/argon2 với salt
- NF7: Authentication bằng JWT với refresh token rotation
- NF8: PIN owner không lưu plaintext, hash + rate-limit (5 lần sai → khoá 15 phút)
- NF9: Tất cả thao tác sửa giá, điều chỉnh nợ, override hạn mức tạo audit log không xoá được

## Scalability

- NF10: Hỗ trợ ≤ 10.000 sản phẩm/cửa hàng trong MVP
- NF11: Hỗ trợ ≤ 5.000 khách hàng/cửa hàng trong MVP
- NF12: Hỗ trợ ≤ 5 nhân viên bán cùng lúc trên 1 cửa hàng không conflict
- NF13: Database backup tự động hàng ngày

## Offline & Sync

- NF14: 100% chức năng bán hàng (POS, tạo đơn, in hóa đơn) hoạt động offline
- NF15: Đồng bộ tự động khi có mạng, không mất đơn hàng
- NF16: Thời gian sync ≤ 100 đơn hàng offline trong < 30 giây

## Compatibility

- NF17: Hoạt động trên mobile ≥ 375px, tablet, desktop
- NF18: Hỗ trợ in ấn: thermal printer 58mm/80mm (ESC/POS protocol), A4/A5
- NF19: Camera quét barcode hoạt động trên Chrome Android và Safari iOS
