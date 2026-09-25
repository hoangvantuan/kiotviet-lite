-- GL-15: loại sự kiện cho nút "Gửi thử" kênh thông báo, không ghi vào notification_deliveries.
-- Thêm giá trị enum chạy được trong transaction (PG 12+) vì migration này không dùng tới giá trị mới.
ALTER TYPE "public"."notification_type" ADD VALUE 'notification.test';