-- GL-03: ghi dấu vết mỗi dòng danh mục bị xóa cứng (kể cả xóa lan theo khóa ngoại) vào
-- sync_tombstones, để máy bán hàng đồng bộ gia tăng xóa bản sao cục bộ.
CREATE OR REPLACE FUNCTION sync_record_tombstone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sync_tombstones (store_id, entity, entity_id)
  VALUES (OLD.store_id, TG_TABLE_NAME, OLD.id);
  RETURN OLD;
END;
$$;
--> statement-breakpoint
-- price_list_items không có store_id: tra qua bảng giá cha. Khi cả bảng giá bị xóa thì dòng cha đã
-- mất lúc trigger chạy, bỏ qua; máy khách xóa các dòng con khi nhận dấu xóa của bảng giá.
CREATE OR REPLACE FUNCTION sync_record_price_list_item_tombstone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sync_tombstones (store_id, entity, entity_id)
  SELECT pl.store_id, TG_TABLE_NAME, OLD.id FROM price_lists pl WHERE pl.id = OLD.price_list_id;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_products AFTER DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_product_variants AFTER DELETE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_product_unit_conversions AFTER DELETE ON product_unit_conversions
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_customers AFTER DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_customer_groups AFTER DELETE ON customer_groups
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_price_lists AFTER DELETE ON price_lists
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_price_list_items AFTER DELETE ON price_list_items
  FOR EACH ROW EXECUTE FUNCTION sync_record_price_list_item_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_customer_prices AFTER DELETE ON customer_prices
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_volume_prices AFTER DELETE ON volume_prices
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
--> statement-breakpoint
CREATE TRIGGER trg_sync_tombstone_category_discounts AFTER DELETE ON category_discounts
  FOR EACH ROW EXECUTE FUNCTION sync_record_tombstone();
