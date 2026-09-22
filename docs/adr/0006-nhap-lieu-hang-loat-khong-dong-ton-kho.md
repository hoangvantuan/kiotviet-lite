# ADR-0006: Nhập liệu hàng loạt không bao giờ thay đổi tồn kho

- Trạng thái: Đã chốt
- Ngày: 2026-09-22
- Phạm vi: tính năng nhập liệu hàng loạt, `apps/api/src/services/products.service.ts`

## Bối cảnh

Tệp danh sách mặt hàng xuất từ KiotViet có cột tồn kho, và tệp mẫu để nhập lại cũng phải
có cột đó vì tệp xuất và tệp nhập dùng chung một khuôn. Phản xạ tự nhiên là đọc cột đó
và ghi vào tồn kho.

Nhưng nguyên tắc sẵn có của hệ thống là tồn kho chỉ đổi qua sổ giao dịch kho: bán hàng,
nhập hàng, trả hàng, kiểm kê. Màn hình sửa mặt hàng cũng cố ý không có ô tồn kho.

## Quyết định

Nhập liệu hàng loạt đọc cột tồn kho để hiển thị ở bước xem trước, nhưng không ghi. Muốn
sửa tồn kho thì làm phiếu kiểm kê.

## Hệ quả

- Người đọc mã nguồn sẽ thấy một cột bị đọc rồi bỏ đi và tưởng là lỗi. Không phải.
- Cửa hàng bắt đầu chạy với toàn bộ 11.055 mặt hàng ở tồn kho 0, rồi kiểm kê dần theo
  từng khu hàng. Trong giai đoạn đó bán hàng sẽ đẩy tồn kho xuống âm hàng loạt, nên thông
  báo tồn kho âm được tắt tạm thời và bật lại sau khi kiểm kê xong. Đây là trạng thái có
  thời hạn, không phải cấu hình vĩnh viễn.
- Lịch sử tồn kho vì thế luôn giải thích được: mỗi con số đều truy ngược ra một chứng từ.
