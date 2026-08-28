# ADR-0001: Đơn bán ngoại tuyến vượt hạn mức công nợ thì ghi nhận, không từ chối

- Trạng thái: Đã chốt
- Ngày: 2026-08-27
- Phạm vi: `apps/api/src/services/orders.service.ts`, `apps/api/src/routes/sync.routes.ts`

## Bối cảnh

Khi bán tại quầy trong lúc mất mạng, ứng dụng ghi đơn xuống máy rồi đồng bộ lên máy chủ sau.
Tại thời điểm đồng bộ, công nợ của khách trên máy chủ có thể đã khác so với lúc bán, nên một
đơn ghi nợ hợp lệ tại quầy vẫn có thể vượt hạn mức khi lên tới máy chủ.

Hai hướng xử lý:

1. Từ chối đơn như luồng bán trực tuyến.
2. Vẫn ghi nhận đơn, đánh dấu và cảnh báo chủ cửa hàng.

## Quyết định

Chọn hướng 2. Hàng đã giao và tiền đã (hoặc chưa) thu tại quầy là sự việc đã xảy ra ngoài đời;
từ chối đơn lúc đồng bộ chỉ làm mất dữ liệu bán hàng chứ không thu hồi được hàng.

Cụ thể:

- Bán trực tuyến tại quầy (`source = 'pos'`) vượt hạn mức mà không có mã PIN: **từ chối**, giữ nguyên hành vi cũ.
- Đơn đồng bộ ngoại tuyến (`source = 'offline_sync'`) vượt hạn mức: **vẫn tạo đơn**, đặt cờ
  `orders.debt_limit_exceeded = true`, ghi nhật ký kiểm toán `order.debt_limit_exceeded`
  kèm hạn mức, nợ trước, nợ sau, phần vượt, người bán, thời điểm bán ngoại tuyến,
  và phát thông báo cảnh báo cho chủ cửa hàng.

## Hệ quả

- Chủ cửa hàng thấy được mọi đơn vượt hạn mức để xử lý với khách, thay vì mất đơn.
- Công nợ có thể vượt hạn mức trong thời gian ngắn. Đây là đánh đổi có chủ ý.
- Cần cột `debt_limit_exceeded` (migration `0032`) và một giá trị mới trong enum
  `notification_type`.
