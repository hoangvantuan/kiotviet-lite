# ADR-0009: Hạn mức nợ mặc định là không cho nợ, vượt quyền cần người duyệt nhập PIN

- Trạng thái: Đã chốt
- Ngày: 2026-09-25
- Phạm vi: `apps/api/src/services/order-policy.ts`, `apps/api/src/services/orders.service.ts`,
  `apps/api/src/services/customers.service.ts`, `packages/shared/src/utils/debt-limit.ts`,
  `apps/api/src/services/order-review.service.ts`, `apps/api/src/services/approval-guard.ts`,
  `packages/shared/src/constants/permissions.ts`, migration `0048`

## Bối cảnh

Đợt kiểm tra go-live (POS-01, POS-04, POS-12, TIEN-106, POS-15, BC-13) thấy máy chủ tin số liệu và
quyền do máy khách gửi:

- `customers.debt_limit` NULL nghĩa là "không giới hạn", và giao diện coi 0 cũng là không giới hạn.
  Nhân viên tạo nhanh một khách (không có hạn mức) là ghi nợ bao nhiêu cũng được. Chủ cửa hàng đặt
  hạn mức 0 để chặn nợ thì lại mở toang.
- Vượt hạn mức chỉ cần "một mã PIN đúng", mà máy chủ kiểm PIN của chính người bán. Nhân viên tự nhập
  PIN của mình là vượt được.
- Chiết khấu dòng, chiết khấu đơn không cần quyền gì. Sửa giá cần PIN nhưng lại là PIN người bán, nên
  nhân viên bán Ensure 450.000 đ với giá 1.000 đ được.
- Trạng thái thanh toán do máy khách gửi: "tiền mặt 25.000 đ + nợ 20.000 đ" cho đơn 25.000 đ ghi một
  khoản nợ không có thật.
- Giá vốn đi xuống máy nhân viên qua tìm hàng POS, đồng bộ và chi tiết đơn.

## Quyết định

### Hạn mức nợ

Hạn mức hiệu lực có một định nghĩa duy nhất, `resolveEffectiveDebtLimit`, dùng chung cho máy chủ và
giao diện:

| Cờ `debt_unlimited` | Hạn mức khách | Hạn mức nhóm | Hạn mức hiệu lực        |
| ------------------- | ------------- | ------------ | ----------------------- |
| `true`              | bất kỳ        | bất kỳ       | `null` (không giới hạn) |
| `false`             | có (kể cả 0)  | bất kỳ       | hạn mức khách           |
| `false`             | NULL          | có           | hạn mức nhóm            |
| `false`             | NULL          | NULL         | 0, tức không được nợ    |

- `null` chỉ còn một nghĩa: khách được đặt không giới hạn nợ. Chỉ chủ cửa hàng bật hay tắt cờ này
  (quyền `customers.setUnlimitedDebt`).
- Hạn mức 0 chặn ghi nợ (sửa TIEN-106).
- Tạo nhanh khách tại quầy luôn ra khách không được nợ.
- Nhóm khách không có cờ không giới hạn: nhóm để trống hạn mức nghĩa là không cho nợ.

### Người duyệt

Thao tác vượt quyền người bán cần một **người duyệt** giữ đủ quyền, nhập PIN của chính mình. Đơn gửi
kèm `priceApproverId` hay `debtLimitApproverId` (mặc định là người bán). Máy chủ kiểm người duyệt cùng
cửa hàng, đang hoạt động, giữ đủ quyền, rồi mới kiểm PIN.

| Thao tác                                 | Quyền người duyệt phải có              |
| ---------------------------------------- | -------------------------------------- |
| Sửa giá, chiết khấu dòng, chiết khấu đơn | `pos.editPrice` (chủ, quản lý)         |
| Như trên mà thành tiền dưới giá vốn      | thêm `pos.editPriceBelowCost` (chủ)    |
| Ghi nợ vượt hạn mức hiệu lực             | `pos.overrideDebtLimit` (chủ, quản lý) |

- Người bán tự đủ quyền thì chiết khấu không cần PIN. Sửa giá luôn cần PIN (giữ ADR-0002).
- Dòng dưới giá vốn: dòng có sửa giá hoặc chiết khấu mà thành tiền nhỏ hơn giá vốn đơn vị bán (giá vốn
  biến thể, không có thì giá vốn sản phẩm, nhân hệ số quy đổi) nhân số lượng. Đơn dưới giá vốn: có
  chiết khấu đơn mà tổng đơn nhỏ hơn tổng giá vốn đã biết.
- Máy chủ tự tính lại số tiền chiết khấu từ loại và giá trị chiết khấu; lệch là từ chối.
- Nhật ký ghi cả người bán lẫn người duyệt (`order_item.price_overridden`, `order.discount_applied`,
  `debt.limit_overridden`).
- `POST /users/verify-pin` nhận thêm `userId` và `permissions` để giao diện kiểm PIN người duyệt trước
  khi gửi đơn. Có `userId` người khác thì bắt buộc nêu `permissions`, không thì 400: không ai được
  dùng điểm này để thử PIN của người khác mà không nêu mình cần duyệt gì.
  `GET /pos/approvers?permission=` liệt kê người có thể duyệt.
- Người duyệt không tồn tại trong cửa hàng (kể cả người của cửa hàng khác) trả 404 trước khi kiểm
  PIN. Người duyệt đã bị vô hiệu hoá trả 403 dù PIN đúng.
- Người bán không có `products.viewCost` mà chưa gửi PIN thì lỗi chỉ đòi `pos.editPrice`. Dòng
  "dưới giá vốn" chỉ lộ ra (đòi thêm `pos.editPriceBelowCost`) sau khi PIN người duyệt đã đúng. Nhờ
  vậy nhân viên không dò được giá vốn bằng cách gửi thử nhiều giá không kèm PIN. Đổi lại, nhân viên
  có thể phải nhờ quản lý nhập PIN rồi mới biết đơn cần chủ duyệt.
- PIN duyệt chỉ áp cho đúng giỏ lúc duyệt: giỏ đổi dòng, số lượng, giá hay chiết khấu thì máy khách
  bỏ PIN và người duyệt, bắt duyệt lại.

### Chặn dò PIN người duyệt

Mỗi lần người bán nhập sai PIN của **người khác** (tại `/users/verify-pin` và PIN gửi kèm đơn tại
quầy) được đếm theo người bán (3 lần một vòng) và theo IP (10 lần một vòng, vì cả cửa hàng thường
chung IP). Đủ ngưỡng thì chặn 429 kèm `retryAfter`, thời gian chặn tăng dần 1, 5, 15, 60 phút.
Không sai thêm trong 24 giờ thì quên số vòng. PIN đúng xoá số lần sai của vòng hiện tại.

- Bộ đếm nằm trong bộ nhớ tiến trình: khởi động lại máy chủ là mất, chạy nhiều tiến trình thì mỗi
  tiến trình đếm riêng. Khoá PIN 5 lần sai trên bảng `users` vẫn chạy song song làm lớp cuối.
- Chặn theo IP có thể chặn oan người khác cùng mạng cửa hàng khi một người dò liên tục.

### Thanh toán

Máy chủ tự tính trạng thái thanh toán và tiền thừa. Phương thức ghi nợ: tiền thu cộng số nợ phải bằng
đúng tổng đơn. Phương thức khác: không được kèm nợ. Tổ hợp mâu thuẫn bị từ chối 422, áp cho cả đơn
ngoại tuyến vì chính tổ hợp đó là cách ghi khống một khoản nợ, và giao diện không bao giờ tạo ra nó.

### Giá vốn

Người không có `products.viewCost` (nhân viên) không nhận số giá vốn ở tìm hàng POS, `/sync/initial`,
`/sync/incremental`, phản hồi tạo đơn và chi tiết đơn. Phản hồi tạo đơn có cờ `belowCost` từng dòng
thay cho con số. Không có điểm "thử giá" riêng vì gọi nhiều lần sẽ dò ra giá vốn.

### Đơn ngoại tuyến: nhận đơn nhưng chờ chủ duyệt

Giữ ADR-0001 và ADR-0002: đơn ngoại tuyến đã bán xong tại quầy, hàng đã giao nên máy chủ không từ
chối. Nhưng `/sync/push` không được là đường vòng qua POS-01 và POS-12, nên đơn vi phạm chính sách
mang trạng thái duyệt `orders.review_status` (`none`, `pending_review`, `approved`, `rejected`) và
danh sách vi phạm `orders.policy_violations`:

| Mã vi phạm              | Khi nào                                             | Ai duyệt được                  |
| ----------------------- | --------------------------------------------------- | ------------------------------ |
| `price_unapproved`      | Sửa giá, chiết khấu mà không có duyệt hợp lệ        | `pos.editPrice` (chủ, quản lý) |
| `below_cost_unapproved` | Như trên mà dưới giá vốn                            | thêm `pos.editPriceBelowCost`  |
| `debt_limit_exceeded`   | Ghi nợ vượt hạn mức hiệu lực mà không có duyệt      | `pos.overrideDebtLimit`        |
| `no_credit`             | Ghi nợ cho khách hạn mức 0, gồm khách vừa tạo nhanh | `pos.overrideDebtLimit`        |

"Không có duyệt hợp lệ" gồm: không gửi PIN, PIN sai, người duyệt thiếu quyền hay không thuộc cửa
hàng.

- Đơn vẫn trừ kho và ghi nợ như mọi đơn.
- Ghi nhật ký `order.policy_violation_offline` (người bán, vai trò, thiết bị, giờ bán ngoại tuyến,
  vi phạm) và phát sự kiện `order.policy_violation_offline` mức error cho chủ cửa hàng. Các sự kiện
  cũ (`order.approval_missing`, `order.debt_limit_exceeded`, `audit.price_override`) vẫn phát, nên
  chủ có thể nhận hai thông báo cho một đơn. Giữ vậy vì cửa hàng tạo trước bản này chưa có luật
  thông báo cho sự kiện mới: migration không thêm được luật dùng giá trị enum vừa thêm trong cùng
  giao dịch migration.
- Chủ hoặc quản lý (quyền mới `orders.reviewPolicy`) xem đơn chờ duyệt ở bộ lọc danh sách đơn và
  thẻ cảnh báo trên tổng quan (`GET /orders?reviewStatus=pending_review`,
  `GET /orders/pending-review/count`), rồi duyệt hoặc từ chối (`POST /orders/:id/review`). Người
  duyệt phải giữ thêm mọi quyền mà vi phạm cần: đơn dưới giá vốn chỉ chủ duyệt được.
- Từ chối bắt buộc có lý do và chỉ ghi nhận quyết định (`order.review_rejected`), không huỷ đơn.
  Phản hồi gợi ý bước tiếp: lập phiếu trả hàng, thu chênh lệch, điều chỉnh công nợ.
- Nhân viên thấy đơn của mình "Chờ chủ duyệt" ở chi tiết đơn và ở bảng đồng bộ ngoại tuyến. Nhân viên
  không có `products.viewCost` thấy vi phạm dưới giá vốn dưới dạng vi phạm giá (BC-13).
- PIN sai lúc đồng bộ không tăng số lần sai PIN của người duyệt: PIN nhập ngoại tuyến có thể đã cũ,
  và đồng bộ lại không được làm khoá PIN của chủ.
- Sai số học chiết khấu (số tiền không khớp loại và giá trị) vẫn bị từ chối rõ ràng cho cả đơn
  ngoại tuyến. Đơn nằm lại hàng đồng bộ trên máy với trạng thái lỗi: giao diện không bao giờ tạo ra
  số sai đó, nên đây là dấu hiệu máy khách bị sửa.
- Hộp nhập PIN báo ngay "Cần kết nối mạng để xác thực PIN" khi mất mạng thay vì treo (OFF-12).

## Chuyển đổi dữ liệu (migration 0048)

Thêm cột `customers.debt_unlimited boolean NOT NULL DEFAULT false`, rồi bật cờ cho đúng những khách
đang dựa vào nghĩa cũ "NULL là không giới hạn" và đang có nợ:

```sql
UPDATE customers c SET debt_unlimited = true
WHERE c.current_debt > 0 AND c.debt_limit IS NULL
  AND NOT EXISTS (SELECT 1 FROM customer_groups g
                  WHERE g.id = c.group_id AND g.debt_limit IS NOT NULL);
```

- Khách đang nợ mà không có hạn mức nào: giữ được nợ tiếp như trước, chủ cửa hàng rà lại danh sách.
- Khách chưa nợ và không có hạn mức: từ nay không được nợ cho tới khi được cấp hạn mức.
- Khách có hạn mức 0 đặt tay: nay chặn đúng như chủ cửa hàng muốn, không được bật cờ.
- Khách theo nhóm có hạn mức: giữ nguyên.
- Khách thuộc nhóm có hạn mức 0: trước đây giao diện coi 0 là không giới hạn nên vẫn nợ được, nay
  bị chặn. Migration không bật cờ cho nhóm này vì nhóm đã có hạn mức. Chủ cửa hàng cần rà các nhóm
  hạn mức 0 và cấp hạn mức thật hoặc bật cờ cho từng khách.
- Danh sách khách có bộ lọc "Không giới hạn nợ" (`GET /customers?debtUnlimited=yes`, chủ và quản lý)
  để chủ rà lại những khách đã được bật cờ.

## Hệ quả

- Đóng các đường ghi nợ khống, vượt hạn mức bằng PIN của chính mình, bán dưới giá vốn và lộ giá vốn.
- Nhân viên muốn chiết khấu phải có người duyệt tại quầy, thêm một bước thao tác.
- Người duyệt bị khoá PIN sau 5 lần sai, kể cả khi người nhập sai là nhân viên chọn tên họ. Đổi lại,
  PIN chủ cửa hàng không bị dò không giới hạn.
- Cửa hàng đang dùng nghĩa cũ "để trống là không giới hạn" cho khách mới phải cấp hạn mức hoặc nhờ chủ
  bật cờ không giới hạn.
- Đơn ngoại tuyến vi phạm không còn lặng lẽ đi qua: chủ phải duyệt hoặc từ chối từng đơn.
- Bộ kiểm thử `order-policy-r1.integration.test.ts` giữ các bước tái hiện gốc;
  `order-review-offline.integration.test.ts` giữ các ca đơn ngoại tuyến chờ duyệt và chặn dò PIN.

## Còn lại

- PIN duyệt chưa đổi thành mã dùng một lần gắn với dấu vân tay giỏ ở máy chủ. Hiện máy khách bỏ PIN
  khi giỏ đổi và máy chủ kiểm lại toàn bộ đơn theo PIN, nhưng một máy khách tự viết vẫn dùng lại
  được PIN đã biết cho giỏ khác.
- Cửa hàng tạo trước bản này chưa có luật thông báo cho `order.policy_violation_offline`.
