/**
 * POS-08: bảng giá, giá riêng khách và giá theo số lượng gắn được theo biến thể. Dòng cũ đều là giá
 * theo sản phẩm nên cột mới để null là đúng, không phải tải lại bản sao. Chỉ mục tra cứu thêm
 * variant_id để khớp khóa duy nhất của máy chủ.
 */
export const v005CatalogPriceVariants = {
  version: 5,
  name: 'catalog-price-variants',
  sql: `
    ALTER TABLE catalog_price_list_items ADD COLUMN IF NOT EXISTS variant_id UUID;
    ALTER TABLE catalog_customer_prices ADD COLUMN IF NOT EXISTS variant_id UUID;
    ALTER TABLE catalog_volume_prices ADD COLUMN IF NOT EXISTS variant_id UUID;

    DROP INDEX IF EXISTS idx_catalog_price_list_items_lookup;
    CREATE INDEX IF NOT EXISTS idx_catalog_price_list_items_lookup
      ON catalog_price_list_items (store_id, price_list_id, product_id, variant_id);
    DROP INDEX IF EXISTS idx_catalog_customer_prices_lookup;
    CREATE INDEX IF NOT EXISTS idx_catalog_customer_prices_lookup
      ON catalog_customer_prices (store_id, customer_id, product_id, variant_id);
  `,
}
