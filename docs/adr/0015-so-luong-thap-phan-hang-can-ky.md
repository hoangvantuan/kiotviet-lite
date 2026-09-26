# ADR-0015: Số lượng thập phân cho hàng cân ký: numeric(14,3), cờ số lẻ theo mặt hàng

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `packages/shared/src/utils/quantity.ts`, `packages/shared/src/schema/quantity-column.ts`,
  `packages/shared/src/utils/pricing.ts`, các schema zod có số lượng, cột số lượng và tồn kho ở
  `packages/shared/src/schema/*`, migration `*_d4_decimal_quantity`, PGlite `v006`, các dịch vụ bán,
  trả hàng, nhập hàng, trả hàng nhập, kiểm kê, nhập liệu hàng loạt, báo cáo tồn, `apps/api/scripts/invariants.sql`,
  ô nhập số lượng và mẫu in ở `apps/web`
- Bổ sung cho: [ADR-0006](0006-nhap-lieu-hang-loat-khong-dong-ton-kho.md),
  [ADR-0007](0007-gia-von-theo-gia-nhap-thuc.md), [ADR-0010](0010-anh-chup-chung-tu-ban.md)

## Bối cảnh

Mọi cột số lượng và tồn kho là số nguyên, schema nhận số lượng dùng `.int()`. Cửa hàng thực phẩm
bán rau, thịt, cá theo cân hằng ngày nhưng chỉ bán được bội số 1 kg (POS-09); tệp KiotViet mẫu
go-live có 38 dòng tồn thập phân, phần lớn là hàng ĐVT kg, phải làm tròn tay trước khi nhập
(GL-07). Làm tròn thì sai tiền hoặc sai tồn.

Số thực dấu phẩy động của JavaScript không cộng trừ đúng số thập phân (`0.1 + 0.2`), nên nếu chỉ đổi
cột mà giữ phép tính cũ thì tồn kho lệch dần và so sánh tồn cho kết quả sai.

## Quyết định

### 1. Kiểu cột: `numeric(14,3)`

Các cột sau đổi sang `numeric(14,3)` (tối đa 11 chữ số phần nguyên, 3 chữ số lẻ, tức 1 gam với
hàng tính theo kg): `products.current_stock`, `products.min_stock`,
`product_variants.stock_quantity`, `order_items.quantity`, `order_return_items.quantity`,
`purchase_order_items.quantity`, `.returned_quantity`, `.stock_after`,
`purchase_return_items.quantity`, `.base_quantity`, `.stock_after`,
`inventory_transactions.quantity`, `.stock_after`, `stock_check_items` và `stock_check_logs`
(`system_qty`, `actual_qty`, `diff`), `stock_checks.total_diff_positive`, `.total_diff_negative`,
`volume_prices.min_qty`. `category_discounts.min_qty` giữ số nguyên (ngưỡng số dòng hàng). Bản sao danh mục và hàng chờ
ngoại tuyến trên PGlite đổi theo ở migration `v006`.

Migration đổi kiểu bằng `USING col::numeric(14,3)`, giữ nguyên dữ liệu. Hệ số quy đổi
(`conversion_factor`) giữ số nguyên dương: "1 thùng = 24 lon". Tiền giữ `bigint` đồng.

### 2. Cờ cho phép số lượng lẻ

`products.allow_decimal_quantity` và `product_unit_conversions.allow_decimal_quantity`, mặc định
`false`: hàng đếm cái vẫn chỉ nhận số nguyên như trước. Biến thể theo cờ của sản phẩm cha.

Máy chủ kiểm mỗi dòng bán, trả, nhập, trả hàng nhập và kiểm kê:

- Số lượng nhập theo đơn vị đã chọn: đơn vị gốc theo cờ sản phẩm, đơn vị quy đổi theo cờ của đơn vị đó.
- Số lượng quy ra đơn vị gốc (`số lượng × hệ số`) phải nguyên khi sản phẩm không bật cờ. Ví dụ
  bán 0,5 thùng 24 lon được (12 lon), 0,3 thùng thì không (7,2 lon).

Vi phạm trả `400 VALIDATION_ERROR` kèm tên hàng. Tối đa 3 chữ số lẻ ở mọi mặt hàng; số lượng
bán, trả, nhập phải dương. API nhận số lượng dạng số JSON; máy khách cũ gửi số nguyên vẫn hợp lệ.
Đơn ngoại tuyến đồng bộ lên cũng qua cùng phép kiểm.

- Trả hàng và trả hàng nhập: dòng gốc đã có số lẻ thì cho trả số lẻ dù cờ đã tắt sau đó. Dòng bán
  không lưu đơn vị quy đổi nên trả theo đơn vị lớn lấy cờ của sản phẩm (chặt nhất).
- Kiểm kê, điều chỉnh tồn tay, tồn ban đầu khi tạo sản phẩm theo cờ sản phẩm. Tồn ban đầu của biến
  thể giữ số nguyên; biến thể có tồn lẻ qua kiểm kê hoặc nhập hàng.
- Chỉ tắt được cờ khi tồn của sản phẩm và mọi biến thể đã nguyên (422 nếu không). Bất biến `I10`
  của `invariants.sql` kiểm hàng không bật cờ thì tồn nguyên.

### 3. Biểu diễn trong mã: số đã chuẩn hóa, phép tính trên nghìn đơn vị

Không thêm thư viện decimal. Trong TypeScript số lượng là `number` luôn là bội của 0,001:

- **Đọc từ DB ở một chỗ**: cột số lượng khai bằng kiểu `quantity()` (`quantity-column.ts`), đổi
  chuỗi numeric của driver thành `number` qua `parseQuantity` và ghi bằng `toFixed(3)`. Câu SQL
  thô và tổng hợp (`sum`) đọc về bằng `parseQuantity` hoặc `.mapWith(parseQuantity)`, không ép
  `::int`.
- **Phép tính** đi qua `utils/quantity.ts`: `addQty`, `subQty`, `mulQty` (nhân hệ số quy đổi),
  `sumQty` đổi sang số nguyên nghìn đơn vị (`toMilli`) rồi mới cộng trừ, nên `0,1 + 0,2 = 0,3`
  đúng tuyệt đối. So sánh (`<`, `>=`) dùng thẳng vì cả hai vế đã chuẩn hóa.
- **Tiền nhân số lượng** tính bằng `BigInt` trên nghìn đơn vị, chỉ làm tròn một lần ở cuối.

### 4. Một quy tắc làm tròn tiền dòng

`thành tiền trước chiết khấu = round_half_up(đơn giá × số lượng)` về đồng (`lineAmount`), làm tròn
nửa lên (0,5 đồng lên 1 đồng). Ví dụ 1,255 kg × 45.000 đ = 56.475 đ; 0,333 × 10.001 đ =
3.330,333 đ → 3.330 đ. Chiết khấu dòng, chiết khấu đơn và phân bổ tính trên số đã làm tròn này như
cũ. Máy chủ, POS trực tuyến và PGlite ngoại tuyến cùng gọi `calculateLineTotal` ở
`packages/shared`, nên hai đường luôn ra cùng số. Câu SQL cần giá trị hàng (giá trị tồn, giá vốn
hàng bán) dùng `round(đơn giá × số lượng)` của Postgres, cũng là làm tròn nửa xa số 0, cùng kết
quả với số dương.

Các phép chia theo số lượng (giá vốn bình quân gia quyền, giá nhập thực một đơn vị, tiền hoàn theo
tỷ lệ số lượng trả) tính trên nghìn đơn vị bằng `BigInt` rồi làm tròn nửa lên về đồng. Giá vốn
hàng bán của một dòng trong báo cáo là `round(giá vốn × hệ số × số lượng thực bán)`, làm tròn từng
dòng rồi mới cộng, như tiền dòng.

### 5. Nhập và hiển thị ở giao diện

- Ô số lượng nhận dấu phẩy kiểu Việt Nam (`1,5`); dấu chấm cũng hiểu là dấu thập phân vì bàn phím
  số gõ ra dấu chấm. Ô số lượng không nhận dấu phân cách hàng nghìn. Mặt hàng không bật cờ chỉ
  nhận số nguyên; nút tăng giảm vẫn bước 1.
- Hiển thị tối đa 3 chữ số lẻ, bỏ số 0 thừa, theo `vi-VN` (`1,5`, `1,255`, `12`) ở giỏ hàng, hóa
  đơn in, chi tiết chứng từ và báo cáo (`formatQuantity`).
- POS kiểm cờ bằng cùng hàm `isQuantityAllowed` với máy chủ. Đổi đơn vị tính của dòng mà số lượng
  đang có không hợp lệ với đơn vị mới (ví dụ 1,5 kg đổi sang thùng không bật cờ) thì số lượng về 1.
- Chi tiết phiếu nhập, danh sách dòng trả được và chi tiết phiếu kiểm trả kèm `allowDecimalQuantity`
  của từng dòng (cờ hiện tại, hoặc true khi dòng gốc đã lẻ) để ô nhập biết có nhận số lẻ không.
- Ngưỡng bậc giá theo số lượng luôn nhận số lẻ (bậc 2,5 kg).
- Ô số lượng ở giỏ POS ghi khi rời ô hoặc nhấn Enter (gõ "0,5" không đi qua 0 làm xóa dòng); ô ở
  form chứng từ ghi ngay mỗi lần gõ ra số hợp lệ.

### 7. Bản sao danh mục ngoại tuyến

PGlite `v006` đổi `catalog_products.current_stock`, `catalog_variants.stock_quantity`,
`catalog_volume_prices.min_qty` sang `NUMERIC(14,3)`, thêm cờ ở sản phẩm và đơn vị quy đổi, rồi xóa
con trỏ đồng bộ để lần kéo sau nạp lại toàn bộ danh mục kèm cờ. Máy chủ bản cũ chưa gửi cờ thì bản
sao ghi `false`. Tìm hàng và tính giá ngoại tuyến đọc số lượng qua `parseQuantity`, nên ra cùng giá
với trực tuyến.

### 6. Nhập dữ liệu hàng loạt

- Tệp mẫu sản phẩm có cột "Bán số lẻ" (Có/Không) ở cuối. Tệp mẫu cũ thiếu cột này vẫn nhập được
  (giữ cờ đang có). "Định mức tối thiểu" nhận tối đa 3 chữ số lẻ.
- Chế độ nhập tệp KiotViet (không có cột tương đương) tự bật cờ khi ĐVT là đơn vị đo
  (kg, kí, g, gam, lạng, tạ, tấn, lít, ml, m, mét, cm, m2, m3, không phân biệt hoa thường) hoặc tồn
  kho trong tệp là số lẻ, để tồn đầu kỳ số lẻ nhập được bằng chính tệp đó. Hàng khác để trống cột
  (giữ cờ đang có, hàng mới mặc định Không). Đơn vị quy đổi nhập từ KiotViet mặc định không bật cờ.
- Nhập tồn đầu kỳ (kiểm kê từ tệp) nhận số lẻ cho mặt hàng bật cờ; mặt hàng không bật cờ gặp số lẻ
  thì báo lỗi đúng dòng.

## Hệ quả

- Bán được hàng cân ký đúng tiền, đúng tồn; tồn kho vẫn bằng tổng sổ giao dịch kho (bất biến I6)
  vì mọi cộng trừ tồn chạy trong SQL `numeric` hoặc qua `utils/quantity.ts`.
- Đổi kiểu cột viết lại cả bảng và giữ khóa `ACCESS EXCLUSIVE` trong lúc chạy. Bảng
  `inventory_transactions` và `order_items` là lớn nhất; cửa hàng nhỏ mất vài giây, nên chạy
  migration ngoài giờ bán và sao lưu trước.
- Số lượng lẻ tối đa 3 chữ số. Mã vạch cân điện tử (tiền tố 20 đến 29 mang khối lượng hoặc tiền)
  chưa làm; khi làm sẽ dựa trên quy tắc này.
- Tính trên `number` nên số lượng giới hạn khoảng 9 tỷ đơn vị trước khi mất chính xác ở nghìn đơn
  vị, lớn hơn nhiều giới hạn `1.000.000` của một dòng.
- Người viết mã mới không được cộng trừ số lượng trực tiếp bằng `+`/`-` trong TypeScript hay ép
  `::int` trong SQL; review cần soát điểm này.
