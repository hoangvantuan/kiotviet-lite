# Phụ lục

## Phím tắt POS (Desktop)

| Phím     | Hành động                      |
| -------- | ------------------------------ |
| `Enter`  | Thêm SP đang chọn vào giỏ      |
| `F2`     | Mở thanh toán                  |
| `F4`     | Ghi nợ                         |
| `F5`     | Mở tab đơn mới                 |
| `Esc`    | Hủy đơn hiện tại               |
| `Ctrl+F` | Focus vào thanh tìm SP         |
| `↑↓`     | Navigate trong danh sách SP/KH |


## Ma trận quyền ảnh hưởng UX

| Thao tác            | Owner   | Manager | Staff                      |
| ------------------- | ------- | ------- | -------------------------- |
| Xem POS, bán hàng   | ✅       | ✅       | ✅                          |
| Xem giá vốn         | ✅       | ✅       | ❌                          |
| Sửa giá trên đơn    | ✅       | ✅       | Cần quyền `can_edit_price` |
| Sửa giá dưới vốn    | ✅ (PIN) | ❌       | ❌                          |
| Override hạn mức nợ | ✅ (PIN) | ❌       | ❌                          |
| Trả hàng            | ✅       | ✅       | ❌                          |
| Điều chỉnh nợ       | ✅       | ❌       | ❌                          |
| Cấu hình bảng giá   | ✅       | ✅       | ❌                          |
| Xem báo cáo         | ✅       | ✅       | Hạn chế                    |
| Quản lý nhân viên   | ✅       | ❌       | ❌                          |

