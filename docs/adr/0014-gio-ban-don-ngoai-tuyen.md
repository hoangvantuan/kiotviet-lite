# ADR-0014: Giờ bán của đơn ngoại tuyến lấy theo máy bán, máy chủ giới hạn

- Trạng thái: Đã chốt
- Ngày: 2026-09-26
- Phạm vi: `apps/api/src/routes/sync.routes.ts`, `apps/api/src/services/order-policy.ts`,
  `packages/shared/src/schema/orders.ts`, `packages/shared/src/schema/sync-management.ts`,
  `apps/web/src/lib/offline-orders.ts`, `apps/web/src/lib/order-sync.ts`
- Bổ sung cho: [ADR-0009](0009-han-muc-no-mac-dinh-khong-cho-no.md),
  [ADR-0013](0013-ca-ban-hang-va-dong-tien-theo-phuong-thuc.md)

## Bối cảnh

Đơn ngoại tuyến nằm ở máy bán tới khi có mạng, có khi qua đêm hay nhiều ngày. Trước đây máy chủ
ghi `created_at` là lúc nhận đơn, nên đơn bán tối thứ Hai đồng bộ sáng thứ Ba bị tính vào doanh
thu thứ Ba, lệch với tiền trong két (OFF-11). Đơn cũng ghi người đồng bộ làm người bán: nhân viên
bán rồi đăng xuất, chủ đăng nhập trên cùng máy thì đơn thành của chủ (OFF-05). Hóa đơn in lúc
bán chưa có mã máy chủ, khách cầm hóa đơn quay lại thì không tra được đơn (OFF-17).

## Quyết định

1. **Đơn ngoại tuyến có MỘT giờ bán hiệu lực, ghi vào cả `created_at` lẫn `sold_at`** (giờ bán
   trên máy, `soldAt` gửi kèm từng đơn, sau khi kẹp theo mục 2). Báo cáo doanh thu lọc
   `created_at`, báo cáo dòng tiền lọc `sold_at` (ADR-0013), nên hai màn luôn cùng ngày. Ca bán
   hàng cũng gắn theo giờ này. Đơn trực tuyến giữ nguyên: hai cột là lúc máy chủ ghi.
2. **Máy chủ giới hạn giờ bán**, vì đồng hồ máy bán có thể sai hoặc bị chỉnh. Giờ bán nằm ngoài
   khoảng tin được thì đơn ghi theo **giờ nhận đơn**:
   - sau giờ nhận quá 5 phút (`SYNC_SOLD_AT_MAX_FUTURE_MS`);
   - trước giờ nhận quá 7 ngày (`SYNC_SOLD_AT_MAX_AGE_DAYS`);
   - trước lúc tạo cửa hàng (trừ độ lệch 5 phút).

   Mọi trường hợp trên gắn vi phạm `sold_at_suspect`, đơn thành đơn chờ duyệt (ADR-0009). Giờ gốc
   máy gửi vẫn được giữ để tra: `claimedSoldAt` trong nhật ký `order.created`, `offlineCreatedAt`
   trong nhật ký `order.policy_violation_offline`. Ca bán hàng dùng chung quy tắc này
   (`resolveOfflineSoldAt`), không có quy tắc giờ bán thứ hai.

3. **Người bán là người lập đơn trên máy, không phải người đồng bộ.** Hàng chờ ngoại tuyến lưu
   `userId` và `storeId` của người bán; `/sync/push` nhận `sellerUserId` từng đơn, kiểm người đó
   thuộc cửa hàng rồi ghi vào `user_id`. Người gửi lên, khi khác người bán, ghi vào
   `synced_by_user_id`; lúc nhận ghi vào `synced_at` (NULL với đơn trực tuyến). Máy chỉ đẩy đơn
   của cửa hàng đang đăng nhập.
   - `sellerUserId` do máy khách gửi nên không được nâng quyền: khi người bán khác người đồng bộ,
     quyền tự duyệt giá và chiết khấu là **giao quyền của hai người**. Nhân viên khai chủ là người
     bán vẫn ra đơn chờ duyệt; chủ đồng bộ hộ đơn của nhân viên cũng không duyệt thay. Nhật ký ghi
     cả người bán lẫn người đồng bộ và vai trò của họ.
   - Người bán đã bị khóa hoặc mất quyền bán trước khi đơn kịp đồng bộ: đơn vẫn nhận (tiền đã thu)
     với vi phạm `seller_inactive`, chờ chủ duyệt.
4. **Hóa đơn ngoại tuyến in mã tạm `TAM-` cộng 8 ký tự đầu của `clientId`.** Máy chủ cấp mã
   `HD-` khi đồng bộ; tìm đơn bằng mã tạm vẫn ra đúng đơn đó, nên không cần cột mới. Tìm kiếm nhận
   cả tiền tố `OFFLINE-` của bản trước, vì hóa đơn đã in bằng bản đó vẫn còn trong tay khách.

## Hệ quả

- Doanh thu theo ngày khớp tiền trong két kể cả khi đồng bộ trễ.
- Đơn đồng bộ trễ trong vòng 7 ngày làm đổi số của ngày đã qua. Đơn cũ hơn thì vào ngày nhận, gắn
  cờ để chủ xem lại; hệ thống không chặn: chặn thì mất đơn thật. Chủ muốn đơn đó về đúng ngày bán
  thì tra giờ gốc trong nhật ký.
- Máy bán chỉnh đồng hồ lùi trong vòng 7 ngày vẫn dời được doanh thu mà không bị gắn cờ. Giới hạn
  này chấp nhận được với cửa hàng nhỏ; `synced_at` còn lại để đối soát khi cần.
- Mã tạm lấy 8 ký tự hex từ UUID nên có thể trùng giữa hai đơn (xác suất rất nhỏ); khi đó tìm
  bằng mã tạm ra nhiều hơn một đơn, người dùng chọn theo giờ và số tiền.
