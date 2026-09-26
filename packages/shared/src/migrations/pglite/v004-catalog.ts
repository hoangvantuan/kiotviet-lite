import { searchTextSql } from '../../utils/search-text.js'

/**
 * GL-03, OFF-09: bản sao danh mục trên máy bán hàng, đủ để tìm hàng, tìm khách và tính giá khi
 * ngoại tuyến. Mọi bảng có store_id (khóa chính ghép với id) để dọn theo cửa hàng khi đăng xuất
 * hay đổi cửa hàng. Phiên bản 3 dành cho hàng chờ đơn của luồng o1-sync. Cột search_text dùng cùng quy tắc bỏ dấu với máy chủ (GL-16).
 */
export const v004Catalog = {
  version: 4,
  name: 'catalog',
  sql: `
    CREATE TABLE IF NOT EXISTS catalog_products (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      barcode TEXT,
      category_id UUID,
      selling_price BIGINT NOT NULL,
      cost_price BIGINT,
      unit TEXT NOT NULL,
      image_url TEXT,
      has_variants BOOLEAN NOT NULL DEFAULT false,
      track_inventory BOOLEAN NOT NULL DEFAULT false,
      current_stock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      search_text TEXT GENERATED ALWAYS AS (${searchTextSql(`name || ' ' || sku`)}) STORED,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_products_barcode ON catalog_products (store_id, barcode);
    CREATE INDEX IF NOT EXISTS idx_catalog_products_name ON catalog_products (store_id, name);

    CREATE TABLE IF NOT EXISTS catalog_variants (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      product_id UUID NOT NULL,
      sku TEXT NOT NULL,
      barcode TEXT,
      attribute1_name TEXT NOT NULL,
      attribute1_value TEXT NOT NULL,
      attribute2_name TEXT,
      attribute2_value TEXT,
      selling_price BIGINT NOT NULL,
      cost_price BIGINT,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_variants_product ON catalog_variants (store_id, product_id);

    CREATE TABLE IF NOT EXISTS catalog_unit_conversions (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      product_id UUID NOT NULL,
      unit TEXT NOT NULL,
      conversion_factor INTEGER NOT NULL,
      selling_price BIGINT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_unit_conversions_product
      ON catalog_unit_conversions (store_id, product_id);

    CREATE TABLE IF NOT EXISTS catalog_customers (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      phone TEXT,
      group_id UUID,
      debt_limit BIGINT,
      debt_unlimited BOOLEAN NOT NULL DEFAULT false,
      current_debt BIGINT NOT NULL DEFAULT 0,
      search_text TEXT GENERATED ALWAYS AS (
        ${searchTextSql(`name || ' ' || code || ' ' || coalesce(phone, '')`)}
      ) STORED,
      PRIMARY KEY (store_id, id)
    );

    CREATE TABLE IF NOT EXISTS catalog_customer_groups (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      name TEXT NOT NULL,
      default_price_list_id UUID,
      debt_limit BIGINT,
      PRIMARY KEY (store_id, id)
    );

    CREATE TABLE IF NOT EXISTS catalog_price_lists (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL,
      effective_from TEXT,
      effective_to TEXT,
      PRIMARY KEY (store_id, id)
    );

    CREATE TABLE IF NOT EXISTS catalog_price_list_items (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      price_list_id UUID NOT NULL,
      product_id UUID NOT NULL,
      price BIGINT NOT NULL,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_price_list_items_lookup
      ON catalog_price_list_items (store_id, price_list_id, product_id);

    CREATE TABLE IF NOT EXISTS catalog_customer_prices (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      customer_id UUID NOT NULL,
      product_id UUID NOT NULL,
      price BIGINT NOT NULL,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_customer_prices_lookup
      ON catalog_customer_prices (store_id, customer_id, product_id);

    CREATE TABLE IF NOT EXISTS catalog_volume_prices (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      product_id UUID NOT NULL,
      min_qty INTEGER NOT NULL,
      price BIGINT NOT NULL,
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_volume_prices_product
      ON catalog_volume_prices (store_id, product_id);

    CREATE TABLE IF NOT EXISTS catalog_category_discounts (
      store_id UUID NOT NULL,
      id UUID NOT NULL,
      category_id UUID NOT NULL,
      customer_id UUID,
      customer_group_id UUID,
      discount_type TEXT NOT NULL,
      discount_value BIGINT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      effective_from TEXT,
      effective_to TEXT,
      is_active BOOLEAN NOT NULL,
      PRIMARY KEY (store_id, id)
    );

    CREATE TABLE IF NOT EXISTS catalog_sync_state (
      store_id UUID NOT NULL,
      entity TEXT NOT NULL,
      cursor_t TEXT,
      cursor_id UUID,
      PRIMARY KEY (store_id, entity)
    );

    CREATE TABLE IF NOT EXISTS catalog_sync_meta (
      store_id UUID PRIMARY KEY,
      with_cost BOOLEAN NOT NULL,
      synced_at TIMESTAMPTZ
    );
  `,
}
