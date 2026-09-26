/**
 * GL-07 (ADR-0015): tồn kho và ngưỡng giá theo số lượng của bản sao danh mục nhận số lẻ, kèm cờ
 * bán số lẻ của mặt hàng và đơn vị quy đổi. Xóa con trỏ đồng bộ để lần kéo sau tải lại toàn bộ
 * danh mục: dòng đã có trước bản này chưa mang cờ. Hàng chờ đơn lưu JSON nên không đổi.
 */
export const v006DecimalQuantity = {
  version: 6,
  name: 'decimal-quantity',
  sql: `
    ALTER TABLE catalog_products
      ALTER COLUMN current_stock TYPE NUMERIC(14,3) USING current_stock::numeric(14,3);
    ALTER TABLE catalog_products
      ADD COLUMN IF NOT EXISTS allow_decimal_quantity BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE catalog_variants
      ALTER COLUMN stock_quantity TYPE NUMERIC(14,3) USING stock_quantity::numeric(14,3);
    ALTER TABLE catalog_unit_conversions
      ADD COLUMN IF NOT EXISTS allow_decimal_quantity BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE catalog_volume_prices
      ALTER COLUMN min_qty TYPE NUMERIC(14,3) USING min_qty::numeric(14,3);
    ALTER TABLE catalog_category_discounts
      ALTER COLUMN min_qty TYPE NUMERIC(14,3) USING min_qty::numeric(14,3);
    DELETE FROM catalog_sync_state;
  `,
}
