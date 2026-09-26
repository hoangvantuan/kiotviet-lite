-- ADR-0015: số lượng và tồn kho thập phân numeric(14,3) cho hàng cân ký. Sửa tay sau drizzle-kit
-- (khi sinh lại phải giữ): mỗi bảng đổi mọi cột trong MỘT lệnh ALTER TABLE để chỉ viết lại bảng
-- một lần, kèm USING col::numeric(14,3) giữ nguyên giá trị cũ. Đổi kiểu giữ khóa ACCESS EXCLUSIVE
-- tới hết lệnh: chạy ngoài giờ bán, sao lưu trước.
ALTER TABLE "volume_prices" DROP CONSTRAINT "check_volume_prices_min_qty_positive";--> statement-breakpoint
ALTER TABLE "category_discounts"
  ALTER COLUMN "min_qty" SET DATA TYPE numeric(14, 3) USING "min_qty"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "inventory_transactions"
  ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3) USING "quantity"::numeric(14, 3),
  ALTER COLUMN "stock_after" SET DATA TYPE numeric(14, 3) USING "stock_after"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "order_items"
  ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3) USING "quantity"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "order_return_items"
  ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3) USING "quantity"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "product_variants"
  ALTER COLUMN "stock_quantity" SET DATA TYPE numeric(14, 3) USING "stock_quantity"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "products"
  ALTER COLUMN "current_stock" SET DATA TYPE numeric(14, 3) USING "current_stock"::numeric(14, 3),
  ALTER COLUMN "min_stock" SET DATA TYPE numeric(14, 3) USING "min_stock"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "purchase_order_items"
  ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3) USING "quantity"::numeric(14, 3),
  ALTER COLUMN "stock_after" SET DATA TYPE numeric(14, 3) USING "stock_after"::numeric(14, 3),
  ALTER COLUMN "returned_quantity" SET DATA TYPE numeric(14, 3) USING "returned_quantity"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "purchase_return_items"
  ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3) USING "quantity"::numeric(14, 3),
  ALTER COLUMN "base_quantity" SET DATA TYPE numeric(14, 3) USING "base_quantity"::numeric(14, 3),
  ALTER COLUMN "stock_after" SET DATA TYPE numeric(14, 3) USING "stock_after"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_check_items"
  ALTER COLUMN "system_qty" SET DATA TYPE numeric(14, 3) USING "system_qty"::numeric(14, 3),
  ALTER COLUMN "actual_qty" SET DATA TYPE numeric(14, 3) USING "actual_qty"::numeric(14, 3),
  ALTER COLUMN "diff" SET DATA TYPE numeric(14, 3) USING "diff"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_check_logs"
  ALTER COLUMN "system_qty" SET DATA TYPE numeric(14, 3) USING "system_qty"::numeric(14, 3),
  ALTER COLUMN "actual_qty" SET DATA TYPE numeric(14, 3) USING "actual_qty"::numeric(14, 3),
  ALTER COLUMN "diff" SET DATA TYPE numeric(14, 3) USING "diff"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_checks"
  ALTER COLUMN "total_diff_positive" SET DATA TYPE numeric(14, 3) USING "total_diff_positive"::numeric(14, 3),
  ALTER COLUMN "total_diff_negative" SET DATA TYPE numeric(14, 3) USING "total_diff_negative"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "volume_prices"
  ALTER COLUMN "min_qty" SET DATA TYPE numeric(14, 3) USING "min_qty"::numeric(14, 3);--> statement-breakpoint
ALTER TABLE "category_discounts" ALTER COLUMN "min_qty" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD COLUMN "allow_decimal_quantity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allow_decimal_quantity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "volume_prices" ADD CONSTRAINT "check_volume_prices_min_qty_positive" CHECK ("volume_prices"."min_qty" > 0);
