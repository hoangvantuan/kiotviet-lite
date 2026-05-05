export const v002OfflineOrdersEnhance = {
  version: 2,
  name: 'offline-orders-enhance',
  sql: `
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS server_id TEXT;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
    ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_offline_orders_sync_status ON offline_orders(sync_status);
  `,
}
