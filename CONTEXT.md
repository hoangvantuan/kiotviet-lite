# Ngữ cảnh nghiệp vụ: quản lý bán lẻ

Đây là từ điển thuật ngữ của phần mềm quản lý bán hàng cho một cửa hàng bán lẻ.
Mỗi thuật ngữ ở đây có một nghĩa duy nhất trong toàn bộ mã nguồn, giao diện và tài liệu.
Khi đọc hoặc viết mã, dùng đúng từ được chọn, không dùng từ nằm trong mục _Tránh dùng_.

Tài liệu này CHỈ là từ điển: nó định nghĩa các khái niệm, không mô tả quy tắc xử lý.
Quy tắc và các quyết định thiết kế nằm ở `docs/adr/`.

## Ngôn ngữ

### Cửa hàng và người dùng

**Cửa hàng**:
Một đơn vị kinh doanh độc lập, sở hữu toàn bộ dữ liệu của mình và không nhìn thấy dữ liệu của cửa hàng khác.
_Tránh dùng_: chi nhánh, gian hàng, tenant, shop

**Chủ cửa hàng**:
Người có toàn quyền trong một cửa hàng, kể cả những thao tác không vai trò nào khác được làm.
_Tránh dùng_: admin, quản trị viên

**Quản lý**:
Người điều hành hằng ngày, quyền hạn dưới chủ cửa hàng.
_Tránh dùng_: trưởng ca, giám sát

**Nhân viên**:
Người bán hàng tại quầy, quyền hạn thấp nhất.
_Tránh dùng_: staff, nhân viên bán hàng

**Ca bán hàng**:
Khoảng thời gian một người trực quầy, có số tiền quỹ ghi nhận lúc mở và lúc đóng.
_Tránh dùng_: phiên làm việc, ca trực

### Hàng hóa

**Sản phẩm**:
Một thứ được bày bán, có tên, giá bán và đơn vị tính.
_Tránh dùng_: mặt hàng, hàng hóa, item

**Mã hàng**:
Chuỗi ký tự do cửa hàng tự đặt để định danh một sản phẩm, không trùng nhau trong cùng cửa hàng.
_Tránh dùng_: SKU, mã sản phẩm, mã nội bộ

**Mã vạch**:
Dãy ký tự in trên bao bì do nhà sản xuất cấp, dùng để quét tại quầy. Khác với mã hàng.
_Tránh dùng_: barcode, mã EAN

**Biến thể**:
Một phiên bản cụ thể của sản phẩm, phân biệt bằng thuộc tính như màu sắc hay kích cỡ, có giá và tồn kho riêng.
_Tránh dùng_: phân loại, tùy chọn, variant

**Danh mục**:
Cách xếp sản phẩm thành nhóm theo công dụng, lồng cha con và sâu tối đa hai cấp.
_Tránh dùng_: nhóm hàng, loại hàng, ngành hàng, category

**Thương hiệu**:
Nhà sản xuất hoặc nhãn hàng của sản phẩm. Là một chiều phân loại độc lập với danh mục.
_Tránh dùng_: nhãn hiệu, hãng, brand

**Đơn vị tính**:
Đơn vị nhỏ nhất dùng để đếm và tính tồn kho của một sản phẩm.
_Tránh dùng_: đơn vị cơ bản, ĐVT

**Đơn vị quy đổi**:
Đơn vị lớn hơn kèm hệ số quy ra đơn vị tính, ví dụ một thùng bằng hai mươi bốn lon.
_Tránh dùng_: đơn vị lớn, quy cách đóng gói

**Bảng giá**:
Một bộ giá bán có thể gắn với nhóm khách hàng hoặc được chọn cho một đơn hàng, thay cho giá bán mặc định.
_Tránh dùng_: chính sách giá, biểu giá

### Tồn kho

**Tồn kho**:
Số lượng một sản phẩm đang thực có, tính theo đơn vị tính.
_Tránh dùng_: số lượng, tồn, số lượng còn lại

**Theo dõi tồn kho**:
Tính chất của một sản phẩm cho biết cửa hàng có đếm tồn kho của nó hay không.
_Tránh dùng_: quản lý kho, bật kho

**Sổ giao dịch kho**:
Nơi ghi lại mọi lần tồn kho thay đổi, kèm lý do và chứng từ gốc của lần thay đổi đó.
_Tránh dùng_: lịch sử kho, nhật ký kho

**Phiếu nhập hàng**:
Chứng từ ghi nhận hàng mua từ nhà cung cấp về kho.
_Tránh dùng_: đơn mua hàng, phiếu mua, PO

**Giá vốn**:
Giá trị của một đơn vị tính hàng đang tồn, tính theo bình quân gia quyền và cập nhật sau mỗi lần nhập hàng từ giá nhập thực của lô. Mỗi biến thể có giá vốn riêng; biến thể chưa có giá vốn thì dùng giá vốn sản phẩm cha. Giá vốn của một sản phẩm có biến thể chỉ là số tóm tắt: bình quân giá vốn các biến thể theo tồn kho. Quy tắc ở ADR-0007.
_Tránh dùng_: giá gốc, giá nhập, cost

**Giá nhập thực**:
Số tiền thực trả cho một đơn vị tính trên một dòng phiếu nhập hàng: thành tiền dòng sau chiết khấu dòng, trừ phần chiết khấu phiếu phân bổ cho dòng, chia cho số lượng quy ra đơn vị tính. Chiết khấu phiếu phân bổ theo tỷ lệ thành tiền dòng, tổng phân bổ khớp đúng số chiết khấu. Đây là số đi vào giá vốn và sổ giao dịch kho, khác đơn giá ghi trên phiếu (chuẩn mực VAS 02 đoạn 06, cách KiotViet tính).
_Tránh dùng_: giá sau chiết khấu, đơn giá thực, giá nhập ròng

**Kiểm kê**:
Việc đếm lại hàng thực tế trong kho rồi ghi nhận chênh lệch so với sổ sách.
_Tránh dùng_: cân bằng kho, kiểm hàng

**Tồn kho âm**:
Trạng thái tồn kho của một sản phẩm xuống dưới không.
_Tránh dùng_: âm kho, thiếu hàng

**Tồn tối thiểu**:
Ngưỡng tồn kho mà xuống dưới đó thì sản phẩm cần được nhập thêm.
_Tránh dùng_: định mức tồn, tồn an toàn

### Bán hàng

**Đơn hàng**:
Một lần khách mua hàng, dù trả tiền ngay hay ghi nợ. Đây là bản ghi trong hệ thống.
_Tránh dùng_: giao dịch, bill, phiếu bán hàng

**Hóa đơn**:
Tờ giấy in ra đưa khách sau khi bán. Là kết quả in của một đơn hàng, không phải một bản ghi riêng.
_Tránh dùng_: biên lai, phiếu tính tiền

**Sửa giá**:
Việc bán một dòng hàng khác với giá hệ thống tính ra.
_Tránh dùng_: giảm giá tay, đổi giá

**Mã PIN**:
Dãy sáu chữ số dùng để xác nhận một thao tác nhạy cảm ngay tại quầy, khác với mật khẩu đăng nhập.
_Tránh dùng_: mã xác nhận, mật khẩu cấp hai

**Người duyệt**:
Người có quyền cho phép một thao tác vượt quyền của người bán (sửa giá, chiết khấu, bán dưới giá vốn, ghi nợ vượt hạn mức) bằng cách nhập mã PIN của chính mình tại quầy. Có thể chính là người bán nếu người bán đủ quyền.
_Tránh dùng_: người phê duyệt, người ký

**Đơn ngoại tuyến**:
Đơn bán lập khi máy mất mạng, lưu tại máy và gửi lên khi có mạng trở lại.
_Tránh dùng_: đơn offline, đơn chờ đồng bộ

**Đơn chờ duyệt**:
Đơn ngoại tuyến đã được nhận (đã trừ kho, đã ghi nợ) nhưng vi phạm chính sách giá, chiết khấu hay hạn mức nợ mà không có người duyệt hợp lệ. Chủ hoặc quản lý đủ quyền duyệt hoặc từ chối; từ chối chỉ ghi nhận, không huỷ đơn. Quy tắc ở ADR-0009.
_Tránh dùng_: đơn treo, đơn bị khoá, đơn lỗi

**Trả hàng**:
Việc khách mang hàng đã mua quay lại, kéo theo hoàn tiền và hoàn tồn kho.
_Tránh dùng_: đổi trả, hoàn hàng

### Công nợ

**Khách hàng**:
Người mua hàng có lưu thông tin để theo dõi lịch sử và công nợ.
_Tránh dùng_: khách, đối tác, client

**Mã khách hàng**:
Chuỗi ký tự định danh một khách hàng trong phạm vi cửa hàng, không trùng nhau, mọi khách hàng đều có.
_Tránh dùng_: mã KH, mã cũ, mã tham chiếu

**Nhà cung cấp**:
Bên bán hàng cho cửa hàng.
_Tránh dùng_: đối tác, NCC, vendor

**Công nợ**:
Tổng số tiền một khách hàng còn nợ cửa hàng, hoặc cửa hàng còn nợ một nhà cung cấp.
_Tránh dùng_: dư nợ, tiền nợ, nợ

**Khoản nợ**:
Một món nợ riêng lẻ với số tiền phát sinh, số tiền đã trả, số tiền giảm trừ và số tiền còn lại; phát sinh luôn bằng đã trả cộng giảm trừ cộng còn lại. Công nợ của khách hàng là tổng số còn lại của các khoản nợ.
_Tránh dùng_: dòng nợ, món nợ

**Giảm trừ**:
Phần khoản nợ được xoá mà khách không trả tiền, do trả hàng cấn nợ hoặc điều chỉnh giảm nợ. Khác với đã trả: đã trả chỉ là tiền thực thu qua phiếu thu.
_Tránh dùng_: khấu trừ, trả bằng hàng

**Nợ đầu kỳ**:
Khoản nợ đã có từ trước khi cửa hàng dùng phần mềm này, không sinh ra từ đơn hàng nào trong hệ thống.
_Tránh dùng_: nợ cũ, nợ tồn, số dư ban đầu

**Hạn mức nợ**:
Số tiền tối đa một khách hàng được nợ. Khách không đặt hạn mức riêng thì theo hạn mức nhóm; không có cả hai, hoặc hạn mức bằng 0, nghĩa là không được nợ. "Không giới hạn nợ" là một cờ riêng chỉ chủ cửa hàng bật. Quy tắc ở ADR-0009.
_Tránh dùng_: giới hạn nợ, hạn mức tín dụng

**Tuổi nợ**:
Số ngày tính từ lúc một khoản nợ phát sinh đến hôm nay.
_Tránh dùng_: thời hạn nợ

**Nợ quá hạn**:
Khoản nợ có tuổi nợ vượt ngưỡng mà cửa hàng đặt ra. Khác với tuổi nợ: tuổi nợ là con số, quá hạn là kết luận rút từ con số đó.
_Tránh dùng_: nợ xấu, nợ trễ

**Phiếu thu**:
Chứng từ ghi nhận cửa hàng nhận tiền khách trả nợ.
_Tránh dùng_: phiếu thu tiền, biên nhận

**Phiếu chi**:
Chứng từ ghi nhận cửa hàng trả tiền nợ cho nhà cung cấp.
_Tránh dùng_: phiếu chi tiền, thanh toán NCC

**Điều chỉnh nợ**:
Bút toán tăng hoặc giảm công nợ một số tiền chênh lệch, kèm lý do, vì một việc nằm ngoài mua bán và thu chi, ví dụ chiết khấu cuối kỳ hay ghi nhận sai sót. Tăng nợ tạo một khoản nợ mới; giảm nợ giảm trừ các khoản nợ cũ nhất trước. Không gõ thẳng số công nợ mới.
_Tránh dùng_: sửa nợ, chỉnh nợ

### Chuyển dữ liệu

**Nhập liệu hàng loạt**:
Việc đưa nhiều bản ghi cùng loại vào hệ thống từ một tệp bảng tính.
_Tránh dùng_: import, nạp dữ liệu, upload

**Chế độ nhập**:
Lựa chọn của một lần nhập liệu hàng loạt: chỉ thêm mới, hoặc thêm mới và cập nhật bản ghi đã có.
_Tránh dùng_: kiểu nhập, tùy chọn import

**Tệp mẫu**:
Tệp bảng tính rỗng có sẵn đúng các cột mà hệ thống đọc được, để người dùng tải về và điền.
_Tránh dùng_: template, biểu mẫu

**Xem trước**:
Bước cho thấy một lần nhập liệu hàng loạt sẽ thêm và sửa những gì, kèm mọi lỗi tìm thấy, trước khi người dùng xác nhận.
_Tránh dùng_: kiểm tra trước, preview, dry run
