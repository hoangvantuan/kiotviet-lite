export const v001Initial = {
  version: 1,
  name: 'initial-offline-tables',
  sql: `
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now(),
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS offline_orders (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      store_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      order_data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      synced_at TIMESTAMPTZ
    );
  `,
}
