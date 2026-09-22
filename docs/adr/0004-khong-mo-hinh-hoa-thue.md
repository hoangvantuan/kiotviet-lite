# ADR-0004: Hệ thống cố ý không mô hình hóa thuế

- Trạng thái: Đã chốt
- Ngày: 2026-09-22
- Phạm vi: toàn bộ phần giá và tiền

## Bối cảnh

Dữ liệu xuất từ KiotViet có ba cột liên quan tới thuế: `Tỷ lệ tính thuế(%)`,
`Áp dụng giảm thuế`, và `Tên hàng trên hóa đơn điện tử`. Cột tỷ lệ thuế KHÔNG trống:
11.054 trên 11.055 dòng mang giá trị `VAT 1%`, một dòng để `--`.

Tuy vậy cửa hàng không phát hành hóa đơn điện tử và không kê khai thuế trên từng đơn bán.
Con số 1% ứng với cách nộp thuế khoán của hộ kinh doanh bán lẻ, tính trên doanh thu cả kỳ
chứ không tách vào từng dòng hàng, nên nó không ảnh hưởng tới giá khách trả tại quầy.

## Quyết định

Không có thuế suất, không có tiền thuế, không tách giá trước thuế và sau thuế ở bất kỳ đâu.
Mọi con số giá trong hệ thống là số tiền cuối cùng khách trả.

Ba cột thuế trong tệp KiotViet bị bỏ đi có chủ ý khi chuyển dữ liệu.

## Hệ quả

- Người đọc mã nguồn sẽ không tìm thấy trường thuế nào và có thể tưởng là thiếu sót.
  Đây là chủ ý, không phải nợ kỹ thuật.
- Dữ liệu thuế 1% trong tệp gốc không được lưu lại ở đâu trong hệ thống. Nếu về sau cần
  tới, phải lấy lại từ tệp KiotViet cũ. Tệp đó cần được giữ.
- Nếu cửa hàng phải xuất hóa đơn điện tử, đây không phải là bật một tùy chọn. Giá bán,
  giá vốn, dòng đơn hàng, phiếu nhập, mẫu in và mọi báo cáo doanh thu đều phải sửa cùng lúc.
  Khi đó cần một ADR mới thay thế ADR này.
