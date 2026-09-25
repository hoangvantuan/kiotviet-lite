# ADR-0010: Chứng từ bán chụp số liệu lúc bán; tiền hoàn theo giá trị ròng lũy kế

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `packages/shared/src/utils/order-refund.ts`, `apps/api/src/services/orders.service.ts`,
  `apps/api/src/services/returns.service.ts`, `apps/api/src/lib/order-status.ts`, các báo cáo
  doanh thu, lãi lỗ và tổng quan, `apps/web/src/features/orders/return-dialog.tsx`, mẫu in hóa
  đơn, migration `*_order_snapshot_r2`, `apps/api/scripts/tien-101-over-refund-report.sql`

## Bối cảnh

Đợt kiểm tra go-live (POS-03, BC-01, TIEN-101, TIEN-108, BC-10, BC-08) thấy chung một nguyên nhân
(R2): dòng đơn không giữ số liệu lúc bán, nên mọi chỗ đọc lại phải suy ra từ trạng thái hiện tại.

- Bán 1 thùng (24 gói) rồi trả 1 thùng: kho chỉ cộng lại 1 gói, vì dòng đơn không biết hệ số quy đổi.
- Lãi lỗ lấy giá vốn hiện tại của sản phẩm cha: nhập lô mới giá khác là lợi nhuận các tháng trước đổi
  theo; biến thể có giá vốn riêng cũng bị lấy giá cha.
- Chiết khấu đơn không phân bổ xuống dòng. Trả hàng áp lại tỷ lệ chiết khấu trên phần còn lại ở mỗi
  lần, nên trả 3 lần một dòng 135.000 đ ở đơn chiết khấu 20% hoàn 121.500 đ thay vì 108.000 đ.
- Hộp trả hàng tính đơn giá × số lượng, không trừ chiết khấu đơn, không tách phần cấn nợ.
- Doanh thu theo hàng hóa không trừ chiết khấu đơn nên tổng không khớp doanh thu theo ngày.
- In lại hóa đơn lấy "đã trả" và "còn nợ" hiện tại (đã đổi sau khi thu nợ hay trả hàng), và "Nợ cũ"
  suy ngược từ công nợ hiện tại.

## Quyết định

### Ảnh chụp lúc bán (không đổi sau khi tạo đơn)

`order_items`:

| Cột                        | Nghĩa                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `conversion_factor`        | Số đơn vị gốc trong một đơn vị bán (1 nếu bán đơn vị gốc)              |
| `unit_cost`                | Giá vốn một đơn vị gốc lúc bán: giá vốn biến thể, không có thì của cha |
| `unit_cost_estimated`      | `true` với dòng đơn cũ điền ngược, giá vốn chỉ là ước tính             |
| `order_discount_allocated` | Phần chiết khấu đơn phân bổ cho dòng; tổng các dòng = chiết khấu đơn   |

`orders`: `paid_amount_at_sale` (khách trả lúc bán = tổng đơn - nợ ghi cho đơn) và
`customer_debt_before` (công nợ khách ngay trước đơn, chỉ ghi khi đơn có khách).

### Phân bổ chiết khấu đơn

`allocateOrderDiscount(lineTotals, discount)`: mỗi dòng nhận `floor(lineTotal × discount / tổng)`,
phần dư vào dòng có thành tiền lớn nhất (bằng nhau thì dòng đầu). Chiết khấu vượt tổng thành tiền bị
chặn ở tổng. Doanh thu ròng dòng = `line_total - order_discount_allocated`, cộng các dòng ra đúng
`orders.total`.

### Tiền hoàn

Với dòng mua `Q`, giá trị ròng `N = lineTotal - orderDiscountAllocated`:

```
net(q) = q >= Q ? N : round(N × q / Q)
hoàn(phiếu này) = net(đã trả trước + trả lần này) - net(đã trả trước)
```

Tỷ lệ chiết khấu áp đúng một lần trên cả dòng nên trả N lần cộng lại bằng trả một lần, và trả hết dòng
luôn ra đúng `N`, không dư làm tròn. `order_return_items.line_total` lưu số đã trừ chiết khấu đơn.
Tổng phiếu trả tách bằng `splitReturnRefund`: cấn vào nợ còn lại của đơn trước (qua sổ công nợ,
ADR-0008), phần dư hoàn tiền. Hộp trả hàng ở web gọi đúng hai hàm này nên số xem trước khớp số máy
chủ ghi. Kho hoàn `số lượng trả × conversion_factor`.

### Báo cáo và in lại

- Giá vốn hàng bán = `coalesce(unit_cost, 0) × conversion_factor × số lượng ròng` (sau trả). Nhập lô
  mới không đổi lợi nhuận đã qua.
- Doanh thu theo mọi chiều (ngày, hàng hóa, nhóm, nhân viên, khách) đều cộng doanh thu ròng dòng nên
  khớp nhau.
- In lại hóa đơn dùng `paid_amount_at_sale` và nợ ghi lúc bán; dòng "Nợ trước đơn" (thay cho "Nợ cũ")
  in `customer_debt_before`. Chi tiết đơn vẫn trả `paidAmount`/`debtAmount` hiện tại cho màn hình.

### Đơn cũ (migration điền ngược)

- `conversion_factor`: theo tên đơn vị trong bảng quy đổi, rồi ưu tiên phiếu kho bán của chính đơn
  (ghi chú là mã đơn) khi đơn có đúng một dòng và một phiếu kho cho cùng hàng và số lượng chia hết.
- `unit_cost`: `cost_after` của lần nhập gần nhất trước lúc bán, không có thì giá vốn hiện tại; luôn
  gắn `unit_cost_estimated = true`.
- `order_discount_allocated`: cùng quy tắc phân bổ, viết bằng hàm cửa sổ SQL.
- `paid_amount_at_sale = total - khoản nợ của đơn`. `customer_debt_before` để NULL (công nợ đã đổi
  nhiều lần, không suy ngược được), hóa đơn in lại của đơn cũ không in "Nợ trước đơn".
- Phiếu trả cũ đã hoàn dư không tự sửa (quyết định nghiệp vụ 7): script
  `tien-101-over-refund-report.sql` liệt kê để chủ cửa hàng quyết định.

## Hệ quả

- Tốt: trả hàng, lãi lỗ và hóa đơn in lại không còn phụ thuộc trạng thái hiện tại; một công thức tiền
  hoàn dùng chung cho máy chủ và web.
- Đổi lại: lợi nhuận của đơn cũ là ước tính (có cờ), đơn cũ không có "Nợ trước đơn". Báo cáo đối
  chiếu bảng giá (`pricing-report`) vẫn so bảng giá hiện tại với giá vốn hiện tại, đúng mục đích của
  nó, không đọc ảnh chụp.
