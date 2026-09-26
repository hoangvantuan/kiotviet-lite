-- POS-18: mỗi dòng sổ kho trỏ về chứng từ gốc (reference_type, reference_id) thay vì khớp theo ghi
-- chú. TIEN-105: bỏ hai cột đếm tổng mua, số đơn của khách, nay tính khi đọc từ đơn.
-- Sửa tay sau drizzle-kit (khi sinh lại migration phải giữ phần này): thêm reference_type cho phép
-- NULL, điền dòng cũ từ ghi chú, rồi mới đặt NOT NULL; ràng buộc CHECK thêm NOT VALID vì dòng cũ
-- không khớp được chứng từ nào vẫn giữ reference_id NULL, chỉ dòng ghi mới bị kiểm.
ALTER TABLE "inventory_transactions" ADD COLUMN "reference_type" varchar(32);--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "reference_id" uuid;--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'order', "reference_id" = o."id"
FROM "orders" o
WHERE it."type" = 'sale' AND o."store_id" = it."store_id"
  AND (it."note" = o."order_number" OR it."note" = o."order_number" || ' (offline sync)');--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'order', "reference_id" = o."id"
FROM "orders" o
WHERE it."type" = 'order_cancel' AND o."store_id" = it."store_id"
  AND it."note" = 'Hủy ' || o."order_number";--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'order_return', "reference_id" = r."id"
FROM "order_returns" r
WHERE it."type" = 'return' AND r."store_id" = it."store_id" AND it."note" = r."return_number";--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'purchase_order', "reference_id" = po."id"
FROM "purchase_orders" po
WHERE it."type" = 'purchase' AND po."store_id" = it."store_id" AND it."note" = po."code";--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'purchase_order', "reference_id" = po."id"
FROM "purchase_orders" po
WHERE it."type" = 'purchase_cancel' AND po."store_id" = it."store_id"
  AND it."note" = 'Hủy ' || po."code";--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'purchase_return', "reference_id" = pr."id"
FROM "purchase_returns" pr
WHERE it."type" = 'purchase_return' AND pr."store_id" = it."store_id" AND it."note" = pr."code";--> statement-breakpoint
UPDATE "inventory_transactions" it SET "reference_type" = 'stock_check', "reference_id" = sc."id"
FROM "stock_checks" sc
WHERE it."type" = 'stock_check' AND sc."store_id" = it."store_id"
  AND it."note" = 'Kiểm kho ' || sc."code";--> statement-breakpoint
UPDATE "inventory_transactions" SET "reference_type" = 'product', "reference_id" = "product_id"
WHERE "type" = 'initial_stock';--> statement-breakpoint
-- Còn lại: nhập tay, điều chỉnh tay là manual; dòng chứng từ không khớp ghi chú giữ loại chứng từ
-- theo loại dòng, reference_id NULL (bất biến I10 chỉ kiểm dòng có reference_id)
UPDATE "inventory_transactions" SET "reference_type" = CASE "type"
    WHEN 'sale' THEN 'order'
    WHEN 'order_cancel' THEN 'order'
    WHEN 'return' THEN 'order_return'
    WHEN 'purchase_cancel' THEN 'purchase_order'
    WHEN 'purchase_return' THEN 'purchase_return'
    WHEN 'stock_check' THEN 'stock_check'
    ELSE 'manual'
  END
WHERE "reference_type" IS NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ALTER COLUMN "reference_type" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_reference" ON "inventory_transactions" USING btree ("store_id","reference_type","reference_id");--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "total_purchased";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "purchase_count";--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "chk_inventory_tx_reference_id" CHECK ("inventory_transactions"."reference_type" = 'manual' OR "inventory_transactions"."reference_id" IS NOT NULL) NOT VALID;
