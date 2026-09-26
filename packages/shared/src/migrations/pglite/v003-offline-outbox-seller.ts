/**
 * Luồng o1-sync (OFF-05, OFF-10, OFF-13, OFF-14, OFF-17):
 * - user_id: người bán gốc của đơn, máy chủ ghi đơn cho người này dù ai đồng bộ.
 * - error_code, next_retry_at: phân loại lỗi đồng bộ, lỗi tạm thời tự thử lại theo lịch lùi dần.
 * - server_order_number: mã đơn máy chủ cấp sau khi đồng bộ, thay mã tạm khi in lại.
 * - Xóa PIN duyệt khỏi các đơn đã lưu bởi bản cũ: PIN không được nằm trong cơ sở dữ liệu trình
 *   duyệt (ADR-0002). Đơn đó đồng bộ theo nhánh "không có PIN" và vào hàng chờ duyệt (ADR-0009).
 */
export const v003OfflineOutboxSeller = {
  version: 3,
  name: 'offline-outbox-seller',
  sql: `
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS error_code TEXT;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS server_order_number TEXT;
    CREATE INDEX IF NOT EXISTS idx_offline_orders_client_id ON offline_orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_offline_orders_store_status ON offline_orders(store_id, sync_status);
    UPDATE offline_orders
      SET order_data = (order_data - 'debtLimitOverridePin' - 'priceOverridePin')
        || jsonb_build_object('debtLimitOverridden', false)
      WHERE order_data ? 'debtLimitOverridePin' OR order_data ? 'priceOverridePin';
  `,
}
